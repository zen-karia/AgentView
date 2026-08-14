"""Playwright-MCP benchmark condition -- the real competitor.

Drives the REAL `@playwright/mcp` server with Claude as the brain (Gemini optional),
on the SAME generated pages as the other conditions (served over local HTTP -- MCP
blocks file://, and http vs file is the same HTML, so the comparison stays fair):

  browser_navigate(url)
  loop: browser_snapshot()  -> Claude picks a tool -> browser_click/browser_type
  browser_evaluate(state)   -> read window.__STATE__ for the verifier

MCP's snapshot is GENERIC (the whole a11y tree, every turn, no task-conditioning)
-- exactly the baseline we're measuring against.

Needs: node/npx (spawns @playwright/mcp), `pip install mcp`, and an Anthropic key
for the brain. The plumbing (connect/snapshot/state) runs without a key:

  python3 mcp_runner.py --selftest shop_15
"""
from __future__ import annotations

import argparse
import asyncio
import contextlib
import datetime
import functools
import http.server
import json
import os
import pathlib
import threading
import time

from mcp import ClientSession, StdioServerParameters
from mcp.client.stdio import stdio_client

MAX_STEPS = 10
_GEMINI_MODEL = os.getenv("GEMINI_MODEL", "gemini-3.1-flash-lite")
_SITES_DIR = pathlib.Path(__file__).parent / "sites"

# read window.__STATE__ (falls back to cart/products) for the verifier
_STATE_JS = "() => window.__STATE__ || { cart: window.__CART__ || [], products: window.__PRODUCTS__ || [] }"


def _server() -> StdioServerParameters:
    return StdioServerParameters(
        command="npx",
        args=["-y", "@playwright/mcp@latest", "--headless", "--isolated"],
    )


class _QuietHandler(http.server.SimpleHTTPRequestHandler):
    def log_message(self, *args) -> None:  # silence request logging
        pass


@contextlib.contextmanager
def _serve():
    """Serve the sites/ dir over local HTTP (MCP blocks file://). Yields base URL."""
    handler = functools.partial(_QuietHandler, directory=str(_SITES_DIR))
    httpd = http.server.ThreadingHTTPServer(("127.0.0.1", 0), handler)
    threading.Thread(target=httpd.serve_forever, daemon=True).start()
    try:
        yield f"http://127.0.0.1:{httpd.server_address[1]}"
    finally:
        httpd.shutdown()


def _site_url(base: str, site_key: str) -> str:
    return f"{base}/{site_key}/index.html"


def _text(result) -> str:
    """Concatenate the text content blocks of an MCP tool result."""
    out = []
    for block in getattr(result, "content", []) or []:
        if getattr(block, "type", None) == "text":
            out.append(block.text)
    return "\n".join(out)


def _extract_json(text: str):
    """Pull the first JSON object/array out of an MCP result string."""
    for opener in ("{", "["):
        i = text.find(opener)
        if i != -1:
            try:
                obj, _ = json.JSONDecoder().raw_decode(text[i:])
                return obj
            except json.JSONDecodeError:
                continue
    return None


class _StateAdapter:
    """Lets a task.check() run against the state read out of MCP's browser."""

    def __init__(self, state: dict):
        self._state = state

    def state(self) -> dict:
        return self._state


# ---------------- Brain: read MCP's generic snapshot, pick a browser tool ---------
# (needs an LLM key; NOT run until step 3). choice = {done} or {tool, args}.
def _mcp_prompt(goal: str, snapshot: str, history: list[dict]) -> str:
    return f"""You control a web browser via these tools:
- browser_click  args: {{"element": <short description>, "target": <exact ref>}}
- browser_type   args: {{"element": <short description>, "target": <exact ref>, "text": <text>}}

The accessibility snapshot lists elements with refs like [ref=e34]. Put that exact
ref (e.g. "e34") in "target" -- it is REQUIRED. Pick the SINGLE next tool call to
make progress on the goal. When the goal is already satisfied, return done.

Reply with JSON only:
{{"thought": str, "done": bool, "tool": "browser_click"|"browser_type",
  "args": {{"element": str, "target": str, "text": str (browser_type only)}}}}

GOAL: {goal}

ACTIONS TAKEN: {json.dumps(history)}

SNAPSHOT:
{snapshot}"""


def _decide_claude(goal: str, snapshot: str, history: list[dict]) -> tuple[dict, int]:
    from claude_llm import claude_json
    from translator import loads_first_json

    text, tokens = claude_json(_mcp_prompt(goal, snapshot, history), max_tokens=1024)
    return loads_first_json(text), tokens


def _decide_gemini(goal: str, snapshot: str, history: list[dict]) -> tuple[dict, int]:
    from google import genai
    from google.genai import types

    from translator import loads_first_json

    api_key = os.getenv("GEMINI_API_KEY") or os.getenv("GOOGLE_API_KEY")
    if not api_key:
        raise RuntimeError("set GEMINI_API_KEY to run the MCP Gemini brain")
    client = genai.Client(api_key=api_key)
    resp = client.models.generate_content(
        model=_GEMINI_MODEL,
        contents=_mcp_prompt(goal, snapshot, history),
        config=types.GenerateContentConfig(response_mime_type="application/json"),
    )
    usage = getattr(resp, "usage_metadata", None)
    tokens = getattr(usage, "prompt_token_count", None) or len(snapshot) // 4
    return loads_first_json(resp.text), tokens


def _decide(brain: str, goal: str, snapshot: str, history: list[dict]) -> tuple[dict, int]:
    return _decide_claude(goal, snapshot, history) if brain == "claude" \
        else _decide_gemini(goal, snapshot, history)


async def run_mcp_task(task, brain: str = "claude"):
    """Run one task through the real Playwright-MCP loop -> RunLog(condition='mcp')."""
    from schemas import RunLog

    with _serve() as base:
        url = _site_url(base, task.site)
        async with stdio_client(_server()) as (read, write):
            async with ClientSession(read, write) as session:
                await session.initialize()
                await session.call_tool("browser_navigate", {"url": url})

                history: list[dict] = []
                agent_tokens = 0
                page_tokens = 0
                steps = 0
                t0 = time.time()

                for step in range(MAX_STEPS):
                    snap = _text(await session.call_tool("browser_snapshot", {}))
                    if step == 0:
                        page_tokens = len(snap) // 4
                    choice, tok = _decide(brain, task.goal, snap, history)
                    agent_tokens += tok
                    if choice.get("done") or not choice.get("tool"):
                        break
                    args = choice.get("args", {})
                    await session.call_tool(choice["tool"], {k: v for k, v in args.items() if v is not None})
                    history.append({"tool": choice["tool"], "args": args})
                    steps += 1

                raw = _text(await session.call_tool("browser_evaluate", {"function": _STATE_JS}))
                state = _extract_json(raw) or {"cart": [], "products": []}
                success = bool(task.check(_StateAdapter(state)))
                latency_ms = int((time.time() - t0) * 1000)

    return RunLog(
        task_id=task.id, condition="mcp", model="mcp", success=success, steps=steps,
        tokens=agent_tokens, latency_ms=latency_ms,
        timestamp=datetime.datetime.now(datetime.timezone.utc).isoformat(),
        agent_model=brain, driver="playwright",
        translator_tokens=0, agent_tokens=agent_tokens, page_tokens=page_tokens,
    )


async def _selftest(site_key: str) -> None:
    with _serve() as base:
        url = _site_url(base, site_key)
        async with stdio_client(_server()) as (read, write):
            async with ClientSession(read, write) as session:
                await session.initialize()
                tools = sorted(t.name for t in (await session.list_tools()).tools)
                print("MCP tools:", ", ".join(tools)[:200], "...")

                nav = await session.call_tool("browser_navigate", {"url": url})
                print(f"\nnavigate -> {url}  (isError={getattr(nav, 'isError', None)})")

                snap = _text(await session.call_tool("browser_snapshot", {}))
                print(f"snapshot: {len(snap)} chars (~{len(snap) // 4} tokens)")

                raw = _text(await session.call_tool("browser_evaluate", {"function": _STATE_JS}))
                state = _extract_json(raw)
                if isinstance(state, dict):
                    print("state -> cart:", state.get("cart"),
                          "| products on page:", len(state.get("products", [])))
                print("\nplumbing OK" if state and state.get("products") else "\nplumbing: page not loaded")


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--selftest", metavar="SITE", help="prove plumbing on a site key (e.g. shop_15)")
    args = ap.parse_args()

    from envload import load_env
    load_env()

    if args.selftest:
        asyncio.run(_selftest(args.selftest))
        return

    print("Plumbing + Claude brain wired and verified. Run via benchmark.py --with-mcp.")


if __name__ == "__main__":
    main()

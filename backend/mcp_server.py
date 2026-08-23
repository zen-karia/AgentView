"""AgentView as an MCP server -- "someone else uses our model from their Claude Code".

Exposes ONE tool, agentview_run(url, goal), over streamable-HTTP. It runs the full
e2e on THIS machine (real browser + your trained model + agent loop) and returns
the step log. Front it with an ngrok tunnel and anyone can add it to their client:

  # 1) run it (token-gate it before exposing publicly):
  AGENTVIEW_MCP_TOKEN=some-secret python3 mcp_server.py       # -> http://127.0.0.1:8000/mcp
  # 2) expose it:
  ngrok http 8000                                             # -> https://xxxx.ngrok-free.app
  # 3) they add it:
  claude mcp add --transport http agentview https://xxxx.ngrok-free.app/mcp \
      --header "Authorization: Bearer some-secret"

Tool functions are SYNC on purpose: FastMCP runs them in a worker thread, so the
sync Playwright driver never touches the server's asyncio loop.
"""
from __future__ import annotations

import os

from envload import load_env

load_env()

from mcp.server.fastmcp import FastMCP
from mcp.server.transport_security import TransportSecuritySettings

from agent_run import run_workflow

mcp = FastMCP(
    "agentview",
    instructions="Run a goal-conditioned web-agent workflow on any URL using the "
    "AgentView trained perception model. Call agentview_run with a url and a goal.",
    # We sit behind an ngrok tunnel (host changes each restart) and gate with a
    # bearer token, so disable the SDK's default localhost-only host check (which
    # rejects the ngrok domain with 421 Misdirected Request).
    transport_security=TransportSecuritySettings(enable_dns_rebinding_protection=False),
    # Plain-JSON, stateless responses (no long-lived SSE stream) -- proxies like
    # ngrok buffer SSE, which makes tools/list hang. This makes every call a simple
    # request/response any client handles cleanly through the tunnel.
    json_response=True,
    stateless_http=True,
)


@mcp.tool()
async def agentview_run(url: str, goal: str, model: str = "trained") -> str:
    """Open `url` in a real browser, turn the live page into a goal-conditioned
    AgentView with `model` (trained = the distilled AgentView model; openrouter =
    gemini prompting as a fallback), and let a Claude agent act toward `goal`.

    Returns the step-by-step action log (each step's chosen action + reasoning) and
    the final page state. The full trace is also persisted to MongoDB.
    """
    import functools

    import anyio

    # run_workflow uses the SYNC Playwright API; offload it to a worker thread so it
    # never runs inside the server's asyncio loop ("use the Async API" error).
    result = await anyio.to_thread.run_sync(
        functools.partial(run_workflow, url, goal, model=model,
                          agent_model="openrouter", fallback="openrouter")
    )
    return result["log"]


@mcp.custom_route("/health", methods=["GET"])
async def _health(request):
    from starlette.responses import PlainTextResponse

    return PlainTextResponse("ok")


def build_app():
    """Starlette ASGI app for the MCP endpoint, token-gated when AGENTVIEW_MCP_TOKEN
    is set (leave /health open for a quick connectivity check)."""
    app = mcp.streamable_http_app()
    token = os.getenv("AGENTVIEW_MCP_TOKEN")
    if token:
        from starlette.middleware.base import BaseHTTPMiddleware
        from starlette.responses import JSONResponse

        async def _auth(request, call_next):
            if request.url.path == "/health":
                return await call_next(request)
            if request.headers.get("authorization") != f"Bearer {token}":
                return JSONResponse({"error": "unauthorized"}, status_code=401)
            return await call_next(request)

        app.add_middleware(BaseHTTPMiddleware, dispatch=_auth)
    return app


if __name__ == "__main__":
    import uvicorn

    port = int(os.getenv("PORT", "8000"))
    gated = "token-gated" if os.getenv("AGENTVIEW_MCP_TOKEN") else "OPEN — set AGENTVIEW_MCP_TOKEN before exposing!"
    print(f"AgentView MCP server -> http://127.0.0.1:{port}/mcp   ({gated})")
    uvicorn.run(build_app(), host="127.0.0.1", port=port)

"""Live agent workflow on ANY url + a natural-language goal.

Claude Code is the front door: type "open <url> and <goal>" in plain English and
Claude Code pulls out the url + goal and runs this. Or call it directly:

  python3 agent_run.py --url https://example.com --goal "add the cheapest blue shirt to the cart"
  python3 agent_run.py "open https://example.com and add the cheapest blue shirt to the cart"

It opens the url in a real browser, turns the LIVE page into an AgentView via the
trained model by default (--model trained, your Freesolo model). Add
--fallback openrouter to have a prompted frontier model take over ONLY when the
trained model can't produce a view (the Layer-1 -> Layer-0 story). It then lets
the agent act, prints each step's reasoning + action AS IT GOES, and persists the
run + full turn trace to agentview.runs.

There is no automatic success check on an arbitrary page -- read the step log and
the final state.
"""
from __future__ import annotations

import argparse
import datetime
import re
import time

from envload import load_env

load_env()

from agent import decide
from logger import save_run
from playwright_driver import PlaywrightDriver
from schemas import RunLog, TranslatorInput
from translator import translate
from verifier import ground_check

_URL_RE = re.compile(r"(?:https?|file)://[^\s\"'<>]+")


def _parse(argv=None) -> argparse.Namespace:
    ap = argparse.ArgumentParser(description="Run a live agent workflow on any url.")
    ap.add_argument("text", nargs="*", help="natural language, e.g. 'open <url> and <goal>'")
    ap.add_argument("--url", help="page to open (else extracted from the text)")
    ap.add_argument("--goal", help="task in plain English (else the whole text)")
    ap.add_argument("--model", default="trained",
                    choices=["stub", "gemini", "claude", "openrouter", "trained"],
                    help="translator that builds the AgentView (default: trained = your model)")
    ap.add_argument("--fallback", default=None,
                    choices=["gemini", "claude", "openrouter"],
                    help="Layer-0 fallback: if the trained model returns an empty view, "
                         "re-translate that step with this prompted model (logged transparently)")
    ap.add_argument("--agent-model", default="openrouter",
                    choices=["stub", "gemini", "claude", "openrouter"])
    ap.add_argument("--steps", type=int, default=8, help="max agent steps")
    args = ap.parse_args(argv)

    nl = " ".join(args.text).strip()
    if not args.url:
        m = _URL_RE.search(nl)
        args.url = m.group(0) if m else None
    if not args.goal:
        # goal = the sentence minus the url (fallback to the whole text)
        args.goal = (_URL_RE.sub("", nl).strip(" .") or nl) if nl else None
    if not args.url or not args.goal:
        ap.error("need a url and a goal (via --url/--goal or a natural-language string)")
    return args


def run_workflow(url: str, goal: str, model: str = "trained",
                 agent_model: str = "openrouter", fallback: str | None = "openrouter",
                 steps: int = 8) -> dict:
    """The reusable e2e core: open `url` in a real browser, build an AgentView with
    `model`, let the agent act, persist the trace. Returns a dict with a readable
    `log`, the step records, final page state, token counts, and the mongo task_id.
    Both the CLI (main) and the MCP server call this."""
    log: list[str] = []

    def emit(line: str) -> None:
        log.append(line)

    driver = PlaywrightDriver(url)
    history: list[dict] = []
    turns: list[dict] = []
    ttok = atok = ptok = 0
    t0 = time.time()
    emit(f"🌐  {url}")
    emit(f"🎯  {goal}")
    emit(f"    translator={model}  agent={agent_model}")
    state: dict = {}
    try:
        for step in range(steps):
            try:
                page = driver.snapshot()
                if step == 0:
                    ptok = len(page.html) // 4
                view, tok = translate(TranslatorInput(goal, page), "translated", model, driver)
                ttok += tok
                # Layer-1 first; fall back to a frontier translator only if the trained
                # model couldn't surface any action (its "can't advance" signal).
                if not view.actions and fallback and fallback != model:
                    emit(f"      ↳ {model} produced no view — falling back to {fallback}")
                    view, tok = translate(TranslatorInput(goal, page), "translated", fallback, driver)
                    ttok += tok
                choice, at = decide(goal, view, history, agent_model)
                atok += at
            except Exception as exc:
                # A flaky translate/decide (e.g. malformed model JSON) stops this run
                # cleanly instead of crashing the caller/MCP tool.
                emit(f"[{step}] ⚠️  step failed: {type(exc).__name__}: {str(exc)[:120]}")
                break

            if choice.done or not choice.name:
                emit(f"[{step}] ✓ done — {choice.thought or 'goal satisfied'}")
                turns.append({"step": step, "action": None, "thought": choice.thought})
                break

            grounded, info = ground_check(view, choice, driver)
            emit(f"[{step}] {choice.name}({choice.params})  ->  {info}   grounded={grounded}")
            if choice.thought:
                emit(f"      ↳ {choice.thought}")
            turns.append({"step": step, "action": choice.name, "params": choice.params,
                          "grounded": grounded, "info": info, "thought": choice.thought})
            if not grounded:
                emit("      ✗ action didn't resolve to a real element — stopping")
                break
            driver.execute(info, choice.name, choice.params)
            history.append({"name": choice.name, "params": choice.params})

        try:
            state = driver.state()
        except Exception:
            state = {}
        emit(f"📋  final page state: {state}")
    finally:
        driver.close()

    task_id = f"live-{int(t0 * 1000)}"
    run = RunLog(
        task_id=task_id, condition="translated", model=model,
        success=False,  # no automatic verifier on an arbitrary url
        steps=len(history), tokens=ttok + atok,
        latency_ms=int((time.time() - t0) * 1000),
        timestamp=datetime.datetime.now(datetime.timezone.utc).isoformat(),
        agent_model=agent_model, driver="playwright", turns=turns,
        translator_tokens=ttok, agent_tokens=atok, page_tokens=ptok,
    )
    try:
        save_run(run)
        emit(f"💾  saved trace to agentview.runs (task_id={task_id}, {len(history)} steps, {ttok + atok} tokens)")
    except Exception as exc:
        emit(f"⚠️  mongo save skipped: {exc}")

    return {"url": url, "goal": goal, "translator": model, "agent": agent_model,
            "steps": turns, "final_state": state, "translator_tokens": ttok,
            "agent_tokens": atok, "latency_ms": run.latency_ms, "task_id": task_id,
            "log": "\n".join(log)}


def main(argv=None) -> None:
    args = _parse(argv)
    result = run_workflow(args.url, args.goal, model=args.model,
                          agent_model=args.agent_model, fallback=args.fallback, steps=args.steps)
    print("\n" + result["log"])


if __name__ == "__main__":
    main()

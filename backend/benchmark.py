"""Benchmark: run every task x every condition, aggregate, print the scoreboard.

Five metrics per condition, holding the AGENT constant and varying only the
perception layer:
  success    -- did the verifier confirm completion (X/N)
  frontier   -- tokens that hit the expensive model (the token/cost axis)
  cost USD   -- seat-weighted cost
  time ms    -- avg latency (run with --reps to smooth this noisy axis)
  goal-cond  -- agent_tokens / page_tokens (~1.0 generic snapshot, <<1.0 conditioned)

Conditions: raw, markdown_baseline, translated (via the harness), and -- with
--with-mcp -- the real Playwright-MCP competitor (its own browser + Gemini brain).

  python3 benchmark.py                                  # stub, in-memory
  python3 benchmark.py --reps 3                         # 3x each, average
  python3 benchmark.py --model gemini --agent-model gemini --driver playwright --with-mcp   # real (needs key)
"""
from __future__ import annotations

import argparse
import asyncio
import datetime
import os

from costs import frontier_tokens, token_cost_usd
from envload import load_env
from harness import run_task
from tasks import TASKS

load_env()

BASE_CONDITIONS = ["raw", "markdown_baseline", "translated"]


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--model", default="stub", choices=["stub", "gemini", "claude", "trained"])
    ap.add_argument("--agent-model", default="stub", choices=["stub", "gemini", "claude"])
    ap.add_argument("--driver", default="fake", choices=["fake", "playwright"])
    ap.add_argument("--reps", type=int, default=1, help="runs per task (averages latency/success noise)")
    ap.add_argument("--with-mcp", action="store_true",
                    help="also run the real Playwright-MCP condition (needs Gemini key)")
    ap.add_argument("--freesolo-model", default=None,
                    help="override the trained-translator model (<run-id>)")
    args = ap.parse_args()

    if args.freesolo_model:  # CLI flag wins over .env / default
        os.environ["FREESOLO_MODEL"] = args.freesolo_model

    from logger import save_results, save_run

    conditions = list(BASE_CONDITIONS) + (["mcp"] if args.with_mcp else [])

    make_driver = None
    if args.driver == "playwright":
        from run import _playwright_factory

        make_driver = _playwright_factory()

    def _do_run(task, cond):
        # mcp is its own stack (own browser + Gemini brain); everything else is the harness.
        if cond == "mcp":
            from mcp_runner import run_mcp_task

            return asyncio.run(run_mcp_task(task))
        return run_task(task, cond, args.model, agent_model=args.agent_model, make_driver=make_driver)

    def _blank():
        return {"pass": 0, "n": 0, "frontier": 0, "cost": 0.0,
                "latency": 0, "agent_tok": 0, "page_tok": 0}

    agg = {c: _blank() for c in conditions}
    by_size: dict[int, dict[str, dict]] = {}

    for _ in range(args.reps):
        for task in TASKS.values():
            for cond in conditions:
                run = _do_run(task, cond)
                save_run(run)
                buckets = [agg[cond]]
                if task.size:
                    buckets.append(by_size.setdefault(task.size, {c: _blank() for c in conditions})[cond])
                for a in buckets:
                    a["n"] += 1
                    a["pass"] += int(run.success)
                    a["frontier"] += frontier_tokens(run)
                    a["cost"] += token_cost_usd(run)
                    a["latency"] += run.latency_ms
                    a["agent_tok"] += run.agent_tokens
                    a["page_tok"] += run.page_tokens

    def _row(cond: str, a: dict) -> str:
        gc = a["agent_tok"] / (a["page_tok"] or 1)
        return (f"{cond:<18}{a['pass']}/{a['n']:<8}{a['frontier'] // a['n']:<12}"
                f"{a['cost'] / a['n']:<12.6f}{a['latency'] // a['n']:<9}{gc:.2f}")

    header = f"{'condition':<18}{'success':<10}{'frontier':<12}{'cost USD':<12}{'time ms':<9}{'goal-cond'}"
    print(f"\n{len(TASKS)} tasks x {len(conditions)} conditions x {args.reps} reps "
          f"(translator={args.model}, agent={args.agent_model}, driver={args.driver})\n")
    print(header)
    for cond in conditions:
        print(_row(cond, agg[cond]))

    for size in sorted(by_size):
        print(f"\n-- page size {size} items --")
        print(header)
        for cond in conditions:
            print(_row(cond, by_size[size][cond]))

    # Dashboard-ready aggregates -> agentview.results (success_rate + goal_cond explicit)
    run_id = datetime.datetime.now(datetime.timezone.utc).isoformat()

    def _result(cond: str, a: dict, size) -> dict:
        n = a["n"] or 1
        return {
            "run_id": run_id,
            "condition": cond,
            "model": "mcp" if cond == "mcp" else args.model,
            "agent_model": "claude" if cond == "mcp" else args.agent_model,  # MCP brain
            "driver": "playwright" if cond == "mcp" else args.driver,
            "size": size,
            "n": a["n"],
            "success_rate": round(a["pass"] / n, 3),
            "goal_conditioning": round(a["agent_tok"] / (a["page_tok"] or 1), 3),
            "avg_frontier_tokens": a["frontier"] // n,
            "avg_cost_usd": round(a["cost"] / n, 8),
            "avg_latency_ms": a["latency"] // n,
            "timestamp": run_id,
        }

    rows = [_result(c, agg[c], None) for c in conditions]
    for size in sorted(by_size):
        rows += [_result(c, by_size[size][c], size) for c in conditions]
    save_results(rows)
    print(f"\nwrote {len(rows)} aggregate rows -> agentview.results (+ runs/results.json)")


if __name__ == "__main__":
    main()

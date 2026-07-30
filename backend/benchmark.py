"""Benchmark: run every task x every condition, aggregate, print the scoreboard.

This is the number that goes on the dashboard and in the Deloitte/Freesolo pitch.
Holds the AGENT constant across conditions and varies only the perception layer.

  python3 benchmark.py                                  # stub, in-memory
  python3 benchmark.py --driver playwright              # real browser
  python3 benchmark.py --model gemini --agent-model gemini --driver playwright   # real (needs key)
"""
from __future__ import annotations

import argparse

from costs import frontier_tokens, token_cost_usd
from envload import load_env
from harness import run_task
from logger import save_run
from tasks import TASKS

load_env()

CONDITIONS = ["raw", "markdown_baseline", "translated"]


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--model", default="stub", choices=["stub", "gemini", "trained"])
    ap.add_argument("--agent-model", default="stub", choices=["stub", "gemini"])
    ap.add_argument("--driver", default="fake", choices=["fake", "playwright"])
    args = ap.parse_args()

    make_driver = None
    if args.driver == "playwright":
        from run import _playwright_factory

        make_driver = _playwright_factory()

    agg = {c: {"pass": 0, "n": 0, "steps": 0, "frontier": 0, "cost": 0.0} for c in CONDITIONS}
    for task in TASKS.values():
        for cond in CONDITIONS:
            run = run_task(
                task, cond, args.model,
                agent_model=args.agent_model, make_driver=make_driver,
            )
            save_run(run)
            a = agg[cond]
            a["n"] += 1
            a["pass"] += int(run.success)
            a["steps"] += run.steps
            a["frontier"] += frontier_tokens(run)
            a["cost"] += token_cost_usd(run)

    print(f"\n{len(TASKS)} tasks x {len(CONDITIONS)} conditions "
          f"(translator={args.model}, agent={args.agent_model}, driver={args.driver})\n")
    print(f"{'condition':<18}{'success':<10}{'avg steps':<11}"
          f"{'frontier tok':<14}{'cost USD':<12}{'cheaper vs raw'}")
    raw_cost = agg["raw"]["cost"] or 1e-12
    for cond in CONDITIONS:
        a = agg[cond]
        success = f"{a['pass']}/{a['n']}"
        savings = raw_cost / (a["cost"] or 1e-12)
        print(f"{cond:<18}{success:<10}{a['steps'] / a['n']:<11.1f}"
              f"{a['frontier']:<14}{a['cost']:<12.6f}{savings:.1f}x")


if __name__ == "__main__":
    main()

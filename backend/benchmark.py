"""Benchmark: run every task x every condition, aggregate, print the scoreboard.

Five metrics per condition, holding the AGENT constant and varying only the
perception layer:
  success    -- did the verifier confirm completion (X/N)
  frontier   -- tokens that hit the expensive model (the token/cost axis)
  cost USD   -- seat-weighted cost
  time ms    -- avg latency (run with --reps to smooth this noisy axis)
  goal-cond  -- agent_tokens / page_tokens (~1.0 generic snapshot, <<1.0 conditioned)

  python3 benchmark.py                                  # stub, in-memory
  python3 benchmark.py --reps 3                         # 3x each, average
  python3 benchmark.py --model gemini --agent-model gemini --driver playwright   # real (needs key)
"""
from __future__ import annotations

import argparse
import os

from costs import frontier_tokens, token_cost_usd
from envload import load_env
from harness import run_task
from tasks import TASKS

load_env()

CONDITIONS = ["raw", "markdown_baseline", "translated"]


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--model", default="stub", choices=["stub", "gemini", "trained"])
    ap.add_argument("--agent-model", default="stub", choices=["stub", "gemini"])
    ap.add_argument("--driver", default="fake", choices=["fake", "playwright"])
    ap.add_argument("--reps", type=int, default=1, help="runs per task (averages latency/success noise)")
    ap.add_argument("--freesolo-model", default=None,
                    help="override the trained-translator model (<run-id>)")
    args = ap.parse_args()

    if args.freesolo_model:  # CLI flag wins over .env / default
        os.environ["FREESOLO_MODEL"] = args.freesolo_model

    from logger import save_run

    make_driver = None
    if args.driver == "playwright":
        from run import _playwright_factory

        make_driver = _playwright_factory()

    def _blank():
        return {"pass": 0, "n": 0, "frontier": 0, "cost": 0.0,
                "latency": 0, "agent_tok": 0, "page_tok": 0}

    # overall per condition, and per (size bucket, condition)
    agg = {c: _blank() for c in CONDITIONS}
    by_size: dict[int, dict[str, dict]] = {}

    for _ in range(args.reps):
        for task in TASKS.values():
            for cond in CONDITIONS:
                run = run_task(task, cond, args.model,
                               agent_model=args.agent_model, make_driver=make_driver)
                save_run(run)
                buckets = [agg[cond]]
                if task.size:
                    buckets.append(by_size.setdefault(task.size, {c: _blank() for c in CONDITIONS})[cond])
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
    print(f"\n{len(TASKS)} tasks x {len(CONDITIONS)} conditions x {args.reps} reps "
          f"(translator={args.model}, agent={args.agent_model}, driver={args.driver})\n")
    print(header)
    for cond in CONDITIONS:
        print(_row(cond, agg[cond]))

    for size in sorted(by_size):
        print(f"\n-- page size {size} items --")
        print(header)
        for cond in CONDITIONS:
            print(_row(cond, by_size[size][cond]))


if __name__ == "__main__":
    main()

"""CLI: run a task under one or all conditions and print the result.

  python3 run.py                    # t01, translated, stub
  python3 run.py --condition raw
  python3 run.py --all-conditions   # race raw vs markdown vs translated (the demo)

Run from inside backend/ so the flat module imports resolve.
"""
from __future__ import annotations

import argparse
import pathlib

from harness import run_task
from logger import save_run
from tasks import TASKS

_SHOP_URL = (pathlib.Path(__file__).parent / "sites" / "shop" / "index.html").as_uri()


def _playwright_factory():
    """Build a fresh real-browser driver pointed at the demo shop."""
    from playwright_driver import PlaywrightDriver

    return lambda: PlaywrightDriver(_SHOP_URL)


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--task", default="t01_cheapest_blue_shirt")
    ap.add_argument(
        "--condition",
        default="translated",
        choices=["translated", "raw", "markdown_baseline"],
    )
    ap.add_argument("--model", default="stub", choices=["stub", "gemini", "trained"],
                    help="translator model (produces the AgentView)")
    ap.add_argument("--agent-model", default="stub", choices=["stub", "gemini"],
                    help="reasoner model (consumes the AgentView, picks actions)")
    ap.add_argument("--driver", default="fake", choices=["fake", "playwright"],
                    help="fake = in-memory; playwright = real browser on the demo site")
    ap.add_argument("--all-conditions", action="store_true")
    args = ap.parse_args()

    make_driver = _playwright_factory() if args.driver == "playwright" else None

    task = TASKS[args.task]
    conditions = (
        ["raw", "markdown_baseline", "translated"]
        if args.all_conditions
        else [args.condition]
    )

    for cond in conditions:
        run = run_task(
            task, cond, args.model,
            agent_model=args.agent_model, make_driver=make_driver,
        )
        save_run(run)
        mark = "PASS" if run.success else "FAIL"
        print(
            f"[{mark}] {cond:<17} steps={run.steps} "
            f"tok(transl/agent/total)={run.translator_tokens}/{run.agent_tokens}/{run.tokens} "
            f"latency={run.latency_ms}ms"
        )


if __name__ == "__main__":
    main()

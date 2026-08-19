"""Generate the Layer 1 training set from Layer 0 runs.

Run every task through the translated condition, keep only the runs the verifier
marked success:true, and emit each turn's (translator input -> AgentView) as a
Freesolo SFT row. Keeping only successful runs is the reward-filtering that makes
the trained translator learn views that actually work.

  python3 datagen.py                                     # stub -> tests the PIPELINE
  python3 datagen.py --model gemini --agent-model gemini --driver playwright   # REAL data (key)

NOTE: stub data trains a model to mimic a hardcoded function -- useful only to test
the pipeline. Real, useful data needs --model gemini (a Gemini key).
"""
from __future__ import annotations

import argparse
import json
import pathlib

from envload import load_env
from freesolo import to_record
from harness import run_task
from tasks import TASKS

load_env()


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--model", default="stub", choices=["stub", "gemini"],
                    help="translator that produces the training AgentViews")
    ap.add_argument("--agent-model", default="stub", choices=["stub", "gemini"])
    ap.add_argument("--driver", default="fake", choices=["fake", "playwright"])
    ap.add_argument("--repeat", type=int, default=1, help="passes over the task set")
    ap.add_argument("--out", default="dataset/train.jsonl")
    args = ap.parse_args()

    make_driver = None
    if args.driver == "playwright":
        from run import _playwright_factory

        make_driver = _playwright_factory()

    records: list[dict] = []
    kept_runs = total_runs = 0
    for _ in range(args.repeat):
        for task in TASKS.values():
            total_runs += 1
            run = run_task(task, "translated", args.model,
                           agent_model=args.agent_model, make_driver=make_driver,
                           record_training=True)
            if not run.success:
                continue
            kept_runs += 1
            for turn in run.turns:
                pair = turn.get("train")
                if pair:
                    records.append(to_record(
                        pair["prompt"], pair["agentview"],
                        metadata={"task_id": run.task_id, "site": task.site},
                    ))

    out = pathlib.Path(args.out)
    out.parent.mkdir(parents=True, exist_ok=True)
    with out.open("w") as f:
        for r in records:
            f.write(json.dumps(r) + "\n")

    print(f"kept {kept_runs}/{total_runs} runs -> {len(records)} SFT records -> {out}")


if __name__ == "__main__":
    main()

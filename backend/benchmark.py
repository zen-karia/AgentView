"""Benchmark: run every task x every condition, aggregate, print the scoreboard.

Five metrics per condition, holding the AGENT constant and varying only the
perception layer:
  success    -- did the verifier confirm completion (X/N)
  frontier   -- tokens that hit the expensive model (the token/cost axis)
  cost USD   -- seat-weighted cost
  time ms    -- avg latency (run with --reps to smooth this noisy axis)
  goal-cond  -- agent_tokens / page_tokens (~1.0 generic snapshot, <<1.0 conditioned)

The headline comparison is translator-vs-translator: WHO produces the AgentView --
a prompted frontier model (claude) vs our distilled small model (trained) -- holding
the agent + view schema constant. Each translator gets its own translated[<m>] row
(same five metrics). raw / markdown_baseline / mcp (--with-mcp, the real Playwright-MCP
competitor + Claude brain) stay as context baselines.

  python3 benchmark.py                                  # stub, in-memory
  python3 benchmark.py --translators claude,trained --agent-model claude --driver playwright --reps 3
  python3 benchmark.py --translators claude,trained --agent-model claude --driver playwright --with-mcp
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


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--model", default="stub", choices=["stub", "gemini", "claude", "openrouter", "trained"])
    ap.add_argument("--translators", default=None,
                    help="comma-separated translators to compare head-to-head on the "
                         "translated condition, e.g. 'claude,trained' (default: --model). "
                         "Each gets its own translated[<m>] row -- same agent, same metrics.")
    ap.add_argument("--agent-model", default="stub", choices=["stub", "gemini", "claude", "openrouter"])
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

    # The comparison is translator-vs-translator: one translated[<m>] row per model,
    # holding the agent + view schema constant. raw/markdown/mcp stay as context.
    translators = ([m.strip() for m in args.translators.split(",")]
                   if args.translators else [args.model])
    conditions = (["raw", "markdown_baseline"]
                  + [f"translated[{m}]" for m in translators]
                  + (["mcp"] if args.with_mcp else []))

    # MCP has no translator -- its brain IS the agent. Track the agent seat so the
    # whole run stays on one model family (falls back to claude for stub agents).
    mcp_brain = args.agent_model if args.agent_model in ("claude", "gemini", "openrouter") else "claude"

    def _split(cond: str) -> tuple[str, str]:
        """Display condition -> (condition, translator model) for the results rows."""
        if cond.startswith("translated["):
            return "translated", cond[len("translated["):-1]
        if cond == "mcp":
            return "mcp", "mcp"
        return cond, translators[0]  # raw/markdown: translator is irrelevant (0 tokens)

    make_driver = None
    if args.driver == "playwright":
        from run import _playwright_factory

        make_driver = _playwright_factory()

    def _do_run(task, cond):
        # mcp is its own stack (own browser + Claude brain); everything else is the harness.
        if cond == "mcp":
            from mcp_runner import run_mcp_task

            return asyncio.run(run_mcp_task(task, brain=mcp_brain))
        base_cond, model = _split(cond)
        return run_task(task, base_cond, model, agent_model=args.agent_model, make_driver=make_driver)

    def _blank():
        return {"pass": 0, "n": 0, "frontier": 0, "cost": 0.0,
                "latency": 0, "agent_tok": 0, "page_tok": 0}

    agg = {c: _blank() for c in conditions}
    by_bucket: dict[str, dict[str, dict]] = {}

    for _ in range(args.reps):
        for task in TASKS.values():
            for cond in conditions:
                try:
                    run = _do_run(task, cond)
                except Exception as exc:  # one flaky run must not sink the whole benchmark
                    print(f"[benchmark] skipped {task.id}/{cond}: {exc}")
                    continue
                save_run(run)
                buckets = [agg[cond]]
                label = task.bucket or (str(task.size) if task.size else "")
                if label:
                    buckets.append(by_bucket.setdefault(label, {c: _blank() for c in conditions})[cond])
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
        return (f"{cond:<22}{a['pass']}/{a['n']:<8}{a['frontier'] // a['n']:<12}"
                f"{a['cost'] / a['n']:<12.6f}{a['latency'] // a['n']:<9}{gc:.2f}")

    header = f"{'condition':<22}{'success':<10}{'frontier':<12}{'cost USD':<12}{'time ms':<9}{'goal-cond'}"
    print(f"\n{len(TASKS)} tasks x {len(conditions)} conditions x {args.reps} reps "
          f"(translators={','.join(translators)}, agent={args.agent_model}, driver={args.driver})\n")
    print(header)
    for cond in conditions:
        print(_row(cond, agg[cond]))

    for label in sorted(by_bucket):
        print(f"\n-- bucket {label} --")
        print(header)
        for cond in conditions:
            print(_row(cond, by_bucket[label][cond]))

    # Dashboard-ready aggregates -> agentview.results (success_rate + goal_cond explicit)
    run_id = datetime.datetime.now(datetime.timezone.utc).isoformat()

    def _result(cond: str, a: dict, bucket) -> dict:
        n = a["n"] or 1
        base_cond, model = _split(cond)
        return {
            "run_id": run_id,
            "condition": base_cond,       # raw | markdown_baseline | translated | mcp
            "model": model,               # the translator (claude/trained/...) or "mcp"
            "agent_model": mcp_brain if cond == "mcp" else args.agent_model,
            "driver": "playwright" if cond == "mcp" else args.driver,
            "bucket": bucket,  # "all" or a size/trap bucket label
            "n": a["n"],
            "success_rate": round(a["pass"] / n, 3),
            "goal_conditioning": round(a["agent_tok"] / (a["page_tok"] or 1), 3),
            "avg_frontier_tokens": a["frontier"] // n,
            "avg_cost_usd": round(a["cost"] / n, 8),
            "avg_latency_ms": a["latency"] // n,
            "timestamp": run_id,
        }

    rows = [_result(c, agg[c], "all") for c in conditions]
    for label in sorted(by_bucket):
        rows += [_result(c, by_bucket[label][c], label) for c in conditions]
    save_results(rows)
    print(f"\nwrote {len(rows)} aggregate rows -> agentview.results (+ runs/results.json)")


if __name__ == "__main__":
    main()

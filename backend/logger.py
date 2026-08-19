"""Run logging. Always writes JSON files; also writes to MongoDB when MONGODB_URI
is set (the MLH Mongo/Atlas track). Two collections in the `agentview` database:

  runs     -- one doc per (task, condition, model, agent, driver) run. Raw detail
              + per-turn trace. Source of truth and the Model lane's training data.
  results  -- one aggregate doc per (run_id, condition, model, bucket): the
              dashboard-ready summary with success_rate + goal_conditioning explicit.

Logging must NEVER break a run/benchmark, so Mongo errors are swallowed and the
JSON files are the fallback.
"""
from __future__ import annotations

import json
import os
import pathlib

from schemas import RunLog

_LOG_DIR = pathlib.Path(__file__).parent / "runs"

_mongo_db = None
_mongo_resolved = False


def _db():
    """Resolve the Mongo database once, reused across writes. None if unavailable."""
    global _mongo_db, _mongo_resolved
    if _mongo_resolved:
        return _mongo_db
    _mongo_resolved = True
    uri = os.getenv("MONGODB_URI")
    if uri:
        try:
            from pymongo import MongoClient

            kwargs = {"serverSelectionTimeoutMS": 3000}
            try:
                import certifi  # Atlas TLS on macOS python.org builds

                kwargs["tlsCAFile"] = certifi.where()
            except ImportError:
                pass
            _mongo_db = MongoClient(uri, **kwargs)[os.getenv("MONGODB_DB", "agentview")]
        except Exception as exc:
            print(f"[logger] mongo unavailable, JSON only: {exc}")
    return _mongo_db


# Config that uniquely identifies a run for comparison. The UI groups on these.
def _key(run: RunLog) -> dict:
    return {
        "task_id": run.task_id,
        "condition": run.condition,
        "model": run.model,
        "agent_model": run.agent_model,
        "driver": run.driver,
    }


def save_run(run: RunLog) -> None:
    _LOG_DIR.mkdir(exist_ok=True)
    k = _key(run)
    name = f"{k['task_id']}__{k['condition']}__t-{k['model']}__a-{k['agent_model']}__{k['driver']}"
    (_LOG_DIR / f"{name}.json").write_text(json.dumps(run.to_dict(), indent=2))

    db = _db()
    if db is not None:
        try:
            # one authoritative (latest) row per config -- re-runs update in place
            db["runs"].replace_one(_key(run), run.to_dict(), upsert=True)
        except Exception as exc:
            print(f"[logger] mongo runs upsert skipped: {exc}")


def save_results(rows: list[dict]) -> None:
    """Write dashboard-ready aggregate rows to agentview.results (one per config)."""
    _LOG_DIR.mkdir(exist_ok=True)
    (_LOG_DIR / "results.json").write_text(json.dumps(rows, indent=2))

    db = _db()
    if db is not None:
        try:
            for r in rows:
                db["results"].replace_one(
                    {"run_id": r["run_id"], "condition": r["condition"],
                     "model": r["model"], "bucket": r["bucket"]},
                    r, upsert=True,
                )
        except Exception as exc:
            print(f"[logger] mongo results write skipped: {exc}")

"""Run logging. Always writes a JSON file; also inserts into MongoDB when
MONGODB_URI is set (the MLH Mongo/Atlas track).

Logging must NEVER break a run or benchmark, so Mongo errors are swallowed and the
JSON file is the source of truth. The dashboard and datagen read these runs.
"""
from __future__ import annotations

import json
import os
import pathlib

from schemas import RunLog

_LOG_DIR = pathlib.Path(__file__).parent / "runs"

# Cached collection handle: resolved once, reused across the ~51 runs of a benchmark.
_mongo_collection = None
_mongo_resolved = False


def _collection():
    global _mongo_collection, _mongo_resolved
    if _mongo_resolved:
        return _mongo_collection
    _mongo_resolved = True
    uri = os.getenv("MONGODB_URI")
    if uri:
        try:
            from pymongo import MongoClient

            # tlsCAFile=certifi: Atlas needs a real CA bundle, which python.org's
            # macOS build lacks by default (else: CERTIFICATE_VERIFY_FAILED).
            kwargs = {"serverSelectionTimeoutMS": 3000}
            try:
                import certifi

                kwargs["tlsCAFile"] = certifi.where()
            except ImportError:
                pass
            client = MongoClient(uri, **kwargs)
            db = client[os.getenv("MONGODB_DB", "agentview")]
            _mongo_collection = db["runs"]
        except Exception as exc:  # missing pymongo, bad URI, etc.
            print(f"[logger] mongo unavailable, JSON only: {exc}")
    return _mongo_collection


# The config that uniquely identifies a run for comparison. The UI groups on these.
def _key(run: RunLog) -> dict:
    return {
        "task_id": run.task_id,
        "condition": run.condition,
        "model": run.model,          # translator: stub | gemini | trained
        "agent_model": run.agent_model,
        "driver": run.driver,
    }


def save_run(run: RunLog) -> None:
    _LOG_DIR.mkdir(exist_ok=True)
    k = _key(run)
    name = f"{k['task_id']}__{k['condition']}__t-{k['model']}__a-{k['agent_model']}__{k['driver']}"
    (_LOG_DIR / f"{name}.json").write_text(json.dumps(run.to_dict(), indent=2))

    coll = _collection()
    if coll is not None:
        try:
            # Upsert on the config key: one authoritative (latest) row per config, so
            # re-runs update in place instead of piling up duplicates.
            coll.replace_one(_key(run), run.to_dict(), upsert=True)
        except Exception as exc:
            print(f"[logger] mongo upsert skipped: {exc}")

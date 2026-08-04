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


def save_run(run: RunLog) -> None:
    _LOG_DIR.mkdir(exist_ok=True)
    path = _LOG_DIR / f"{run.task_id}__{run.condition}__{run.model}.json"
    path.write_text(json.dumps(run.to_dict(), indent=2))

    coll = _collection()
    if coll is not None:
        try:
            coll.insert_one(run.to_dict())
        except Exception as exc:
            print(f"[logger] mongo insert skipped: {exc}")

"""Run logging. JSON files now; flip to Mongo once MONGODB_URI is set (Lane B2).

Every run is one document. The dashboard reads these; the Model lane mines the
success:true turns for training data. Same store, three readers.
"""
from __future__ import annotations

import json
import os
import pathlib

from schemas import RunLog

_LOG_DIR = pathlib.Path(__file__).parent / "runs"


def save_run(run: RunLog) -> None:
    _LOG_DIR.mkdir(exist_ok=True)
    path = _LOG_DIR / f"{run.task_id}__{run.condition}__{run.model}.json"
    path.write_text(json.dumps(run.to_dict(), indent=2))

    # TODO(B2): when os.getenv("MONGODB_URI") is set, also insert into Mongo:
    #   from pymongo import MongoClient
    #   MongoClient(os.environ["MONGODB_URI"])["agentview"]["runs"].insert_one(run.to_dict())
    _ = os  # placeholder so the import documents the Mongo swap point

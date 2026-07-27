"""Freesolo (flash) adapter -- the ONLY Freesolo-specific code in the project.

Docs: https://freesolo.co/docs
  install : uv tool install freesolo-flash ; flash login --api-key <key>
  dataset : JSONL rows {"input","output","metadata"}  (only these 3 keys survive)
  config  : config.toml (model, algorithm="sft", [environment] id, [train] max_examples)
  train   : flash train config.toml  ->  flash deploy <run-id>
  serve   : OpenAI-compatible endpoint; base_url from `flash deployments --json`
  json out: response_format={"type":"json_schema","json_schema":{"schema": ...}}
"""
from __future__ import annotations

import json

# Env vars we read at inference time (translator.py `_trained_translate`).
API_KEY_ENV = "FREESOLO_API_KEY"
BASE_URL_ENV = "FREESOLO_BASE_URL"  # the openai_base_url from `flash deployments --json`
MODEL_ENV = "FREESOLO_MODEL"        # the deployed <run-id>

DEFAULT_BASE_MODEL = "Qwen/Qwen3.5-4B"

# JSON schema for the AgentView. Passed as response_format so the trained model is
# guaranteed to emit valid AgentView JSON at inference (Freesolo structured outputs).
AGENTVIEW_SCHEMA = {
    "type": "object",
    "properties": {
        "summary": {"type": "string"},
        "relevant_content": {
            "type": "array",
            "items": {
                "type": "object",
                "properties": {
                    "id": {"type": "string"},
                    "text": {"type": "string"},
                    "meta": {"type": "object"},
                },
                "required": ["id", "text"],
            },
        },
        "actions": {
            "type": "array",
            "items": {
                "type": "object",
                "properties": {
                    "name": {"type": "string"},
                    "description": {"type": "string"},
                    "params": {"type": "object"},
                    "target_selector": {"type": "string"},
                },
                "required": ["name", "target_selector"],
            },
        },
    },
    "required": ["summary", "relevant_content", "actions"],
}


def to_record(prompt: str, agentview: dict, metadata: dict | None = None) -> dict:
    """One Freesolo SFT row. Only input/output/metadata survive Flash's ingest, so
    anything else (task_id, etc.) must live under metadata."""
    return {
        "input": prompt,
        "output": json.dumps(agentview, separators=(",", ":")),
        "metadata": metadata or {},
    }

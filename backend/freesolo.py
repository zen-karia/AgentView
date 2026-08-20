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
BASE_URL_ENV = "FREESOLO_BASE_URL"  # override ONLY for a non-default deployment
MODEL_ENV = "FREESOLO_MODEL"        # the deployed <run-id>

# Our deployed serving endpoint (from `flash deployments --json`). FREESOLO_BASE_URL
# overrides it if a redeploy lands on a different host.
DEFAULT_BASE_URL = "https://clado-ai--freesolo-lora-serving.modal.run/v1"
DEFAULT_BASE_MODEL = "Qwen/Qwen3.5-4B"

# The demo model: 4B-v4 (SFT on synthetic + Mind2Web-train real-web rows) — 55%
# strict element accuracy on the Mind2Web sample vs Gemini 35%, 100% in-distribution.
# Override with FREESOLO_MODEL / --freesolo-model to try 9B-v4 (…c6ce6a72) etc.
DEFAULT_MODEL = "flash-1784420990-1f1e3398"


def resolve_base_url(override: str | None) -> str:
    """Default to Freesolo's endpoint; honor an override. Ensure an OpenAI-style
    /v1 suffix so the OpenAI client hits /v1/chat/completions."""
    base = (override or DEFAULT_BASE_URL).rstrip("/")
    return base if base.endswith("/v1") else base + "/v1"

# The TRAINED model's contract (mirrors model/contracts/agentview.schema.json —
# the schema the 4B-v4 adapter was trained under). Passed as response_format so
# structured-output decoding matches training. agentview_bridge.to_backend_view
# maps this into the backend's AgentView shape after the call.
AGENTVIEW_SCHEMA = {
    "type": "object",
    "properties": {
        "schema_version": {"type": "string"},
        "relevant_content": {
            "type": "array",
            "items": {
                "type": "object",
                "properties": {
                    "id": {"type": "string"},
                    "text": {"type": "string"},
                    "selector": {"type": "string"},
                },
                "required": ["id", "text", "selector"],
            },
        },
        "actions": {
            "type": "array",
            "items": {
                "type": "object",
                "properties": {
                    "id": {"type": "string"},
                    "kind": {"type": "string", "enum": ["click", "type", "select"]},
                    "description": {"type": "string"},
                    "target_selector": {"type": "string"},
                    "content_refs": {"type": "array", "items": {"type": "string"}},
                    "value_hint": {"type": "string"},
                },
                "required": ["id", "kind", "description", "target_selector"],
            },
        },
    },
    "required": ["schema_version", "relevant_content", "actions"],
}


def to_record(prompt: str, agentview: dict, metadata: dict | None = None) -> dict:
    """One Freesolo SFT row. Only input/output/metadata survive Flash's ingest, so
    anything else (task_id, etc.) must live under metadata."""
    return {
        "input": prompt,
        "output": json.dumps(agentview, separators=(",", ":")),
        "metadata": metadata or {},
    }

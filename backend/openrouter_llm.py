"""OpenRouter (OpenAI-compatible) LLM helper. One key, any catalog model in any
seat. We use it to run gemini-3.5-flash as the TRANSLATOR without a direct Gemini
key/quota -- the agent stays Claude.

Set in .env:
  OPENROUTER_API_KEY   -- your key
  OPENROUTER_MODEL     -- catalog slug, default google/gemini-3.5-flash
"""
from __future__ import annotations

import os

OPENROUTER_BASE = "https://openrouter.ai/api/v1"
_DEFAULT_MODEL = "google/gemini-3.5-flash"


def openrouter_model() -> str:
    return os.getenv("OPENROUTER_MODEL") or _DEFAULT_MODEL


def openrouter_json(prompt: str, max_tokens: int = 4096, model: str | None = None) -> tuple[str, int]:
    """Return (text, real input tokens) from one OpenRouter chat completion."""
    from openai import OpenAI

    key = os.getenv("OPENROUTER_API_KEY")
    if not key:
        raise RuntimeError("set OPENROUTER_API_KEY to use the openrouter path")
    client = OpenAI(base_url=OPENROUTER_BASE, api_key=key)
    resp = client.chat.completions.create(
        model=model or openrouter_model(),
        messages=[{"role": "user", "content": prompt}],
        max_tokens=max_tokens,
    )
    text = resp.choices[0].message.content or ""
    usage = getattr(resp, "usage", None)
    tokens = getattr(usage, "prompt_tokens", None) or len(prompt) // 4
    return text, tokens

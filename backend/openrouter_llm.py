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
_DEFAULT_MODEL = "google/gemini-3.5-flash"        # translator seat
_DEFAULT_AGENT_MODEL = "anthropic/claude-haiku-4.5"  # agent seat + MCP brain


def openrouter_model() -> str:
    """Translator-seat model (OPENROUTER_MODEL)."""
    return os.getenv("OPENROUTER_MODEL") or _DEFAULT_MODEL


def openrouter_agent_model() -> str:
    """Agent-seat model (OPENROUTER_AGENT_MODEL)."""
    return os.getenv("OPENROUTER_AGENT_MODEL") or _DEFAULT_AGENT_MODEL


def openrouter_mcp_model() -> str:
    """MCP-brain model (OPENROUTER_MCP_MODEL); defaults to the agent-seat model, so
    set it only to drive MCP with a different model (e.g. gemini-3.5-flash)."""
    return os.getenv("OPENROUTER_MCP_MODEL") or openrouter_agent_model()


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

"""Claude (Anthropic) helper for the prompting baseline, the agent reasoner, and
the MCP brain. Official `anthropic` SDK; zero-arg client resolves ANTHROPIC_API_KEY
or an `ant auth login` profile -- no key hardcoded.

Model via CLAUDE_MODEL (default claude-opus-4-8 -- a strong frontier model, which is
what you want as the prompting baseline). Set CLAUDE_MODEL=claude-haiku-4-5 for a
cheap/fast dry run.
"""
from __future__ import annotations

import os

CLAUDE_MODEL = os.getenv("CLAUDE_MODEL", "claude-opus-4-8")


def claude_json(prompt: str, max_tokens: int = 4096) -> tuple[str, int]:
    """Send one prompt, return (response_text, input_tokens). Caller parses JSON."""
    import anthropic

    client = anthropic.Anthropic()  # resolves ANTHROPIC_API_KEY or an ant profile
    resp = client.messages.create(
        model=CLAUDE_MODEL,
        max_tokens=max_tokens,
        messages=[{"role": "user", "content": prompt}],
    )
    text = "".join(b.text for b in resp.content if getattr(b, "type", None) == "text")
    usage = getattr(resp, "usage", None)
    tokens = getattr(usage, "input_tokens", None) or len(prompt) // 4
    return text, tokens

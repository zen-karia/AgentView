"""Cost / energy model. Turns token counts into money and an energy proxy,
weighted by WHICH model sits in each seat -- because the whole thesis is
"do the big, noisy page-read on a cheap model, and let only the tiny distilled
view touch the expensive reasoner."

Rates are illustrative USD per 1M input tokens. Swap in real numbers at demo time.
"""
from __future__ import annotations

FRONTIER_RATE = 0.10  # e.g. a Gemini Flash-class reasoner, per 1M input tokens
CHEAP_RATE = 0.01     # a small distilled translator (Layer 1) or self-hosted


def _translator_rate(model: str) -> float:
    # stub/trained stand in for the small model; a Gemini Layer-0 translator is
    # itself a frontier model -> billed at the frontier rate (why Layer 0 is a
    # capability proof, not a cost proof).
    return CHEAP_RATE if model in ("stub", "trained") else FRONTIER_RATE


def token_cost_usd(run) -> float:
    """USD for one run. The agent seat is ALWAYS the frontier reasoner (fixed)."""
    return (
        run.translator_tokens / 1e6 * _translator_rate(run.model)
        + run.agent_tokens / 1e6 * FRONTIER_RATE
    )


def frontier_tokens(run) -> int:
    """Energy proxy: tokens that hit an expensive model. The Deloitte green number.
    Minimizing this is the whole game -- a cheap translator moves the big read off
    the expensive model."""
    # Any prompted frontier translator (gemini, claude, ...) burns frontier tokens
    # producing the view. Only the trained/stub small model is cheap perception.
    translator_on_frontier = 0 if run.model in ("stub", "trained") else run.translator_tokens
    return translator_on_frontier + run.agent_tokens

"""ReAct-style agent. Reads an AgentView, picks the next action.

model switch:
  stub   -> rule-based demo agent. Proves the loop, handles the shop tasks.
  gemini -> real LLM reasoner (a FIXED general model; NOT the thing we train).

Key guarantee: the agent may only choose from view.actions. It cannot invent an
action that was never surfaced -> that's the action-hallucination guarantee, and
it's why the translated condition can't fabricate a nonexistent button.
"""
from __future__ import annotations

from schemas import ActionChoice, AgentView


def decide(goal: str, view: AgentView, history: list[dict], model: str) -> ActionChoice:
    if model == "stub":
        return _stub_decide(goal, view, history)
    if model == "gemini":
        return _gemini_decide(goal, view, history)  # TODO(model-lane)
    raise ValueError(f"unknown agent model: {model}")


def _stub_decide(goal: str, view: AgentView, history: list[dict]) -> ActionChoice:
    """Placeholder for the LLM reasoner. Handles 'add cheapest <color> ... to cart'.
    Deliberately simple: if there are no surfaced actions (raw/markdown baselines),
    it gives up -> that's why those conditions fail and translated succeeds."""
    if any(h.get("name") == "add_to_cart" for h in history):
        return ActionChoice(name="", done=True, thought="item already added; done")
    if not view.actions:
        return ActionChoice(name="", done=True, thought="no actions surfaced; giving up")

    color = next((c for c in ("blue", "red", "green") if c in goal.lower()), None)
    items = [
        c for c in view.relevant_content
        if color is None or c.meta.get("color") == color
    ]
    if not items:
        return ActionChoice(name="", done=True, thought="no matching item found")

    pick = min(items, key=lambda c: c.meta.get("price", float("inf")))
    return ActionChoice(
        name="add_to_cart",
        params={"product_id": pick.id},
        thought=f"cheapest {color or 'item'} is {pick.id} at ${pick.meta.get('price')}",
    )


def _gemini_decide(goal: str, view: AgentView, history: list[dict]) -> ActionChoice:
    raise NotImplementedError("Wire the reasoner LLM here (fixed general model).")

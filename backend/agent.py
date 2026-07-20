"""ReAct-style agent. Reads an AgentView, picks the next action.

model switch:
  stub   -> rule-based demo agent. Proves the loop, handles the shop tasks.
  gemini -> real LLM reasoner (a FIXED general model; NOT the thing we train).

Key guarantee: the agent may only choose from view.actions. It cannot invent an
action that was never surfaced -> that's the action-hallucination guarantee, and
it's why the translated condition can't fabricate a nonexistent button. We enforce
it in code too: an unsurfaced choice is rejected, not executed.
"""
from __future__ import annotations

import json
import os

from schemas import ActionChoice, AgentView

# Override with GEMINI_MODEL. Flash is cheap + fast, right for a fixed reasoner.
_GEMINI_MODEL = os.getenv("GEMINI_MODEL", "gemini-2.0-flash")


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
    """Real LLM reasoner. Reads the AgentView, returns the next action as JSON.

    Needs GEMINI_API_KEY (or GOOGLE_API_KEY) in the env and `pip install google-genai`.
    """
    from google import genai
    from google.genai import types

    api_key = os.getenv("GEMINI_API_KEY") or os.getenv("GOOGLE_API_KEY")
    if not api_key:
        raise RuntimeError("set GEMINI_API_KEY (or GOOGLE_API_KEY) to use --model gemini")

    client = genai.Client(api_key=api_key)

    content = [{"id": c.id, "text": c.text, "meta": c.meta} for c in view.relevant_content]
    actions = [{"name": a.name, "description": a.description, "params": a.params}
               for a in view.actions]

    prompt = f"""You are a web agent. Pick the single next action to progress on the goal.

GOAL: {goal}

PAGE SUMMARY: {view.summary}

RELEVANT CONTENT:
{json.dumps(content, indent=2)}

AVAILABLE ACTIONS (choose ONLY from these; never invent one):
{json.dumps(actions, indent=2)}

ACTIONS ALREADY TAKEN:
{json.dumps(history, indent=2)}

Reply with JSON only: {{"thought": string, "done": boolean, "name": string, "params": object}}
- done=true and name="" when the goal is already satisfied by the actions taken.
- otherwise set name to one action above and fill params per its schema."""

    resp = client.models.generate_content(
        model=_GEMINI_MODEL,
        contents=prompt,
        config=types.GenerateContentConfig(response_mime_type="application/json"),
    )
    data = json.loads(resp.text)

    name = (data.get("name") or "").strip()
    # Enforce the action-hallucination guarantee in code, not just in the prompt.
    if name and view.action_by_name(name) is None:
        return ActionChoice(
            name="", done=True,
            thought=f"model chose unsurfaced action '{name}'; refusing",
        )
    return ActionChoice(
        name=name,
        params=data.get("params") or {},
        done=bool(data.get("done", False)),
        thought=data.get("thought", ""),
    )

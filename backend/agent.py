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
import re

from schemas import ActionChoice, AgentView

# Override with GEMINI_MODEL. Flash is cheap + fast, right for a fixed reasoner.
_GEMINI_MODEL = os.getenv("GEMINI_MODEL", "gemini-3.1-flash-lite")


def decide(
    goal: str, view: AgentView, history: list[dict], model: str
) -> tuple[ActionChoice, int]:
    """Return (chosen action, agent input tokens). The token count is what makes the
    cost story measurable: the agent reads the whole view, so a compact translated
    view costs far fewer agent tokens than a raw HTML dump."""
    if model == "stub":
        return _stub_decide(goal, view, history)
    if model == "gemini":
        return _gemini_decide(goal, view, history)
    raise ValueError(f"unknown agent model: {model}")


def _estimate_input_tokens(goal: str, view: AgentView, history: list[dict]) -> int:
    """Char/4 estimate of what a reasoner ingests: the FULL view, not just the bit
    the stub happens to use. So raw (summary = whole HTML) costs a lot; translated
    (compact) costs little -- the delta the demo is about."""
    blob = goal + view.summary
    blob += json.dumps([{"id": c.id, "text": c.text, "meta": c.meta} for c in view.relevant_content])
    blob += json.dumps([{"name": a.name, "description": a.description, "params": a.params}
                        for a in view.actions])
    blob += json.dumps(history)
    return max(1, len(blob) // 4)


def _stub_decide(
    goal: str, view: AgentView, history: list[dict]
) -> tuple[ActionChoice, int]:
    """Placeholder for the LLM reasoner. Handles 'add cheapest <color> ... to cart'.
    Deliberately simple: if there are no surfaced actions (raw/markdown baselines),
    it gives up -> that's why those conditions fail and translated succeeds."""
    tokens = _estimate_input_tokens(goal, view, history)

    if not view.actions:
        return ActionChoice(name="", done=True, thought="no actions surfaced; giving up"), tokens

    # Form site: multi-turn fill each target field, then submit.
    if view.action_by_name("fill") is not None:
        return _stub_decide_form(goal, view, history), tokens

    # Docs site: open the surfaced (already task-conditioned) article.
    if view.action_by_name("open_doc") is not None:
        if any(h.get("name") == "open_doc" for h in history) or not view.relevant_content:
            return ActionChoice(name="", done=True, thought="article opened; done"), tokens
        pick = view.relevant_content[0]
        return ActionChoice(name="open_doc", params={"doc_id": pick.id},
                            thought=f"opening {pick.id}"), tokens

    # Shop site: single add_to_cart.
    if any(h.get("name") == "add_to_cart" for h in history):
        return ActionChoice(name="", done=True, thought="item already added; done"), tokens

    color = next((c for c in ("blue", "red", "green", "black", "white", "grey")
                  if c in goal.lower()), None)
    items = [
        c for c in view.relevant_content
        if color is None or c.meta.get("color") == color
    ]
    if not items:
        return ActionChoice(name="", done=True, thought="no matching item found"), tokens

    pick = min(items, key=lambda c: c.meta.get("price", float("inf")))
    return ActionChoice(
        name="add_to_cart",
        params={"product_id": pick.id},
        thought=f"cheapest {color or 'item'} is {pick.id} at ${pick.meta.get('price')}",
    ), tokens


def _stub_decide_form(goal: str, view: AgentView, history: list[dict]) -> ActionChoice:
    """Fill each target field named in the goal ('field=value'), one per turn, then
    submit. Multi-turn: the reward lands only after the final submit."""
    targets = dict(re.findall(r"(\w+)=([^\s,]+)", goal))
    filled = {h["params"].get("field") for h in history if h.get("name") == "fill"}
    submitted = any(h.get("name") == "submit" for h in history)

    if submitted:
        return ActionChoice(name="", done=True, thought="form submitted; done")
    for field, value in targets.items():
        if field not in filled:
            return ActionChoice(
                name="fill", params={"field": field, "value": value},
                thought=f"filling {field}",
            )
    return ActionChoice(name="submit", thought="all fields filled; submitting")


def _gemini_decide(
    goal: str, view: AgentView, history: list[dict]
) -> tuple[ActionChoice, int]:
    """Real LLM reasoner. Reads the AgentView, returns (action, real input tokens).

    Needs GEMINI_API_KEY (or GOOGLE_API_KEY) in the env and `pip install google-genai`.
    """
    from google import genai
    from google.genai import types

    api_key = os.getenv("GEMINI_API_KEY") or os.getenv("GOOGLE_API_KEY")
    if not api_key:
        raise RuntimeError("set GEMINI_API_KEY (or GOOGLE_API_KEY) to use --agent-model gemini")

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
    from translator import loads_first_json

    data = loads_first_json(resp.text)

    # Real input-token usage; fall back to the estimate if the field is absent.
    usage = getattr(resp, "usage_metadata", None)
    tokens = getattr(usage, "prompt_token_count", None) or _estimate_input_tokens(
        goal, view, history
    )

    name = (data.get("name") or "").strip()
    # Enforce the action-hallucination guarantee in code, not just in the prompt.
    if name and view.action_by_name(name) is None:
        return ActionChoice(
            name="", done=True,
            thought=f"model chose unsurfaced action '{name}'; refusing",
        ), tokens
    return ActionChoice(
        name=name,
        params=data.get("params") or {},
        done=bool(data.get("done", False)),
        thought=data.get("thought", ""),
    ), tokens

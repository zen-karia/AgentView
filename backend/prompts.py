"""The ONE translate prompt, shared by every seat that produces an AgentView:
Gemini (Layer 0), the Freesolo-trained model (Layer 1), and the data-gen script.

Training input and inference input MUST be byte-identical, or the fine-tune learns
to answer a prompt it never sees at serving time. So both go through here.
"""
from __future__ import annotations

_SCHEMA_HINT = (
    '{"summary": str, '
    '"relevant_content": [{"id": str, "text": str, "meta": object}], '
    '"actions": [{"name": str, "description": str, "params": object, '
    '"target_selector": str}]}'
)


def translate_prompt(goal: str, url: str, html: str) -> str:
    """Build the translator's input from a goal and a raw page."""
    return f"""You convert a human-facing web page plus a goal into a compact,
agent-legible JSON view. Return ONLY JSON matching this schema:
{_SCHEMA_HINT}

Rules:
- Task-conditioned: include only content/actions relevant to the goal.
- Every target_selector must use a real id/attribute from the HTML
  (e.g. "#add-{{product_id}}"). Never invent an element not in the HTML.
- Output strict JSON, no markdown fences.

GOAL: {goal}
URL: {url}
HTML:
{html}"""

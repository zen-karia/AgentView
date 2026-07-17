"""Verifier: two jobs, both load-bearing.

1. Grounding. An action the agent chose must resolve to a selector that actually
   EXISTS on the page before we execute it. This kills translator-hallucinated
   actions -- the translator can't offer a button that isn't real.
2. Task success. Deterministic per-task post-condition (lives in tasks.py).

The verifier's pass/fail is not just scoring -- it's the training signal for the
Model lane. If it's flaky, the training data is noise. Build it right, trust it.
"""
from __future__ import annotations

from schemas import ActionChoice, ActionDef, AgentView


def resolve_selector(action_def: ActionDef, choice: ActionChoice) -> str:
    """Fill the selector template with chosen params: #add-{product_id} -> #add-p1."""
    selector = action_def.target_selector
    for key, value in choice.params.items():
        selector = selector.replace("{" + key + "}", str(value))
    return selector


def ground_check(view: AgentView, choice: ActionChoice, driver) -> tuple[bool, str]:
    """Return (ok, resolved_selector_or_reason). ok=False means don't execute."""
    action_def = view.action_by_name(choice.name)
    if action_def is None:
        return False, f"action '{choice.name}' was not surfaced in the AgentView"
    selector = resolve_selector(action_def, choice)
    if not driver.selector_exists(selector):
        return False, f"selector '{selector}' does not exist on the page"
    return True, selector

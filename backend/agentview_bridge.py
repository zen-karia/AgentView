"""Bridge between the TRAINED model's contract and the backend's AgentView.

The model lane (model/) and this backend were built to two different AgentView
shapes. Rather than retrain or rewrite either, this module adapts at the seam:

  * The model was trained (model/flash-env/system_prompt.txt) to read a
    data-av-id-annotated page and emit contract-B:
        {schema_version, relevant_content:[{id,text,selector}],
         actions:[{id, kind:click|type|select, description,
                   target_selector, content_refs?, value_hint?}]}
  * The backend executes contract-A (backend/schemas.py):
        {summary, relevant_content:[{id,text,meta}],
         actions:[{name, description, params, target_selector}]}
    where the harness picks an action by name, resolves target_selector with
    params, ground-checks it exists, and driver.execute()s it.

Two adaptations, both here:
  1. build_messages() renders the exact system+user prompt the model was trained
     on (kept in sync with model/flash-env/system_prompt.txt — the source of
     truth; if that file changes, update SYSTEM_PROMPT).
  2. to_backend_view() maps contract-B -> a backend AgentView whose actions are
     directly groundable/executable: each model action becomes a uniquely-named
     ActionDef whose target_selector is the model's CONCRETE selector (no
     template placeholders, so resolve_selector is a no-op and ground_check just
     confirms the element exists).

ANNOTATE_JS stamps the same data-av-id ids on the LIVE page (mirrors
model/src/annotate.js) so the concrete [data-av-id="N"] selectors the model
emits actually resolve when the driver executes them.
"""
from __future__ import annotations

from schemas import ActionDef, AgentView, ContentItem

# Verbatim from model/flash-env/system_prompt.txt (the frozen trained prompt).
SYSTEM_PROMPT = """You are AgentView. You are given a GOAL and a PAGE (pre-trimmed HTML). Output ONE JSON object
in exactly this shape, and nothing else — no prose, no code fences:

{"schema_version": "1",
 "relevant_content": [
   {"id": "c1", "text": "<verbatim extract>", "selector": "<css selector>"}
 ],
 "actions": [
   {"id": "a1", "kind": "click", "description": "<what this action does>", "target_selector": "<css selector>",
    "content_refs": ["c1"], "value_hint": "<intended value>"}
 ]}

Field rules: schema_version is always "1". Content ids are c1, c2, ... and action ids are a1, a2, ...
(sequential, unique). kind is one of "click", "type", "select". content_refs (optional) lists the
content ids an action concerns. value_hint (optional) is allowed only on "type" and "select".
Limits: at most 50 content items and 30 actions.

Rules:
- relevant_content: only content needed to pursue the GOAL. Each item's "text" must be a verbatim
  extract of its target element's text. Target the TIGHTEST element that contains the text. Each
  "selector" must be a CSS selector matching exactly one element on the page.
- actions: only actions that advance the GOAL. Never invent elements. When the GOAL requires
  choosing among candidates (cheapest, best-rated, ...), include each candidate's action and the
  content needed to compare them — the agent makes the final choice. Use "content_refs" to link an
  action to the content items it concerns.
  - "click" must target an interactive element. "type" must target a text input/textarea. "select"
    must target a native <select>; its "value_hint" must be one of its option labels/values.
  - For "type" and "select", put the intended value in "value_hint" when the GOAL implies one.
- If the GOAL cannot be advanced on this page, return empty "relevant_content" and "actions" arrays.
- Selectors: CSS only, one element per selector — no comma lists, no html/body, no :*-child family,
  no +/~ combinators.
- Interactive elements carry a data-av-id attribute. For action target_selectors, use
  [data-av-id="N"] — it is guaranteed unique. For relevant_content selectors, use ids, data-*
  attributes, or class paths."""


def build_messages(goal: str, page_html: str) -> list[dict]:
    """The exact chat shape the model trained on: system + user(GOAL/PAGE)."""
    return [
        {"role": "system", "content": SYSTEM_PROMPT},
        {"role": "user", "content": f"GOAL: {goal}\n\nPAGE:\n{page_html}"},
    ]


# Mirror of model/src/annotate.js, as browser-side JS for PlaywrightDriver.
# Stamps document-order data-av-id on interactive elements AND strips
# script/style/etc. so the live page matches what the model was trained to read.
# The ids are deterministic per DOM, so the model's [data-av-id="N"] selectors
# resolve on the very page the driver then executes against.
ANNOTATE_JS = r"""() => {
  const TAGS = new Set(['a','button','input','select','textarea','summary','label','option','details']);
  const ROLES = new Set(['button','link','menuitem','menuitemcheckbox','menuitemradio','tab',
    'checkbox','radio','switch','option','treeitem','combobox','listbox','searchbox','textbox']);
  const interactive = (el) => {
    const t = el.tagName.toLowerCase();
    if (TAGS.has(t)) return true;
    if (el.hasAttribute('onclick') || el.hasAttribute('tabindex') || el.hasAttribute('contenteditable')) return true;
    return ROLES.has((el.getAttribute('role') || '').toLowerCase());
  };
  let n = 0;
  document.querySelectorAll('*').forEach((el) => { if (interactive(el)) el.setAttribute('data-av-id', String(++n)); });
}"""


def _summary(goal: str, content: list, actions: list) -> str:
    return f"{len(content)} relevant items, {len(actions)} actions for: {goal}"


def to_backend_view(obj: dict, goal: str = "") -> AgentView:
    """Map the trained model's contract-B JSON into a backend AgentView the
    harness can ground-check and execute unchanged."""
    content = [
        ContentItem(
            id=c.get("id", ""),
            text=c.get("text", ""),
            meta={"selector": c.get("selector", "")},
        )
        for c in obj.get("relevant_content", [])
    ]

    actions: list[ActionDef] = []
    for a in obj.get("actions", []):
        kind = a.get("kind", "click")
        desc = a.get("description", "")
        vh = a.get("value_hint")
        if kind in ("type", "select") and vh:
            # Carry the intended value in the description so the agent supplies it
            # as params.value (driver.execute reads params['value'] for fill/type).
            desc = f'{desc} — value: "{vh}"'
        params: dict = {}
        if kind in ("type", "select"):
            params = {"value": {"type": "string", "required": True, "suggested": vh or ""}}
        actions.append(
            ActionDef(
                # Unique per action id (a1, a2, ...) so action_by_name is unambiguous.
                # driver.execute treats 'type'/'fill' specially; everything else clicks,
                # so keep the executable verb recoverable while the name stays unique.
                name=a.get("id", f"act{len(actions)+1}"),
                description=f"[{'type' if kind in ('type','select') else 'click'}] {desc}",
                params=params,
                target_selector=a.get("target_selector", ""),  # concrete, no template
            )
        )

    return AgentView(
        summary=_summary(goal, content, actions),
        relevant_content=content,
        actions=actions,
    )

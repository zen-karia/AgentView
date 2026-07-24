"""Translator: (goal, page) -> AgentView.  The heart of the project.

condition switch (what representation the agent sees):
  translated         -> full task-conditioned AgentView (the product)
  raw                -> raw HTML passed through, no surfaced actions (baseline)
  markdown_baseline  -> text dump, no surfaced actions (baseline)

model switch (who produces the translated view):
  stub    -> deterministic, zero-dep. Proves the loop. Stands in for Gemini.
  gemini  -> prompted Gemini (Layer 0, real).        [Model lane fills this in]
  trained -> Freesolo-trained small model (Layer 1).  [swapped in behind a flag]

Returns (AgentView, tokens). Tokens are faked in stub mode; real modes report
true usage so the benchmark and the Deloitte cost numbers are honest.
"""
from __future__ import annotations

import json
import os

from schemas import ActionDef, AgentView, ContentItem, TranslatorInput

_GEMINI_MODEL = os.getenv("GEMINI_MODEL", "gemini-2.0-flash")


def translate(
    inp: TranslatorInput, condition: str, model: str, driver=None
) -> tuple[AgentView, int]:
    if condition == "translated":
        if model == "stub":
            return _stub_translate(inp, driver)
        if model == "gemini":
            return _gemini_translate(inp)   # TODO(model-lane)
        if model == "trained":
            return _trained_translate(inp)  # TODO(layer-1)
        raise ValueError(f"unknown model: {model}")
    if condition == "raw":
        return _raw_view(inp)
    if condition == "markdown_baseline":
        return _markdown_view(inp)
    raise ValueError(f"unknown condition: {condition}")


_COLORS = ("blue", "red", "green", "black", "white", "grey")


def _stub_translate(inp: TranslatorInput, driver) -> tuple[AgentView, int]:
    """Deterministic stand-in for Gemini. Branches by site (duck-typed on driver)."""
    if driver is not None and hasattr(driver, "form_fields"):
        return _stub_translate_form(inp, driver)
    return _stub_translate_shop(inp, driver)


def _stub_translate_form(inp: TranslatorInput, driver) -> tuple[AgentView, int]:
    """Surface the form's fields as content plus fill + submit action schemas."""
    fields = driver.form_fields
    content = [ContentItem(id=f"field:{f}", text=f, meta={}) for f in fields]
    actions = [
        ActionDef(
            name="fill",
            description="Fill a form field with a value",
            params={
                "field": {"type": "string", "required": True},
                "value": {"type": "string", "required": True},
            },
            target_selector="#field-{field}",
        ),
        ActionDef(
            name="submit",
            description="Submit the form",
            params={},
            target_selector="#submit",
        ),
    ]
    view = AgentView(
        summary=f"Checkout form with {len(fields)} fields: {', '.join(fields)}",
        relevant_content=content,
        actions=actions,
    )
    return view, len(inp.page.html) // 4


def _stub_translate_shop(inp: TranslatorInput, driver) -> tuple[AgentView, int]:
    """TASK-CONDITIONED: if the goal names a color, surface only those items -- the
    whole point of translation is to distill the page to what the goal needs."""
    products = driver.products if driver is not None else []
    goal_color = next((c for c in _COLORS if c in inp.goal.lower()), None)
    if goal_color is not None:
        products = [p for p in products if p["color"] == goal_color]
    content = [
        ContentItem(
            id=p["id"],
            text=f'{p["name"]}, ${p["price"]}',
            meta={"price": p["price"], "color": p["color"]},
        )
        for p in products
    ]
    actions = [
        ActionDef(
            name="add_to_cart",
            description="Add a product to the cart",
            params={"product_id": {"type": "string", "required": True}},
            target_selector="#add-{product_id}",
        )
    ]
    view = AgentView(
        summary=f"Shop page, {len(products)} items with color and price",
        relevant_content=content,
        actions=actions,
    )
    # Honest cost model: a translator must READ the whole raw page, so its input
    # cost scales with the page, not the tidy output. (In real mode this is the
    # model's actual usage.) This is what the cost model later weights by price.
    return view, len(inp.page.html) // 4


def _raw_view(inp: TranslatorInput) -> tuple[AgentView, int]:
    """Baseline: dump raw HTML straight to the agent. No translator model runs, so
    there's no translator cost -- the whole (big) page hits the agent instead."""
    return AgentView(summary=inp.page.html, relevant_content=[], actions=[]), 0


def _markdown_view(inp: TranslatorInput) -> tuple[AgentView, int]:
    """Baseline: deterministic text extraction (like html2text) -- no LLM, so ~free.
    Cheap, but drowns the agent in irrelevant content and surfaces no actions."""
    return AgentView(summary=inp.page.text, relevant_content=[], actions=[]), 0


def _gemini_translate(inp: TranslatorInput) -> tuple[AgentView, int]:
    """Layer 0: Gemini reads the RAW HTML (no planted structure) and produces the
    AgentView. Returns (view, real input tokens). This is the first honest translator.

    Needs GEMINI_API_KEY (or GOOGLE_API_KEY) and `pip install google-genai`.
    Prompt mirrors backend/translate_prompt.md -- keep them in sync.
    """
    from google import genai
    from google.genai import types

    api_key = os.getenv("GEMINI_API_KEY") or os.getenv("GOOGLE_API_KEY")
    if not api_key:
        raise RuntimeError("set GEMINI_API_KEY (or GOOGLE_API_KEY) to use --model gemini")

    client = genai.Client(api_key=api_key)

    prompt = f"""You convert a human-facing web page plus a goal into a compact,
agent-legible JSON view. Return ONLY JSON matching this schema:
{{"summary": str,
  "relevant_content": [{{"id": str, "text": str, "meta": object}}],
  "actions": [{{"name": str, "description": str, "params": object,
                "target_selector": str}}]}}

Rules:
- Task-conditioned: include only content/actions relevant to the goal.
- Every target_selector must use a real id/attribute from the HTML (e.g. "#add-{{product_id}}").
  Never invent an element that isn't in the HTML.
- Output strict JSON, no markdown fences.

GOAL: {inp.goal}
URL: {inp.page.url}
HTML:
{inp.page.html}"""

    resp = client.models.generate_content(
        model=_GEMINI_MODEL,
        contents=prompt,
        config=types.GenerateContentConfig(response_mime_type="application/json"),
    )
    data = json.loads(resp.text)

    view = AgentView(
        summary=data.get("summary", ""),
        relevant_content=[
            ContentItem(id=c.get("id", ""), text=c.get("text", ""), meta=c.get("meta", {}))
            for c in data.get("relevant_content", [])
        ],
        actions=[
            ActionDef(
                name=a["name"],
                description=a.get("description", ""),
                params=a.get("params", {}),
                target_selector=a.get("target_selector", ""),
            )
            for a in data.get("actions", [])
        ],
    )
    usage = getattr(resp, "usage_metadata", None)
    tokens = getattr(usage, "prompt_token_count", None) or len(inp.page.html) // 4
    return view, tokens


def _trained_translate(inp: TranslatorInput) -> tuple[AgentView, int]:
    raise NotImplementedError("Layer 1: call the Freesolo-trained model behind the flag.")

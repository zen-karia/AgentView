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

from schemas import ActionDef, AgentView, ContentItem, TranslatorInput


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


def _stub_translate(inp: TranslatorInput, driver) -> tuple[AgentView, int]:
    """Deterministic stand-in for Gemini. Task-conditioned: surfaces products as
    content plus the add_to_cart action schema. This is the shape Gemini must emit."""
    products = driver.products if driver is not None else []
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
    return view, 120  # faked token count for stub mode


def _raw_view(inp: TranslatorInput) -> tuple[AgentView, int]:
    """Baseline: dump raw HTML, surface no actions. The agent must cope alone."""
    return AgentView(summary=inp.page.html, relevant_content=[], actions=[]), len(inp.page.html) // 4


def _markdown_view(inp: TranslatorInput) -> tuple[AgentView, int]:
    """Baseline: text-only dump, no actions surfaced."""
    return AgentView(summary=inp.page.text, relevant_content=[], actions=[]), len(inp.page.text) // 4


def _gemini_translate(inp: TranslatorInput) -> tuple[AgentView, int]:
    raise NotImplementedError(
        "Model lane: prompt Gemini with the goal + page, parse JSON into AgentView."
    )


def _trained_translate(inp: TranslatorInput) -> tuple[AgentView, int]:
    raise NotImplementedError("Layer 1: call the Freesolo-trained model behind the flag.")

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

from prompts import translate_prompt
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
    # Dispatch on content, not attribute presence: PlaywrightDriver serves every
    # site, so it exposes all accessors -- pick by which one is non-empty.
    if driver is not None and getattr(driver, "form_fields", None):
        return _stub_translate_form(inp, driver)
    if driver is not None and getattr(driver, "docs", None):
        return _stub_translate_docs(inp, driver)
    return _stub_translate_shop(inp, driver)


def _stub_translate_docs(inp: TranslatorInput, driver) -> tuple[AgentView, int]:
    """TASK-CONDITIONED: surface only articles whose topic the goal mentions, plus
    the open_doc action -- distilling a long help center to the relevant article."""
    docs = driver.docs
    goal = inp.goal.lower()
    matching = [d for d in docs if d["topic"] in goal] or docs
    content = [
        ContentItem(id=d["id"], text=d["title"], meta={"topic": d["topic"]})
        for d in matching
    ]
    actions = [
        ActionDef(
            name="open_doc",
            description="Open a help article",
            params={"doc_id": {"type": "string", "required": True}},
            target_selector="#open-{doc_id}",
        )
    ]
    view = AgentView(
        summary=f"Help center with {len(docs)} articles",
        relevant_content=content,
        actions=actions,
    )
    return view, len(inp.page.html) // 4


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

    prompt = translate_prompt(inp.goal, inp.page.url, inp.page.html)

    resp = client.models.generate_content(
        model=_GEMINI_MODEL,
        contents=prompt,
        config=types.GenerateContentConfig(response_mime_type="application/json"),
    )
    data = json.loads(resp.text)
    view = _agentview_from_dict(data)
    usage = getattr(resp, "usage_metadata", None)
    tokens = getattr(usage, "prompt_token_count", None) or len(inp.page.html) // 4
    return view, tokens


def _agentview_from_dict(data: dict) -> AgentView:
    """Parse the JSON a translator model returns into an AgentView. Shared by the
    Gemini (Layer 0) and Freesolo-trained (Layer 1) paths."""
    return AgentView(
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


def _trained_translate(inp: TranslatorInput) -> tuple[AgentView, int]:
    """Layer 1: the Freesolo-trained small model on its OpenAI-compatible endpoint.
    Same prompt as Layer 0; response_format pins the AgentView JSON schema.

    From `flash deploy` / `flash deployments --json`, set:
      FREESOLO_API_KEY, FREESOLO_BASE_URL (openai_base_url), FREESOLO_MODEL (<run-id>).
    """
    import freesolo

    # Base URL is optional: defaults to Freesolo's endpoint, overridden by
    # FREESOLO_BASE_URL only for a non-default deployment. Only key + run-id required.
    api_key = os.getenv(freesolo.API_KEY_ENV)
    model = os.getenv(freesolo.MODEL_ENV)
    if not (api_key and model):
        raise RuntimeError(
            f"set {freesolo.API_KEY_ENV} and {freesolo.MODEL_ENV} (<run-id>); "
            f"{freesolo.BASE_URL_ENV} is optional (defaults to {freesolo.DEFAULT_BASE_URL})"
        )

    from openai import OpenAI

    base_url = freesolo.resolve_base_url(os.getenv(freesolo.BASE_URL_ENV))
    client = OpenAI(base_url=base_url, api_key=api_key)
    resp = client.chat.completions.create(
        model=model,
        messages=[{"role": "user",
                   "content": translate_prompt(inp.goal, inp.page.url, inp.page.html)}],
        response_format={"type": "json_schema",
                         "json_schema": {"schema": freesolo.AGENTVIEW_SCHEMA}},
    )
    data = json.loads(resp.choices[0].message.content)
    view = _agentview_from_dict(data)
    usage = getattr(resp, "usage", None)
    tokens = getattr(usage, "prompt_tokens", None) or len(inp.page.html) // 4
    return view, tokens

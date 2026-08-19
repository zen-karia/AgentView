"""AgentView validator — pure-Python port of src/validate.js (v1 semantics).

Built for the Freesolo Flash GRPO reward path: reward workers are Python-only
(docs/FREESOLO.md), so this ports the Node validator's checks 1:1 using
jsonschema (Draft 2020-12), lxml for DOM parsing, and cssselect for CSS
selector -> XPath translation. Error message strings mirror src/validate.js so
downstream substring checks (and the parity fixtures) behave identically.

Checks, in order (same as src/validate.js):
  1. JSON-schema conformance against contracts/agentview.schema.json
  2. content/action id uniqueness, content_refs integrity
  3. selector rules: parses; banned :*-child pseudo family (regex, checked
     BEFORE any CSS parsing); banned +/~ sibling combinators and comma
     selector lists (outside attribute brackets); no html/body targets;
     matches exactly one element in the trimmed DOM AND (when raw_html is
     given) exactly one in the raw DOM, and the SAME element in both
     (canonical structural-path comparison)
  4. text grounding: '…'-split segments, whitespace-normalized, contained in
     order in the trimmed element's text AND (when raw_html is given) the raw
     element's text; non-empty after normalization; tightest-element rule
  5. click interactivity (bubbling-aware; same tag/role/attribute lists as
     src/annotate.js), type/select element-kind rules (NON_TYPEABLE inputs,
     native <select> only), select value_hint must match an option label or
     value, value_hint banned on click

Documented deviation: when raw_html is None (the GRPO runtime, where only the
trimmed page is recoverable from the prompt) every raw-DOM check is skipped —
raw resolution, structural-path identity, raw text grounding — and the
element-kind checks run against the trimmed element instead of the raw one.
Pass raw_html for full dual-DOM validation (offline filtering, parity tests).

Strictness note: lxml/cssselect is not jsdom. Any selector cssselect cannot
translate (e.g. '*:nth-of-type(n)') is REJECTED as unparseable — where the two
engines could disagree, this port fails closed.

API:
    validate(output_dict, trimmed_html, raw_html=None) -> (valid, errors)
"""

from __future__ import annotations

import json
import re
from functools import lru_cache
from pathlib import Path
from typing import Any, Optional

import lxml.html
from cssselect import HTMLTranslator
from cssselect.parser import parse_series
from cssselect.xpath import ExpressionError
from jsonschema import Draft202012Validator
from lxml import etree

# Bundled copy (flash-env): schema ships next to this file in the environment
# package; fall back to the repo layout when run from pipeline/reward/.
_here = Path(__file__).resolve().parent
_SCHEMA_PATH = (
    _here / "agentview.schema.json"
    if (_here / "agentview.schema.json").exists()
    else _here.parents[1] / "contracts" / "agentview.schema.json"
)
_SCHEMA = json.loads(_SCHEMA_PATH.read_text(encoding="utf-8"))
_SCHEMA_VALIDATOR = Draft202012Validator(_SCHEMA)

# --- universal :*-of-type support -------------------------------------------
# The contract endorses :*-of-type positional selection (DECISIONS.md D4), and
# real outputs use it on class compounds (".r:nth-of-type(2)"). cssselect
# refuses of-type pseudos on a universal element type ("*:nth-of-type() is not
# implemented") because XPath 1.0 cannot reference the context node's own tag
# inside a predicate. jsdom supports them, so we close the gap with lxml XPath
# extension functions that compute the 1-based same-tag sibling index in
# Python — exact CSS of-type semantics, identical to jsdom's.

def _same_type_index(node, from_end: bool) -> int:
    tag = node.tag
    i = 1
    siblings = node.itersiblings(preceding=not from_end) if from_end else node.itersiblings(preceding=True)
    for sib in siblings:
        if sib.tag == tag:
            i += 1
    return i


def _matches_series(idx: int, a: int, b: int) -> bool:
    """True if idx == a*n + b for some integer n >= 0 (CSS an+b semantics)."""
    if a == 0:
        return idx == b
    n, rem = divmod(idx - b, a)
    return rem == 0 and n >= 0


def _xp_nth_of_type(context, a, b):
    return _matches_series(_same_type_index(context.context_node, False), int(a), int(b))


def _xp_nth_last_of_type(context, a, b):
    return _matches_series(_same_type_index(context.context_node, True), int(a), int(b))


_FNS = etree.FunctionNamespace("urn:agentview-validator")
_FNS.prefix = "av"
_FNS["nth-of-type"] = _xp_nth_of_type
_FNS["nth-last-of-type"] = _xp_nth_last_of_type


class _Translator(HTMLTranslator):
    """HTMLTranslator that also handles of-type pseudos on universal compounds."""

    @staticmethod
    def _series(function):
        try:
            a, b = parse_series(function.arguments)
        except ValueError:
            raise ExpressionError(f"Invalid series: {function.arguments!r}")
        return a, b

    def xpath_nth_of_type_function(self, xpath, function):
        if xpath.element == "*":
            a, b = self._series(function)
            return xpath.add_condition(f"av:nth-of-type({a}, {b})")
        return super().xpath_nth_of_type_function(xpath, function)

    def xpath_nth_last_of_type_function(self, xpath, function):
        if xpath.element == "*":
            a, b = self._series(function)
            return xpath.add_condition(f"av:nth-last-of-type({a}, {b})")
        return super().xpath_nth_last_of_type_function(xpath, function)

    def xpath_first_of_type_pseudo(self, xpath):
        if xpath.element == "*":
            return xpath.add_condition("av:nth-of-type(0, 1)")
        return super().xpath_first_of_type_pseudo(xpath)

    def xpath_last_of_type_pseudo(self, xpath):
        if xpath.element == "*":
            return xpath.add_condition("av:nth-last-of-type(0, 1)")
        return super().xpath_last_of_type_pseudo(xpath)

    def xpath_only_of_type_pseudo(self, xpath):
        if xpath.element == "*":
            return xpath.add_condition("av:nth-of-type(0, 1) and av:nth-last-of-type(0, 1)")
        return super().xpath_only_of_type_pseudo(xpath)


_TRANSLATOR = _Translator()

BANNED_PSEUDO = re.compile(
    r":(?:nth-child|nth-last-child|first-child|last-child|only-child)\b", re.IGNORECASE
)
# Input types where kind=type makes no sense (native pickers included).
NON_TYPEABLE_INPUT = frozenset([
    "hidden", "submit", "button", "checkbox", "radio", "file", "image", "reset", "range", "color",
    "date", "time", "month", "week", "datetime-local",
])
# Same lists as src/annotate.js / src/validate.js — if these diverge, minted
# data-av-ids and click validation stop transferring.
CLICKABLE_TAGS = frozenset([
    "a", "button", "input", "select", "textarea", "summary", "label", "option", "details",
])
CLICKABLE_ROLES = frozenset([
    "button", "link", "menuitem", "menuitemcheckbox", "menuitemradio", "tab", "checkbox",
    "radio", "switch", "option", "treeitem", "combobox", "listbox", "searchbox", "textbox",
])

_WS = re.compile(r"\s+")
_ATTR_BRACKETS = re.compile(r"\[[^\]]*\]")


def _norm(s: str) -> str:
    return _WS.sub(" ", s).strip()


def _tag(el) -> str:
    """Lowercased tag name; '' for non-element nodes (comments, PIs)."""
    t = el.tag
    return t.lower() if isinstance(t, str) else ""


def _text_content(el) -> str:
    """DOM textContent equivalent: XPath string() — all descendant text nodes,
    excluding comments/PIs (matches jsdom's Node.textContent)."""
    return el.xpath("string()")


def _structural_path(el) -> str:
    """Canonical structural address: tag + index among same-tag element
    siblings, root-down. Identical to structuralPath() in src/validate.js."""
    parts = []
    cur = el
    while cur is not None and cur.getparent() is not None:
        tag = _tag(cur)
        i = 0
        for sib in cur.itersiblings(preceding=True):
            if _tag(sib) == tag:
                i += 1
        parts.append(f"{tag}[{i}]")
        cur = cur.getparent()
    parts.append(_tag(cur) if cur is not None else "?")
    return "/".join(reversed(parts))


def _contains_in_order(hay: str, segments: list[str]) -> bool:
    """True if every segment appears in hay, in order, without overlap."""
    idx = 0
    for seg in segments:
        found = hay.find(seg, idx)
        if found == -1:
            return False
        idx = found + len(seg)
    return True


def _is_clickable(el) -> bool:
    """A click is executable if the element is natively interactive, carries an
    interactivity marker, or sits inside such an element (events bubble)."""
    cur = el
    while cur is not None:
        tag = _tag(cur)
        if tag in ("body", "html"):
            return False
        if tag in CLICKABLE_TAGS:
            return True
        if (
            cur.get("onclick") is not None
            or cur.get("tabindex") is not None
            or cur.get("contenteditable") is not None
            or cur.get("href") is not None
        ):
            return True
        if (cur.get("role") or "").lower() in CLICKABLE_ROLES:
            return True
        cur = cur.getparent()
    return False


@lru_cache(maxsize=4096)
def _css_to_xpath(selector: str) -> str:
    return _TRANSLATOR.css_to_xpath(selector)


def _parse_html(html: str):
    return lxml.html.document_fromstring(html)


def _resolve_unique(root, selector: str, where: str, id_: str, errors: list[str]):
    try:
        xpath = _css_to_xpath(selector)
        nodes = root.xpath(xpath)
    except Exception:  # SelectorError, ExpressionError, XPathEvalError, ...
        # Anything cssselect/lxml cannot translate or evaluate is rejected —
        # fail closed where lxml semantics might diverge from jsdom.
        errors.append(f"{id_}: selector does not parse ({where} DOM): {selector}")
        return None
    if len(nodes) != 1:
        errors.append(
            f"{id_}: selector matches {len(nodes)} elements in {where} DOM (must be exactly 1): {selector}"
        )
        return None
    el = nodes[0]
    tag = _tag(el)
    if tag in ("html", "body"):
        errors.append(f"{id_}: selector targets <{tag}> — banned")
        return None
    return el


def validate(output: Any, trimmed_html: str, raw_html: Optional[str] = None):
    """Validate an AgentView output dict against the trimmed page (and, when
    provided, the raw/annotated page). Returns (valid: bool, errors: list[str]).
    """
    errors: list[str] = []

    schema_errors = sorted(_SCHEMA_VALIDATOR.iter_errors(output), key=lambda e: list(e.absolute_path))
    if schema_errors:
        for e in schema_errors:
            path = "/" + "/".join(str(p) for p in e.absolute_path) if e.absolute_path else "/"
            errors.append(f"schema: {path} {e.message}")
        return False, errors

    trimmed = _parse_html(trimmed_html)
    raw = _parse_html(raw_html) if raw_html is not None else None

    c_ids = set()
    for c in output["relevant_content"]:
        if c["id"] in c_ids:
            errors.append(f"{c['id']}: duplicate content id")
        c_ids.add(c["id"])
    a_ids = set()
    for a in output["actions"]:
        if a["id"] in a_ids:
            errors.append(f"{a['id']}: duplicate action id")
        a_ids.add(a["id"])
        for ref in a.get("content_refs") or []:
            if ref not in c_ids:
                errors.append(f"{a['id']}: content_ref {ref} does not exist in relevant_content")

    def check_selector(id_: str, selector: str):
        # Banned-pseudo family checked by explicit regex BEFORE any CSS
        # parsing (cssselect's own handling is not trusted here).
        if BANNED_PSEUDO.search(selector):
            errors.append(f"{id_}: :*-child pseudo-classes are banned (use :*-of-type): {selector}")
            return None
        # Sibling combinators and comma lists are banned; attribute brackets
        # are masked first so [href="/a+b"] is not a false hit.
        masked = _ATTR_BRACKETS.sub("[]", selector)
        if "+" in masked or "~" in masked:
            errors.append(
                f"{id_}: sibling combinators + and ~ are banned (adjacency differs under pretrim): {selector}"
            )
            return None
        if "," in masked:
            errors.append(f"{id_}: comma selector lists are banned (one element per selector): {selector}")
            return None
        trimmed_el = _resolve_unique(trimmed, selector, "trimmed", id_, errors)
        if trimmed_el is None:
            return None
        if raw is None:
            # GRPO runtime: raw page unavailable — raw-DOM checks skipped.
            return trimmed_el, None
        raw_el = _resolve_unique(raw, selector, "raw", id_, errors)
        if raw_el is None:
            return None
        # Same COUNT in both DOMs is not enough: assert same ELEMENT.
        if _structural_path(trimmed_el) != _structural_path(raw_el):
            errors.append(
                f"{id_}: selector resolves to a different element in the raw DOM than in the trimmed DOM: {selector}"
            )
            return None
        return trimmed_el, raw_el

    for c in output["relevant_content"]:
        r = check_selector(c["id"], c["selector"])
        if r is None:
            continue
        trimmed_el, raw_el = r
        # '…' marks pretrim truncation; segments around it must each be
        # grounded, in order, in the trimmed element (what the model saw)
        # and — when available — the raw element (what exists on the page).
        segments = [s for s in (_norm(seg) for seg in c["text"].split("…")) if s]
        if not segments:
            errors.append(f"{c['id']}: text has no groundable content")
            continue
        if not _contains_in_order(_norm(_text_content(trimmed_el)), segments):
            errors.append(f"{c['id']}: text is not a verbatim extract of the target element's text")
            continue
        if raw_el is not None and not _contains_in_order(_norm(_text_content(raw_el)), segments):
            errors.append(f"{c['id']}: text is not grounded in the raw page (pretrim artifact)")
            continue
        # Anti-misattribution: if a child element already contains the text,
        # the selector must point at that tighter element.
        for child in trimmed_el:
            if not isinstance(child.tag, str):
                continue
            if _contains_in_order(_norm(_text_content(child)), segments):
                errors.append(
                    f"{c['id']}: text must target the tightest element containing it (a descendant also contains it): {c['selector']}"
                )
                break

    for a in output["actions"]:
        r = check_selector(a["id"], a["target_selector"])
        if r is None:
            continue
        trimmed_el, raw_el = r
        # Element-kind checks run on the raw element (what the executor
        # drives); at GRPO runtime (raw_html=None) the trimmed element stands in.
        el = raw_el if raw_el is not None else trimmed_el
        tag = _tag(el)
        kind = a["kind"]
        if kind == "click":
            if not _is_clickable(el):
                errors.append(
                    f"{a['id']}: kind=click must target an interactive element (native control, onclick/tabindex/role marker, or inside one), got <{tag}>"
                )
            if "value_hint" in a:
                errors.append(f"{a['id']}: value_hint is not allowed on kind=click")
        elif kind == "type":
            input_type = (el.get("type") or "text").lower()
            ok = (
                tag == "textarea"
                or (tag == "input" and input_type not in NON_TYPEABLE_INPUT)
                or el.get("contenteditable") is not None
                or (el.get("role") or "").lower() in ("textbox", "searchbox")
            )
            if not ok:
                errors.append(f"{a['id']}: kind=type must target a text-input-capable element, got <{tag}>")
        elif kind == "select":
            # v1: native <select> only.
            if tag != "select":
                errors.append(f"{a['id']}: kind=select must target a native <select> element, got <{tag}>")
            elif "value_hint" in a:
                # value_hint must map to an existing option's visible label or
                # value attribute (checked against the raw page when available).
                hint = _norm(a["value_hint"]).lower()
                ok = any(
                    _norm(_text_content(o)).lower() == hint or (o.get("value") or "").lower() == hint
                    for o in el.xpath(".//option")
                )
                if not ok:
                    errors.append(
                        f"{a['id']}: value_hint \"{a['value_hint']}\" matches no option label or value of the target <select>"
                    )

    return len(errors) == 0, errors

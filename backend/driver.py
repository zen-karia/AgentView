"""Browser driver abstraction.

The harness only needs four things from a page, so that's the whole Protocol:
  snapshot()          -> the page as (url, html, text)
  selector_exists()   -> grounding check support
  execute()           -> perform an action
  state()             -> deterministic state for the verifier

FakeShopDriver: in-memory demo shop. Zero deps, runs anywhere -> proves the loop.
PlaywrightDriver: real browser. Drops in once `pip install playwright` + browsers,
pointed at sites/shop/index.html which mirrors these exact selectors.
"""
from __future__ import annotations

from typing import Any, Protocol

from schemas import Page


class Driver(Protocol):
    def snapshot(self) -> Page: ...
    def selector_exists(self, selector: str) -> bool: ...
    def execute(self, selector: str, action_name: str, params: dict[str, Any]) -> None: ...
    def state(self) -> dict[str, Any]: ...


# ---------------- FakeShopDriver: in-memory shop ----------------
# Anchor products the tasks assert on: p1 = cheapest blue ($19), p3 = cheapest
# overall ($15), p4 = only green. Keep these fixed.
_ANCHORS = [
    {"id": "p1", "name": "Blue Shirt", "price": 19, "color": "blue"},
    {"id": "p2", "name": "Blue Shirt Premium", "price": 25, "color": "blue"},
    {"id": "p3", "name": "Red Shirt", "price": 15, "color": "red"},
    {"id": "p4", "name": "Green Hat", "price": 30, "color": "green"},
]
# Filler catalog: adds realistic bloat. All priced >= $35 and never blue, so the
# anchor invariants (cheapest blue = p1, cheapest overall = p3) always hold.
_FILLER = [
    {
        "id": f"p{i}",
        "name": f"Catalog Item {i}",
        "price": 35 + (i % 45),
        "color": ["red", "green", "black", "white", "grey"][i % 5],
    }
    for i in range(5, 31)
]
_PRODUCTS = _ANCHORS + _FILLER

# Static page noise a real e-commerce page carries -- inflates the raw DOM so the
# translated view has something real to distill.
_NAV = (
    "<nav><a href='/'>Home</a><a href='/deals'>Deals</a><a href='/new'>New</a>"
    "<a href='/account'>Account</a><a href='/cart'>Cart</a></nav>"
)
_FOOTER = (
    "<footer><div>About</div><div>Careers</div><div>Privacy Policy</div>"
    "<div>Terms</div><div>Returns</div><div>Contact</div>"
    "<p>(c) 2026 DemoShop Inc. All rights reserved. Free shipping over $50.</p></footer>"
)
_HIDDEN_SEO = (
    "<div style='display:none'>best shirts online cheap shirts blue shirts red "
    "shirts discount apparel free shipping trending fashion 2026</div>"
)


class FakeShopDriver:
    """A minimal deterministic shop so the loop is fully runnable offline."""

    def __init__(self) -> None:
        self.cart: list[str] = []

    def snapshot(self) -> Page:
        rows = "\n".join(
            f'<li class="product-card" data-color="{p["color"]}">'
            f'<span class="name">{p["name"]}</span> - '
            f'<span class="price">${p["price"]}</span> ({p["color"]}) '
            f'<button id="add-{p["id"]}">Add to cart</button></li>'
            for p in _PRODUCTS
        )
        html = (
            "<html><head><style>.product-card{margin:4px}</style></head><body>"
            f"{_NAV}{_HIDDEN_SEO}<h1>Shop</h1>"
            "<aside class='filters'>Filter by: color, price, size, brand</aside>"
            f"<ul class='grid'>{rows}</ul>"
            f"<div id='cart'>Cart: {self.cart}</div>{_FOOTER}"
            "<script>console.log('analytics loaded');</script></body></html>"
        )
        text = " ".join(f'{p["name"]} ${p["price"]} {p["color"]}' for p in _PRODUCTS)
        return Page(url="fake://shop", html=html, text=text)

    def selector_exists(self, selector: str) -> bool:
        return any(selector == f"#add-{p['id']}" for p in _PRODUCTS)

    def execute(self, selector: str, action_name: str, params: dict[str, Any]) -> None:
        if action_name == "add_to_cart":
            pid = params.get("product_id")
            if pid and any(p["id"] == pid for p in _PRODUCTS):
                self.cart.append(pid)

    def state(self) -> dict[str, Any]:
        return {"cart": list(self.cart), "products": _PRODUCTS}

    @property
    def products(self) -> list[dict[str, Any]]:
        """Structured access for the stub translator (stands in for Gemini parsing)."""
        return _PRODUCTS


# ---------------- FakeFormDriver: in-memory multi-field checkout form ----------------
_FORM_FIELDS = ["name", "email", "city", "zip"]


class FakeFormDriver:
    """A multi-field form -> multi-turn tasks (fill each field, then submit)."""

    def __init__(self) -> None:
        self.values: dict[str, str] = {}
        self.submitted = False

    def snapshot(self) -> Page:
        inputs = "".join(
            f'<label for="field-{f}">{f}</label>'
            f'<input id="field-{f}" name="{f}" />'
            for f in _FORM_FIELDS
        )
        html = (
            "<html><body>"
            f"{_NAV}{_HIDDEN_SEO}<h1>Checkout</h1>"
            f"<form>{inputs}<button id='submit'>Place order</button></form>"
            f"{_FOOTER}<script>console.log('checkout loaded');</script></body></html>"
        )
        text = "Checkout form fields: " + ", ".join(_FORM_FIELDS)
        return Page(url="fake://form", html=html, text=text)

    def selector_exists(self, selector: str) -> bool:
        return selector == "#submit" or any(selector == f"#field-{f}" for f in _FORM_FIELDS)

    def execute(self, selector: str, action_name: str, params: dict[str, Any]) -> None:
        if action_name == "fill":
            field, value = params.get("field"), params.get("value")
            if field in _FORM_FIELDS:
                self.values[field] = value
        elif action_name == "submit":
            self.submitted = True

    def state(self) -> dict[str, Any]:
        return {"values": dict(self.values), "submitted": self.submitted}

    @property
    def form_fields(self) -> list[str]:
        return _FORM_FIELDS


# ---------------- FakeDocsDriver: in-memory help center (find + open article) ----------------
_DOCS = [
    {"id": "d1", "title": "Getting Started Guide", "topic": "onboarding"},
    {"id": "d2", "title": "Billing and Invoices", "topic": "billing"},
    {"id": "d3", "title": "Reset Your Password", "topic": "password"},
    {"id": "d4", "title": "API Rate Limits", "topic": "api"},
    {"id": "d5", "title": "Export Your Data", "topic": "export"},
    {"id": "d6", "title": "Two-Factor Security", "topic": "security"},
    {"id": "d7", "title": "Managing Teams", "topic": "teams"},
    {"id": "d8", "title": "Third-Party Integrations", "topic": "integrations"},
    {"id": "d9", "title": "Keyboard Shortcuts", "topic": "shortcuts"},
    {"id": "d10", "title": "Notification Settings", "topic": "notifications"},
    {"id": "d11", "title": "Deleting Your Account", "topic": "deletion"},
    {"id": "d12", "title": "Mobile App Setup", "topic": "mobile"},
]


class FakeDocsDriver:
    """A help center: a long article list where the task is to open the right one."""

    def __init__(self) -> None:
        self.opened: str | None = None

    def snapshot(self) -> Page:
        rows = "\n".join(
            f'<li class="doc" data-topic="{d["topic"]}">'
            f'<span class="title">{d["title"]}</span> '
            f'<button id="open-{d["id"]}">Open</button></li>'
            for d in _DOCS
        )
        html = (
            "<html><body>"
            f"{_NAV}{_HIDDEN_SEO}<h1>Help Center</h1>"
            "<input id='search' placeholder='Search articles' />"
            f"<ul class='articles'>{rows}</ul>{_FOOTER}"
            "<script>console.log('help center loaded');</script></body></html>"
        )
        text = " ".join(f'{d["title"]} ({d["topic"]})' for d in _DOCS)
        return Page(url="fake://docs", html=html, text=text)

    def selector_exists(self, selector: str) -> bool:
        return any(selector == f"#open-{d['id']}" for d in _DOCS)

    def execute(self, selector: str, action_name: str, params: dict[str, Any]) -> None:
        if action_name == "open_doc":
            doc_id = params.get("doc_id")
            if any(d["id"] == doc_id for d in _DOCS):
                self.opened = doc_id

    def state(self) -> dict[str, Any]:
        return {"opened": self.opened, "docs": _DOCS}

    @property
    def docs(self) -> list[dict[str, Any]]:
        return _DOCS

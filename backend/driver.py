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

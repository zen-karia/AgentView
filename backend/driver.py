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
_PRODUCTS = [
    {"id": "p1", "name": "Blue Shirt", "price": 19, "color": "blue"},
    {"id": "p2", "name": "Blue Shirt Premium", "price": 25, "color": "blue"},
    {"id": "p3", "name": "Red Shirt", "price": 15, "color": "red"},
    {"id": "p4", "name": "Green Hat", "price": 30, "color": "green"},
]


class FakeShopDriver:
    """A minimal deterministic shop so the loop is fully runnable offline."""

    def __init__(self) -> None:
        self.cart: list[str] = []

    def snapshot(self) -> Page:
        rows = "\n".join(
            f'<li>{p["name"]} - ${p["price"]} ({p["color"]}) '
            f'<button id="add-{p["id"]}">Add</button></li>'
            for p in _PRODUCTS
        )
        html = (
            f"<html><body><h1>Shop</h1><ul>{rows}</ul>"
            f"<div id='cart'>Cart: {self.cart}</div></body></html>"
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

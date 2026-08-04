"""Real-browser driver (Playwright). Implements the same Driver protocol as
FakeShopDriver, so the harness doesn't change -- only which driver a Task builds.

Isolated in its own module so stub mode NEVER needs playwright installed. Setup:

    pip install playwright && playwright install chromium

Point it at sites/shop/index.html, which mirrors the fake driver's selectors and
exposes window.__CART__ so state() stays deterministic for the verifier.
"""
from __future__ import annotations

from typing import Any

from schemas import Page


class PlaywrightDriver:
    def __init__(self, url: str, headless: bool = True) -> None:
        from playwright.sync_api import sync_playwright  # lazy: only when used

        self._pw = sync_playwright().start()
        self._browser = self._pw.chromium.launch(headless=headless)
        self._page = self._browser.new_page()
        self._page.goto(url)

    def snapshot(self) -> Page:
        return Page(
            url=self._page.url,
            html=self._page.content(),
            text=self._page.inner_text("body"),
        )

    def selector_exists(self, selector: str) -> bool:
        return self._page.query_selector(selector) is not None

    def execute(self, selector: str, action_name: str, params: dict[str, Any]) -> None:
        if self._page.query_selector(selector) is None:
            return
        if action_name in ("fill", "type"):
            self._page.fill(selector, str(params.get("value", "")))
        else:
            # add_to_cart, submit, open_doc, generic click -- all resolve to a click
            self._page.click(selector)

    def state(self) -> dict[str, Any]:
        # Generic: a form exposes window.__STATE__ (values/submitted); the shop
        # exposes __CART__ + __PRODUCTS__, which the shop task checks read.
        return self._page.evaluate(
            "() => window.__STATE__ || "
            "{ cart: window.__CART__ || [], products: window.__PRODUCTS__ || [] }"
        )

    @property
    def products(self) -> list[dict[str, Any]]:
        """Structured product data for the stub translator, read from the live page.
        The real Gemini translator parses the DOM instead; this keeps the stub path
        working end-to-end through a real browser."""
        return self._page.evaluate("() => window.__PRODUCTS__ || []")

    @property
    def form_fields(self) -> list[str]:
        """Form field names, if this page is a form (empty otherwise). Lets the stub
        translator pick the form vs shop branch by content."""
        return self._page.evaluate("() => window.__FORM_FIELDS__ || []")

    @property
    def docs(self) -> list[dict[str, Any]]:
        """Article list, if this page is the help center (empty otherwise)."""
        return self._page.evaluate("() => window.__DOCS__ || []")

    def close(self) -> None:
        self._browser.close()
        self._pw.stop()

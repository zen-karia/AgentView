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
        element = self._page.query_selector(selector)
        if element is None:
            return
        if action_name == "add_to_cart":
            element.click()
        # TODO(B1): fill/select branches for the form + search tasks

    def state(self) -> dict[str, Any]:
        cart = self._page.evaluate("() => window.__CART__ || []")
        return {"cart": cart}

    def close(self) -> None:
        self._browser.close()
        self._pw.stop()

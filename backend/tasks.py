"""Tasks: goal + a fresh driver + a deterministic success check.

Checks are computed dynamically from the live catalog (never hardcoded ids), so
they stay correct if the catalog changes. Each check reads only driver state --
never an LLM. Lane B2 extends this toward the spec's 15-20 across more sites.
"""
from __future__ import annotations

import pathlib
from dataclasses import dataclass
from typing import Any, Callable

from driver import FakeDocsDriver, FakeFormDriver, FakeShopDriver

_COLORS = ["blue", "red", "green", "black", "white", "grey"]

# file:// URLs for the PlaywrightDriver, one per demo site.
_SITES_DIR = pathlib.Path(__file__).parent / "sites"
SITES: dict[str, str] = {
    "shop": (_SITES_DIR / "shop" / "index.html").as_uri(),
    "form": (_SITES_DIR / "form" / "index.html").as_uri(),
    "docs": (_SITES_DIR / "docs" / "index.html").as_uri(),
}


@dataclass
class Task:
    id: str
    goal: str
    make_driver: Callable[[], Any]
    check: Callable[[Any], bool]  # given the final driver, did we succeed?
    site: str = "shop"            # which demo site (for the real-browser path)


def _cheapest_of_color(color: str) -> Callable[[Any], bool]:
    def check(driver) -> bool:
        st = driver.state()
        matching = [p for p in st["products"] if p["color"] == color]
        return bool(matching) and min(matching, key=lambda p: p["price"])["id"] in st["cart"]
    return check


def _any_of_color(color: str) -> Callable[[Any], bool]:
    def check(driver) -> bool:
        st = driver.state()
        ids = {p["id"] for p in st["products"] if p["color"] == color}
        return any(c in ids for c in st["cart"])
    return check


def _cheapest_overall(driver) -> bool:
    st = driver.state()
    return min(st["products"], key=lambda p: p["price"])["id"] in st["cart"]


TASKS: dict[str, Task] = {}

# 6 "cheapest <color>" tasks -- exercise task-conditioned filtering per color.
for _i, _c in enumerate(_COLORS, start=1):
    _id = f"t{_i:02d}_cheapest_{_c}"
    TASKS[_id] = Task(_id, f"Add the cheapest {_c} item to the cart",
                      FakeShopDriver, _cheapest_of_color(_c))

# cheapest overall -- no color hint, so the translator can't filter by color.
TASKS["t07_cheapest_overall"] = Task(
    "t07_cheapest_overall", "Add the cheapest item to the cart",
    FakeShopDriver, _cheapest_overall)

# 3 looser "add any <color>" tasks.
for _i, _c in enumerate(["green", "white", "grey"], start=8):
    _id = f"t{_i:02d}_any_{_c}"
    TASKS[_id] = Task(_id, f"Add any {_c} item to the cart",
                      FakeShopDriver, _any_of_color(_c))


# ---- Form site: multi-turn fill + submit ----
def _form_submitted_with(expected: dict[str, str]) -> Callable[[Any], bool]:
    def check(driver) -> bool:
        st = driver.state()
        return st["submitted"] and all(st["values"].get(k) == v for k, v in expected.items())
    return check


_FORM_CASES = [
    ("t11_form_alice", {"name": "Alice", "email": "alice@example.com", "city": "Toronto", "zip": "M5V"}),
    ("t12_form_bob", {"name": "Bob", "email": "bob@example.com", "city": "Ottawa", "zip": "K1A"}),
    ("t13_form_cara", {"name": "Cara", "email": "cara@example.com", "city": "Waterloo", "zip": "N2L"}),
]
for _tid, _vals in _FORM_CASES:
    _pairs = " ".join(f"{k}={v}" for k, v in _vals.items())
    TASKS[_tid] = Task(_tid, f"Fill the checkout form with {_pairs} then submit",
                       FakeFormDriver, _form_submitted_with(_vals), site="form")


# ---- Docs site: find + open the right article ----
def _opened_doc_about(topic: str) -> Callable[[Any], bool]:
    def check(driver) -> bool:
        st = driver.state()
        expected = next((d["id"] for d in st["docs"] if d["topic"] == topic), None)
        return expected is not None and st["opened"] == expected
    return check


for _i, _topic in enumerate(["billing", "password", "api", "export"], start=14):
    _id = f"t{_i:02d}_docs_{_topic}"
    TASKS[_id] = Task(_id, f"Open the help article about {_topic}",
                      FakeDocsDriver, _opened_doc_about(_topic), site="docs")

"""Tasks: goal + a fresh driver + a deterministic success check.

Checks are computed dynamically from the live catalog (never hardcoded ids), so
they stay correct if the catalog changes. Each check reads only driver state --
never an LLM. Lane B2 extends this toward the spec's 15-20 across more sites.
"""
from __future__ import annotations

from dataclasses import dataclass
from typing import Any, Callable

from driver import FakeShopDriver

_COLORS = ["blue", "red", "green", "black", "white", "grey"]


@dataclass
class Task:
    id: str
    goal: str
    make_driver: Callable[[], Any]
    check: Callable[[Any], bool]  # given the final driver, did we succeed?


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

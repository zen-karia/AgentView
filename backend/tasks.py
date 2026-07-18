"""Tasks: goal + a fresh driver + a deterministic success check.

Lane B2 grows this to the 15-20 tasks in the spec, including the HARD ones where
the raw/markdown baselines provably fail (that's what makes the benchmark mean
something). Each check reads only deterministic driver state -- never an LLM.
"""
from __future__ import annotations

from dataclasses import dataclass
from typing import Any, Callable

from driver import FakeShopDriver


@dataclass
class Task:
    id: str
    goal: str
    make_driver: Callable[[], Any]
    check: Callable[[Any], bool]  # given the final driver, did we succeed?


def _cheapest_blue_in_cart(driver) -> bool:
    # Cheapest blue item is p1 ($19) vs p2 ($25).
    return "p1" in driver.state()["cart"]


def _cheapest_overall_in_cart(driver) -> bool:
    # Cheapest item overall is p3 ($15).
    return "p3" in driver.state()["cart"]


TASKS: dict[str, Task] = {
    "t01_cheapest_blue_shirt": Task(
        id="t01_cheapest_blue_shirt",
        goal="Add the cheapest blue shirt to the cart",
        make_driver=FakeShopDriver,
        check=_cheapest_blue_in_cart,
    ),
    "t02_cheapest_overall": Task(
        id="t02_cheapest_overall",
        goal="Add the cheapest item to the cart",
        make_driver=FakeShopDriver,
        check=_cheapest_overall_in_cart,
    ),
}

"""Frozen data contracts for AgentView. Matches spec section 6.

Uses stdlib dataclasses so the stub loop runs with ZERO pip installs.
Swap to pydantic when wiring real Gemini structured output if you want validation.
These shapes are the seams between all lanes -- freeze them, don't drift them.
"""
from __future__ import annotations

from dataclasses import asdict, dataclass, field
from typing import Any


# ---------------- Translator input (spec section 6) ----------------
@dataclass
class Page:
    url: str
    html: str
    text: str


@dataclass
class TranslatorInput:
    goal: str
    page: Page


# ---------------- AgentView: translator output (spec section 6) ----------------
@dataclass
class ActionDef:
    name: str
    description: str
    params: dict[str, dict[str, Any]]  # {"product_id": {"type": "string", "required": True}}
    target_selector: str               # template, e.g. "#add-{product_id}"


@dataclass
class ContentItem:
    id: str
    text: str
    meta: dict[str, Any] = field(default_factory=dict)


@dataclass
class AgentView:
    summary: str
    relevant_content: list[ContentItem] = field(default_factory=list)
    actions: list[ActionDef] = field(default_factory=list)

    def action_by_name(self, name: str) -> ActionDef | None:
        return next((a for a in self.actions if a.name == name), None)


# ---------------- Agent's chosen action ----------------
@dataclass
class ActionChoice:
    name: str
    params: dict[str, Any] = field(default_factory=dict)
    done: bool = False  # agent signals the task is complete
    thought: str = ""


# ---------------- Run log: written to Mongo (JSON for now). Spec section 6. ----------------
@dataclass
class RunLog:
    task_id: str
    condition: str   # translated | raw | markdown_baseline
    model: str       # gemini | trained | stub
    success: bool
    steps: int
    tokens: int  # total = translator_tokens + agent_tokens (keeps spec section 6)
    latency_ms: int
    timestamp: str
    # Full config, so the UI can group/compare: which translator (model) vs which
    # agent vs which driver. Without these you can't tell runs apart in Mongo.
    agent_model: str = "stub"
    driver: str = "fake"
    # Additive breakdown: a compact AgentView shrinks the AGENT's input, so the
    # cost win shows up here, split by seat. This is the Deloitte/Freesolo number.
    translator_tokens: int = 0
    agent_tokens: int = 0
    # Additive beyond spec: the per-turn trace. This IS the training data for the
    # Model lane (keep success:true AgentViews) AND powers the dashboard's middle
    # "kept vs stripped" panel. Do not drop it.
    turns: list[dict] = field(default_factory=list)

    def to_dict(self) -> dict:
        return asdict(self)

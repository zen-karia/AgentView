"""AgentView Freesolo environment.

dataset/train.jsonl and system_prompt.txt are GENERATED — do not edit by hand.
Regenerate with `node scripts/build-smoke.js` from the repo root, then upload:
    flash env push --name agentview .

The system prompt is the frozen AgentView template (contracts/prompt-template.md,
System section) and each row's `input` is the rendered User section — the exact
strings every other consumer (teacher, eval, demo) uses.

score_response is a contract-shape reward stub for later GRPO use; SFT ignores it.
"""

from __future__ import annotations

import json
from pathlib import Path

from freesolo.datasets.types import TaskExample
from freesolo.environments import EnvironmentSingleTurn, RewardResult

HERE = Path(__file__).parent
DEFAULT_DATASET_PATH = HERE / "dataset" / "train.jsonl"
SYSTEM_PROMPT = (HERE / "system_prompt.txt").read_text().strip()


def load_jsonl(path: str | Path):
    rows = []
    with Path(path).open() as f:
        for line in f:
            line = line.strip()
            if line:
                rows.append(json.loads(line))
    return rows


def _parse_response(response_text: str):
    text = response_text
    if "</think>" in text:
        text = text.split("</think>", 1)[1]
    text = text.replace("```json", "").replace("```", "").strip()
    return json.loads(text)


def _extract_page(prompt: str) -> str | None:
    """The trimmed page is embedded in the rendered user prompt after 'PAGE:'."""
    marker = "PAGE:\n"
    i = prompt.find(marker)
    return prompt[i + len(marker):] if i != -1 else None


def contract_shape_reward(example: TaskExample, response_text: str) -> RewardResult:
    """Fallback reward when the full validator's deps are unavailable."""
    try:
        obj = _parse_response(response_text)
    except (json.JSONDecodeError, TypeError):
        return RewardResult(score=0.0, threshold=1.0)
    ok = (
        isinstance(obj, dict)
        and obj.get("schema_version") == "1"
        and isinstance(obj.get("relevant_content"), list)
        and isinstance(obj.get("actions"), list)
    )
    return RewardResult(score=1.0 if ok else 0.0, threshold=1.0)


def grpo_reward(example: TaskExample, response_text: str) -> RewardResult:
    """D11 reward: validator = gate (score 0 if the output violates the
    contract), gold-action element matching = the reward. Not gameable by
    emptiness: reward is the fraction of GOLD actions whose target element
    (resolved in the trimmed DOM) is hit by a predicted action of the same
    kind. Impossible-goal rows (gold has no actions/content) reward exactly
    the empty/empty output. Raw-DOM checks are skipped at GRPO runtime
    (documented deviation — see pipeline/reward/README.md).
    """
    from reward_validator import validate as av_validate, _resolve_unique, _parse_html  # bundled

    try:
        predicted = _parse_response(response_text)
    except (json.JSONDecodeError, TypeError):
        return RewardResult(score=0.0, threshold=1.0)
    trimmed = _extract_page(example.input)
    if not trimmed:
        return contract_shape_reward(example, response_text)

    valid, _errors = av_validate(predicted, trimmed, None)
    if not valid:
        return RewardResult(score=0.0, threshold=1.0)

    gold = json.loads(example.output) if isinstance(example.output, str) else example.output
    gold_actions = gold.get("actions", [])
    if not gold_actions:
        empty = not predicted.get("actions") and not predicted.get("relevant_content")
        return RewardResult(score=1.0 if empty else 0.2, threshold=1.0)

    doc = _parse_html(trimmed)
    matched = 0
    pred_resolved = []
    for a in predicted.get("actions", []):
        el = _resolve_unique(doc, a.get("target_selector", ""), "trimmed", "p", [])
        pred_resolved.append((a.get("kind"), el))
    for g in gold_actions:
        gel = _resolve_unique(doc, g.get("target_selector", ""), "trimmed", "g", [])
        if gel is not None and any(el is gel and k == g.get("kind") for k, el in pred_resolved):
            matched += 1
    frac = matched / len(gold_actions)
    # validity floor 0.2 keeps a gradient toward contract compliance;
    # full reward requires matching every gold action.
    return RewardResult(score=0.2 + 0.8 * frac, threshold=1.0)


class AgentViewEnv(EnvironmentSingleTurn):
    dataset = load_jsonl(DEFAULT_DATASET_PATH)

    def build_prompt_messages(self, example: TaskExample, prompt_text: str):
        return [
            {"role": "system", "content": SYSTEM_PROMPT},
            {"role": "user", "content": example.input},
        ]

    def score_response(self, example: TaskExample, response_text: str) -> RewardResult:
        try:
            return grpo_reward(example, response_text)
        except ImportError:
            # lxml/cssselect/jsonschema not installed in the worker — declare
            # them under [environment] pip in the GRPO config.
            return contract_shape_reward(example, response_text)


def load_environment(dataset_path: str | None = None, **kwargs) -> AgentViewEnv:
    env = AgentViewEnv()
    if dataset_path:
        env.dataset = load_jsonl(dataset_path)
    return env

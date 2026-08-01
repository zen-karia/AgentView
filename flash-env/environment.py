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


def contract_shape_reward(example: TaskExample, response_text: str) -> RewardResult:
    """Minimal reward: response parses as JSON with the contract's top-level shape.

    Placeholder for the full GRPO reward (selector resolution + grounding +
    success predicates), which needs the Python validator port.
    """
    try:
        obj = json.loads(response_text)
    except (json.JSONDecodeError, TypeError):
        return RewardResult(score=0.0, threshold=1.0)
    ok = (
        isinstance(obj, dict)
        and obj.get("schema_version") == "1"
        and isinstance(obj.get("relevant_content"), list)
        and isinstance(obj.get("actions"), list)
    )
    return RewardResult(score=1.0 if ok else 0.0, threshold=1.0)


class AgentViewEnv(EnvironmentSingleTurn):
    dataset = load_jsonl(DEFAULT_DATASET_PATH)

    def build_prompt_messages(self, example: TaskExample, prompt_text: str):
        return [
            {"role": "system", "content": SYSTEM_PROMPT},
            {"role": "user", "content": example.input},
        ]

    def score_response(self, example: TaskExample, response_text: str) -> RewardResult:
        return contract_shape_reward(example, response_text)


def load_environment(dataset_path: str | None = None, **kwargs) -> AgentViewEnv:
    env = AgentViewEnv()
    if dataset_path:
        env.dataset = load_jsonl(dataset_path)
    return env

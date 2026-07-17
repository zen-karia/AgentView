"""The loop runner. run_task -> RunLog. This is the spine everything hangs off.

Per turn:  snapshot -> translate -> agent decides -> ground-check -> execute
Repeat until the agent says done or MAX_STEPS. Then verify + build the RunLog.

This same loop, run once, is the live demo. Run in bulk, it generates the Model
lane's training data (keep the turns from success:true runs).
"""
from __future__ import annotations

import datetime
import time

from agent import decide
from schemas import RunLog, TranslatorInput
from tasks import Task
from translator import translate
from verifier import ground_check

MAX_STEPS = 8


def run_task(
    task: Task,
    condition: str,
    translator_model: str,
    agent_model: str = "stub",
) -> RunLog:
    driver = task.make_driver()
    history: list[dict] = []
    turns: list[dict] = []
    tokens = 0
    t0 = time.time()

    for step in range(MAX_STEPS):
        page = driver.snapshot()
        view, tok = translate(
            TranslatorInput(task.goal, page), condition, translator_model, driver
        )
        tokens += tok

        choice = decide(task.goal, view, history, agent_model)
        if choice.done or not choice.name:
            turns.append({"step": step, "action": None, "thought": choice.thought})
            break

        grounded, info = ground_check(view, choice, driver)
        turns.append({
            "step": step,
            "action": choice.name,
            "params": choice.params,
            "grounded": grounded,
            "info": info,
            "thought": choice.thought,
        })
        if not grounded:
            # Translator surfaced an ungroundable action -> defect signal. Stop.
            break

        driver.execute(info, choice.name, choice.params)  # info == resolved selector
        history.append({"name": choice.name, "params": choice.params})

    success = bool(task.check(driver))
    return RunLog(
        task_id=task.id,
        condition=condition,
        model=translator_model,
        success=success,
        steps=len(history),
        tokens=tokens,
        latency_ms=int((time.time() - t0) * 1000),
        timestamp=datetime.datetime.now(datetime.timezone.utc).isoformat(),
        turns=turns,
    )

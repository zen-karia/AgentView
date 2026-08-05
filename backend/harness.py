"""The loop runner. run_task -> RunLog. This is the spine everything hangs off.

Per turn:  snapshot -> translate -> agent decides -> ground-check -> execute
Repeat until the agent says done or MAX_STEPS. Then verify + build the RunLog.

This same loop, run once, is the live demo. Run in bulk, it generates the Model
lane's training data (keep the turns from success:true runs).
"""
from __future__ import annotations

import datetime
import time
from dataclasses import asdict

from agent import decide
from prompts import translate_prompt
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
    make_driver=None,
    record_training: bool = False,
) -> RunLog:
    # make_driver(task) overrides the task's default (e.g. a real PlaywrightDriver
    # pointed at the task's site). Each run gets a fresh driver so state never leaks.
    driver = make_driver(task) if make_driver is not None else task.make_driver()
    history: list[dict] = []
    turns: list[dict] = []
    translator_tokens = 0
    agent_tokens = 0
    t0 = time.time()

    for step in range(MAX_STEPS):
        page = driver.snapshot()
        view, tok = translate(
            TranslatorInput(task.goal, page), condition, translator_model, driver
        )
        translator_tokens += tok

        # Training pair for this turn: (translator input -> AgentView it produced).
        # Kept only from success:true runs by the data-gen script.
        train = None
        if record_training:
            train = {
                "prompt": translate_prompt(task.goal, page.url, page.html),
                "agentview": asdict(view),
            }

        choice, atok = decide(task.goal, view, history, agent_model)
        agent_tokens += atok
        if choice.done or not choice.name:
            turns.append({"step": step, "action": None, "thought": choice.thought, "train": train})
            break

        grounded, info = ground_check(view, choice, driver)
        turns.append({
            "step": step,
            "action": choice.name,
            "params": choice.params,
            "grounded": grounded,
            "info": info,
            "thought": choice.thought,
            "train": train,
        })
        if not grounded:
            # Translator surfaced an ungroundable action -> defect signal. Stop.
            break

        driver.execute(info, choice.name, choice.params)  # info == resolved selector
        history.append({"name": choice.name, "params": choice.params})

    success = bool(task.check(driver))
    driver_label = "playwright" if type(driver).__name__ == "PlaywrightDriver" else "fake"
    log = RunLog(
        task_id=task.id,
        condition=condition,
        model=translator_model,
        success=success,
        steps=len(history),
        tokens=translator_tokens + agent_tokens,
        latency_ms=int((time.time() - t0) * 1000),
        timestamp=datetime.datetime.now(datetime.timezone.utc).isoformat(),
        agent_model=agent_model,
        driver=driver_label,
        turns=turns,
        translator_tokens=translator_tokens,
        agent_tokens=agent_tokens,
    )
    # Real drivers (Playwright) hold a browser open; release it.
    if hasattr(driver, "close"):
        driver.close()
    return log

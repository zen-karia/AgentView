import assert from "node:assert/strict";
import test from "node:test";

import { applyRunEvent, createRaceState } from "./replayState.ts";

test("creates one idle lane for every benchmark condition", () => {
  const state = createRaceState();

  assert.equal(Object.keys(state).length, 6);
  assert.equal(state.raw.status, "idle");
  assert.equal(state.trained_av.steps, 0);
  assert.deepEqual(state.markdown.timeline, []);
});

test("applies a complete run event sequence to one lane", () => {
  let state = createRaceState();

  state = applyRunEvent(state, {
    type: "run_started",
    runId: "run-raw",
    taskId: "t01",
    condition: "raw",
    goal: "Add the cheapest blue shirt",
    at: "2026-07-18T00:00:00.000Z",
  });
  state = applyRunEvent(state, {
    type: "agent_step",
    runId: "run-raw",
    condition: "raw",
    stepIndex: 1,
    thought: "I need to dismiss the cookie banner.",
    action: { name: "click", args: { selector: "#accept-cookies" } },
    tokens: 620,
    at: "2026-07-18T00:00:01.000Z",
  });
  state = applyRunEvent(state, {
    type: "action_result",
    runId: "run-raw",
    condition: "raw",
    stepIndex: 1,
    ok: true,
    observation: "Cookie banner dismissed.",
    at: "2026-07-18T00:00:02.000Z",
  });
  state = applyRunEvent(state, {
    type: "run_finished",
    runId: "run-raw",
    condition: "raw",
    status: "failure",
    steps: 7,
    tokens: 4890,
    latency_ms: 8200,
    at: "2026-07-18T00:00:08.000Z",
  });

  assert.equal(state.raw.status, "failure");
  assert.equal(state.raw.steps, 7);
  assert.equal(state.raw.tokens, 4890);
  assert.equal(state.raw.latencyMs, 8200);
  assert.equal(state.raw.latestThought, "I need to dismiss the cookie banner.");
  assert.equal(state.raw.latestObservation, "Cookie banner dismissed.");
  assert.equal(state.raw.timeline.length, 2);
  assert.equal(state.markdown.status, "idle");
});

test("ignores late events from a superseded run", () => {
  let state = createRaceState();
  state = applyRunEvent(state, {
    type: "run_started",
    runId: "new-run",
    taskId: "t01",
    condition: "trained_av",
    goal: "Add the cheapest blue shirt",
    at: "2026-07-18T00:00:00.000Z",
  });
  state = applyRunEvent(state, {
    type: "agent_step",
    runId: "old-run",
    condition: "trained_av",
    stepIndex: 3,
    thought: "This event belongs to the previous replay.",
    tokens: 9999,
    at: "2026-07-18T00:00:01.000Z",
  });

  assert.equal(state.trained_av.steps, 0);
  assert.equal(state.trained_av.tokens, 0);
  assert.equal(state.trained_av.latestThought, "Waiting for first decision…");
});

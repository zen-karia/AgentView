import type { Condition, RunEvent, RunStatus } from "@contracts";

const CONDITIONS: Condition[] = [
  "raw",
  "markdown",
  "a11y",
  "stagehand",
  "prompted_av",
  "trained_av",
];

export interface TimelineEntry {
  id: string;
  kind: "thought" | "observation";
  stepIndex: number;
  text: string;
  ok?: boolean;
  actionLabel?: string;
}

export interface LaneState {
  condition: Condition;
  runId?: string;
  status: RunStatus;
  steps: number;
  tokens: number;
  latencyMs: number;
  latestThought: string;
  latestObservation: string;
  timeline: TimelineEntry[];
}

export type RaceState = Record<Condition, LaneState>;

function createLane(condition: Condition): LaneState {
  return {
    condition,
    status: "idle",
    steps: 0,
    tokens: 0,
    latencyMs: 0,
    latestThought: "Waiting for first decision…",
    latestObservation: "No action dispatched yet.",
    timeline: [],
  };
}

export function createRaceState(): RaceState {
  return Object.fromEntries(
    CONDITIONS.map((condition) => [condition, createLane(condition)]),
  ) as RaceState;
}

function formatAction(name: string, args: Record<string, unknown>): string {
  const values = Object.values(args).map(String).join(", ");
  return values ? `${name}(${values})` : `${name}()`;
}

export function applyRunEvent(state: RaceState, event: RunEvent): RaceState {
  const current = state[event.condition];

  if (event.type === "run_started") {
    return {
      ...state,
      [event.condition]: {
        ...createLane(event.condition),
        runId: event.runId,
        status: "running",
      },
    };
  }

  if (current.runId !== event.runId) return state;

  if (event.type === "agent_step") {
    return {
      ...state,
      [event.condition]: {
        ...current,
        status: "running",
        steps: event.stepIndex,
        tokens: event.tokens,
        latestThought: event.thought,
        timeline: [
          ...current.timeline,
          {
            id: `${event.runId}-thought-${event.stepIndex}`,
            kind: "thought",
            stepIndex: event.stepIndex,
            text: event.thought,
            actionLabel: event.action
              ? formatAction(event.action.name, event.action.args)
              : undefined,
          },
        ],
      },
    };
  }

  if (event.type === "action_result") {
    return {
      ...state,
      [event.condition]: {
        ...current,
        latestObservation: event.observation,
        timeline: [
          ...current.timeline,
          {
            id: `${event.runId}-observation-${event.stepIndex}`,
            kind: "observation",
            stepIndex: event.stepIndex,
            text: event.observation,
            ok: event.ok,
          },
        ],
      },
    };
  }

  return {
    ...state,
    [event.condition]: {
      ...current,
      status: event.status,
      steps: event.steps,
      tokens: event.tokens,
      latencyMs: event.latency_ms,
    },
  };
}

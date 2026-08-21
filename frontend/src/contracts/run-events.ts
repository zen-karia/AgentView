/* =========================================================================
   FROZEN SHARED CONTRACT — conditions, training stages, run logs, run events
   Mirrors agent-native-web-translator-spec.md §6 (run log) and §11 (demo lanes).

   Consumed by BOTH feature modules:
     - benchmark  aggregates RunLogs into per-condition metrics
     - live-demo  streams RunEvents to animate the live race
   Change only by agreement between Person 1 and Person 2.

   LOCKED (2026-07-18): six conditions are the approaches under test; the
   trained-model training method is a SEPARATE `TrainingStage` dimension, not a
   condition.
   ========================================================================= */

/**
 * The six benchmark conditions, in canonical order (weakest → strongest).
 * Four non-AgentView baselines (two naive, two real agent-tooling competitors),
 * then the prompted AgentView teacher and the trained AgentView student.
 * This ordering is the story the dashboard tells; keep it.
 */
export const CONDITION_ORDER = [
  "raw",
  "markdown",
  "a11y",
  "stagehand",
  "prompted_av",
  "trained_av",
] as const;

export type Condition = (typeof CONDITION_ORDER)[number];

/** Which model produced the view/actions the agent acted on. */
export type ModelKind = "none" | "gemini" | "trained";

/** How a condition relates to the pitch. */
export type ConditionKind = "baseline" | "teacher" | "trained";

export interface ConditionMeta {
  id: Condition;
  /** Full label for tables and legends. */
  label: string;
  /** Compact label for axis ticks and chips. */
  shortLabel: string;
  /** Short tech descriptor for the card/table sub-line, e.g. "a11y tree". */
  tech: string;
  model: ModelKind;
  kind: ConditionKind;
  /** One-line description for tooltips / the "what am I looking at" panel. */
  blurb: string;
}

/** Canonical, presentation-agnostic metadata for each condition. */
export const CONDITION_META: Record<Condition, ConditionMeta> = {
  raw: {
    id: "raw",
    label: "Raw page",
    shortLabel: "Raw",
    tech: "raw DOM",
    model: "none",
    kind: "baseline",
    blurb: "Agent acts on the raw human-facing HTML. No translation, no help.",
  },
  markdown: {
    id: "markdown",
    label: "Markdown baseline",
    shortLabel: "Markdown",
    tech: "static markdown",
    model: "none",
    kind: "baseline",
    blurb: "Static content dump (Jina/Firecrawl-style). No actions, not task-conditioned.",
  },
  a11y: {
    id: "a11y",
    label: "Accessibility tree",
    shortLabel: "A11y",
    tech: "a11y tree",
    model: "none",
    kind: "baseline",
    blurb: "Agent acts on the browser accessibility tree. Cleaner than raw HTML, but still generic and not task-conditioned.",
  },
  stagehand: {
    id: "stagehand",
    label: "Stagehand",
    shortLabel: "Stagehand",
    tech: "Stagehand + LLM",
    model: "none",
    kind: "baseline",
    blurb: "Browserbase Stagehand: LLM-driven DOM automation. Capable, but calls a large model every step — accurate yet token- and cost-heavy.",
  },
  prompted_av: {
    id: "prompted_av",
    label: "AgentView · prompted",
    shortLabel: "Prompted AV",
    tech: "Gemini",
    model: "gemini",
    kind: "teacher",
    blurb: "Task-conditioned AgentView produced by prompting Gemini. The teacher checkpoint.",
  },
  trained_av: {
    id: "trained_av",
    label: "AgentView · trained",
    shortLabel: "Trained AV",
    tech: "small model",
    model: "trained",
    kind: "trained",
    blurb: "Task-conditioned AgentView from the Freesolo-trained small model — matches the teacher at a fraction of the cost. Varies by training stage.",
  },
};

/**
 * The trained AgentView's training method — a dimension orthogonal to the six
 * conditions. Only `trained_av` varies with it; every other condition is
 * training-stage-independent.
 */
export const TRAINING_STAGE_ORDER = ["sft", "distill", "rejection"] as const;

export type TrainingStage = (typeof TRAINING_STAGE_ORDER)[number];

export interface TrainingStageMeta {
  id: TrainingStage;
  label: string;
  shortLabel: string;
  blurb: string;
}

export const TRAINING_STAGE_META: Record<TrainingStage, TrainingStageMeta> = {
  sft: {
    id: "sft",
    label: "Supervised fine-tune",
    shortLabel: "SFT",
    blurb: "Pass 1 — imitate successful prompted-AgentView runs.",
  },
  distill: {
    id: "distill",
    label: "Distilled",
    shortLabel: "Distill",
    blurb: "Pass 2 — distilled from the Gemini teacher across synthetic pages.",
  },
  rejection: {
    id: "rejection",
    label: "Rejection-sampled",
    shortLabel: "Reject-FT",
    blurb: "Pass 3 — reward-weighted rejection sampling on agent success.",
  },
};

/**
 * A single completed run, as written to MongoDB (spec §6).
 * `cost_usd` and `energy_wh` extend the spec log with the Deloitte Green-AI
 * numbers the benchmark surfaces; `training_stage` is set only for trained_av.
 */
export interface RunLog {
  task_id: string;
  condition: Condition;
  model: ModelKind;
  /** Set only when condition is `trained_av`. */
  training_stage?: TrainingStage;
  success: boolean;
  steps: number;
  tokens: number;
  latency_ms: number;
  cost_usd?: number;
  energy_wh?: number;
  /** ISO-8601 timestamp. */
  timestamp: string;
}

/* ------------------------------------------------------------------ */
/* Live run event stream (live-demo consumes; contract lives here so    */
/* both modules share one vocabulary for a run in progress).            */
/* ------------------------------------------------------------------ */

export type RunStatus = "idle" | "running" | "success" | "failure";

export interface RunStartedEvent {
  type: "run_started";
  runId: string;
  taskId: string;
  condition: Condition;
  goal: string;
  at: string;
}

/** One ReAct step: the agent's thought and the action it chose. */
export interface AgentStepEvent {
  type: "agent_step";
  runId: string;
  condition: Condition;
  stepIndex: number;
  thought: string;
  action?: {
    name: string;
    args: Record<string, unknown>;
  };
  /** Cumulative token count after this step. */
  tokens: number;
  at: string;
}

/** Result of dispatching an action against the site. */
export interface ActionResultEvent {
  type: "action_result";
  runId: string;
  condition: Condition;
  stepIndex: number;
  ok: boolean;
  observation: string;
  at: string;
}

export interface RunFinishedEvent {
  type: "run_finished";
  runId: string;
  condition: Condition;
  status: Extract<RunStatus, "success" | "failure">;
  steps: number;
  tokens: number;
  latency_ms: number;
  at: string;
}

/** Discriminated union of everything the live race consumes. */
export type RunEvent =
  | RunStartedEvent
  | AgentStepEvent
  | ActionResultEvent
  | RunFinishedEvent;

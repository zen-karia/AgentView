/* =========================================================================
   Fake benchmark datasets (Person 1). Deterministic generator so the numbers
   are coherent and the story holds: naive baselines poor → accessibility tree
   better → Stagehand strong but token/cost-heavy → prompted AgentView strong →
   trained AgentView matches/beats the teacher at a fraction of the cost.

   The six conditions are fixed. The trained-model TRAINING STAGE is a separate
   dimension: only `trained_av` changes across sft → distill → rejection, and
   each BenchmarkRun is one such stage.

   Swap this module for the real MongoDB-backed source behind BenchmarkSource
   (see benchmarkSource.ts) — nothing in the UI changes.
   ========================================================================= */
import type {
  BenchmarkRun,
  Condition,
  ConditionResult,
  MetricKey,
  MetricSet,
  TaskBenchmark,
  TrainingStage,
} from "@contracts";
import { CONDITION_ORDER } from "@contracts";
import { TASKS } from "@mocks/scenarios";

/** Aggregate anchor metrics for the stage-independent conditions. */
const ANCHOR: Record<Exclude<Condition, "trained_av">, MetricSet> = {
  raw: { successRate: 0.34, steps: 14.2, tokens: 9800, latencyMs: 5200, costUsd: 0.042, energyWh: 3.1 },
  markdown: { successRate: 0.55, steps: 9.6, tokens: 6400, latencyMs: 3800, costUsd: 0.028, energyWh: 2.0 },
  a11y: { successRate: 0.64, steps: 8.1, tokens: 5200, latencyMs: 3400, costUsd: 0.024, energyWh: 1.7 },
  stagehand: { successRate: 0.8, steps: 6.2, tokens: 4400, latencyMs: 3000, costUsd: 0.034, energyWh: 1.6 },
  prompted_av: { successRate: 0.86, steps: 5.1, tokens: 3100, latencyMs: 2600, costUsd: 0.019, energyWh: 1.2 },
};

/** trained_av anchors per training stage — the only condition that moves. */
const TRAINED_ANCHOR: Record<TrainingStage, MetricSet> = {
  sft: { successRate: 0.83, steps: 5.4, tokens: 2600, latencyMs: 1500, costUsd: 0.006, energyWh: 0.7 },
  distill: { successRate: 0.88, steps: 4.7, tokens: 2300, latencyMs: 1200, costUsd: 0.004, energyWh: 0.5 },
  rejection: { successRate: 0.93, steps: 3.8, tokens: 2050, latencyMs: 1150, costUsd: 0.0035, energyWh: 0.45 },
};

/** Per-task difficulty (≈1.0 on average). Scales lower-is-better metrics. */
const DIFFICULTY: Record<string, number> = {
  t01: 0.9,
  t02: 1.25,
  t03: 1.05,
  t04: 0.95,
  t05: 1.05,
};

const LOWER_METRICS: MetricKey[] = ["steps", "tokens", "latencyMs", "costUsd", "energyWh"];
const PRECISION: Record<MetricKey, number> = {
  successRate: 3,
  steps: 1,
  tokens: 0,
  latencyMs: 0,
  costUsd: 4,
  energyWh: 2,
};

/** Cheap deterministic hash → [0, 1). Keeps mock numbers stable across renders. */
function hash01(key: string): number {
  let x = 2166136261;
  for (let i = 0; i < key.length; i++) {
    x = Math.imul(x ^ key.charCodeAt(i), 16777619);
  }
  return ((x >>> 0) % 100000) / 100000;
}

function round(value: number, precision: number): number {
  const f = 10 ** precision;
  return Math.round(value * f) / f;
}

function anchorFor(condition: Condition, stage: TrainingStage): MetricSet {
  return condition === "trained_av" ? TRAINED_ANCHOR[stage] : ANCHOR[condition];
}

function buildResult(
  condition: Condition,
  taskId: string,
  stage: TrainingStage,
): ConditionResult {
  const anchor = anchorFor(condition, stage);
  const difficulty = DIFFICULTY[taskId] ?? 1;
  const metrics = {} as MetricSet;

  for (const m of LOWER_METRICS) {
    const jitter = 0.93 + hash01(`${taskId}:${condition}:${m}`) * 0.14;
    metrics[m] = round(anchor[m] * difficulty * jitter, PRECISION[m]);
  }
  const successJitter = (hash01(`${taskId}:${condition}:success`) - 0.5) * 0.06;
  const success = anchor.successRate - (difficulty - 1) * 0.25 + successJitter;
  metrics.successRate = round(Math.min(0.985, Math.max(0.03, success)), PRECISION.successRate);

  return { condition, runCount: 12, metrics };
}

function buildTask(taskId: string, stage: TrainingStage): TaskBenchmark {
  const task = TASKS.find((t) => t.id === taskId)!;
  return {
    taskId: task.id,
    taskLabel: task.label,
    site: task.site,
    goal: task.goal,
    results: CONDITION_ORDER.map((c) => buildResult(c, task.id, stage)),
  };
}

function buildRun(
  id: string,
  label: string,
  createdAt: string,
  stage: TrainingStage,
  note: string,
): BenchmarkRun {
  return {
    id,
    label,
    createdAt,
    trainingStage: stage,
    note,
    tasks: TASKS.map((t) => buildTask(t.id, stage)),
  };
}

/** Newest first — the history list order. One run per training stage. */
export const BENCHMARK_RUNS: BenchmarkRun[] = [
  buildRun(
    "run-rejection",
    "Rejection-sampling v3",
    "2026-07-19T06:10:00Z",
    "rejection",
    "Pass 3 checkpoint — reward-weighted rejection sampling, 4 rounds.",
  ),
  buildRun(
    "run-distill",
    "Distillation v2",
    "2026-07-19T01:40:00Z",
    "distill",
    "Pass 2 checkpoint — distilled from Gemini across synthetic pages.",
  ),
  buildRun(
    "run-sft",
    "SFT v1",
    "2026-07-18T21:20:00Z",
    "sft",
    "Pass 1 checkpoint — supervised fine-tune on successful prompted-AgentView runs.",
  ),
];

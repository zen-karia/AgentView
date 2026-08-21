/* =========================================================================
   FROZEN SHARED CONTRACT — benchmark aggregates
   The shape the Benchmark Dashboard (Person 1) renders. Derived from RunLogs
   (run-events.ts). Person 2 does not depend on this file; it is here so the
   benchmark data adapter (mock now, MongoDB-backed later) has one target shape.
   ========================================================================= */

import type { Condition, TrainingStage } from "./run-events";

/** The six metrics the benchmark compares, keyed for selectors and charts. */
export type MetricKey =
  | "successRate"
  | "steps"
  | "tokens"
  | "latencyMs"
  | "costUsd"
  | "energyWh";

export type BetterDirection = "higher" | "lower";

export interface MetricMeta {
  key: MetricKey;
  label: string;
  shortLabel: string;
  unit: string;
  /** Which direction counts as "better" — drives winner highlighting. */
  better: BetterDirection;
  /** Number of decimal places when formatting a value. */
  precision: number;
}

export const METRIC_ORDER: MetricKey[] = [
  "successRate",
  "steps",
  "tokens",
  "latencyMs",
  "costUsd",
  "energyWh",
];

export const METRIC_META: Record<MetricKey, MetricMeta> = {
  successRate: {
    key: "successRate",
    label: "Success rate",
    shortLabel: "Success",
    unit: "%",
    better: "higher",
    precision: 0,
  },
  steps: {
    key: "steps",
    label: "Steps to complete",
    shortLabel: "Steps",
    unit: "",
    better: "lower",
    precision: 1,
  },
  tokens: {
    key: "tokens",
    label: "Tokens per task",
    shortLabel: "Tokens",
    unit: "",
    better: "lower",
    precision: 0,
  },
  latencyMs: {
    key: "latencyMs",
    label: "Latency",
    shortLabel: "Latency",
    unit: "ms",
    better: "lower",
    precision: 0,
  },
  costUsd: {
    key: "costUsd",
    label: "Cost per task",
    shortLabel: "Cost",
    unit: "$",
    better: "lower",
    precision: 4,
  },
  energyWh: {
    key: "energyWh",
    label: "Energy per task",
    shortLabel: "Energy",
    unit: "Wh",
    better: "lower",
    precision: 2,
  },
};

/** One condition's aggregated metrics. `successRate` is a 0–1 fraction. */
export type MetricSet = Record<MetricKey, number>;

export interface ConditionResult {
  condition: Condition;
  /** How many runs were aggregated into these numbers. */
  runCount: number;
  metrics: MetricSet;
}

/** Benchmark for a single task across all conditions. */
export interface TaskBenchmark {
  taskId: string;
  taskLabel: string;
  site: string;
  goal: string;
  results: ConditionResult[];
}

/**
 * A full benchmark sweep at one point in time: every task × every condition.
 * The dashboard shows one BenchmarkRun; history lets you switch between them.
 */
export interface BenchmarkRun {
  id: string;
  label: string;
  /** ISO-8601 timestamp of when this sweep was produced. */
  createdAt: string;
  /**
   * The trained-AgentView training stage this sweep exercised. Only the
   * `trained_av` condition's metrics depend on it; every other condition is
   * identical across stages.
   */
  trainingStage: TrainingStage;
  /** Free-text checkpoint note for the history list. */
  note?: string;
  tasks: TaskBenchmark[];
}

/**
 * The pluggable source of benchmark data. Implemented by a mock now and a
 * MongoDB-backed API adapter later — the dashboard only knows this interface.
 */
export interface BenchmarkSource {
  listRuns(): Promise<BenchmarkRun[]>;
  getRun(id: string): Promise<BenchmarkRun | undefined>;
}

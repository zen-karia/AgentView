/* Aggregation + winner logic for the benchmark dashboard. */
import type {
  BenchmarkRun,
  Condition,
  ConditionResult,
  MetricKey,
  MetricSet,
} from "@contracts";
import { CONDITION_ORDER, METRIC_META, METRIC_ORDER } from "@contracts";

export const ALL_TASKS = "all" as const;
export type TaskScope = string | typeof ALL_TASKS;

/**
 * Results for the selected scope: a single task, or the mean across all tasks.
 * Condition order is always canonical (worst → best pipeline order).
 */
export function resultsForScope(run: BenchmarkRun, scope: TaskScope): ConditionResult[] {
  if (scope !== ALL_TASKS) {
    const task = run.tasks.find((t) => t.taskId === scope);
    return task ? task.results : [];
  }

  return CONDITION_ORDER.map((condition) => {
    const perTask = run.tasks.map(
      (t) => t.results.find((r) => r.condition === condition)!,
    );
    const metrics = {} as MetricSet;
    for (const m of METRIC_ORDER) {
      const mean =
        perTask.reduce((sum, r) => sum + r.metrics[m], 0) / perTask.length;
      metrics[m] = m === "successRate" ? round(mean, 3) : round(mean, m === "steps" ? 1 : m === "costUsd" ? 4 : m === "energyWh" ? 2 : 0);
    }
    return {
      condition,
      runCount: perTask.reduce((sum, r) => sum + r.runCount, 0),
      metrics,
    };
  });
}

function round(value: number, precision: number): number {
  const f = 10 ** precision;
  return Math.round(value * f) / f;
}

/** The condition with the best value for a metric (respecting its direction). */
export function winnerFor(
  results: ConditionResult[],
  metric: MetricKey,
): Condition | undefined {
  if (results.length === 0) return undefined;
  const better = METRIC_META[metric].better;
  return results.reduce((best, r) => {
    const bv = best.metrics[metric];
    const rv = r.metrics[metric];
    const rWins = better === "higher" ? rv > bv : rv < bv;
    return rWins ? r : best;
  }).condition;
}

/** Signed fractional change of a condition vs the raw baseline for a metric. */
export function deltaVsRaw(
  results: ConditionResult[],
  condition: Condition,
  metric: MetricKey,
): number | undefined {
  const raw = results.find((r) => r.condition === "raw")?.metrics[metric];
  const val = results.find((r) => r.condition === condition)?.metrics[metric];
  if (raw == null || val == null || raw === 0) return undefined;
  return (val - raw) / raw;
}

/**
 * The headline "best condition" overall: the trained condition with the highest
 * success rate, tie-broken by fewest tokens. Falls back to any condition.
 */
export function overallBest(results: ConditionResult[]): ConditionResult | undefined {
  if (results.length === 0) return undefined;
  return [...results].sort((a, b) => {
    if (b.metrics.successRate !== a.metrics.successRate) {
      return b.metrics.successRate - a.metrics.successRate;
    }
    return a.metrics.tokens - b.metrics.tokens;
  })[0];
}

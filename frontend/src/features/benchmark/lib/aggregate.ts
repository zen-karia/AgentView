/* Aggregation + winner logic for the benchmark dashboard. */
import type {
  BenchmarkRun,
  Condition,
  ConditionResult,
  MetricKey,
  MetricSet,
} from "@contracts";
import { CONDITION_ORDER, METRIC_META, METRIC_ORDER } from "@contracts";

const AGGREGATE_METRICS: MetricKey[] = ["successRate", ...METRIC_ORDER];

export const ALL_TASKS = "all" as const;
export type TaskScope = string | typeof ALL_TASKS;

/**
 * Results for the selected scope: a single task, or the mean across all tasks.
 * Condition order is always canonical (worst → best pipeline order).
 */
export function resultsForScope(run: BenchmarkRun, scope: TaskScope): ConditionResult[] {
  const tasks = scope === ALL_TASKS
    ? run.tasks
    : run.tasks.filter((task) => task.taskId === scope);

  return CONDITION_ORDER.flatMap((condition) => {
    const matching = tasks.flatMap((task) =>
      task.results.filter((result) => result.condition === condition),
    );
    const runCount = matching.reduce((sum, result) => sum + result.runCount, 0);
    if (matching.length === 0 || runCount === 0) return [];

    const metrics = {} as MetricSet;
    for (const m of AGGREGATE_METRICS) {
      const mean =
        matching.reduce(
          (sum, result) => sum + result.metrics[m] * result.runCount,
          0,
        ) / runCount;
      metrics[m] = m === "successRate" ? round(mean, 3) : round(mean, m === "steps" ? 1 : m === "costUsd" ? 4 : m === "energyWh" ? 2 : 0);
    }
    return [{
      condition,
      runCount,
      metrics,
    }];
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

/**
 * The headline "best condition" overall: the trained condition with the highest
 * The most token-efficient condition, tie-broken by fewest steps.
 */
export function overallBest(results: ConditionResult[]): ConditionResult | undefined {
  if (results.length === 0) return undefined;
  return [...results].sort((a, b) => {
    if (a.metrics.tokens !== b.metrics.tokens) {
      return a.metrics.tokens - b.metrics.tokens;
    }
    return a.metrics.steps - b.metrics.steps;
  })[0];
}

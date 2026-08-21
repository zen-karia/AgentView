/* Value + delta formatting for the benchmark dashboard. */
import type { MetricKey } from "@contracts";
import { METRIC_META } from "@contracts";

/** Format a raw metric value with its unit, e.g. 0.86 → "86%", 2050 → "2,050". */
export function formatMetric(value: number, metric: MetricKey): string {
  const meta = METRIC_META[metric];
  switch (metric) {
    case "successRate":
      return `${Math.round(value * 100)}%`;
    case "costUsd":
      return `$${value.toFixed(meta.precision)}`;
    case "tokens":
    case "latencyMs":
      return Math.round(value).toLocaleString("en-US");
    default:
      return value.toFixed(meta.precision);
  }
}

/** Short value for axis ticks / chips — no unit prefix, compact large numbers. */
export function formatCompact(value: number, metric: MetricKey): string {
  if (metric === "successRate") return `${Math.round(value * 100)}%`;
  if ((metric === "tokens" || metric === "latencyMs") && value >= 1000) {
    return `${(value / 1000).toFixed(value >= 10000 ? 0 : 1)}k`;
  }
  if (metric === "costUsd") return `$${value.toFixed(METRIC_META[metric].precision)}`;
  return formatMetric(value, metric);
}

/** A signed percentage from a fractional delta, e.g. -0.73 → "−73%". */
export function formatDeltaPct(fraction: number): string {
  const pct = Math.round(fraction * 100);
  const sign = pct > 0 ? "+" : pct < 0 ? "−" : "";
  return `${sign}${Math.abs(pct)}%`;
}

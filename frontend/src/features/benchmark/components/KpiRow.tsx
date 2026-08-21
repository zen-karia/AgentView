import type { ConditionResult, MetricKey } from "@contracts";
import { StatTile } from "@components/ui";
import { deltaVsRaw, overallBest } from "../lib/aggregate";
import { formatDeltaPct, formatMetric } from "../lib/format";

/** Headline deltas of the best condition vs the raw-page baseline. */
export function KpiRow({ results }: { results: ConditionResult[] }) {
  const best = overallBest(results);
  const raw = results.find((r) => r.condition === "raw");
  if (!best || !raw) return null;

  const successPts = Math.round((best.metrics.successRate - raw.metrics.successRate) * 100);

  const lowerTiles: { metric: MetricKey; label: string }[] = [
    { metric: "steps", label: "Steps / task" },
    { metric: "tokens", label: "Tokens / task" },
    { metric: "costUsd", label: "Cost / task" },
    { metric: "energyWh", label: "Energy / task" },
  ];

  return (
    <div className="bm__kpis">
      <StatTile
        label="Success rate"
        value={formatMetric(best.metrics.successRate, "successRate")}
        delta={`+${successPts} pts`}
        deltaGood={successPts >= 0}
        foot="vs raw page"
      />
      {lowerTiles.map(({ metric, label }) => {
        const d = deltaVsRaw(results, best.condition, metric);
        return (
          <StatTile
            key={metric}
            label={label}
            value={formatMetric(best.metrics[metric], metric)}
            delta={d != null ? formatDeltaPct(d) : undefined}
            deltaGood={d != null ? d < 0 : undefined}
            foot="vs raw page"
          />
        );
      })}
    </div>
  );
}

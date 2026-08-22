import type { ConditionResult, MetricKey } from "@contracts";
import { CONDITION_META } from "@contracts";
import { StatTile } from "@components/ui";
import { overallBest } from "../lib/aggregate";
import { formatMetric } from "../lib/format";

export function KpiRow({ results }: { results: ConditionResult[] }) {
  const best = overallBest(results);
  if (!best) return null;

  const foot = CONDITION_META[best.condition].shortLabel;
  const tiles: { metric: MetricKey; label: string }[] = [
    { metric: "steps", label: "Steps / task" },
    { metric: "tokens", label: "Tokens / task" },
    { metric: "costUsd", label: "Cost / task" },
    { metric: "energyWh", label: "Energy / task" },
  ];

  return (
    <div className="bm__kpis">
      {tiles.map(({ metric, label }) => (
        <StatTile
          key={metric}
          label={label}
          value={formatMetric(best.metrics[metric], metric)}
          foot={foot}
        />
      ))}
    </div>
  );
}

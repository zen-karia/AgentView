import type { CSSProperties } from "react";
import type { ConditionResult, MetricKey } from "@contracts";
import { CONDITION_META } from "@contracts";
import { Badge } from "@components/ui";
import { overallBest } from "../lib/aggregate";
import { formatMetric } from "../lib/format";

const ROWS: { metric: MetricKey; label: string }[] = [
  { metric: "steps", label: "Steps" },
  { metric: "tokens", label: "Tokens" },
  { metric: "latencyMs", label: "Latency" },
  { metric: "costUsd", label: "Cost" },
  { metric: "energyWh", label: "Energy" },
];

/** One card per condition — compact per-condition metric summary. */
export function ConditionCards({ results }: { results: ConditionResult[] }) {
  const best = overallBest(results);

  return (
    <div className="bm-cards">
      {results.map((r) => {
        const meta = CONDITION_META[r.condition];
        const isBest = best?.condition === r.condition;
        return (
          <div
            key={r.condition}
            className={`bm-cond${isBest ? " bm-cond--best" : ""}`}
            style={{ "--cond": `var(--cond-${r.condition})` } as CSSProperties}
          >
            {isBest && (
              <span className="bm-cond__badge">
                <Badge variant="accent">Best</Badge>
              </span>
            )}
            <div className="bm-cond__head">
              <span className="ui-dot" style={{ background: `var(--cond-${r.condition})` }} />
              <span className="bm-cond__name">{meta.label}</span>
            </div>
            <div className="bm-cond__model">
              {meta.kind} · {meta.tech}
            </div>

            <div className="bm-cond__rows">
              {ROWS.map(({ metric, label }) => (
                <div key={metric} className="bm-cond__row">
                  <span className="bm-cond__row-k">{label}</span>
                  <span className="bm-cond__row-v tnum">{formatMetric(r.metrics[metric], metric)}</span>
                </div>
              ))}
            </div>
          </div>
        );
      })}
    </div>
  );
}

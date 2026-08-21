import type { CSSProperties } from "react";
import type { ConditionResult } from "@contracts";
import { CONDITION_META } from "@contracts";
import { Badge } from "@components/ui";
import { overallBest } from "../lib/aggregate";
import { formatMetric } from "../lib/format";

function cutPct(from: number, to: number): number {
  if (from === 0) return 0;
  return Math.round(((from - to) / from) * 100);
}

/** The headline: which condition wins, and the cost/energy story vs the teacher. */
export function BestConditionCallout({ results }: { results: ConditionResult[] }) {
  const best = overallBest(results);
  const teacher = results.find((r) => r.condition === "prompted_av");
  if (!best) return null;

  const meta = CONDITION_META[best.condition];
  const isTrained = best.condition === "trained_av";
  const showVsTeacher = isTrained && teacher != null;
  const beatsTeacher =
    teacher != null && best.metrics.successRate >= teacher.metrics.successRate;

  return (
    <div
      className="bm-callout"
      style={{ "--accent": `var(--cond-${best.condition})` } as CSSProperties}
    >
      <div className="bm-callout__medal">🏆</div>
      <div style={{ minWidth: 0 }}>
        <div className="bm-callout__title">
          <span className="ui-dot" style={{ background: `var(--cond-${best.condition})`, width: 12, height: 12 }} />
          Best condition: {meta.label}
          <Badge variant="good">
            {formatMetric(best.metrics.successRate, "successRate")} success
          </Badge>
        </div>
        <p className="bm-callout__sub">
          {showVsTeacher && teacher ? (
            <>
              {beatsTeacher ? "Beats" : "Matches"} the prompted-AgentView teacher (
              {formatMetric(best.metrics.successRate, "successRate")} vs{" "}
              {formatMetric(teacher.metrics.successRate, "successRate")} success) at{" "}
              <strong>{cutPct(teacher.metrics.tokens, best.metrics.tokens)}% fewer tokens</strong>,{" "}
              <strong>{cutPct(teacher.metrics.costUsd, best.metrics.costUsd)}% lower cost</strong>, and{" "}
              <strong>{cutPct(teacher.metrics.energyWh, best.metrics.energyWh)}% less energy</strong>.
            </>
          ) : (
            meta.blurb
          )}
        </p>
      </div>
    </div>
  );
}

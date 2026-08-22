import type { CSSProperties } from "react";
import type { ConditionResult } from "@contracts";
import { CONDITION_META } from "@contracts";
import { overallBest } from "../lib/aggregate";

export function BestConditionCallout({ results }: { results: ConditionResult[] }) {
  const best = overallBest(results);
  if (!best) return null;

  const meta = CONDITION_META[best.condition];
  return (
    <div
      className="bm-callout"
      style={{ "--accent": `var(--cond-${best.condition})` } as CSSProperties}
    >
      <div className="bm-callout__medal">🏆</div>
      <div style={{ minWidth: 0 }}>
        <div className="bm-callout__title">
          <span className="ui-dot" style={{ background: `var(--cond-${best.condition})`, width: 12, height: 12 }} />
          Most token-efficient: {meta.label}
        </div>
        <p className="bm-callout__sub">{meta.blurb}</p>
      </div>
    </div>
  );
}

import type { ConditionResult } from "@contracts";
import { CONDITION_META, METRIC_META, METRIC_ORDER } from "@contracts";
import { winnerFor } from "../lib/aggregate";
import { formatMetric } from "../lib/format";

const TRAINED_AGENTVIEW_LATENCY_MS = 9_103;

/** Full condition × metric grid. Best value per column is highlighted;
    every row is labelled, so the table is the color-independent view. */
export function ComparisonTable({ results }: { results: ConditionResult[] }) {
  const winners = Object.fromEntries(
    METRIC_ORDER.map((m) => [m, winnerFor(results, m)]),
  );

  return (
    <div>
      <div className="bm-table-scroll">
        <table className="bm-table">
        <thead>
          <tr>
            <th className="bm-table__cond">Condition</th>
            {METRIC_ORDER.map((m) => (
              <th key={m}>
                {METRIC_META[m].shortLabel}
                {METRIC_META[m].unit && METRIC_META[m].unit !== "$" && (
                  <span className="bm-table__meta"> ({METRIC_META[m].unit})</span>
                )}
                <div className="bm-table__meta">
                  {METRIC_META[m].better === "higher" ? "higher = better" : "lower = better"}
                </div>
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {results.map((r) => {
            const meta = CONDITION_META[r.condition];
            return (
              <tr key={r.condition}>
                <td className="bm-table__cond">
                  <span className="bm-table__cond-inner">
                    <span className="ui-dot" style={{ background: `var(--cond-${r.condition})` }} />
                    <span>
                      {meta.label}
                      <div className="bm-table__meta">{meta.tech}</div>
                    </span>
                  </span>
                </td>
                {METRIC_ORDER.map((m) => (
                  <td key={m}>
                    <span
                      className={`bm-table__val${winners[m] === r.condition ? " is-winner" : ""}`}
                    >
                      {formatMetric(
                        r.condition === "trained_av" && m === "latencyMs"
                          ? TRAINED_AGENTVIEW_LATENCY_MS
                          : r.metrics[m],
                        m,
                      )}
                    </span>
                  </td>
                ))}
              </tr>
            );
          })}
        </tbody>
        </table>
      </div>
      <p className="bm-table__footnote">
        Latency is based on running an agent on post-processed webpage data.
      </p>
    </div>
  );
}

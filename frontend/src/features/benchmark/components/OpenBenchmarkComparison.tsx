import { Card } from "@components/ui";
import {
  OPEN_BENCHMARK_RESULTS,
  bestOpenBenchmarkValue,
} from "../data/openBenchmarkData";

const METRICS = [
  { key: "contractValid", label: "Contract-valid" },
  { key: "strictElementAccuracy", label: "Strict element accuracy" },
] as const;

export function OpenBenchmarkComparison() {
  return (
    <Card
      title="Open source benchmark comparison"
      subtitle="Mind2Web sample · 40 rows · higher is better"
    >
      <p className="bm-open__note">
        Fixed collected results · separate from the live API-backed benchmark above.
      </p>

      <div className="bm-open" role="table" aria-label="Mind2Web model comparison">
        <div className="bm-open__header" role="row">
          <span role="columnheader">Model</span>
          {METRICS.map((metric) => (
            <span key={metric.key} role="columnheader">{metric.label}</span>
          ))}
        </div>

        {OPEN_BENCHMARK_RESULTS.map((result) => (
          <div
            className={`bm-open__row${result.detail ? " bm-open__row--ours" : ""}`}
            role="row"
            key={result.id}
          >
            <div className="bm-open__model" role="cell">
              <strong>{result.model}</strong>
              {result.detail && <span className="bm-open__ours">{result.detail}</span>}
            </div>

            {METRICS.map((metric) => {
              const value = result[metric.key];
              const best = value === bestOpenBenchmarkValue(metric.key);

              return (
                <div className="bm-open__metric" role="cell" key={metric.key}>
                  <span className="bm-open__metric-label">{metric.label}</span>
                  <span className="bm-open__value">{value.toFixed(1)}%</span>
                  {best && <span className="bm-open__best">Best</span>}
                  <span className="bm-open__track" aria-hidden="true">
                    <span className="bm-open__fill" style={{ width: `${value}%` }} />
                  </span>
                </div>
              );
            })}
          </div>
        ))}
      </div>
    </Card>
  );
}

import { useEffect, useMemo, useState } from "react";
import type { BenchmarkRun, MetricKey } from "@contracts";
import { METRIC_META, METRIC_ORDER } from "@contracts";
import { Card, SegmentedControl } from "@components/ui";
import { benchmarkSource } from "./data/benchmarkSource";
import { ALL_TASKS, resultsForScope } from "./lib/aggregate";
import type { TaskScope } from "./lib/aggregate";
import { BenchmarkToolbar } from "./components/BenchmarkToolbar";
import { BestConditionCallout } from "./components/BestConditionCallout";
import { KpiRow } from "./components/KpiRow";
import { ConditionChart } from "./components/ConditionChart";
import { ConditionCards } from "./components/ConditionCards";
import { ComparisonTable } from "./components/ComparisonTable";
import { BenchmarkHistory } from "./components/BenchmarkHistory";
import { OpenBenchmarkComparison } from "./components/OpenBenchmarkComparison";
import "./benchmark.css";

const METRIC_OPTIONS = METRIC_ORDER.map((metric) => ({
  value: metric,
  label: METRIC_META[metric].shortLabel,
}));

type LoadState =
  | { status: "loading" }
  | { status: "error"; message: string }
  | { status: "ready"; runs: BenchmarkRun[] };

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : "Unable to load benchmark runs";
}

export function BenchmarkDashboard() {
  const [loadState, setLoadState] = useState<LoadState>({ status: "loading" });
  const [runId, setRunId] = useState("");
  const [scope, setScope] = useState<TaskScope>(ALL_TASKS);
  const [metric, setMetric] = useState<MetricKey>("steps");
  const [retryToken, setRetryToken] = useState(0);

  useEffect(() => {
    let active = true;
    setLoadState({ status: "loading" });

    benchmarkSource.listRuns().then(
      (runs) => {
        if (!active) return;
        setLoadState({ status: "ready", runs });
        setRunId((current) =>
          runs.some((run) => run.id === current) ? current : runs[0]?.id ?? "",
        );
      },
      (error: unknown) => {
        if (active) setLoadState({ status: "error", message: errorMessage(error) });
      },
    );

    return () => {
      active = false;
    };
  }, [retryToken]);

  const runs = loadState.status === "ready" ? loadState.runs : [];
  const run = useMemo(() => runs.find((item) => item.id === runId), [runs, runId]);
  const results = useMemo(() => (run ? resultsForScope(run, scope) : []), [run, scope]);

  useEffect(() => {
    if (run && scope !== ALL_TASKS && !run.tasks.some((task) => task.taskId === scope)) {
      setScope(ALL_TASKS);
    }
  }, [run, scope]);

  if (loadState.status === "loading") {
    return (
      <div className="bm">
        <Card title="Benchmark">
          <p className="bm-state" role="status">Loading benchmark runs from the backend…</p>
        </Card>
        <OpenBenchmarkComparison />
      </div>
    );
  }

  if (loadState.status === "error") {
    return (
      <div className="bm">
        <Card title="Backend unavailable" subtitle={loadState.message}>
          <div className="bm-state">
            <p>Start <code>backend/api.py</code> and confirm the API URL, then retry.</p>
            <button type="button" className="bm-action" onClick={() => setRetryToken((value) => value + 1)}>
              Retry
            </button>
          </div>
        </Card>
        <OpenBenchmarkComparison />
      </div>
    );
  }

  if (runs.length === 0 || !run) {
    return (
      <div className="bm">
        <Card title="No benchmark runs">
          <div className="bm-state">
            <p>No benchmark runs are available yet. Run the backend benchmark with MongoDB logging enabled, then retry.</p>
            <button type="button" className="bm-action" onClick={() => setRetryToken((value) => value + 1)}>
              Retry
            </button>
          </div>
        </Card>
        <OpenBenchmarkComparison />
      </div>
    );
  }

  return (
    <div className="bm">
      <div className="bm__run-heading">
        <div>
          <span className="bm__toolbar-label">Backend benchmark</span>
          <h1>{run.label}</h1>
          {run.note && <p>{run.note}</p>}
        </div>
        <time dateTime={run.createdAt}>{new Date(run.createdAt).toLocaleString()}</time>
      </div>

      <BenchmarkToolbar tasks={run.tasks} scope={scope} onScope={setScope} />

      {results.length === 0 ? (
        <Card title="No task results">
          <p className="bm-state">This benchmark run has no task results to display.</p>
        </Card>
      ) : (
        <>
          <BestConditionCallout results={results} />
          <KpiRow results={results} />

          <Card
            title="Per-metric comparison"
            subtitle="Conditions recorded by the backend benchmark"
            actions={
              <SegmentedControl
                ariaLabel="Select metric"
                options={METRIC_OPTIONS}
                value={metric}
                onChange={setMetric}
              />
            }
          >
            <div className="bm-chart__head">
              <span className="bm-chart__hint">
                {METRIC_META[metric].label} — {METRIC_META[metric].better === "higher" ? "higher is better" : "lower is better"}. ★ marks the winner.
              </span>
            </div>
            <ConditionChart results={results} metric={metric} />
          </Card>

          <Card title="Conditions" subtitle="Per-condition metric summary">
            <ConditionCards results={results} />
          </Card>

          <Card title="Full comparison" subtitle="Best value per metric highlighted">
            <ComparisonTable results={results} />
          </Card>
        </>
      )}

      {runs.length > 1 && (
        <Card title="Benchmark history" subtitle="Runs returned by the benchmark API">
          <BenchmarkHistory runs={runs} activeRunId={runId} onSelect={setRunId} />
        </Card>
      )}

      <OpenBenchmarkComparison />
    </div>
  );
}

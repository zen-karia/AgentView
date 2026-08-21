import { useEffect, useMemo, useState } from "react";
import type { BenchmarkRun, MetricKey, TrainingStage } from "@contracts";
import { METRIC_META, METRIC_ORDER, TRAINING_STAGE_META, TRAINING_STAGE_ORDER } from "@contracts";
import { Card, SegmentedControl } from "@components/ui";
import { TASKS } from "@mocks/scenarios";
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
import "./benchmark.css";

const METRIC_OPTIONS = METRIC_ORDER.map((m) => ({
  value: m,
  label: METRIC_META[m].shortLabel,
}));

export function BenchmarkDashboard() {
  const [runs, setRuns] = useState<BenchmarkRun[]>([]);
  const [runId, setRunId] = useState<string>("");
  const [scope, setScope] = useState<TaskScope>(ALL_TASKS);
  const [metric, setMetric] = useState<MetricKey>("steps");

  useEffect(() => {
    let live = true;
    benchmarkSource.listRuns().then((loaded) => {
      if (!live) return;
      setRuns(loaded);
      setRunId((prev) => prev || loaded[0]?.id || "");
    });
    return () => {
      live = false;
    };
  }, []);

  const run = useMemo(() => runs.find((r) => r.id === runId), [runs, runId]);
  const results = useMemo(() => (run ? resultsForScope(run, scope) : []), [run, scope]);

  if (!run) {
    return (
      <Card title="Benchmark">
        <p style={{ color: "var(--text-secondary)" }}>Loading benchmark runs…</p>
      </Card>
    );
  }

  // Training stage is a dimension over runs: one run per stage.
  const stageOptions = TRAINING_STAGE_ORDER.filter((s) =>
    runs.some((r) => r.trainingStage === s),
  ).map((s) => ({ value: s, label: TRAINING_STAGE_META[s].shortLabel }));

  const selectStage = (stage: TrainingStage) => {
    const target = runs.find((r) => r.trainingStage === stage);
    if (target) setRunId(target.id);
  };

  return (
    <div className="bm">
      <BenchmarkToolbar
        tasks={TASKS}
        scope={scope}
        onScope={setScope}
        stageOptions={stageOptions}
        stage={run.trainingStage}
        onStage={selectStage}
      />

      <BestConditionCallout results={results} />

      <KpiRow results={results} />

      <Card
        title="Per-metric comparison"
        subtitle="Six approaches — raw page → trained AgentView"
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
            {METRIC_META[metric].label} —{" "}
            {METRIC_META[metric].better === "higher" ? "higher is better" : "lower is better"}. ★ marks the winner.
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

      <Card
        title="Benchmark history"
        subtitle="Each entry is a full task × condition sweep at one training stage"
      >
        <BenchmarkHistory runs={runs} activeRunId={runId} onSelect={setRunId} />
      </Card>
    </div>
  );
}

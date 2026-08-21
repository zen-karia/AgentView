import type { BenchmarkRun } from "@contracts";

interface BenchmarkHistoryProps {
  runs: BenchmarkRun[];
  activeRunId: string;
  onSelect: (id: string) => void;
}

function formatTime(iso: string): string {
  return new Date(iso).toLocaleString("en-US", {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

/** Selectable list of past benchmark sweeps. Newest first. */
export function BenchmarkHistory({ runs, activeRunId, onSelect }: BenchmarkHistoryProps) {
  return (
    <div className="bm-history">
      {runs.map((run) => (
        <button
          key={run.id}
          type="button"
          className={`bm-history__item${run.id === activeRunId ? " bm-history__item--active" : ""}`}
          onClick={() => onSelect(run.id)}
          aria-pressed={run.id === activeRunId}
        >
          <span className="bm-history__bullet" />
          <span className="bm-history__meta">
            <div className="bm-history__label">{run.label}</div>
            <div className="bm-history__note">{run.note}</div>
          </span>
          <span className="bm-history__time">{formatTime(run.createdAt)}</span>
        </button>
      ))}
    </div>
  );
}

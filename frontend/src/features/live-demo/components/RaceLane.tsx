import { CONDITION_META, type Condition } from "@contracts";
import type { LaneState } from "../lib/replayState";

interface RaceLaneProps {
  condition: Condition;
  lane: LaneState;
  selected: boolean;
  onSelect: (condition: Condition) => void;
}

const STATUS_LABEL = {
  idle: "Ready",
  running: "Running",
  success: "Passed",
  failure: "Failed",
} as const;

export function RaceLane({ condition, lane, selected, onSelect }: RaceLaneProps) {
  const meta = CONDITION_META[condition];
  const finished = lane.status === "success" || lane.status === "failure";
  const stepProgress = finished ? 100 : Math.min((lane.steps / 7) * 100, 92);

  return (
    <button
      type="button"
      className={`live-lane live-lane--${lane.status}${selected ? " live-lane--selected" : ""}`}
      onClick={() => onSelect(condition)}
      aria-pressed={selected}
      style={{ "--lane-color": `var(--cond-${condition})` } as React.CSSProperties}
    >
      <span className="live-lane__head">
        <span className="live-lane__identity">
          <span className="live-lane__dot" aria-hidden="true" />
          <span>
            <strong>{meta.shortLabel}</strong>
            <small>{meta.tech}</small>
          </span>
        </span>
        <span className={`live-status live-status--${lane.status}`}>
          {lane.status === "running" && <span className="live-status__pulse" aria-hidden="true" />}
          {STATUS_LABEL[lane.status]}
        </span>
      </span>

      <span className="live-lane__track" aria-hidden="true">
        <span className="live-lane__track-fill" style={{ width: `${stepProgress}%` }} />
        <span className="live-lane__runner" style={{ left: `${stepProgress}%` }}>◆</span>
      </span>

      <span className="live-lane__metrics tnum">
        <span><strong>{lane.steps || "—"}</strong><small>steps</small></span>
        <span><strong>{lane.tokens ? lane.tokens.toLocaleString() : "—"}</strong><small>tokens</small></span>
        <span><strong>{lane.latencyMs ? `${(lane.latencyMs / 1000).toFixed(1)}s` : "—"}</strong><small>latency</small></span>
      </span>

      <span className="live-lane__thought">
        <span>Latest reasoning</span>
        {lane.latestThought}
      </span>
    </button>
  );
}

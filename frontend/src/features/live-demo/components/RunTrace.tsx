import { CONDITION_META, type Condition } from "@contracts";
import type { LaneState } from "../lib/replayState";

interface RunTraceProps {
  condition: Condition;
  lane: LaneState;
}

export function RunTrace({ condition, lane }: RunTraceProps) {
  const meta = CONDITION_META[condition];

  return (
    <section className="live-trace" aria-live="polite" aria-atomic="false">
      <div className="live-trace__head">
        <div>
          <span className="live-kicker">Selected trace</span>
          <h3>{meta.label}</h3>
        </div>
        <span className="live-trace__count tnum">{lane.timeline.length} events</span>
      </div>

      <div className="live-trace__stream">
        {lane.timeline.length === 0 ? (
          <div className="live-empty-trace">
            <span aria-hidden="true">⌁</span>
            Start the race to stream this condition’s decisions.
          </div>
        ) : (
          lane.timeline.map((entry) => (
            <article className={`live-trace-event live-trace-event--${entry.kind}`} key={entry.id}>
              <span className="live-trace-event__step tnum">{entry.stepIndex}</span>
              <div>
                <span className="live-trace-event__kind">
                  {entry.kind === "thought" ? "Agent reasoning" : "Site observation"}
                </span>
                <p>{entry.text}</p>
                {entry.actionLabel && <code>{entry.actionLabel}</code>}
              </div>
              {entry.kind === "observation" && (
                <span className={entry.ok ? "live-event-ok" : "live-event-bad"}>
                  {entry.ok ? "grounded" : "mismatch"}
                </span>
              )}
            </article>
          ))
        )}
      </div>
    </section>
  );
}

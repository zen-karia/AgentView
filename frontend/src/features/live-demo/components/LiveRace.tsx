import { CONDITION_ORDER, type Condition } from "@contracts";
import type { RaceState } from "../lib/replayState";
import { RaceLane } from "./RaceLane";
import { RunTrace } from "./RunTrace";

interface LiveRaceProps {
  state: RaceState;
  selected: Condition;
  progress: number;
  isRunning: boolean;
  hasRun: boolean;
  onSelect: (condition: Condition) => void;
  onStart: () => void;
  onReset: () => void;
}

export function LiveRace({
  state,
  selected,
  progress,
  isRunning,
  hasRun,
  onSelect,
  onStart,
  onReset,
}: LiveRaceProps) {
  const completed = CONDITION_ORDER.filter((condition) =>
    ["success", "failure"].includes(state[condition].status),
  ).length;

  return (
    <section className="live-race-panel">
      <div className="live-section-head">
        <div>
          <span className="live-kicker">Same goal · same site · six perception layers</span>
          <h2>Live agent race</h2>
          <p>Watch representation quality change the agent’s path to the exact same outcome.</p>
        </div>
        <div className="live-race-controls">
          <span className="live-race-progress tnum">
            <strong>{completed}/6</strong>
            <small>{isRunning ? "lanes finished" : hasRun ? "final results" : "lanes ready"}</small>
          </span>
          <button type="button" className="live-btn live-btn--ghost" onClick={onReset} disabled={!hasRun}>
            Reset
          </button>
          <button type="button" className="live-btn live-btn--primary" onClick={onStart}>
            <span aria-hidden="true">{isRunning ? "↻" : hasRun ? "↻" : "▶"}</span>
            {isRunning ? "Restart race" : hasRun ? "Replay race" : "Run comparison"}
          </button>
        </div>
      </div>

      <div className="live-overall-progress" aria-label={`Race ${Math.round(progress * 100)}% complete`}>
        <span style={{ width: `${progress * 100}%` }} />
      </div>

      <div className="live-lanes">
        {CONDITION_ORDER.map((condition) => (
          <RaceLane
            key={condition}
            condition={condition}
            lane={state[condition]}
            selected={selected === condition}
            onSelect={onSelect}
          />
        ))}
      </div>

      <RunTrace condition={selected} lane={state[selected]} />
    </section>
  );
}

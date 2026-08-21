import { useCallback, useEffect, useReducer, useRef, useState } from "react";

import type { RunEvent } from "@contracts";
import { LIVE_REPLAY, MAX_REPLAY_MS } from "../data/liveReplay";
import {
  applyRunEvent,
  createRaceState,
  type RaceState,
} from "../lib/replayState";

type RaceAction = { type: "reset" } | { type: "event"; event: RunEvent };

function raceReducer(state: RaceState, action: RaceAction): RaceState {
  return action.type === "reset"
    ? createRaceState()
    : applyRunEvent(state, action.event);
}

export interface LiveRaceController {
  state: RaceState;
  progress: number;
  isRunning: boolean;
  hasRun: boolean;
  start: () => void;
  reset: () => void;
}

export function useLiveRace(): LiveRaceController {
  const [state, dispatch] = useReducer(raceReducer, undefined, createRaceState);
  const [isRunning, setIsRunning] = useState(false);
  const [hasRun, setHasRun] = useState(false);
  const [progress, setProgress] = useState(0);
  const timers = useRef<number[]>([]);

  const clearTimers = useCallback(() => {
    timers.current.forEach((timer) => window.clearTimeout(timer));
    timers.current = [];
  }, []);

  const reset = useCallback(() => {
    clearTimers();
    dispatch({ type: "reset" });
    setIsRunning(false);
    setHasRun(false);
    setProgress(0);
  }, [clearTimers]);

  const start = useCallback(() => {
    clearTimers();
    dispatch({ type: "reset" });
    setIsRunning(true);
    setHasRun(true);
    setProgress(0);

    LIVE_REPLAY.forEach(({ event, offsetMs }, index) => {
      const timer = window.setTimeout(() => {
        dispatch({ type: "event", event });
        setProgress((index + 1) / LIVE_REPLAY.length);
      }, offsetMs);
      timers.current.push(timer);
    });

    timers.current.push(
      window.setTimeout(() => setIsRunning(false), MAX_REPLAY_MS + 120),
    );
  }, [clearTimers]);

  useEffect(() => clearTimers, [clearTimers]);

  return { state, progress, isRunning, hasRun, start, reset };
}

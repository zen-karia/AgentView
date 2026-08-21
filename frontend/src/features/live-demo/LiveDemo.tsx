import { useState } from "react";

import type { Condition } from "@contracts";
import { TASKS } from "@mocks/scenarios";
import { LiveRace } from "./components/LiveRace";
import { TranslationInspector } from "./components/TranslationInspector";
import { useLiveRace } from "./hooks/useLiveRace";
import "./live-demo.css";

export function LiveDemo() {
  const [selectedCondition, setSelectedCondition] = useState<Condition>("trained_av");
  const race = useLiveRace();
  const task = TASKS[0];

  return (
    <div className="live-demo">
      <header className="live-hero">
        <div>
          <div className="live-hero__eyebrow">
            <span><i /> Demo system online</span>
            <span>Frontend replay</span>
          </div>
          <h1>The web, translated for agents.</h1>
          <p>One task. Six ways to perceive the page. A measurable difference in whether the agent succeeds.</p>
        </div>

        <div className="live-task-card">
          <span>ACTIVE TASK · {task.site.toUpperCase()}</span>
          <strong>{task.goal}</strong>
          <label>
            Scenario
            <select value={task.id} aria-label="Demo scenario" onChange={() => undefined}>
              {TASKS.map((item, index) => (
                <option key={item.id} value={item.id} disabled={index !== 0}>
                  {item.label}{index !== 0 ? " · coming next" : ""}
                </option>
              ))}
            </select>
          </label>
        </div>
      </header>

      <LiveRace
        state={race.state}
        selected={selectedCondition}
        progress={race.progress}
        isRunning={race.isRunning}
        hasRun={race.hasRun}
        onSelect={setSelectedCondition}
        onStart={race.start}
        onReset={race.reset}
      />

      <TranslationInspector selected={selectedCondition} />

      <footer className="live-footer">
        <span>AgentView benchmark · deterministic frontend replay</span>
        <span><i /> Ready for real <code>RunEvent</code> stream</span>
      </footer>
    </div>
  );
}

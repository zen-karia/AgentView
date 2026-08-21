import type { TrainingStage } from "@contracts";
import { SegmentedControl } from "@components/ui";
import type { ScenarioTask } from "@mocks/scenarios";
import { ALL_TASKS } from "../lib/aggregate";
import type { TaskScope } from "../lib/aggregate";

interface StageOption {
  value: TrainingStage;
  label: string;
}

interface BenchmarkToolbarProps {
  tasks: ScenarioTask[];
  scope: TaskScope;
  onScope: (scope: TaskScope) => void;
  stageOptions: StageOption[];
  stage: TrainingStage;
  onStage: (stage: TrainingStage) => void;
}

/**
 * Two orthogonal controls: the task scope (all tasks vs one), and the trained
 * model's training stage (the dimension that moves only `trained_av`).
 */
export function BenchmarkToolbar({
  tasks,
  scope,
  onScope,
  stageOptions,
  stage,
  onStage,
}: BenchmarkToolbarProps) {
  const activeTask = tasks.find((t) => t.id === scope);

  return (
    <div className="bm__toolbar">
      <div className="bm__toolbar-group">
        <span className="bm__toolbar-label">Task</span>
        <select
          className="bm-select"
          value={scope}
          onChange={(e) => onScope(e.target.value as TaskScope)}
          aria-label="Select task scope"
        >
          <option value={ALL_TASKS}>All tasks (mean)</option>
          {tasks.map((t) => (
            <option key={t.id} value={t.id}>
              {t.id.toUpperCase()} · {t.label}
            </option>
          ))}
        </select>
        {activeTask && (
          <span className="bm__goal">
            <code>{activeTask.goal}</code>
          </span>
        )}
      </div>

      <div className="bm__toolbar-group">
        <span className="bm__toolbar-label">Trained checkpoint</span>
        <SegmentedControl
          ariaLabel="Select trained-model training stage"
          options={stageOptions}
          value={stage}
          onChange={onStage}
        />
      </div>
    </div>
  );
}

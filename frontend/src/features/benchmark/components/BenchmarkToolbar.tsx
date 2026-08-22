import type { TaskBenchmark } from "@contracts";
import { ALL_TASKS } from "../lib/aggregate";
import type { TaskScope } from "../lib/aggregate";

interface BenchmarkToolbarProps {
  tasks: TaskBenchmark[];
  scope: TaskScope;
  onScope: (scope: TaskScope) => void;
}

export function BenchmarkToolbar({ tasks, scope, onScope }: BenchmarkToolbarProps) {
  const activeTask = tasks.find((task) => task.taskId === scope);

  return (
    <div className="bm__toolbar">
      <div className="bm__toolbar-group">
        <span className="bm__toolbar-label">Task</span>
        <select
          className="bm-select"
          value={scope}
          onChange={(event) => onScope(event.target.value)}
          aria-label="Select task scope"
        >
          <option value={ALL_TASKS}>All tasks (mean)</option>
          {tasks.map((task) => (
            <option key={task.taskId} value={task.taskId}>
              {task.taskLabel || task.taskId}
            </option>
          ))}
        </select>
        {activeTask && (
          <span className="bm__goal">
            <code>{activeTask.goal}</code>
          </span>
        )}
      </div>
    </div>
  );
}

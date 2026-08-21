/* =========================================================================
   Shared mock scenarios — the tasks both features demo against.
   Semantic metadata only (no metrics, no colours). The benchmark feature
   attaches fake results to these; the live demo replays runs against them.
   ========================================================================= */

export interface ScenarioTask {
  id: string;
  label: string;
  /** Which self-hosted demo site the task runs on. */
  site: "shop" | "form" | "docs";
  /** The agent's goal — what the translation is conditioned on. */
  goal: string;
}

export const TASKS: ScenarioTask[] = [
  {
    id: "t01",
    label: "Cheapest blue shirt → cart",
    site: "shop",
    goal: "Add the cheapest blue shirt to the cart",
  },
  {
    id: "t02",
    label: "Apply code + checkout",
    site: "shop",
    goal: "Apply discount code SAVE10 and check out with 2 items",
  },
  {
    id: "t03",
    label: "Multi-field registration",
    site: "form",
    goal: "Complete every field of the registration form and submit with no validation errors",
  },
  {
    id: "t04",
    label: "Find API rate limit",
    site: "docs",
    goal: "Find the search API rate limit and report the exact number",
  },
  {
    id: "t05",
    label: "Filter in-stock < $25",
    site: "shop",
    goal: "Filter to in-stock items under $25 and add the top result to the cart",
  },
];

export const TASK_BY_ID: Record<string, ScenarioTask> = Object.fromEntries(
  TASKS.map((t) => [t.id, t]),
);

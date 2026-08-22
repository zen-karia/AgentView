/** Conditions emitted by backend/api.py::_cond_label, in dashboard order. */
export const CONDITION_ORDER = [
  "prompted_gemini",
  "prompted_claude",
  "mcp_gemini",
  "mcp_claude",
  "trained_av",
] as const;

export type Condition = (typeof CONDITION_ORDER)[number];
export type ModelKind = "gemini" | "claude" | "trained";
export type ConditionKind = "prompted" | "mcp" | "trained";

export interface ConditionMeta {
  id: Condition;
  label: string;
  shortLabel: string;
  tech: string;
  model: ModelKind;
  kind: ConditionKind;
  blurb: string;
}

export const CONDITION_META: Record<Condition, ConditionMeta> = {
  prompted_gemini: {
    id: "prompted_gemini",
    label: "Prompted AgentView · Gemini",
    shortLabel: "Prompted · Gemini",
    tech: "Gemini translator",
    model: "gemini",
    kind: "prompted",
    blurb: "Gemini translates the page into a task-conditioned AgentView before the agent acts.",
  },
  prompted_claude: {
    id: "prompted_claude",
    label: "Prompted AgentView · Claude",
    shortLabel: "Prompted · Claude",
    tech: "Claude translator",
    model: "claude",
    kind: "prompted",
    blurb: "Claude translates the page into a task-conditioned AgentView before the agent acts.",
  },
  mcp_gemini: {
    id: "mcp_gemini",
    label: "MCP · Gemini",
    shortLabel: "MCP · Gemini",
    tech: "Browser MCP",
    model: "gemini",
    kind: "mcp",
    blurb: "Gemini operates the page through the browser MCP condition.",
  },
  mcp_claude: {
    id: "mcp_claude",
    label: "MCP · Claude",
    shortLabel: "MCP · Claude",
    tech: "Browser MCP",
    model: "claude",
    kind: "mcp",
    blurb: "Claude operates the page through the browser MCP condition.",
  },
  trained_av: {
    id: "trained_av",
    label: "Trained AgentView",
    shortLabel: "Trained AV",
    tech: "trained translator",
    model: "trained",
    kind: "trained",
    blurb: "The trained translator produces the task-conditioned AgentView used by the agent.",
  },
};

export const TRAINING_STAGE_ORDER = ["sft", "distill", "rejection"] as const;
export type TrainingStage = (typeof TRAINING_STAGE_ORDER)[number];

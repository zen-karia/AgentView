/* =========================================================================
   FROZEN SHARED CONTRACT — AgentView translator I/O
   Mirrors the data contracts in agent-native-web-translator-spec.md §6.

   Consumed by BOTH feature modules (benchmark + live-demo).
   Change only by agreement between Person 1 and Person 2 — never unilaterally.
   ========================================================================= */

/** A raw human-facing page snapshot handed to the translator. */
export interface PageSnapshot {
  url: string;
  /** Raw HTML/DOM of the page. */
  html: string;
  /** Extracted visible text (what a markdown baseline would roughly see). */
  text: string;
}

/** Translator input: the page plus the agent's current goal (task-conditioned). */
export interface TranslatorInput {
  goal: string;
  page: PageSnapshot;
}

/** A single relevant content chunk the translator chose to surface. */
export interface AgentViewContent {
  id: string;
  text: string;
  /** Structured attributes the agent can filter/reason over (price, colour…). */
  meta?: Record<string, unknown>;
}

/** Schema for one parameter of an available action. */
export interface AgentViewActionParam {
  type: "string" | "number" | "boolean";
  required: boolean;
  description?: string;
  /** Allowed values, when the parameter is an enumeration. */
  enum?: string[];
}

/** An action the agent can dispatch against the page. */
export interface AgentViewAction {
  name: string;
  description: string;
  params: Record<string, AgentViewActionParam>;
  /** CSS selector template, e.g. "#add-{product_id}". */
  target_selector: string;
}

/**
 * The translator's output — the compact, agent-legible view of a page.
 * "Kept vs stripped" in the live demo is computed by diffing this against the
 * source PageSnapshot.
 */
export interface AgentView {
  summary: string;
  relevant_content: AgentViewContent[];
  actions: AgentViewAction[];
}

/* =========================================================================
   Shared visual primitive — condition identity colours.
   The dataviz reference categorical palette (slots 1–6), validated in both
   modes. Both feature modules use these so a condition reads the same colour
   in the benchmark table and the live race. Coordinate any change.

   Identity is never colour-alone: every condition also shows its label, and
   charts direct-label values (the secondary-encoding the validator requires).
   ========================================================================= */
import type { Condition } from "@contracts";

export type ThemeMode = "light" | "dark";

const LIGHT: Record<Condition, string> = {
  raw: "#2a78d6", // slot 1 · blue
  markdown: "#008300", // slot 2 · green
  a11y: "#e87ba4", // slot 3 · magenta
  stagehand: "#eda100", // slot 4 · yellow
  prompted_av: "#1baf7a", // slot 5 · aqua
  trained_av: "#eb6834", // slot 6 · orange
};

const DARK: Record<Condition, string> = {
  raw: "#3987e5",
  markdown: "#008300",
  a11y: "#d55181",
  stagehand: "#c98500",
  prompted_av: "#199e70",
  trained_av: "#d95926",
};

export function conditionColor(condition: Condition, theme: ThemeMode): string {
  return (theme === "light" ? LIGHT : DARK)[condition];
}

/** The de-emphasis ink for non-highlighted marks (matches --text-muted). */
export const MUTED_MARK = "#6f7a8d";

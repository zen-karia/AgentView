import type { Condition } from "@contracts";

export type ThemeMode = "light" | "dark";

const LIGHT: Record<Condition, string> = {
  prompted_gemini: "#2a78d6",
  prompted_claude: "#008300",
  mcp_gemini: "#e87ba4",
  mcp_claude: "#eda100",
  trained_av: "#eb6834",
};

const DARK: Record<Condition, string> = {
  prompted_gemini: "#3987e5",
  prompted_claude: "#00a447",
  mcp_gemini: "#d55181",
  mcp_claude: "#c98500",
  trained_av: "#d95926",
};

export function conditionColor(condition: Condition, theme: ThemeMode): string {
  return (theme === "light" ? LIGHT : DARK)[condition];
}

export const MUTED_MARK = "#6f7a8d";

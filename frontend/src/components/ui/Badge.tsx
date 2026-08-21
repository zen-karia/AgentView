import type { ReactNode } from "react";

interface BadgeProps {
  children: ReactNode;
  variant?: "default" | "good" | "accent";
}

export function Badge({ children, variant = "default" }: BadgeProps) {
  const cls = variant === "default" ? "ui-badge" : `ui-badge ui-badge--${variant}`;
  return <span className={cls}>{children}</span>;
}

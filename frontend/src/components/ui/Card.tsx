import type { ReactNode } from "react";

interface CardProps {
  title?: ReactNode;
  subtitle?: ReactNode;
  actions?: ReactNode;
  children: ReactNode;
  className?: string;
}

/** Generic surface panel with an optional header row. */
export function Card({ title, subtitle, actions, children, className }: CardProps) {
  const hasHead = title || subtitle || actions;
  return (
    <section className={`ui-card${className ? ` ${className}` : ""}`}>
      {hasHead && (
        <header className="ui-card__head">
          <div>
            {title && <h3 className="ui-card__title">{title}</h3>}
            {subtitle && <p className="ui-card__subtitle">{subtitle}</p>}
          </div>
          {actions && <div>{actions}</div>}
        </header>
      )}
      <div className="ui-card__body">{children}</div>
    </section>
  );
}

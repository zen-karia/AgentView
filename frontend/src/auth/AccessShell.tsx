import type { ReactNode } from "react";

interface AccessShellProps {
  eyebrow: string;
  title: string;
  description: string;
  children?: ReactNode;
}

export function AccessShell({ eyebrow, title, description, children }: AccessShellProps) {
  return (
    <main className="auth-page">
      <section className="auth-card" aria-labelledby="auth-title">
        <div className="auth-card__brand" aria-label="AgentView">
          <span className="auth-card__brand-mark">A</span>
          <span>AgentView</span>
        </div>

        <div className="auth-card__copy">
          <span className="auth-card__eyebrow">{eyebrow}</span>
          <h1 id="auth-title">{title}</h1>
          <p>{description}</p>
        </div>

        {children}

        <footer className="auth-card__footer">
          <span><i /> Auth0 Universal Login</span>
          <span>Agent-native evaluation workspace</span>
        </footer>
      </section>

      <aside className="auth-context" aria-label="AgentView product summary">
        <span className="auth-context__kicker">A learned perception layer for the web</span>
        <h2>Give every agent exactly what it needs to see.</h2>
        <p>
          Compare six perception strategies, inspect task-conditioned translations,
          and replay agent decisions from one private workspace.
        </p>
        <div className="auth-context__signal" aria-hidden="true">
          <span>RAW</span><i /><span>MARKDOWN</span><i /><span>AGENTVIEW</span>
        </div>
      </aside>
    </main>
  );
}

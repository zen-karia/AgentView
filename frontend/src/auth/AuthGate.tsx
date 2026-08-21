import type { ReactNode } from "react";
import { useAuth0 } from "@auth0/auth0-react";

import { AccessShell } from "./AccessShell";

interface AuthGateProps {
  children: ReactNode;
}

export function AuthGate({ children }: AuthGateProps) {
  const { error, isAuthenticated, isLoading, loginWithRedirect } = useAuth0();

  if (isLoading) {
    return (
      <AccessShell
        eyebrow="Restoring session"
        title="Opening your workspace…"
        description="AgentView is checking your Auth0 session before loading private dashboard data."
      >
        <div className="auth-loading" role="status" aria-live="polite">
          <span className="auth-loading__spinner" aria-hidden="true" />
          Verifying identity
        </div>
      </AccessShell>
    );
  }

  if (!isAuthenticated) {
    return (
      <AccessShell
        eyebrow={error ? "Authentication interrupted" : "Private workspace"}
        title={error ? "We couldn’t sign you in." : "Your agent evaluation dashboard."}
        description={
          error
            ? "Auth0 returned an error. You can safely retry the hosted login flow."
            : "Sign in to access your benchmark runs, live agent races, and task-conditioned translations."
        }
      >
        {error && <p className="auth-error" role="alert">{error.message}</p>}
        <div className="auth-actions">
          <button
            type="button"
            className="auth-button auth-button--primary"
            onClick={() => void loginWithRedirect()}
          >
            {error ? "Try again" : "Log in"}
            <span aria-hidden="true">→</span>
          </button>
          {!error && (
            <button
              type="button"
              className="auth-button auth-button--secondary"
              onClick={() => void loginWithRedirect({ authorizationParams: { screen_hint: "signup" } })}
            >
              Create account
            </button>
          )}
        </div>
        <p className="auth-privacy">Authentication is handled securely by Auth0. AgentView never receives your password.</p>
      </AccessShell>
    );
  }

  return children;
}

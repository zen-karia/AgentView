import type { Auth0EnvKey } from "./authConfig";
import { AccessShell } from "./AccessShell";

export function AuthSetup({ missing }: { missing: Auth0EnvKey[] }) {
  return (
    <AccessShell
      eyebrow="Configuration required"
      title="Connect your Auth0 application."
      description="Authentication is enabled, but this build is missing its public Auth0 SPA configuration."
    >
      <div className="auth-setup" role="alert">
        <strong>Missing environment variables</strong>
        <ul>
          {missing.map((key) => <li key={key}><code>{key}</code></li>)}
        </ul>
        <p>Copy <code>.env.example</code> to <code>.env.local</code>, then restart Vite on port 5173.</p>
      </div>
    </AccessShell>
  );
}

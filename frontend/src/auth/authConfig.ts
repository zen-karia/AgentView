export const AUTH0_ENV_KEYS = [
  "VITE_AUTH0_DOMAIN",
  "VITE_AUTH0_CLIENT_ID",
] as const;

export type Auth0EnvKey = (typeof AUTH0_ENV_KEYS)[number];

interface AuthEnvironment {
  readonly [key: string]: unknown;
  VITE_AUTH0_DOMAIN?: string;
  VITE_AUTH0_CLIENT_ID?: string;
}

export type AuthConfigResult =
  | {
      configured: true;
      domain: string;
      clientId: string;
    }
  | {
      configured: false;
      missing: Auth0EnvKey[];
    };

export function readAuthConfig(env: AuthEnvironment): AuthConfigResult {
  const domain = env.VITE_AUTH0_DOMAIN?.trim() ?? "";
  const clientId = env.VITE_AUTH0_CLIENT_ID?.trim() ?? "";
  const missing: Auth0EnvKey[] = [];

  if (!domain) missing.push("VITE_AUTH0_DOMAIN");
  if (!clientId) missing.push("VITE_AUTH0_CLIENT_ID");

  return missing.length > 0
    ? { configured: false, missing }
    : { configured: true, domain, clientId };
}

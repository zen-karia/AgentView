import assert from "node:assert/strict";
import test from "node:test";

import { readAuthConfig } from "./authConfig.ts";

test("returns normalized Auth0 configuration when both values are present", () => {
  const result = readAuthConfig({
    VITE_AUTH0_DOMAIN: "  dev-example.us.auth0.com  ",
    VITE_AUTH0_CLIENT_ID: "  client-123  ",
  });

  assert.deepEqual(result, {
    configured: true,
    domain: "dev-example.us.auth0.com",
    clientId: "client-123",
  });
});

test("reports both missing settings when values are absent", () => {
  const result = readAuthConfig({});

  assert.deepEqual(result, {
    configured: false,
    missing: ["VITE_AUTH0_DOMAIN", "VITE_AUTH0_CLIENT_ID"],
  });
});

test("treats whitespace-only settings as missing", () => {
  const result = readAuthConfig({
    VITE_AUTH0_DOMAIN: "   ",
    VITE_AUTH0_CLIENT_ID: "client-123",
  });

  assert.deepEqual(result, {
    configured: false,
    missing: ["VITE_AUTH0_DOMAIN"],
  });
});

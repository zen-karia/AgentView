import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { Auth0Provider } from "@auth0/auth0-react";
import { App } from "@app/App";
import { AuthGate, AuthSetup, readAuthConfig } from "./auth";
import "./index.css";

const rootElement = document.getElementById("root");
if (!rootElement) {
  throw new Error("Root element #root not found");
}

const authConfig = readAuthConfig(import.meta.env);

const application = authConfig.configured ? (
  <Auth0Provider
    domain={authConfig.domain}
    clientId={authConfig.clientId}
    authorizationParams={{ redirect_uri: window.location.origin }}
  >
    <AuthGate>
      <App />
    </AuthGate>
  </Auth0Provider>
) : (
  <AuthSetup missing={authConfig.missing} />
);

createRoot(rootElement).render(<StrictMode>{application}</StrictMode>);

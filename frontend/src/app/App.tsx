import { useState } from "react";
import { ThemeProvider, useTheme } from "./theme";
import { BenchmarkDashboard } from "../features/benchmark";
import { LiveDemo } from "../features/live-demo";
import { UserMenu } from "../auth";
import "./app.css";

type Tab = "benchmark" | "live";

function Shell() {
  const [tab, setTab] = useState<Tab>("benchmark");
  const { theme, toggle } = useTheme();

  return (
    <div className="app">
      <header className="app__header">
        <div className="app__brand">
          <span className="app__brand-mark">A</span>
          <span>
            AgentView <span className="app__brand-sub">· Web → Agent translator</span>
          </span>
        </div>

        <nav className="app__nav" aria-label="Primary">
          <button
            type="button"
            className={`app__tab${tab === "benchmark" ? " app__tab--active" : ""}`}
            onClick={() => setTab("benchmark")}
          >
            Benchmark
          </button>
          <button
            type="button"
            className={`app__tab${tab === "live" ? " app__tab--active" : ""}`}
            onClick={() => setTab("live")}
          >
            Live demo
          </button>
        </nav>

        <div className="app__spacer" />

        <UserMenu />

        <button
          type="button"
          className="app__icon-btn"
          onClick={toggle}
          aria-label={`Switch to ${theme === "dark" ? "light" : "dark"} theme`}
          title="Toggle theme"
        >
          {theme === "dark" ? "☀" : "☾"}
        </button>
      </header>

      <main className="app__main">
        {/* The integration rule: the shell renders each feature; neither
            feature imports the other. */}
        {tab === "benchmark" ? <BenchmarkDashboard /> : <LiveDemo />}
      </main>
    </div>
  );
}

export function App() {
  return (
    <ThemeProvider>
      <Shell />
    </ThemeProvider>
  );
}

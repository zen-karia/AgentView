import { ThemeProvider, useTheme } from "./theme";
import { BenchmarkDashboard } from "../features/benchmark";
import { UserMenu } from "../auth";
import "./app.css";

function Shell() {
  const { theme, toggle } = useTheme();

  return (
    <div className="app">
      <header className="app__header">
        <div className="app__brand">
          <span className="app__brand-mark">A</span>
          <span>
            AgentView <span className="app__brand-sub">· Benchmark dashboard</span>
          </span>
        </div>

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
        <BenchmarkDashboard />
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

# Real Backend–Frontend Integration Design

## Goal

Replace the placeholder frontend data and scripted demo with a dashboard that displays only the benchmark information exposed by `backend/api.py`.

## Scope

- Use `GET /api/benchmark/runs` as the frontend's source of benchmark runs.
- Use `GET /api/benchmark/runs/:id` through the existing `BenchmarkSource` interface.
- Display the backend's real conditions: `prompted_gemini`, `prompted_claude`, `mcp_gemini`, `mcp_claude`, and `trained_av`.
- Derive task choices, labels, sites, and goals from each returned `BenchmarkRun`.
- Remove the scripted Live Demo navigation and UI because the backend exposes no live-run or event-stream API.
- Remove mock benchmark runs, mock tasks, mock AgentViews, and replay data from the production frontend.
- Keep authentication, theming, metric visualization, and aggregate comparison behavior.

## Architecture

The frontend remains a single benchmark dashboard backed by the existing `BenchmarkSource` boundary. A fetch-based implementation reads the API base URL from `VITE_API_BASE_URL`, defaulting locally to `http://127.0.0.1:8787`. HTTP and payload failures are normalized into actionable errors for the dashboard instead of leaving the page in an indefinite loading state.

The API response is authoritative. Frontend contracts and condition metadata mirror the backend's condition keys, while task controls read from `run.tasks` rather than a static scenario catalog. The backend already provides CORS headers, so the Vite development server can call port 8787 directly.

## Data Flow

1. `BenchmarkDashboard` mounts and calls `benchmarkSource.listRuns()`.
2. The source fetches `${VITE_API_BASE_URL}/api/benchmark/runs` and validates that the top-level response is an array.
3. The dashboard selects the first returned run and derives task options and aggregate condition results from it.
4. Selecting a task recomputes the displayed metrics from that run's API-provided task results.
5. If future API responses include multiple runs, the existing history selector continues to switch among them.

## Presentation Changes

- The application shell renders only `BenchmarkDashboard`; it no longer shows Benchmark/Live Demo tabs.
- Condition labels and descriptions accurately describe prompted Gemini, prompted Claude, Gemini MCP, Claude MCP, and trained AgentView.
- The toolbar shows task selection from the active API run. Training-stage selection is removed because the current API returns one live `sft` run rather than placeholder checkpoint history.
- Copy that promises six approaches, training histories, or teacher-versus-student mock narratives is replaced with neutral copy based on actual metrics.
- The benchmark history section remains useful when multiple real runs are returned, but is hidden when only one is available.

## Error and Empty States

- While the request is pending, show a loading state.
- On network failure, non-2xx status, invalid JSON shape, or malformed run data, show an error message and a Retry action.
- When the API returns no runs, show an empty-database explanation rather than charts with invented values.
- When a run has no tasks or no results for the selected scope, show an explicit no-results state.

## Testing

- Unit-test the API source for URL construction, successful parsing, HTTP errors, and invalid payloads using an injected `fetch` implementation.
- Unit-test aggregate behavior with the five real backend conditions, including missing-condition data so sparse Mongo results do not crash the dashboard.
- Run the frontend typecheck and production build.
- Run backend API unit tests if an existing backend test suite is present; no backend behavior change is required by this design.

## Non-Goals

- Starting benchmark jobs from the frontend.
- Streaming live agent events.
- Inventing benchmark history or training stages not returned by the backend.
- Changing MongoDB storage or `backend/api.py` response semantics.

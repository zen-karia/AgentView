# Real Backend–Frontend Integration Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace all placeholder frontend data and scripted-demo content with a resilient dashboard driven by `backend/api.py`.

**Architecture:** Keep the existing `BenchmarkSource` seam, replace its in-memory implementation with an HTTP client, and make the backend response authoritative for conditions and tasks. Reduce the shell to the benchmark dashboard and remove frontend modules whose content cannot be supplied by the backend.

**Tech Stack:** React 18, TypeScript 5.6, Vite 5, Node native test runner, Recharts, Python stdlib HTTP API

## Global Constraints

- The frontend displays only information exposed by `backend/api.py`.
- The API base URL comes from `VITE_API_BASE_URL` and defaults to `http://127.0.0.1:8787` for local development.
- Real conditions are `prompted_gemini`, `prompted_claude`, `mcp_gemini`, `mcp_claude`, and `trained_av`.
- No live-run, event-stream, mock benchmark, mock scenario, or invented history content remains in the production frontend.
- HTTP, malformed-payload, empty-run, empty-task, and sparse-condition states must render safely.

---

### Task 1: HTTP Benchmark Source

**Files:**
- Modify: `frontend/package.json`
- Modify: `frontend/.env.example`
- Modify: `frontend/src/features/benchmark/data/benchmarkSource.ts`
- Create: `frontend/src/features/benchmark/data/benchmarkSource.test.ts`

**Interfaces:**
- Consumes: `BenchmarkSource`, `BenchmarkRun`, `VITE_API_BASE_URL`, and a browser-compatible `fetch` function.
- Produces: `createApiBenchmarkSource(apiBaseUrl: string, fetcher?: typeof fetch): BenchmarkSource` and the configured `benchmarkSource` singleton.

- [ ] **Step 1: Add the native test script**

Follow the repository's existing `node:test` TypeScript pattern and add:

```json
"test": "node --test"
```

No dependency or lockfile change is required.

- [ ] **Step 2: Write failing source tests**

Cover these exact cases in `benchmarkSource.test.ts`:

```ts
it("lists benchmark runs from the configured API base URL", async () => {
  const calls: Parameters<typeof fetch>[] = [];
  const fetcher: typeof fetch = async (...args) => {
    calls.push(args);
    return new Response(JSON.stringify([RUN]), { status: 200 });
  };
  const source = createApiBenchmarkSource("http://127.0.0.1:8787/", fetcher);
  assert.deepEqual(await source.listRuns(), [RUN]);
  assert.equal(calls[0]?.[0], "http://127.0.0.1:8787/api/benchmark/runs");
});

it("returns undefined when the run endpoint returns an empty object", async () => {
  const fetcher = vi.fn().mockResolvedValue(
    new Response(JSON.stringify({}), { status: 200 }),
  );
  const source = createApiBenchmarkSource("http://127.0.0.1:8787", fetcher);
  assert.equal(await source.getRun("missing"), undefined);
});

it("reports non-successful HTTP responses", async () => {
  const source = createApiBenchmarkSource("http://127.0.0.1:8787", async () =>
    new Response("down", { status: 503 }),
  );
  await assert.rejects(source.listRuns(), /Benchmark API request failed \(503\)/);
});

it("rejects a non-array list payload", async () => {
  const source = createApiBenchmarkSource("http://127.0.0.1:8787", async () =>
    new Response(JSON.stringify({}), { status: 200 }),
  );
  await assert.rejects(source.listRuns(), /invalid benchmark run list/);
});
```

- [ ] **Step 3: Run the source tests and verify RED**

Run: `npm test -- src/features/benchmark/data/benchmarkSource.test.ts`
Expected: FAIL because `createApiBenchmarkSource` is not exported.

- [ ] **Step 4: Implement the minimal HTTP source**

Implement normalized URL joining, a shared response reader that rejects non-2xx responses, array validation for `listRuns`, and an `id` check for `getRun`. Configure the singleton with:

```ts
const apiBaseUrl = import.meta.env.VITE_API_BASE_URL ?? "http://127.0.0.1:8787";
export const benchmarkSource = createApiBenchmarkSource(apiBaseUrl);
```

Document `VITE_API_BASE_URL=http://127.0.0.1:8787` in `.env.example`.

- [ ] **Step 5: Run the source tests and verify GREEN**

Run: `npm test -- src/features/benchmark/data/benchmarkSource.test.ts`
Expected: 4 tests pass.

### Task 2: Backend-Accurate Conditions and Sparse Aggregation

**Files:**
- Modify: `frontend/src/contracts/run-events.ts`
- Modify: `frontend/src/contracts/benchmark.ts`
- Modify: `frontend/src/components/ui/conditionColors.ts`
- Modify: `frontend/src/app/app.css`
- Modify: `frontend/src/features/benchmark/lib/aggregate.ts`
- Create: `frontend/src/features/benchmark/lib/aggregate.test.ts`

**Interfaces:**
- Consumes: condition strings emitted by `_cond_label()` in `backend/api.py`.
- Produces: `Condition`, `CONDITION_ORDER`, `CONDITION_META`, and `resultsForScope()` that tolerate absent Mongo condition rows.

- [ ] **Step 1: Write failing condition and aggregation tests**

Assert the canonical order exactly:

```ts
expect(CONDITION_ORDER).toEqual([
  "prompted_gemini",
  "prompted_claude",
  "mcp_gemini",
  "mcp_claude",
  "trained_av",
]);
```

Build a run where one task contains only `trained_av` and another only `mcp_gemini`; assert `resultsForScope(run, "all")` returns only those two conditions with their actual means and never dereferences `undefined`.

- [ ] **Step 2: Run the aggregation tests and verify RED**

Run: `npm test -- src/features/benchmark/lib/aggregate.test.ts`
Expected: FAIL because the old condition order differs and aggregation assumes every task has every condition.

- [ ] **Step 3: Align contracts and presentation metadata**

Replace the six placeholder condition keys with the five backend keys. Provide accurate labels:

```ts
prompted_gemini: "Prompted AgentView · Gemini"
prompted_claude: "Prompted AgentView · Claude"
mcp_gemini: "MCP · Gemini"
mcp_claude: "MCP · Claude"
trained_av: "Trained AgentView"
```

Update colors and CSS custom properties to use the same keys. Remove contract comments about the frozen six-condition placeholder story while retaining `TrainingStage` because `BenchmarkRun.trainingStage` still comes from the API.

- [ ] **Step 4: Make aggregation sparse-safe**

For each condition, collect only task results that exist, omit conditions with zero results, average each metric over the collected results, and sum their `runCount`. Preserve canonical order.

- [ ] **Step 5: Run aggregation and source tests and verify GREEN**

Run: `npm test`
Expected: all tests pass.

### Task 3: API-Derived Dashboard States and Copy

**Files:**
- Modify: `frontend/src/features/benchmark/BenchmarkDashboard.tsx`
- Modify: `frontend/src/features/benchmark/components/BenchmarkToolbar.tsx`
- Modify: `frontend/src/features/benchmark/components/BestConditionCallout.tsx`
- Modify: `frontend/src/features/benchmark/components/BenchmarkHistory.tsx`
- Modify: `frontend/src/features/benchmark/components/ConditionChart.tsx`
- Modify: `frontend/src/features/benchmark/components/ComparisonTable.tsx`
- Modify: `frontend/src/features/benchmark/benchmark.css`

**Interfaces:**
- Consumes: `BenchmarkRun.tasks`, `benchmarkSource.listRuns()`, and five-condition aggregate results.
- Produces: benchmark-only UI with `loading | error | empty | ready` behavior and `retry()`.

- [ ] **Step 1: Add an explicit dashboard load-state model**

Use a discriminated union:

```ts
type LoadState =
  | { status: "loading" }
  | { status: "error"; message: string }
  | { status: "ready"; runs: BenchmarkRun[] };
```

Have the request effect catch errors, ignore stale completions, and increment a retry token from an error-state button.

- [ ] **Step 2: Replace static task and training controls**

Pass `run.tasks` to `BenchmarkToolbar`; use `taskId`, `taskLabel`, and `goal` directly. Remove the trained-checkpoint segmented control because the API currently returns one live run rather than mock checkpoint choices.

- [ ] **Step 3: Render honest empty and sparse states**

Render:

```text
No benchmark runs are available yet. Run the backend benchmark with MongoDB logging enabled, then retry.
```

when the list is empty, and:

```text
This benchmark run has no task results to display.
```

when the selected run/scope has no results. Ensure a stale selected task resets to `all` when the active run changes.

- [ ] **Step 4: Remove placeholder narrative assumptions**

Change six-condition copy to “real benchmark conditions,” make the best-condition callout use metadata only (no hard-coded teacher comparison), update component comments, and render benchmark history only when `runs.length > 1`.

- [ ] **Step 5: Run tests and typecheck**

Run: `npm test && npm run typecheck`
Expected: all tests pass and TypeScript exits 0.

### Task 4: Remove Unsupported Placeholder Features

**Files:**
- Modify: `frontend/src/app/App.tsx`
- Modify: `frontend/src/app/app.css`
- Modify: `frontend/vite.config.ts`
- Modify: `frontend/tsconfig.app.json`
- Delete: `frontend/src/features/benchmark/data/benchmarkRuns.ts`
- Delete: `frontend/src/features/live-demo/`
- Delete: `frontend/src/mocks/`
- Delete: `frontend/src/contracts/agent-view.ts`
- Modify: `frontend/src/contracts/index.ts`

**Interfaces:**
- Consumes: `BenchmarkDashboard` only.
- Produces: application shell with no navigation to unsupported frontend-only experiences and no mock aliases or exports.

- [ ] **Step 1: Simplify the application shell**

Remove tab state and Live Demo imports. Keep brand, Auth0 user menu, theme toggle, and render `BenchmarkDashboard` directly.

- [ ] **Step 2: Remove placeholder modules and aliases**

Delete replay, mock scenario, fake run, and unused AgentView contract files. Remove `@mocks` from Vite and TypeScript aliases and remove obsolete contract barrel exports.

- [ ] **Step 3: Prove no placeholder data imports remain**

Run: `rg -n "@mocks|mockBenchmark|BENCHMARK_RUNS|LIVE_REPLAY|Frontend replay|deterministic frontend replay|Ready for real" frontend/src`
Expected: no matches.

- [ ] **Step 4: Run full frontend verification**

Run: `npm test && npm run typecheck && npm run build`
Expected: tests pass, typecheck exits 0, and Vite produces `dist/` successfully.

### Task 5: Final Contract Verification

**Files:**
- Verify: `backend/api.py`
- Verify: all modified frontend files

**Interfaces:**
- Consumes: actual `_cond_label()` values and `/api/benchmark/runs` response shape.
- Produces: evidence that the frontend contract matches the backend contract.

- [ ] **Step 1: Verify backend condition mapping against frontend keys**

Run a Python assertion importing `_cond_label` and compare its five expected outputs with the frontend condition list.

- [ ] **Step 2: Inspect the final diff**

Run: `git diff --check && git status --short && git diff --stat`
Expected: no whitespace errors; only integration-related files are changed or removed.

- [ ] **Step 3: Run fresh full verification**

Run: `npm test && npm run typecheck && npm run build`
Expected: zero test failures, zero TypeScript errors, and build exit code 0.

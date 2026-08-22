import assert from "node:assert/strict";
import test from "node:test";

import type { BenchmarkRun } from "../../../contracts/benchmark.ts";
import { createApiBenchmarkSource } from "./benchmarkSource.ts";

const RUN: BenchmarkRun = {
  id: "current",
  label: "Live benchmark",
  createdAt: "2026-07-19T12:00:00.000Z",
  trainingStage: "sft",
  tasks: [],
};

test("lists benchmark runs from the configured API base URL", async () => {
  const calls: Parameters<typeof fetch>[] = [];
  const fetcher: typeof fetch = async (...args) => {
    calls.push(args);
    return new Response(JSON.stringify([RUN]), { status: 200 });
  };
  const source = createApiBenchmarkSource("http://127.0.0.1:8787/", fetcher);

  assert.deepEqual(await source.listRuns(), [RUN]);
  assert.equal(calls[0]?.[0], "http://127.0.0.1:8787/api/benchmark/runs");
});

test("returns undefined when the run endpoint returns an empty object", async () => {
  const fetcher: typeof fetch = async () =>
    new Response(JSON.stringify({}), { status: 200 });
  const source = createApiBenchmarkSource("http://127.0.0.1:8787", fetcher);

  assert.equal(await source.getRun("missing"), undefined);
});

test("reports non-successful HTTP responses", async () => {
  const fetcher: typeof fetch = async () => new Response("down", { status: 503 });
  const source = createApiBenchmarkSource("http://127.0.0.1:8787", fetcher);

  await assert.rejects(
    source.listRuns(),
    /Benchmark API request failed \(503\)/,
  );
});

test("rejects a non-array list payload", async () => {
  const fetcher: typeof fetch = async () =>
    new Response(JSON.stringify({}), { status: 200 });
  const source = createApiBenchmarkSource("http://127.0.0.1:8787", fetcher);

  await assert.rejects(source.listRuns(), /invalid benchmark run list/);
});

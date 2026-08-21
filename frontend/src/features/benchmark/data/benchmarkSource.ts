/* =========================================================================
   Benchmark data adapter. The dashboard depends only on BenchmarkSource, so
   the mock can be swapped for a MongoDB-backed API without touching the UI.

   Future real adapter (sketch):
     class ApiBenchmarkSource implements BenchmarkSource {
       async listRuns() { return (await fetch("/api/benchmark/runs")).json(); }
       async getRun(id) { return (await fetch(`/api/benchmark/runs/${id}`)).json(); }
     }
   ========================================================================= */
import type { BenchmarkSource } from "@contracts";
import { BENCHMARK_RUNS } from "./benchmarkRuns";

/** In-memory mock. Async on purpose so the swap to a real fetch is a no-op. */
export const mockBenchmarkSource: BenchmarkSource = {
  async listRuns() {
    return BENCHMARK_RUNS;
  },
  async getRun(id) {
    return BENCHMARK_RUNS.find((r) => r.id === id);
  },
};

/** The source the app currently reads from. Point this at the API adapter later. */
export const benchmarkSource = mockBenchmarkSource;

import type { BenchmarkRun, BenchmarkSource } from "@contracts";

type Fetcher = (input: string, init?: RequestInit) => Promise<Response>;

function endpoint(baseUrl: string, path: string): string {
  return `${baseUrl.replace(/\/$/, "")}${path}`;
}

function isBenchmarkRun(value: unknown): value is BenchmarkRun {
  if (typeof value !== "object" || value === null) return false;
  const run = value as Partial<BenchmarkRun>;
  return (
    typeof run.id === "string" &&
    typeof run.label === "string" &&
    typeof run.createdAt === "string" &&
    typeof run.trainingStage === "string" &&
    Array.isArray(run.tasks)
  );
}

async function readJson(response: Response): Promise<unknown> {
  if (!response.ok) {
    throw new Error(`Benchmark API request failed (${response.status})`);
  }
  try {
    return await response.json();
  } catch {
    throw new Error("Benchmark API returned invalid JSON");
  }
}

export function createApiBenchmarkSource(
  apiBaseUrl: string,
  fetcher: Fetcher = fetch,
): BenchmarkSource {
  return {
    async listRuns() {
      const payload = await readJson(
        await fetcher(endpoint(apiBaseUrl, "/api/benchmark/runs")),
      );
      if (!Array.isArray(payload) || !payload.every(isBenchmarkRun)) {
        throw new Error("Benchmark API returned an invalid benchmark run list");
      }
      return payload;
    },

    async getRun(id) {
      const payload = await readJson(
        await fetcher(
          endpoint(apiBaseUrl, `/api/benchmark/runs/${encodeURIComponent(id)}`),
        ),
      );
      return isBenchmarkRun(payload) ? payload : undefined;
    },
  };
}

const apiBaseUrl =
  import.meta.env?.VITE_API_BASE_URL ?? "http://127.0.0.1:8787";

export const benchmarkSource = createApiBenchmarkSource(apiBaseUrl);

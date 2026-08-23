export type OpenBenchmarkMetric =
  | "contractValid"
  | "strictElementAccuracy";

export type OpenBenchmarkResult = {
  id: string;
  model: string;
  detail?: string;
  contractValid: number;
  strictElementAccuracy: number;
};

export const OPEN_BENCHMARK_RESULTS: OpenBenchmarkResult[] = [
  {
    id: "trained",
    model: "Trained AgentView",
    detail: "Ours",
    contractValid: 72.5,
    strictElementAccuracy: 55,
  },
  {
    id: "gemini",
    model: "Gemini 3.5 Flash",
    contractValid: 32.5,
    strictElementAccuracy: 35,
  },
  {
    id: "glm",
    model: "GLM 5.2",
    contractValid: 5,
    strictElementAccuracy: 30,
  },
];

export function bestOpenBenchmarkValue(metric: OpenBenchmarkMetric): number {
  return Math.max(...OPEN_BENCHMARK_RESULTS.map((result) => result[metric]));
}

# Static Open Benchmark Comparison

## Goal

Add a polished, static comparison section to the end of the benchmark dashboard so visitors can see how the trained AgentView model compares with Gemini 3.5 Flash and GLM 5.2 on a collected open-benchmark sample.

## Data and provenance

The section uses hardcoded values and never reads from the benchmark API or MongoDB.

| Model | Contract-valid | Strict element accuracy |
|---|---:|---:|
| Trained AgentView (ours) | 72.5% | 55.0% |
| Gemini 3.5 Flash | 32.5% | 35.0% |
| GLM 5.2 | 5.0% | 30.0% |

The section must identify the evaluation as `Mind2Web sample · 40 rows` and state that higher values are better. It must also say that these fixed, collected results are separate from the live API-backed benchmark above.

## Presentation

Use a leaderboard-style card consistent with the existing dashboard. Each model row shows both exact percentages and proportional horizontal bars. The trained AgentView row receives the existing accent treatment and a clear `Ours` label. Its winning values receive color-independent `Best` labels as well as visual emphasis.

The section appears at the end of the dashboard and remains visible during API loading, error, and empty states because its data has no backend dependency. On narrow screens, the model and metric layout stacks without hiding labels or exact values.

## Component boundary

Create a focused `OpenBenchmarkComparison` component and a small static data module within the benchmark feature. The component owns presentation only; the data module owns the immutable model names and metric values. The existing API contracts and aggregation code remain unchanged.

## Validation

Add a focused test for the static data, row ordering, and metric winners. Follow the existing Node test conventions. Run the targeted test, the complete frontend test suite, type checking, and the production build.

## Non-goals

- Do not write these values to MongoDB.
- Do not add filtering, sorting, animation, or user controls.
- Do not change the existing live benchmark calculations.
- Do not imply that the values cover multiple benchmarks or the full Mind2Web dataset.

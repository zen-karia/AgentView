# AgentView

Turns any webpage into exactly what an AI agent needs for its **goal**: relevant content,
available actions, nothing else.

**Contract:** `(raw HTML, goal) → AgentView JSON` — goal-conditioned by design. The same page with a
different goal produces a different output; that filtering judgment is what separates AgentView from
rule-based serializations like the Playwright accessibility snapshot (which we benchmark against —
see [contracts/EVAL.md](contracts/EVAL.md)).

## Repo map

| Path | What it is |
|---|---|
| [DECISIONS.md](DECISIONS.md) | Decision log — every settled call, frozen contracts, kill rules, open externals |
| [docs/LOGBOOK.md](docs/LOGBOOK.md) | Master record — decision index, implementation decisions, artifacts, measured results, rejected alternatives, risks |
| [docs/PLAN.md](docs/PLAN.md) | The training roadmap — phases, gates, dependency graph, budget ledger |
| [docs/FREESOLO.md](docs/FREESOLO.md) | Freesolo Flash playbook — commands, config, dataset format, cost model, time budget |
| [docs/PRIOR-ART.md](docs/PRIOR-ART.md) | Research synthesis — ReaderLM, HTML-T5/MindAct/AutoWebGLM, production DOM-to-LLM code, data pipelines |
| [docs/BENCHMARKS.md](docs/BENCHMARKS.md) | Public benchmarks — Mind2Web/SWDE/MiniWoB++/REAL/WebArena-Lite, scoring adapters, numbers to beat |
| [contracts/agentview.schema.json](contracts/agentview.schema.json) | Output schema v1 (FROZEN) |
| [contracts/prompt-template.md](contracts/prompt-template.md) | The single prompt template for teacher/training/eval/demo (FROZEN, hash-stamped) |
| [contracts/EVAL.md](contracts/EVAL.md) | Metrics, comparison arms, held-out policy, MongoDB log row shape |
| [contracts/heldout-seeds.json](contracts/heldout-seeds.json) | Reserved generator seeds the data pipeline must refuse |
| [src/annotate.js](src/annotate.js) | Annotate v1 — stamps deterministic `data-av-id` ids on interactive elements (runs before pretrim) |
| [src/pretrim.js](src/pretrim.js) | Pretrim v2 — the model's input contract (structure-preserving HTML reduction, 5.5k-token budget) |
| [src/validate.js](src/validate.js) | The validator — every generated example passes it or is discarded |
| [golden/](golden/) | Golden examples: normative reference for the schema, incl. a same-page-different-goal pair |
| [scripts/](scripts/) | `npm run check` — validates all goldens and rejects all known gaming patterns |

## Quickstart

```bash
npm install
npm run check
```

`check` pretrims every golden page, validates every golden output against the trimmed **and** raw
DOM, reports token fit and harness hashes, then runs the negative suite (outputs that must be
rejected: body-selectors, :nth-child, hallucinated text, multi-match selectors, …).

## Pipeline position

```
raw HTML ──annotate──▶ ──pretrim──▶ (page, goal) ──model──▶ AgentView JSON ──validator──▶ agent ──Playwright──▶ page
```

Teacher (Gemini), student (Qwen3.5 + LoRA via Freesolo Flash), and all eval baselines consume the
identical annotate+pretrim output through the identical prompt template. See DECISIONS.md D3/D9
and docs/FREESOLO.md for the training plan.

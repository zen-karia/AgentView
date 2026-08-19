# Training roadmap — multi-day, quality-optimized

Governed by [DECISIONS.md](../DECISIONS.md) and the platform facts in [FREESOLO.md](FREESOLO.md).
This is an iteration plan, not a clock plan: stages gate on **quality criteria**, and we keep
iterating inside a stage until its gate passes. Two standing rules survive from the hackathon-
paranoia version because they're correct at any timescale: **no mass data generation before the
smoke slice proves every format handoff (D13)**, and **the final day is training-free** — reserved
for eval hardening and the demo, because a failed last-minute run is unrecoverable.

## Base model: why not GLM 5.2, and what we do instead

- **GLM 5.2 is not trainable on Flash.** The trainable catalog is Qwen3.5-0.8B/2B/4B/9B,
  MiniCPM5-1B, Qwen3.6-35B-A3B. glm-5.2 (with deepseek-v4-pro and kimi-k2.6) is a **managed OPD
  teacher** — a frontier-class model Flash lets you distill FROM, on-policy, into your student.
  So "use a better model" translates to: **OPD pass with glm-5.2 as teacher** (Stage D).
  Training a frontier model isn't the goal anyway — the deliverable and the entire track thesis is
  the sub-10B model that matches the frontier on this one task at ~100× lower serving cost.
- **Qwen3.6-35B-A3B is excluded**: 4,096-token context can't fit our 5,500-token page budget.
- **The base is chosen empirically, not by vibes**: Stage C trains identical data on 2B, 4B, and
  9B (~$2–6 each) and the frozen eval picks the winner. Expectation: 9B wins quality, 4B wins the
  cost story; with a multi-day budget we can afford to demo the winner and cite the curve across
  sizes ("capability scales, price stays ~free").
- There is no "download the model" step — bases live on Flash's servers, referenced by name in
  `config.toml`. The untrained base is only needed for the zero-shot baseline arm, served via
  OpenRouter/HF inference of the same checkpoint through the identical harness.

## Where the data comes from (every source, every use)

| # | Source | What it is | Feeds | Gate |
|---|---|---|---|---|
| 1 | **Parameterized site generator** (ours, seeded) | messy shop/checkout/booking/docs pages with randomized layout/class soup, each emitting `(page, goal, success_predicate)` | bulk, spine, GRPO/OPD prompt pool, held-out (seeds 9000–9999 reserved) | validator |
| 2 | **Gemini-synthetic pages** | Gemini-generated div-soup HTML by category, k goals per page in a second pass | bulk only, **≤50% of any mix** (closed-loop guard, D12) | validator |
| 3 | **Exploration rollouts + hindsight relabeling** | scripted/LLM policy wanders generator sites; Gemini writes the goal each trajectory *actually accomplished* from state-diff summaries; an independent judge call gates it (D16) | spine (success by construction) | validator + judge + env-feedback filters |
| 4 | **Own-model rollouts** (on-policy) | the student's own outputs during GRPO/OPD training | RFT tier — generated *by the platform* during training, not offline | GRPO reward / OPD teacher |
| 5 | **Mind2Web** (HuggingFace) | real-website DOM snapshots + tasks | **eval-only**: ≥2 of 5 held-out tasks on pages we didn't generate (D8) | n/a (never trains) |
| 6 | **WebShop** (optional) | self-hosted shopping env, ~1M real product pages, built-in reward | spine, if Docker stands up in one try (D6) | its own reward + validator |
| 7 | **Golden examples** ([golden/](../golden/)) | hand-authored normative anchors | prompt exemplars; never eval | `npm run check` |

Labelers: **Gemini** = offline bulk-tier teacher (the Gemini-track usage). **glm-5.2** = on-policy
OPD teacher (the Freesolo-native teacher). **The validator** = universal rejection gate on
everything. **Success predicates** = ground truth on generator pages, the spine/GRPO reward.
Every example lands in MongoDB with `{source, tier, seed, hashes, validator verdict}` (D12/D15) —
the dataset itself is a demoable, auditable artifact.

## Freesolo feature coverage (the platform IS part of the pitch)

| Feature | Where we use it |
|---|---|
| `--cost` / `--dry-run` | before every single submission (free, deterministic) |
| **SFT** | Stages C & D-loop-1: bulk+spine training |
| **GRPO** (custom Python reward env, `EnvironmentSingleTurn`, pip deps, forwarded secrets) | Stage D: RFT tier as true on-policy RL; reward = Python validator port + success predicates |
| **OPD** (managed teacher glm-5.2) | Stage D: frontier distillation on the prompt pool — no gold outputs needed |
| `init_from_adapter` | GRPO/OPD warm-start from the best SFT run; SFT-continue for failure-mined data |
| `structured_outputs` (JSON-schema guided decoding) | GRPO/OPD rollouts can't emit malformed JSON; becomes the serving default |
| `metadata` in dataset rows | tier/source/seed provenance → tier-weighted ablations |
| `checkpoints` | evaluate multiple per-step GRPO checkpoints, deploy the best |
| `deploy` / `deployments` / `chat` / `undeploy` | every eval arm hits an OpenAI-compatible endpoint; `chat` for spot checks; undeploy losers |
| Automatic prefix caching | template-first prompt order → ~5× cheaper eval passes |
| **W&B integration** (`[wandb]` config) | live loss curves on the dashboard — free demo content |
| `export` | winning adapter → team HuggingFace repo (tangible judging artifact) |
| `gpus` auto-allocator, `runs`/`status`/`log`/`cancel` | ops; measured wall-clock recalibrates estimates |

Deliberately unused: multi-turn/message-shaped outputs with tool_calls (our contract is
single-turn), `EnvironmentMultiTurn` (single-shot translation task).

## Stage A — Foundations (gate: one adapter answers one harness call)

1. Fund the org (booth question first; else card + $50 credit; top up $50 if Stage D ablations demand it).
2. Dataset emitter: template → Flash's exact `{input, output, metadata}` JSONL (D15).
3. **Smoke slice**: 20 examples (4 goldens + 16 quick Gemini labels) → Qwen3.5-0.8B SFT → deploy →
   one harness call → validator passes. Proves emitter, format, training, deploy, client, decode
   settings. Measures real queue + wall-clock. Costs cents.
4. Site generator v1 with annotate + state write-back + seed blocklist; verifier (Playwright)
   running success predicates.
5. **Eval freeze**: 5 held-out tasks committed (≥2 on Mind2Web pages), held-out page set
   (100–300 pairs) carved, baselines captured through the frozen harness: base zero-shot (all
   candidate sizes), Gemini teacher, raw-a11y-snapshot arm. n=10 trials per task (we have days).

## Stage B — Data engine (gate: volume + measured quality, not a deadline)

- Bulk tier target: **5,000–10,000 validator-passed pairs** (budget is not the constraint —
  teacher throughput and validator pass-rate are). Track pass-rate per source — if Gemini's pass
  rate is low, fix the teacher prompt before scaling, not after.
- Spine tier target: **500–1,000 hindsight-relabeled, judge-gated examples.**
- Curriculum ordering baked into the data: easy/clean pages → deep-nested/obfuscated (D16).
- Same-page-different-goal pairs generated systematically (goal-conditioning is the differentiator).
- Dedup by (page-hash, goal-normalized); mix caps enforced; everything logged to Mongo.

## Stage C — Base-model bake-off (gate: a winner on the frozen eval)

Train **identical data** on Qwen3.5-2B, 4B, 9B (rank 32/α64/LR ~1e-4/2 epochs, ~$2–6 each).
Evaluate all three + their zero-shot baselines on the held-out sets. Pick by held-out task success,
with tokens/s and $/M as tiebreakers. This table ("same data, three sizes") is itself demo content.

## Stage D — Optimization loops (the multi-day core; iterate until gains flatten)

Run as many rounds as eval improvement justifies; each is cheap and independently evaluable:

1. **Failure mining → re-SFT** (WebRL-lite, D16): mine eval + spine failures, generate
   parameter-perturbed variants of exactly those pages/goals in the partially-solvable band,
   augment, retrain (fresh SFT or `init_from_adapter` continue — compare both once).
2. **GRPO pass**: warm-start from best SFT; reward = Python validator port (lxml+cssselect) +
   success predicates; prompt pool = partial-success band (20–70%); `group_size` 4–8,
   `max_completion_tokens` 2000, `structured_outputs` on. Evaluate several `checkpoints`, deploy the best.
3. **OPD pass**: glm-5.2 teacher over the same prompt pool — data-free frontier distillation.
   Run it *in parallel branch* with GRPO from the same SFT init and let the eval arbitrate.
4. **Self-play round** (ReaderLM-v2's stage-4 analog): regenerate spine/relabeled data with the
   improved model as the explorer, judge-gate it, fold into one more SFT/GRPO round.
5. **Ablation table** (the judge-killer, enabled by `metadata` tiers): SFT(bulk) vs
   SFT(bulk+spine) vs +GRPO vs +OPD — 4–6 runs at $2–6 each. "Which tier bought what" is the
   difference between a demo and a research-grade result.

Quality gates, not clock gates: a loop earns another round only if held-out success improved;
two flat rounds in a row on a loop → stop that loop, spend elsewhere.

## Stage E — Hardening + demo (final day, training-free)

- Freeze the winning adapter; keep deployed through judging; `flash undeploy` everything else.
- `flash export` winner to the team HuggingFace repo.
- Final eval at n=10 trials/task on all arms; latency + $/task benchmark table vs Gemini
  (9B serving $0.12/M prompt vs frontier ~100×; prefix-cached eval receipts from Mongo).
- Dashboard: four-arm curve, ablation table, W&B loss curves, live Mongo data-pipeline stats.
- Live demo: 2 held-out tasks executed on stage (one on a Mind2Web real-web page), curve for the rest.

## Budget ledger

Smoke ~$0.50 · bake-off 3× SFT ~$6–18 · loops (2× SFT-iter, GRPO, OPD, self-play round) ~$15–30 ·
serving/eval ~$2–5 → **~$25–55 total**: the $50 starter credit covers most of it; one $50 top-up
buys full headroom for the ablation table. Every run is pre-quoted with `--cost` before submit.

# LOGBOOK — the master record

Everything decided, built, measured, rejected, and parked, in one place. Where a decision has a
full write-up elsewhere, this is the index; where it only existed in conversation, this is the
record. Last updated: **2026-07-18** (Stage A complete).

## Where everything lives

| Doc | Holds |
|---|---|
| [DECISIONS.md](../DECISIONS.md) | The 18 numbered decisions (frozen contracts, policies, kill rules) |
| [contracts/](../contracts/) | Schema v1, frozen prompt template, EVAL contract, held-out seed reservations |
| [docs/PLAN.md](PLAN.md) | Stage A–E roadmap, data source table, Freesolo feature coverage, dependency graph |
| [docs/FREESOLO.md](FREESOLO.md) | Platform playbook + **measured** run numbers |
| [docs/PRIOR-ART.md](PRIOR-ART.md) | Research synthesis + the judge-facing decision-lineage table |
| [docs/BENCHMARKS.md](BENCHMARKS.md) | Public benchmark survey, scoring adapters, numbers to beat |
| this file | Decision index, implementation decisions, artifact registry, measured results, review record, rejected alternatives, parked ideas, risks |

## Decision index (full text in DECISIONS.md)

- **D1** Function signature: (raw HTML, goal) → AgentView JSON; goal always present; empty-goal = enumerate mode; empty/empty = "goal impossible here"; *AgentView selects, the agent decides*.
- **D2** Schema v1 frozen; click/type/select only; array caps as anti-gaming bounds; goldens are normative.
- **D3** Input pipeline = annotate (`data-av-id`) → pretrim; two-tier token budget (12k soft target / 28k hard gate — Flash cap raised to 32,768, see update entry below); identical pipeline for teacher/student/baselines; state write-back required.
- **D4** Selector dialect: unique in both DOMs AND same element (structural-path identity); bans: html/body, comma lists, :*-child, +/~; action targets use `[data-av-id]`; value_hint rules.
- **D5** Text grounding: verbatim, in trimmed AND raw DOM, tightest element, non-empty.
- **D6** Playwright (library) is executor/verifier; generator must emit (page, goal, success_predicate); spine/RFT only from own sites; Gemini-synthetic bulk-only; Mind2Web eval-only.
- **D7** Metrics: end-to-end success primary; element recall reported separately; validator pass rate never a headline; four arms incl. raw-a11y-snapshot baseline.
- **D8** Held-out: 5 tasks committed pre-generation; seeds 9000–9999 reserved; ≥2 third-party pages; 100–300-pair held-out page set; goldens never eval.
- **D9** One frozen prompt template, hash-stamped on every row; only content varies, never format.
- **D10** Training: SFT → GRPO warm-start (validator-port reward) → OPD branch (glm-5.2); quality gates not clock gates; final day training-free; ablations planned.
- **D11** RFT reward design: validator = gate, success predicate = reward; prompt pool in the 20–70% success band.
- **D12** Every example logged to Mongo with source/tier/seed/hashes; gemini-synthetic ≤50% of any mix.
- **D13** Flash platform facts (resolved from docs + measured); smoke slice before any mass labeling.
- **D14** Base model by bake-off (2B/4B/9B, identical data); 35B excluded (4k ctx); GLM/DeepSeek/Kimi are teachers, not bases; capture zero-shot before training.
- **D15** Dataset rows emitted in Flash's exact {input, output, metadata} format from example one.
- **D16** Spine mechanics: hindsight relabeling + independent judge + mid-flight pruning + env-feedback filters + failure-seeded curriculum.
- **D17** Decode settings pinned for all arms: temp 0, repetition_penalty 1.05–1.08, max ~2,000 completion tokens, guided decoding, loop-stop; prefix-cache-friendly prompt order.
- **D18** Playwright MCP: baseline arm + dev tool; never in our harness; AgentView-as-MCP-server parked as a demo idea.

## Implementation decisions (unnumbered, made while building)

1. **Flash CLI runs in WSL Ubuntu** (`~/.flash` venv): v1.0.1 imports Unix-only `fcntl` and pins Python <3.13 — native Windows impossible. Invoke: `wsl -d Ubuntu -- ~/.flash/bin/flash …`.
2. **`environment.py` carries the system prompt from a generated file** (`system_prompt.txt`, written by the emitter from the frozen template) — `build_prompt_messages` returns [system, user], keeping the template the single source of truth across training and serving. Includes a contract-shape reward stub to be upgraded for GRPO.
3. **Smoke dataset (19 examples) hand-authored, not teacher-labeled** — no Gemini key was configured yet, and for a format-proof run, validator-passed hand labels are equivalent. Composition chosen for coverage: multi-action, select+value_hint, content-only (2), impossible-goal (1), empty-goal enumerate (1), same-page-different-goal clusters (shop ×9).
4. **Golden/smoke action selectors use `[data-av-id]`; content selectors stay semantic** — mirrors the template rule so goldens remain normative.
5. **`scripts/av-ids.js` authoring helper** — prints each interactive element with the id annotate will assign; makes hand-labeling mechanical and id-drift visible.
6. **Harness (`pipeline/infer.js`) is arm-agnostic** — same entrypoint for Flash adapter / base zero-shot / Gemini; `repetition_penalty: 1.08` added after live degeneration (see Measured); parser tolerates code fences and `<think>` blocks.
7. **`data/fixtures/` = never-train pages** — megashop.html (55 interactive elements, sold-out trap, base64 tracking attrs) is a qualitative eval panel with 7 canonical goals; candidate held-out material.
8. **npm `check` = golden suite + negative suite**; harness hashes printed on every run (current: schema `a1a5f3931aa6`, template `1ae340e484d3`, annotate v1, pretrim v2).

## Artifact registry

| Artifact | Value |
|---|---|
| Flash org / env | `ht6-team` (pre-funded — no card needed, verified by accepted run) / `ht6-team/agentview` |
| Smoke run | `flash-1784358075-7999e3c4` — SFT, Qwen3.5-0.8B, rank 32/α64/LR 1e-4/2 epochs/19 examples |
| Adapter endpoint | `https://clado-ai--freesolo-lora-serving.modal.run/v1`, model = run id, Bearer = org `fslo_` key (left deployed; idle costs $0) |
| Adapter HF mirror | `Freesolo-Co/flashrun-ht6-team-agentview-b699ab9910de5e97` |
| Toolchain | Windows Node 22.18 (repo pipeline) · WSL Ubuntu 24.04 / Python 3.12.3 (Flash CLI) · flash 1.0.1 |
| Repo pipeline | annotate v1 · pretrim v2 · schema v1 · template `1ae340e484d3` |

## Measured results (Stage A smoke slice, 2026-07-18)

- Quote $0.01 → billed **$0.0088**. Queue **12 s** (vast.ai A100 SXM). Setup ~5 min (unbilled). 8 train steps. **Submit→done 6.4 min.** Deploy ~1 min. Inference ~3 s/call (0.8B).
- Trained goal ("Find the shipping policy", shop.html): **validator PASS** — byte-correct contract output.
- Unseen goal, trained page: **degeneration loop** (verbatim `"actions"` repetition to the 2,000-token cap) — the exact ReaderLM failure mode; `repetition_penalty 1.08` stopped it on the first try. Post-fix output well-formed but semantically hallucinated → validator rejected (`matches 0 elements`).
- Unseen page (megashop): different loop shape (incrementing `content_refs` ids c1→c408) — motivates harness loop-stop + `structured_outputs` schema caps (content_refs ≤10) at GRPO/serve time.
- Interpretation on record: 19 examples buys format, not semantics. Generalization is Stage B's job. All 25 `npm run check` cases green throughout.

## Adversarial review record (every exploit reproduced, then fixed, then made a regression test)

1. Count-only dual-DOM check gameable → comma selector-lists / truncated-attribute collisions resolve to *different* elements while unique in both → **fixed**: structural-path identity + comma ban.
2. Text grounding accepted any on-page phrase attributed to any container → **fixed**: tightest-element rule.
3. Lone `…`/whitespace text skipped grounding entirely → **fixed**: rejected as ungroundable.
4. Clicks on `<title>`/decoration/dead divs passed → **fixed**: interactivity requirement (bubbling-aware).
5. Pretrim forced quirks-mode pages into standards mode (selector case-semantics drift) → **fixed**: doctype presence preserved.
6. `<pre>`/`<textarea>` whitespace corruption; non-ASCII token underestimate; date-picker typing; select on ARIA divs; value_hint unvalidated/undefined; template↔validator drift (template never showed the schema shape; empty-goal contradicted caps); golden violated its own relevance rule → **all fixed** (validator, pretrim, template, D-log updated).
Consolidated consequence: 21-case negative suite; every entry is a formerly-working exploit.

## Rejected alternatives (and why — judges ask)

- **A11y snapshot as model input** — degrades on ARIA-poor pages, the exact target distribution (D3).
- **Goal-free contract** — would compete with a free deterministic serializer; goal-conditioning is the moat (D1).
- **Model-authored-only selectors** — every production system mints harness ids; small models hallucinate selector syntax; hybrid adopted (D4).
- **Qwen3.6-35B-A3B** — 4,096-token context can't fit the page budget (D14). **GLM 5.2 as base** — not in the trainable catalog; used as OPD teacher instead (D10/D14).
- **Validator pass-rate as headline metric** — gameable by trivially-safe outputs (D7).
- **Mind2Web as training data** — conversion is a subproject; eval-only (D6).
- **WebArena during the event** — hosting weight; WebArena-Lite is a multi-day stretch only (BENCHMARKS).
- **Sequence packing** — examples nearly fill the window; bucketing by length instead (FREESOLO).
- **HTML pretraining, 256k context extension, checkpoint merging, DPO, trained ORM, CDP bookkeeping** — right ideas, wrong timescale (PRIOR-ART "not copied" list).

## Parked ideas (not scheduled, not forgotten)

- AgentView as an MCP server (`agentview_snapshot(goal)`) — closing demo beat (D18).
- OPD as a data-free fourth tier on the same prompt pool (D10).
- WebShop as an extra spine environment if Docker cooperates (D6).
- Validator-rejected outputs harvested as DPO pairs (ReaderLM trick) if a preference-training option ever appears.
- Graded 1–5 quality scores as sampling weights (OS-Genesis) — binary gate suffices for now.
- W&B `[wandb]` config for live loss curves on the dashboard; `flash export` of the winner to a team HF repo.

## Open items / risks

1. **Gemini API key** — user has it (2026-07-18); pending: add `GEMINI_API_KEY=` to `.env`, then verify with a models-list call. Teacher plan: Gemini primary; optional GLM-5.2 second teacher for the synthetic-page slice (loop-breaking) if a Z.ai/OpenRouter key appears.
   **MongoDB logging: LIVE** — Atlas M0, `.env` configured, write+read verified (~1s round trip); `src/log.js` layer + inference receipts wired; collections: meta (live), inference (wired), examples/eval (with the generator build).
2. **Site generator + verifier: LIVE (2026-07-18).** `pipeline/generate-site.js` — seeded
   (mulberry32, hash-identical regeneration verified), 3 class-name schemes, feature toggles
   (cookie/banner/newsletter/sort/wrapper-depth), emits (page, tasks) where every task carries
   goal + gold_actions + a JS success predicate; held-out seed blocklist enforced both directions.
   `pipeline/verify.js` — Playwright/Chromium, injects the identical data-av-id annotation
   (criteria imported from src/annotate.js), executes actions, evaluates predicates in-page,
   logs to Mongo `verify`. Verified: seeds 1–2 all gold tasks PASS; `--no-act` sanity mode
   confirms predicates are false without actions (no trivially-true GRPO rewards). Generated
   pages trim to ~1k tokens — small; a long-page tier (multi-category/long lists) is the next
   generator upgrade. Remaining before mass data: goal-phrasing diversity (teacher paraphrases)
   and the gold-output emitter (generator → AgentView JSON training rows).
3. **Held-out tasks not yet authored/committed** — `heldout-seeds.json` still says `tasks_committed: false`; must happen before any mass generation.
4. **Base zero-shot serving path — RESOLVED (surveyed 2026-07-18).** No hosted free tier serves
   small Qwen3.5 (0.8B–4B) at all; OpenRouter has only the 9B, paid (~$1–1.50 for our whole eval
   after a one-time $10 top-up); Groq/Cerebras/GitHub/Cloudflare/Together/Mistral host no Qwen3.5;
   NVIDIA NIM is free but only the 397B. Chosen path, in order:
   (a) **Identity-LoRA trick on Flash**: train each base with `max_steps=1, learning_rate≈1e-9`
   (LoRA init has B=0 ⇒ the adapter is a no-op ⇒ the deployed run IS the base model) — base
   zero-shot served through the *identical* endpoint/stack/quantization as the fine-tune, ~$0.01
   per size from existing org credits; verify with `--dry-run` before relying on it.
   (b) **ollama locally** (official `qwen3.5:0.8b/2b/4b/9b` tags, OpenAI-compatible at
   localhost:11434/v1) — free/offline backup; use official tags (third-party GGUF imports broken)
   and Q8 if fidelity matters (default tags are ~4-bit; document quant in eval metadata).
   (c) OpenRouter $10 top-up for a managed 9B if needed.
5. **GRPO reward port (Python/lxml)** — written but not started; needed before Pass 2; Node in reward workers assumed unavailable.
6. **jsdom vs Chromium selector semantics** — residual risk (D4); plan a sampled Playwright-side audit.
7. **Security**: the org `fslo_` API key was pasted in a chat session — **rotate it at freesolo.co before sharing the transcript or repo access**; it is stored in WSL by the CLI and deliberately absent from every repo file.

## Update 2026-07-18 (later): context cap 8k → 32k

Freesolo dev tip verified server-side: `--cost`/`--dry-run` accept `max_context_tokens = 32768`
on sub-10B models (client 1.0.1 unchanged — cap is server-side). Measured catch: 0.8B@32k quotes
on a B200 ($5.89/hr) vs A100 ($1.39/hr) at 8k — context length is now the main cost lever.
Changes made: two-tier budget in pretrim.js (`PAGE_TOKEN_TARGET` 12,000 soft / `PAGE_TOKEN_BUDGET`
28,000 hard), D3 updated, FREESOLO.md + BENCHMARKS.md updated. Strategy consequences recorded:
(1) real-web eval pages (Mind2Web/REAL) now fit — trim-recall stops being the binding ceiling;
(2) generator gains a long-page tier (~15% of data, ReaderLM-style short→long mix — degeneration
risk grows with length, so long examples are a slice, not the default); (3) NEW ABLATION unlocked:
pretrim-vs-raw-input on pages that fit either way — the first honest measurement of what pretrim
itself buys; (4) pretrim's pitch reframed from "fit the window" to "signal density + 3–10× cheaper
tokens per call".

## Update 2026-07-18 (evening): Stage B/C foundations executed

- **Held-out freeze COMMITTED** (`b8a7901`, pushed to main): 5 tasks — 3 on reserved seeds
  (9001 cheapest-wireless, 9002 newsletter, 9003 sort) + 2 Mind2Web real-web pages
  (tiktok.music, nba; action-level gold = backend_node_ids); held-out page set = seeds
  9010–9059, 50 pages / 256 goals, sha256-manifested in eval/pageset-manifest.json.
  contracts/heldout-seeds.json flipped to committed. Mind2Web pages fetched via the HF
  datasets-server rows API (full 85KB cleaned_html with embedded backend_node_id — no bulk download).
- **Gold emitter LIVE** (pipeline/emit-gold.js): 267 validator-passed spine rows from seeds
  100–149 → data/rows/gold-100-149.jsonl, all logged to Mongo `examples`
  (source=parametric-gold, tier=spine). Zero teacher cost; refuses held-out seeds.
- **Teacher labeler BUILT** (pipeline/teacher.js: Gemini OpenAI-compat endpoint, frozen template,
  validator rejection-sampling, per-attempt Mongo logging, pass-rate report). First batch
  BLOCKED: the Gemini key's project has **depleted prepayment credits**
  (429 RESOURCE_EXHAUSTED, "prepayment credits are depleted") — user action: add credits or
  mint a free-tier key at ai.studio/projects. Pipeline is ready to run unchanged.
- **Identity-LoRA baselines TRAINED** (max_steps=1, lr=1e-9 — accepted by the platform):
  2B flash-1784382648-91484fce ($0.0022), 4B flash-1784382650-2530171a ($0.0046),
  9B flash-1784382651-5d5bd3f9 ($0.0094). Deployments in progress.
- **Eval harness BUILT** (pipeline/eval.js): scores validator pass, element recall vs gold
  elements (isSameNode), step match (element+kind), full-task match, impossible-goal handling;
  logs rows + summary to Mongo `eval`.
- Session spend so far: ~**$0.03** total training. Budget cap $149/session — untouched.

## First baseline numbers (held-out seeds 9010-9014, 26 tasks/arm, logged to Mongo `eval`)

| Arm (zero-shot via identity-LoRA) | valid rate | element recall | full-task match | impossible OK | avg latency |
|---|---|---|---|---|---|
| base-2b (flash-1784382648-91484fce) | 0.0% | 0.0% | 0.0% | 0% | 4.8 s |
| base-4b (flash-1784382650-2530171a) | 23.1% | 4.2% | 4.8% | 100% | 6.1 s |
| base-9b (flash-1784382651-5d5bd3f9) | 23.1% | 4.2% | 4.8% | 100% | 9.8 s |

Reading: zero-shot bases produce plausible-shaped JSON but fail the strict contract — the 2B broke
contract rules (value_hint on click) and picked wrong elements; 4B/9B pass essentially only the
impossible-goal cases (both emit empty arrays correctly — 100% impossible handling) plus one lucky
element. Differentiation probe confirmed distinct models (4B classified a USB-C cable as wireless
headphones; 9B picked the correct candidate set). These are the "before" rows of the headline
table. Gemini arm + teacher batch BLOCKED on depleted Gemini project credits (user fixing).
Identity-LoRA total cost: $0.016. Session spend to date ≈ $0.05 of the $149 cap.

## Update: Gemini refreshed ($25) — teacher running; first real SFT submitted

- `gemini-2.5-flash` is closed to new users (404) — teacher switched to **gemini-3.5-flash**
  (thinking model; `reasoning_effort: "low"`, max_tokens 3000). teacher.js now appends kept rows
  incrementally (kill-safe) and runs under a persistent Monitor.
- Gold tier scaled: seeds 150–249 → +537 rows; **804 parametric-gold rows total**, all in Mongo.
- **SFT-2B v0 submitted**: `flash-1784384488-054a73ab` — 823 rows (804 gold + 19 smoke),
  rank 32/α64/LR 1e-4/2 epochs/8192 ctx, quoted **$0.92**, 206 steps ≈ 40 min on A100.
  This is the spine-only ablation row. Bake-off configs for 4B/9B staged (identical data).
- Next on completion: deploy → eval.js vs base-2b on held-out seeds 9010-9014 → first real delta.

## MILESTONE: first real adapter — SFT-2B v0 (flash-1784384488-054a73ab, $0.92, 206 steps)

Held-out eval, seeds 9010-9014, 26 tasks, identical harness:

| Arm | valid | element recall | full-task | impossible OK | latency |
|---|---|---|---|---|---|
| base-2B (zero-shot) | 0% | 0% | 0% | 0% | 4.8 s |
| **sft-2B v0 (spine-only, $0.92)** | **100%** | **100%** | **100%** | **100%** | **2.9 s** |

Honest scoping: held-out seeds are unseen pages but the same generator distribution — this row
proves the model mastered the distribution (unseen layouts/ids/product mixes, correct candidate
sets, correct impossible-goal refusals), not open-web generality. OOD probes on the never-trained
megashop fixture: cookie-dismiss = full validator PASS (real transfer); cheapest-earbuds =
format+grounding right but picked the bundle distractor and hallucinated a data-sku wrapper
(generator-convention overfit → fix = teacher diversity + more archetypes). Teacher batch 150-249
running at 100% pass-rate with the parser fix. Next: merge teacher rows → SFT v1 bake-off (2B/4B/9B).

## Bake-off v1 submitted (Stage C)

- Teacher tier complete: **723 rows** (186 @ 69.7% pre-fix + 537 @ **100.0%** post-fix).
- v1 dataset: **1,546 rows** (19 smoke + 804 gold + 723 teacher), pushed to ht6-team/agentview.
- Runs (identical data, rank 32/a64/LR 1e-4/2 epochs): 2B flash-1784388428-de80fdef ($1.74, 75min),
  4B flash-1784388430-882e2acc ($3.55, 153min), 9B flash-1784388432-7182d132 ($7.33, 316min).
- On each completion: deploy -> eval.js seeds 9010-9014 -> table row vs zero-shot baseline.
- Session spend incl. bake-off quotes: ~$15 of $149.

## END-TO-END loop measured (primary metric, EVAL.md)

pipeline/eval-e2e.js = the full product architecture: translator arm -> AgentView JSON ->
driver agent (gemini-3.5-flash, sees ONLY goal+JSON, never the page) -> Playwright executes ->
success predicate judges. Shared executor extracted to pipeline/executor.js (verify.js refactored).
First result: **sft-2b-v0, held-out seeds 9001-9003, 18/18 task success (100%)** — 0 invalid,
0 driver errors, 0 exec errors; includes candidate-comparison tasks (driver picked the cheapest
from relevant_content). Rows in Mongo `eval` (kind: eval-e2e).
In parallel: workflow building the Python validator port (GRPO reward) + Mind2Web scoring adapter.
Bake-off (2B/4B/9B) still training.

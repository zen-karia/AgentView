# AgentView — Decision Log

Every previously-open question, settled. Anything marked **FROZEN** requires a version bump to change,
and a version bump invalidates all data generated under the old version. Decisions marked **OPEN(external)**
cannot be settled from inside the repo and list exactly what unblocks them.

---

## D1 — Function signature (FROZEN)

**Input:** `(raw HTML, goal)` — goal is always present, always a string.
**Output:** one AgentView JSON object per [contracts/agentview.schema.json](contracts/agentview.schema.json).

- Empty goal (`""`) is a documented special mode: enumerate the page's available actions and the
  content needed to use them, most important first, **within the schema caps**, excluding boilerplate
  (legal text, copyright, decoration). Pinned by the `shop / empty-goal-enumerate` golden.
- Empty `relevant_content` + empty `actions` is the explicit signal for "this goal cannot be advanced on this page." It is a valid, trainable output — not an error.
- **AgentView selects, the agent decides:** when a goal requires choosing among candidates
  ("cheapest", "best-rated"), AgentView returns each candidate's action plus the content needed to
  compare them; the downstream agent makes the choice. Pinned by the `shop / add-cheapest-wireless`
  golden (both wireless options, both add-to-cart actions).

*Why:* goal-conditioning is the one property that separates AgentView from a rule-based serializer
(Playwright MCP's accessibility snapshot). A goal-free contract would be competing with a free deterministic tool.

## D2 — Schema v1 (FROZEN)

[contracts/agentview.schema.json](contracts/agentview.schema.json) is the contract. The golden examples in
[golden/](golden/) are its normative reference — every one must pass the validator at all times.
Action taxonomy: `click`, `type`, `select` — nothing else in v1. `navigate` is just `click` on a link.
Array caps (50 content / 30 actions) are anti-bloat and anti-reward-hacking bounds.

*Why:* every downstream artifact (teacher prompt, 1k–3k bulk pairs, verifier, dashboard, LoRA) hardcodes this.
Schema churn after the overnight teacher batch costs the entire bulk tier plus a retrain.

## D3 — Model input = annotated + pre-trimmed HTML, not the accessibility snapshot (FROZEN, v2)

The input pipeline is `annotate(raw)` → `pretrim(annotated)` ([src/annotate.js](src/annotate.js),
[src/pretrim.js](src/pretrim.js), version-stamped). `annotate` stamps deterministic `data-av-id`
attributes on interactive elements — the harness-minted-ID pattern every production system uses
(BrowserGym `bid`, Stagehand EncodedId, Playwright MCP refs; see [docs/PRIOR-ART.md](docs/PRIOR-ART.md)).
Teacher labeling, student training, base-model zero-shot, and the Gemini baseline all consume the
**identical** pipeline output. The validator resolves selectors against the trimmed DOM (what the
model saw) **and** the annotated raw DOM (what the executor drives); the executor runs the same
annotation on the live page before acting, and the site generator/executor must **write live input
state back into attributes** (`value`, `checked`) before any serialization (BrowserGym does this
because serialized HTML doesn't reflect typed text — without it, multi-step spine labels are corrupt).

**Token budget (updated 2026-07-18): two-tier.** Flash raised sub-10B context to **32,768**
(verified server-side via `--dry-run`). Soft target **12,000** for page+goal (most examples —
long context inflates VRAM and jumps the GPU class: 0.8B@32k quotes on a B200 at $5.89/hr vs
A100 at $1.39/hr); hard gate **28,000** for a deliberate long-page slice (~15% of training data,
ReaderLM-style short→long mix) and for big real-web eval pages. Pretrim is unchanged and NOT
obsolete: its job was never only fitting context — trimmed pages are 3–10× cheaper per call,
denser in signal, and now that raw pages *can* fit, a **pretrim-vs-raw-input ablation** becomes
possible and is added to the ablation plan (D10).

*Why not a11y snapshot as input:* our thesis is messy, ARIA-poor pages — exactly where the a11y tree degrades.
The model cannot recover semantics its input already lost. Pretrim cuts tokens while keeping every selectable
element and its semantic attributes.

## D4 — Selector dialect (FROZEN)

CSS selectors only. Each must match **exactly one** element in both trimmed and raw DOM, **and the
same element in both** — the validator compares canonical structural paths, because equal counts
alone are gameable (comma selector-lists and truncated-attribute collisions can match different
elements on each side while being unique in both).
Banned: targeting `html`/`body`; comma selector lists; the `:*-child` pseudo-class family; the
sibling combinators `+`/`~` (pretrim removes `script`/`style` siblings, so trimmed-DOM adjacency is
not live-page adjacency).
Positional selection uses `:*-of-type`, which is invariant under pretrim's removals.
**Action targets use `[data-av-id="N"]`** (unique by construction, minted by `annotate` — small
models hallucinate selector syntax; ID prediction is what HTML-T5 and AutoWebGLM both chose).
Content selectors (and un-annotated elements) fall back to ids, `data-*` attributes, class paths.
Note: `data-*` values over 200 chars are truncated by pretrim (ending `…`) and must not
be used in selectors — the template says so and the raw-DOM check rejects violations.
`value_hint` is allowed only on `type`/`select`; for `select` it must match an existing option's
label or value (validator-enforced), and the executor maps it via label first, then value.
`click` targets must be interactive (native control, `onclick`/`role`/`tabindex` marker, or inside
one); `type` excludes native picker inputs (date/time family); `select` is native `<select>` only.
*Residual risk, accepted for v1:* validation parses with jsdom while the executor drives Chromium;
plan a sampled audit resolving accepted selectors through Playwright itself.

## D5 — Anti-hallucination text rule (FROZEN)

Every `relevant_content.text` must be a verbatim extract, validator-enforced at three levels:
(1) grounded in the trimmed element the model saw *and* in the raw page (`…` truncation markers are
split and each segment matched in order — a pretrim artifact can't launder text that isn't real);
(2) non-empty after normalization (a lone `…` or whitespace is rejected, not skipped);
(3) attributed to the **tightest** element — if a descendant also contains the text, targeting the
container is rejected, so product B's price can't be "grounded" to a page-wide wrapper.

## D6 — Executor, verifier, and which sources can produce which tiers

- Executor/verifier runtime: **Playwright** (the library; MCP optional for the baseline in D7).
- The parameterized site generator MUST emit `(page, goal, success_predicate)` triples from its first version.
  Success predicates are explicit end-state assertions (cart contents, form values, URL), not vibes.
- **Spine and RFT tiers can only come from our own generated sites** (+ WebShop if it stands up in one try).
  Gemini-synthetic pages are bulk-tier-only forever (no ground truth to verify). Mind2Web is **eval-only**
  unless a 30-minute spike on 5 examples proves the node-id→selector conversion is cheap — its labels are
  backend node ids on multi-step traces, not a download-and-use dataset.

## D7 — Metrics (FROZEN — see [contracts/EVAL.md](contracts/EVAL.md))

Primary: end-to-end task success on held-out tasks, identical harness, only the model swapped.
Secondary: action-level correctness on a held-out page set.
Validator pass rate is a **data-quality gate, never a headline** (gameable by `body > div`-style outputs).
Four comparison arms: base zero-shot, base+LoRA, Gemini teacher, and **agent driven by the raw Playwright
a11y snapshot with no AgentView** — the last one is the standing answer to "why not just Playwright MCP?"

## D8 — Held-out policy (FROZEN — details in EVAL.md)

5 held-out tasks authored and committed **before the first training example is generated**; generator seeds
9000–9999 reserved ([contracts/heldout-seeds.json](contracts/heldout-seeds.json)) and refused by the data
pipeline; ≥2 of the 5 tasks on pages we did not generate; a 100–300-pair held-out **page** set carved out
before bulk labeling (n=5 tasks alone cannot support a comparative claim). Golden examples are format anchors,
not eval data.

## D9 — Frozen prompt template + hash stamping

[contracts/prompt-template.md](contracts/prompt-template.md) is the single template for teacher, training,
RFT, eval, and demo. sha256 of (template, schema) + pretrim version are stamped on every MongoDB row.
Vary the (page, goal) content freely; never the template — small LoRA'd models are brittle to format drift.

## D10 — Training plan and kill rules (updated with confirmed Flash facts — see [docs/FREESOLO.md](docs/FREESOLO.md))

- **Pass 1 — SFT** on bulk + spine (metadata-tagged), Flash defaults rank 32 / alpha 64 /
  LR ~1e-4 / batch ~8, 1–2 epochs. Matches the "LoRA Without Regret" recipe (rank 16-32 is ample
  for 1-3k examples; LoRA on all layers; LR ≈ 10× full-FT).
- **Pass 2 — GRPO** (Flash's native RL — this IS the RFT tier, no manual generate-filter-retrain
  loop): warm-start via `init_from_adapter = <sft-run-id>`, reward = Python port of the validator
  (lxml+cssselect; Node in reward workers is unverified) + success predicate on spine tasks;
  `structured_outputs` = our JSON schema so rollouts can't be malformed; raise
  `max_completion_tokens` from the 512 default to ~2,000. GRPO prompt pool: tasks in the
  partial-success band (SFT model solves 20–70% of trials — AutoWebGLM's 1..n-1 rule).
- **Budget by tokens, not examples:** cost ≈ examples × seq × epochs at ~2.5-3k tok/s per A100.
  1,500 × 8k × 2 ≈ 24M tokens ≈ 1.5–3h. Always `flash train --cost` (free, deterministic) first.
- **Pass 3 — OPD** (on-policy distillation from managed teacher **glm-5.2** — the only way to "use
  a bigger model": it is a teacher, not a trainable base) runs as a parallel branch from the same
  SFT init as GRPO; the frozen eval arbitrates between them.
- **Multi-day gates are quality gates, not clock gates** (full loop structure in
  [docs/PLAN.md](docs/PLAN.md)): each optimization loop (failure-mining re-SFT, GRPO, OPD,
  self-play round) earns another iteration only if held-out success improved; two flat rounds
  kill that loop. Two clock rules survive: no mass data generation before the smoke slice passes,
  and **the final day is training-free** (eval hardening + demo only).
- **Ablation runs are planned, not optional**: SFT(bulk) vs SFT(bulk+spine) vs +GRPO vs +OPD,
  enabled by `metadata` tier tags. Rollout generation + Playwright verification dominates GRPO
  wall-clock — parallelize workers.

## D11 — RFT reward design (FROZEN)

Validator pass = **gate** (failures discarded). Success predicate = **reward**. Never validator-pass-alone as
reward — RL finds the trivially-valid-but-useless policy fast. RFT prompt mix skews to tasks where the SFT
model succeeds 20–70% of the time (0% and 100% prompts carry no learning signal).

## D12 — Data logging (FROZEN row shape in EVAL.md)

Every example and eval run is a MongoDB row tagged with `source` (parametric | gemini-synthetic | mind2web),
`tier`, `seed`, harness hashes, and validator verdict. Mix cap: gemini-synthetic ≤ 50% of any training mix
(Gemini generating pages *and* labeling them is a closed loop; cap and tag it so it can be audited).

## D13 — Flash platform facts: RESOLVED from public docs (2026-07-18), residue to VERIFY

Resolved (details + sources in [docs/FREESOLO.md](docs/FREESOLO.md)): checkpoint inference exists
(`flash deploy`, OpenAI-compatible); max context **8,192 tokens** on all sub-10B models (→ D3 budget);
dataset format is strict `{input, output, metadata}` JSONL; GRPO/OPD supported with guided decoding;
billing is pre-quoted, prepaid, $50 starter credit.
**Still VERIFY in the first session:** queue/wall-clock (unpublished — measure with the smoke run),
Node.js in GRPO reward workers (assume no; Python port planned), hackathon credits/quotas, GPU rates
(via `--cost`). The smoke slice stands: ~20 examples → 0.8B/2B SFT → deploy → 1 harness call,
**before any mass labeling**.

## D14 — Base model: chosen by bake-off, not by default

Smoke slice runs on Qwen3.5-0.8B (cents). Then a **bake-off**: identical data trained on
Qwen3.5-2B, 4B, and 9B (~$2–6 each); the frozen eval picks the demo model (expectation: 9B wins
quality, 4B wins the cost story — demo the winner, cite the size curve). Qwen3.6-35B-A3B is
**excluded**: its 4,096-token context cannot fit the 5,500-token page budget. GLM 5.2 / DeepSeek /
Kimi are **not trainable bases** — they are Flash's managed OPD teachers (see D10 Pass 3).
Qwen-family is also ReaderLM's twice-validated base choice for HTML tasks. Capture every
candidate's zero-shot held-out score before training — the "before" numbers cannot be measured
honestly afterward.

## D15 — Dataset emission format (FROZEN)

The pipeline writes Flash's exact canonical row from example one — no "convert later" step:
`{"input": <template-rendered prompt>, "output": <AgentView JSON string>, "metadata": {tier, source, seed, schema_sha, template_sha, pretrim_version}}`.
Flash rejects alternate key names and silently drops other top-level keys; provenance lives only in
`metadata` (mirrors the MongoDB row in EVAL.md, so tier-weighted ablations stay possible).

## D16 — Spine tier mechanics: hindsight relabeling + independent judge (from NNetNav/WebRL — see docs/PRIOR-ART.md)

- **Hindsight relabeling**: exploration rollouts on our parameterized sites; log per-step state
  diffs; Gemini writes the goal the trajectory *actually accomplished* from the diff summaries (not
  raw HTML). Success is by construction; Playwright confirms the end state.
- **Independent judge gate**: a fresh-context Gemini call — "does this trajectory accomplish this
  goal, YES/NO" — drops mismatches. The goal's author never grades its own goal.
- **Mid-flight pruning**: kill a rollout every ~4 steps if no tracked state changed (heuristic on
  our sites; no teacher tokens wasted on junk).
- **Environmental-feedback filters** (HTML-T5's entire quality gate): drop traces with execution
  errors, selector-resolution failures, or wrong end-state URL/state.
- **Failure-seeded curriculum**: after the first eval, generate parameter-perturbed variants of
  exactly the failed pages/goals; keep tasks in the partially-solvable band. Order training data
  easy pages → messy pages.

## D17 — Decode + serving settings (FROZEN; from ReaderLM's failure analysis)

Small HTML-task models degenerate (token loops). Pinned for ALL arms (student, base zero-shot):
temperature 0, repetition_penalty 1.05–1.08, hard `max_completion_tokens` ≈ 2,000, JSON-schema
guided decoding at serve time (`response_format`), loop-detection early stop in the harness.
Prompt order: static system prompt + contract first, per-page HTML last — Flash's automatic prefix
caching then bills the repeated prefix at ~5× cheaper cached rates across eval runs.

## D18 — Playwright MCP: three roles, one prohibition

- **Baseline arm implementation**: the "no-AgentView" eval arm (D7) runs the actual Microsoft
  Playwright MCP server driven by the same frontier model — the measured answer to "why not just
  Playwright MCP?", not an argued one.
- **Dev tooling**: fine for interactively poking generator pages and debugging predicates.
- **Prohibited inside our harness**: the executor/verifier uses the Playwright *library*
  (deterministic, programmatic); MCP adds an LLM-shaped indirection into the component whose job
  is ground truth. Also never the model's input (a11y tree degrades on ARIA-poor pages — D3).
- **Parked demo idea**: package AgentView *as* an MCP server exposing one tool,
  `agentview_snapshot(goal)`, backed by the deployed Flash adapter — "swap goal-blind snapshots
  for goal-conditioned ones by changing one tool." Thin wrapper, end-of-project, strong pitch beat.

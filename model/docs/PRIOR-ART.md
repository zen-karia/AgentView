# Prior art — what we're standing on, what we adopted, what we skipped

## Decision lineage (judge-facing): every load-bearing choice has a named precedent

| Our decision | Precedent (open source) | Their evidence | Our delta |
|---|---|---|---|
| Task = goal-conditioned "selective copying" from HTML, so a small model suffices (D1) | ReaderLM (Jina); HTML-T5/WebAgent snippet extraction | 1.5B beats GPT-4o on HTML→Markdown (ROUGE-L 0.86 vs 0.69); HTML-T5 does instruction-conditioned extraction | One contract unifies content extraction **and** action proposal |
| Small FT model beats prompted frontier on this task shape (the pitch) | MindAct, AutoWebGLM, WebRL, NNetNav, ScribeAgent | 3B FT 52.0 vs GPT-4 36.2 step SR (Mind2Web); 6B 18.2% vs GPT-4 14.4% (WebArena); 8B 42.4% vs GPT-4-Turbo 17.6% (WebArena-Lite) | We replicate the pattern at 4B under a stricter, validated contract |
| Base = Qwen instruct family, LoRA only, no pretraining (D14) | ReaderLM v1+v2 (chose Qwen twice over SmolLM/Phi); ScribeAgent (Qwen LoRA); "LoRA Without Regret" recipe | rank 16–32 ample for small datasets; all-layer LoRA; LR ≈10× full-FT | Constrained to Flash's catalog; bake-off picks size empirically |
| Deterministic DOM pruning before the model (D3, pretrim) | MindAct ranker (1,135→top-50 elements); AutoWebGLM recursive pruner; ReaderLM regex pre-clean; Crawl4AI scoring | MindAct: 86M ranker, 88.9% Recall@50; AutoWebGLM's pruner let a 6B beat GPT-4 | Deterministic + versioned; **inverted** Crawl4AI's exclusions (never drop nav/form — they optimize for reading, we act) |
| Harness-minted element ids, never model-authored locators (D3/D4, `data-av-id`) | BrowserGym `bid` injection; Stagehand EncodedId; Playwright MCP refs; HTML-T5 predicts `data-ref`; AutoWebGLM `click(id)` | Zero production systems trust model-authored locators; ID prediction is where small models stop hallucinating | Our id is itself a CSS selector (`[data-av-id="7"]`) so the contract stays selector-based and validator-checkable; model-authored selectors remain a fallback for content |
| Action taxonomy click/type/select (D2) | Mind2Web's exact operation set (CLICK/TYPE/SELECT) | The field converged on it; makes benchmark scoring 1:1 | value_hint + content_refs added for executor and attribution |
| Rejection-sample ALL training data through a validator (D5) | ReaderLM Draft-Refine-**Critique** (binary pass/fail gate); WebAgent environmental-feedback filters | Jina: "SLMs are particularly sensitive to training-data quality"; the critique gate is load-bearing in their recipe | Ours is deterministic and free (jsdom dual-DOM structural-identity check) instead of an LLM judge; plus an anti-reward-hacking negative suite |
| Bulk tier = teacher-distilled synthetic data (D6) | Synatra ($0.031/demo); AgentTrek ($0.55/demo, judge-verified); ReaderLM (Qwen-32B teacher) | 7B trained on $0.03 demos beats GPT-3.5 on WebArena/Mind2Web | Gemini as teacher; validator replaces the judge for single-step data |
| Spine tier = hindsight relabeling + independent judge (D16) | NNetNav (ΔLM diffs → retroactive goals → ORM gate); OS-Genesis reverse synthesis | 10k relabeled demos took Llama-8B from ~1% to 16.3% WebArena, zero human labels | Gemini writes goals from state-diff summaries; success predicates from our generator replace the trained ORM |
| RFT prompts from the partial-success band; failure-seeded curriculum (D10/D16) | AutoWebGLM (keep tasks solved 1..n-1 of n=20); WebRL (0.05–0.75 critic band, failure-seeded generation) | WebRL ablation: fixed task sets plateau lower | Implemented as generator-seed perturbation of failed tasks |
| RL pass = on-policy with executable reward (D10/D11) | AutoWebGLM RFT; WebRL; ReaderLM stage-4 self-play (0.84→0.86) | Success-filtered self-rollouts are the consistent final-stage win | Run as Flash GRPO with the validator ported as the reward; grammar-constrained rollouts |
| Decode guards: greedy, repetition_penalty ~1.08, output cap, loop-stop (D17) | ReaderLM's documented degeneration failure + fixes | Their dominant small-model failure mode | **Reproduced live in our smoke test; their fix worked on the first try** |
| Element-recall reported separately from end-to-end success (EVAL) | MindAct's Recall@50 vs step-SR split | The two stages fail differently; one number hides which | Same split, plus pretrim gold-element recall as the honest ceiling |

**Deliberately not copied** (and why): HTML-specific long-context pretraining (HTML-T5 — needs 3.4M pages), 256k context extension / checkpoint merging / DPO (ReaderLM-v2 — multi-week, our pretrim makes it unnecessary), trained outcome-reward models (WebRL — deterministic predicates cover it), CDP backendNodeId bookkeeping (Stagehand — needs a live CDP session; we control pretrim), a11y-tree as model input (Playwright MCP — degrades on exactly the ARIA-poor pages that are our thesis).

**What is actually ours** (the honest novelty claim): the frozen validated contract itself — dual-DOM structural-identity selector checking, tightest-element verbatim text grounding, and an adversarially-built negative suite — used as **both** the data gate and the RL reward; the `data-av-id`-as-CSS-attribute compromise; and the four-arm eval where the raw Playwright a11y snapshot is a measured baseline rather than an argument.

Compiled 2026-07-18 from a six-track research sweep (papers + source code + docs). Every claim has
a source. The one-line conclusion: **everything AgentView is attempting has a validated precedent;
our contribution is composing them under one strict, validator-enforced contract in 24h.**

## The pitch ammunition (numbers judges can check)

- Fine-tuned **Flan-T5-XL (3B) beats zero-shot GPT-4** on Mind2Web action prediction: 55.1 vs 41.6
  element accuracy, 52.0 vs 36.2 step success (MindAct, arxiv 2306.06070).
- **AutoWebGLM (6B) beats GPT-4 on WebArena**: 18.2% vs 14.4% (arxiv 2404.03648).
- **NNetNav-tuned Llama-3.1-8B beats zero-shot GPT-4** on WebArena (16.3% vs 14.1%) with 10k
  synthetic demos, zero human labels (arxiv 2410.02907).
- **WebRL took Llama-3.1-8B from 4.8% → 42.4%** on WebArena-Lite vs GPT-4-Turbo's 17.6% (arxiv 2411.02337).
- **ReaderLM-v2 (1.5B) beats GPT-4o on HTML→Markdown** (ROUGE-L 0.86 vs 0.69) but only **matches**
  it on HTML→JSON (F1 0.81-0.82 vs 0.83-0.84) — calibrate the claim: expect parity with Gemini on
  our JSON task, and win on cost/latency, not dominance (arxiv 2503.01151).

## ReaderLM / ReaderLM-v2 (Jina) — closest product precedent

Small Qwen-based models (0.5B–1.5B) trained for messy HTML → Markdown/JSON. Key framing: the task
is **"selective copying"**, not open generation — which is exactly why a small model suffices, and
exactly what our verbatim-extract contract enforces. Their pipeline: teacher-drafted data with a
binary pass/fail critique filter (an LLM version of our deterministic validator — ours is cheaper
and stricter), DPO pairs harvested for free from draft-vs-refined outputs, and a final self-play
round (structurally our RFT tier; it moved ROUGE-L 0.84 → 0.86). Their dominant failure mode was
**degeneration** (token loops); fixes: greedy decoding, repetition_penalty ~1.08, hard output caps,
runtime loop detection. Their model card ships regex pre-cleaning (script/style/comments/base64/SVG)
— independent validation of our pretrim. Sources: jina.ai/news (reader-lm posts), arxiv 2503.01151.

**Adopted:** decode settings pinned in EVAL.md; validator-rejected outputs logged (free DPO pairs
if ever needed); Qwen-family base (their twice-validated choice). **Skipped:** long-context
extension, checkpoint merging, contrastive loss — multi-week work our pretrim makes unnecessary.

## HTML-T5 / WebAgent, MindAct, AutoWebGLM — the academic lineage

All three converge on our thesis: HTML is too big/noisy to act on directly, so interpose a
goal-conditioned filter, and **reference elements by stable IDs, never by generated text**:

- HTML-T5 predicts `data-ref` attribute values and retrieves snippets by XPath "instead of naively
  decoding the raw snippet" (arxiv 2307.12856). Its training data was scripted-agent
  "self-experience" kept only after environmental-feedback filtering — execution errors, retriever
  errors, wrong-URL trajectories dropped. Three cheap checks were the entire quality gate.
- MindAct: an 86M DeBERTa ranker prunes ~1,135-element pages to top-50 candidates (Recall@50
  ~85-89%), then the LLM picks. Element representation = tag + own text + salient attributes +
  **parent and child text** — that context is what disambiguates identical-looking buttons.
- AutoWebGLM: recursive HTML pruner (keep actionable elements + ancestors/siblings; drop nodes with
  no text/attrs/children), numeric-id action space (`click(id)`), curriculum SFT → DPO on
  self-sampled pairs → RFT on success-filtered rollouts. Their RFT prompt selection: sample each
  task n=20 times, **keep only tasks solved between 1 and n-1 times** — all-correct adds nothing,
  all-incorrect adds noise.

**Adopted:** `data-av-id` annotation (see below); the three environmental-feedback filters in the
spine harness; MindAct's parent/child context for `relevant_content.text`; the element-recall
secondary metric (mirrors their Recall@k vs step-SR split — tells you whether a failure is a
filtering miss or an action miss); the partial-success band for RFT prompts. **Skipped:** HTML
pretraining, DPO stage.

## Production code (Stagehand, Playwright MCP, BrowserGym, Crawl4AI, Readability, trafilatura)

The decisive finding: **no production system lets the model author a locator.** Stagehand mints
`frameOrdinal-backendNodeId` ids and resolves them harness-side to XPath; Playwright MCP mints
`ref=eN` valid only against the latest snapshot (stale refs error loudly instead of acting on the
wrong node); BrowserGym **injects a `bid` attribute into every element** and resolves with
Playwright `get_by_test_id` — proven at benchmark scale including iframes and shadow DOM.

**Adopted — the biggest design change from this research:** [src/annotate.js](../src/annotate.js)
stamps deterministic `data-av-id` attributes on interactive elements before pretrim. The model emits
`[data-av-id="7"]` — still valid CSS, so the schema/validator/contract are untouched, but uniqueness
is true by construction and the small model spends zero capacity on selector syntax (the thing small
models hallucinate). Model-authored selectors remain legal fallback for content items and
un-annotated pages. The executor runs the same annotation on the live page before acting.

Also adopted: BrowserGym's **state write-back** (write `elem.value`/`checked` into attributes before
serializing — otherwise typed text is invisible to the model on multi-step tasks; requirement on the
site generator + executor); Playwright MCP's staleness contract (executor re-verifies resolution,
fails loudly). Available if pretrim needs strengthening on real-web pages: Crawl4AI's pruning scores
(text_density/link_density/tag weights, threshold 0.48) and Readability's class/id ±25 regex — but
**invert their exclusion lists**: they hard-delete nav/form/header because they optimize for
reading; forms are our entire task surface. Crawl4AI's BM25ContentFilter is a ready-made
goal-conditioned relevance scorer if we ever need a non-ML pretrim baseline.

## Data pipelines (NNetNav, AgentTrek, Synatra, WebRL, OS-Genesis)

Same recipe as ours everywhere: generate cheap, let a **verifier** decide what enters training.
Costs: $0.03–0.55 per verified example (Synatra/AgentTrek); ~10k examples transforms an 8B model.

**Adopted into DECISIONS D16:**
- **Hindsight relabeling for the spine tier** (NNetNav): roll out on our parameterized sites, log
  per-step state diffs, have Gemini write the goal the trajectory *actually accomplished* — success
  by construction, and the labeler reads diff summaries, not raw HTML (cheap).
- **Independent judge gate**: a fresh-context Gemini call answering "does this trajectory accomplish
  this goal, YES/NO" — both NNetNav and WebRL found the separate judge essential (the goal's author
  always approves its own goal).
- **Mid-flight pruning**: kill exploration rollouts every ~4 steps if no tracked state changed —
  NNetNav's trick for not paying teacher tokens on junk.
- **Failure-seeded curriculum** (WebRL-lite): after the first eval, perturb exactly the failed
  pages/goals into new training variants; keep generated tasks in the "partially solvable" band.
  Our seeded generator makes this a one-line change.

**Skipped:** trained outcome-reward models, graded 1-5 trajectory scoring, replay-buffer perplexity
bands — right ideas, wrong timescale for 24h; the deterministic validator + success predicates cover
the same ground.

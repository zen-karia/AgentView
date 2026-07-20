# AgentView — Model Training Findings

The honest science behind the trained AgentView perception model. Every number
below has a MongoDB receipt (`agentview.eval` / `agentview.inference`) and a
LOGBOOK commit.

---

## 1. The thesis

Train a small model to be a **task-conditioned perception layer**: given a
`(goal, page)`, emit a compact `AgentView` JSON — the goal-relevant content plus
the available actions and their selectors — so an agent acts on a clean menu
instead of raw HTML. Two skills must coexist:

1. **Contract** — always emit valid, schema-correct `AgentView` JSON.
2. **Grounding** — pick the *right* element on a *real* web page.

The central finding of the training runs is that these two skills **trade off**
unless the data mixture holds both.

---

## 2. The benchmark bar (Mind2Web — protocol matters)

A correction we had to make internally, because it reframes every number:

- **Nobody scores 80% on Mind2Web.** The 80–89% figures people remember are
  **MiniWoB++** (tiny synthetic widgets) — a different benchmark.
- Published Mind2Web **step accuracy**:
  - MindAct (fine-tuned Flan-T5-XL): **52%** — but via **multiple-choice**: a
    separate ranker prunes the page to ~50 candidates and the LLM picks from the
    shortlist.
  - GPT-4 prompted: **36%**
  - ScribeAgent (Qwen-7B LoRA), **direct generation**: **27–30%**
- **Our harness is direct generation** — generate a unique CSS selector against
  the *whole* page, the harder protocol. Through our exact pipeline, **Gemini
  scores ~35%, GLM-5.2 ~30%.**

**So the honest bar for our protocol is ~30–35% (direct-gen), not 80%.** Beating
MindAct's 52% would require implementing their two-stage ranker protocol — a
different task, not a fair cross-protocol comparison.

---

## 3. The key finding — synthetic-only SFT causes catastrophic forgetting

We deliberately reserved real-web data for last and trained first on our own
synthetic-shop contract. Result: **contract validity rose while real-web
grounding fell.** The Mind2Web **strict element accuracy** curve:

| model | m2w strict acc | m2w valid rate | note |
|---|---|---|---|
| base 9B (zero-shot) | **20%** | — | untrained web knowledge |
| SFT-9B-v1 | 10% | — | synthetic only |
| SFT-4B-v1 | 7.5% | 7.5% | synthetic only |
| SFT-4B-v2 (more synthetic) | **2.5%** | **27.5%** | dose-confirmed |

The pattern is unambiguous across four models: **more synthetic data → higher
contract validity (7.5% → 27.5%) but lower real-web grounding (7.5% → 2.5%),
both below the untrained base's 20%.** Textbook catastrophic forgetting — the
base already knew how to read the open web; synthetic-only training overwrote it
with shop habits.

**We only caught this because of eval design.** The Mind2Web row exists to catch
exactly what held-out-but-in-distribution eval cannot. A team without it would be
celebrating 100% in-distribution scores while their model quietly lost the open
web.

### The forgetting *gradient*, in one model (SFT-9B-v2)
- **In-distribution** (v2 slice): 100% valid / 100% recall / 100% task-match.
- **Near-OOD** (megashop distractor test): **perfect** candidate set retained —
  both earbuds incl. the cheapest $34.50 Volt Pods. The 9B family is the *only*
  one that solves this.
- **Far-OOD** (Mind2Web real web): eroded (10% valid / 7.5% strict).

A clean distance-from-training-distribution gradient, measured on one model.

---

## 4. Method ablation — did we even need labels?

Same eval slice, full-task match:

| method | full-task match | labels used |
|---|---|---|
| base zero-shot | ~0% | none |
| **OPD** (distilled from GLM-5.2) | **83.3%** | **none** |
| SFT v0 (gold only) | 65%* | 823 |
| SFT v1 / v2 | 100% | 1,546 / 2,220 |
| GRPO (RL) | see §5 | reward only |

\*v0's 65% measured OOD on this slice; OPD's 83% is also OOD — a fair comparison.

**Answer to "did we need labels?": no for the first 83 points, yes for the last
17.** Distillation alone (zero labeling effort) gets most of the way; verified
labels buy the final gap.

---

## 5. GRPO (RL) — two failures, one instructive

- **GRPO-4B: failed by accident.** Training completed, but the adapter artifacts
  were corrupted during upload (platform-side HTTP error after a CUDA-OOM retry).
  Never evaluated — says nothing about RL. A $1.77 re-run if ever wanted.
- **GRPO-9B: failed by config error — the interesting one.** Trained, deployed,
  and came out **worse than its starting point** (100% → 15% on its own
  distribution; Mind2Web 0/0/0). Autopsy: the prompt pool was the **full training
  corpus** — prompts the init already solved ~100%. GRPO learns from *advantage
  within a group of attempts*; if every attempt succeeds, advantage is zero and
  there is nothing to learn → 150 steps of gradient were sampling noise, and the
  policy drifted into corrupted selectors.

  The bitter part: our own decision log (D11) already said *"prompt pool = tasks
  in the 20–70% success band"* (AutoWebGLM's published lesson). The rule was
  written; the config ignored it. **RL didn't fail — the experiment design did,
  exactly as the literature and our own notes predicted.** Fix for any future
  GRPO: build the pool only from tasks the init half-solves.

---

## 6. The fix in progress — same data as the open-source models

The corrective experiments, running as of this writing:

- **SFT-4B-v3** — mixed corpus, Mind2Web-train rows 3× upsampled (~17% real-web).
  Pre-registered success criterion (written *before* the result): **validity
  stays ≥27% AND strict accuracy recovers toward the base's 20%.**
- **SFT-4B-v4** — the **full Mind2Web train split** (~3,500–4,000 validator-passed
  rows, ingested deterministically at zero LLM cost) mixed with our corpus. This
  is the "eat the same food as the leaderboard" run — MindAct trained on this
  exact split.

v3 (156 rows) vs v4 (full split) becomes the **first data-scaling curve**: how
much real-web accuracy each increment of real-web data buys — the same curve
every published model climbed.

---

## 7. Owned honestly

**What we did wrong:** we sequenced real-web data *last* (defensible, but it's
why the Mind2Web number is late), and the first GRPO violated our own prompt-band
rule.

**What is *not* wrong:** the architecture, the recipe lineage, and the harness —
Gemini scoring 35% through our exact pipeline proves the pipeline; the pretrim's
95% gold-survival proves the input path. The gap was **data we chose not to feed
it yet**, and the fix is training now.

**Why this is a better pitch, not a worse one:** *"we measured our own fine-tune
suppressing base knowledge, then fixed it with data mixture — here's the curve
going down and coming back"* is a more credible story than an unbroken string of
100%s, and every point on that curve has a receipt.

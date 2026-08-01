# Freesolo Flash — platform playbook

Compiled 2026-07-18 from https://freesolo.co/docs (machine-readable index: /docs/llms.txt).
Facts below are from the docs unless marked **VERIFY** — those are unpublished and must be checked
against the real platform in the first session.

## Setup status: DONE (2026-07-18)

- **The CLI does not run on native Windows** (v1.0.1 imports the Unix-only `fcntl` module, and PyPI
  pins Python >=3.11,<3.13 while the machine default is 3.13). It is installed and logged in inside
  **WSL Ubuntu** instead, in a venv at `~/.flash`.
- Invoke it from Windows as: `wsl -d Ubuntu -- ~/.flash/bin/flash <command>`
  (or open a WSL shell and alias `flash=~/.flash/bin/flash`). The repo is reachable from WSL at
  `/mnt/c/Users/idide/AgentView` for `flash env push`.
- Login verified (`flash whoami` OK), model catalog confirmed identical to the researched list, and
  `flash runs` answers — org API access works. **The $50 starter credit still requires a card on
  file, added via the freesolo.co website, not the CLI.**
- **Verified GPU rates** (allocation is fully automatic — the submitter picks the cheapest class
  that fits, you don't pin one): RTX 4090 $0.69/hr · RTX 5090 $0.99 · A100 PCIe $1.39 · A100 SXM
  $1.49 · RTX Pro 6000 $2.09 · H100 $3.29 · H200 $4.39 · B200 $5.89.
  At A100 rates, the expected 1.5–3h SFT run costs roughly **$2–5** — the "$12 pre-quoted" homepage
  figure is consistent with a larger run on a faster class.
- Full CLI surface (from `--help`): version, login, whoami, models, gpus, env, train, status, log,
  runs, cancel, **checkpoints** (deployable per-step RL checkpoints — useful for GRPO), deploy,
  undeploy, **export** (adapter → your own HuggingFace repo — useful for the judging artifact),
  deployments, chat.

## What it is

Freesolo (YC Spring 2025) sells "Flash": managed post-training of small open models. You bring a
dataset (or a reward function), pick a catalog base, get a LoRA adapter and an OpenAI-compatible
hosted endpoint. Pricing is pre-quoted and deterministic (`flash train config.toml --cost` computes
the exact price locally, free). Their own pitch is literally our pitch: "a sub-10B model tuned on
your data beats a frontier model on your task."

## The three algorithms (all available on every catalog model)

| Algorithm | What it needs | Our use |
|---|---|---|
| **SFT** | (input, output) pairs | Pass 1: bulk + spine tiers |
| **GRPO** | prompts + a Python reward function (`score_response()`) | Pass 2: the RFT tier, as true on-policy RL — no manual generate-filter-retrain loop needed |
| **OPD** (on-policy distillation) | prompts only + a managed teacher (glm-5.2 default, deepseek-v4-pro, kimi-k2.6) | Optional pass: data-free polish on the same prompt pool. **Gemini is NOT an OPD teacher** — it stays our offline bulk-tier labeler |

GRPO warm-starts from the SFT adapter via `init_from_adapter = "<sft-run-id>"` (omit
lora_rank/lora_alpha when warm-starting). This is exactly our SFT → RFT sequence, platform-managed.

## Model catalog and the constraint that binds us

Qwen3.5-0.8B / MiniCPM5-1B / Qwen3.5-2B (max LoRA rank 128), Qwen3.5-4B / 9B (max rank 64),
Qwen3.6-35B-A3B (4096 ctx). ~~Every sub-10B model caps context at 8,192 tokens~~ —
**UPDATE (2026-07-18, verified server-side): sub-10B context raised to 32,768.** `--cost` and
`--dry-run` accept `max_context_tokens = 32768` on client 1.0.1 (no package update was actually
required; the cap is server-side — PyPI still ships 1.0.1). **Catch, measured in the quote:** long
context inflates VRAM and jumps the GPU class — 0.8B at 32k quoted on a **B200 @ $5.89/hr**
(needs ≥155 GB) vs A100 @ $1.39/hr at 8k. At 5–10k-example scale, sequence length is now the main
cost lever. Hence the two-tier budget in pretrim.js: soft target **12,000** tokens page+goal for
most examples, hard gate **28,000** for a deliberate ~15% long-page slice and big real-web eval
pages (D3).

Serving prices per 1M tokens (prompt / completion / cached-prompt):
0.8B & 1B $0.012/$0.06/$0.0024 · 2B $0.024/$0.12/$0.0048 · 4B $0.036/$0.18/$0.0072 · 9B $0.12/$0.18/$0.024.
Prefix caching is automatic — our template already puts the static system prompt first, so eval
re-runs bill most prompt tokens at the ~5x cheaper cached rate.

## Dataset format (exact, enforced)

NOT chat JSONL. Each row is canonicalized to exactly three keys; alternate names are **rejected**
and extra top-level keys are **silently dropped**:

```json
{"input": "<system+goal+page prompt>", "output": "<AgentView JSON string>", "metadata": {"tier": "bulk", "source": "parametric", "seed": 1234}}
```

`metadata` is where tier/source/seed provenance survives (mirrors our MongoDB row). Files:
.jsonl/.json/.csv/.txt/.bson, pushed via `flash env push` inside a Python environment package
(64 MB compressed / 256 MB uncompressed cap).

## Structured outputs — use this

`structured_outputs = {json = <agentview.schema.json>}` grammar-constrains GRPO/OPD **rollouts** and
becomes the deployed adapter's **serving default** (overridable per-request via OpenAI
`response_format`). With `disable_additional_properties`, malformed JSON becomes impossible at
decode time — the validator then only rejects on selector/grounding semantics, which is exactly the
signal we want RFT to learn from. SFT rejects the key at submit (it never samples), but the deployed
SFT adapter still accepts `response_format` at serve time.

## GRPO reward = our validator, ported

Rewards are a Python class (`flash env setup` scaffolds it) with `score_response()` returning a
RewardResult. Environments are Python with pip-declared deps; **VERIFY: Node.js availability in
reward workers is undocumented** — assume no. Therefore: port the validator's checks to Python
(lxml + cssselect or selectolax) for the reward path; jsdom stays the offline data-filtering
authority. Reward shape: schema-valid (free via guided decoding) + selectors resolve uniquely +
grounding checks + (spine tasks) success predicate.

## The full command sequence

```bash
pip install freesolo-flash
flash login --api-key <org-key>
flash env setup            # scaffold environment (dataset + reward)
flash env push             # upload dataset/environment
flash train config.toml --cost     # free deterministic quote — ALWAYS run first
flash train config.toml --dry-run  # validate config
flash train config.toml            # submit; monitor: flash status <run-id> --follow
flash deploy <run-id>              # smoke-tested, atomic; OpenAI-compatible endpoint
flash deployments --json           # get openai_base_url; model name = run-id
flash chat <run-id>                # quick manual test
flash undeploy <run-id>            # stop token billing after eval
```

Config knobs (TOML): `lora_rank` (default 32), `lora_alpha` (default 64), `learning_rate`
(default ~1e-4), `batch_size` (~8), `epochs` + required `max_examples` for SFT; GRPO adds
`group_size` (≥2), `temperature`, `kl_penalty_coef`, `max_completion_tokens` (**default 512 — too
small for our JSON; raise to ~2,000**), `stop_sequences`. Override inline:
`flash train config.toml --set train.lora_rank=16`.

## Money

Prepaid org balance; **one-time $50 starter credit after a card is on file**; top-ups $50–$10k.
Training bills = billable training hours × GPU rate (setup free, charged only on successful
completion; cancelled runs repriced to steps reached). Homepage example: "$12 pre-quoted" per run —
so the starter credit plausibly covers ~2–4 real runs. **VERIFY: hackathon credits, per-team
quotas, GPU $/hr (only revealed by `--cost`).**

## MEASURED (smoke run flash-1784358075-7999e3c4, 2026-07-18)

The Stage A smoke slice ran end-to-end: 19 validator-passed examples → Qwen3.5-0.8B SFT →
deploy → harness inference → validator PASS on a trained goal.
- **Queue: 12 seconds** (vast.ai A100 SXM allocated instantly). Setup ~5 min (unbilled).
  Training 8 steps in ~40 s. **Total submit→done: 6.4 min. Billed: $0.0088.**
- **Deploy: ~1 min** to state `deployed`; OpenAI-compatible at
  `https://clado-ai--freesolo-lora-serving.modal.run/v1`, model = run-id, auth = the org
  `fslo_` key as Bearer. Inference ~3–4 s/call on the 0.8B.
- **The org key is pre-funded** (`ht6-team` hackathon org): the run was accepted with no card on
  file. The $50-starter-credit question is moot.
- **Degeneration confirmed real** (D17 vindicated): on an unseen goal the 19-example adapter
  looped `"actions"` blocks to the token cap; `repetition_penalty: 1.08` (vLLM extension param,
  accepted by the endpoint) stopped it. Keep D17's decode settings pinned in every harness call.

## Time budget (pre-measurement estimates below; smoke numbers above supersede the queue guess)

Token math: cost ≈ examples × avg_seq × epochs. At our 8k cap, 1,500 examples × ~8k tok × 2 epochs
≈ 24M training tokens. Public anchors: ~2.5–3k tok/s per A100 (~5–6k per H100) for 7-8B LoRA at 8k
seq (LongLoRA Table 12, arxiv 2309.12307; VESSL benchmark).

| Step | Optimistic | Expected | Pessimistic |
|---|---|---|---|
| Smoke run (20 ex, 0.8B/2B) | 10–20 min | 30–60 min | 2 h (platform friction) |
| SFT, 1,000–1,500 ex, 1–2 epochs, 4B | 45–90 min | 1.5–3 h | 5–8 h |
| Deploy adapter | ~2 min | 5–15 min | 1 h |
| Eval: ~150 calls, concurrent | 5 min | 15–35 min | 1–2.5 h (sequential/rate-limited) |
| GRPO pass (training itself) | 30 min | 1–2 h | 6 h+ — **rollouts, not gradients, dominate; Playwright verification must be parallelized** |

Planning rules already in DECISIONS.md D10: final training run launches with ≥40% of the event
remaining; GRPO/RFT runs only if the SFT adapter beats base zero-shot on held-out by the two-thirds
mark; single-run fallback = SFT on bulk + spine (spine upsampled ~5x).

## Sequencing on the platform (recommended)

1. **Hour 0–1:** claim credit, `--cost` quote, smoke slice: 20 examples → 0.8B or 2B SFT →
   deploy → 1 eval call through the frozen harness. This measures the true critical path.
2. Validate pipeline end-to-end on **Qwen3.5-2B** (cheap, rank up to 128).
3. Demo model: **Qwen3.5-4B** (9B only if `--cost` and clock allow) — capture base zero-shot on
   held-out first.
4. SFT (bulk + spine, metadata-tagged) → deploy → eval → if gate passes, GRPO warm-start with the
   Python reward.

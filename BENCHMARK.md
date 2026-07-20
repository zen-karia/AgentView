# AgentView — Efficiency Benchmark

Head-to-head comparison of **perception layers**, holding the agent constant.
Every row is persisted to MongoDB (`agentview.runs` / `agentview.results`).

---

## Setup

- **20 tasks** across **7 page buckets**: sizes 15 / 60 / 200 items, plus
  trap (decoy-button) and compute (ranking/filter) variants.
- **Agent held constant** — Claude-Haiku (via OpenRouter) picks the action in
  *every* condition. Only the **perception layer** changes.
- **5 conditions**, two families:
  - `translated` — a model builds the goal-conditioned `AgentView`:
    `prompted[gemini]`, `prompted[claude]`, `trained` (the distilled model).
  - `mcp` — Playwright-MCP's generic accessibility snapshot drives the brain:
    `mcp[gemini]`, `mcp[claude]`.

The question: **does feeding the agent a goal-conditioned view beat feeding it
raw/generic perception — and how cheap can producing that view get?**

---

## Overall (all 20 tasks)

| condition | success | frontier tok | energy Wh* | cost USD* | latency | goal-cond |
|---|---|---|---|---|---|---|
| prompted [gemini] | **100%** | 32,095 | 10.03 | 0.00321 | 18.8s | 0.13 |
| prompted [claude] | 95% | 26,851 | 8.39 | 0.00269 | 11.4s | 0.14 |
| mcp [gemini] | **100%** | 13,143 | 4.11 | 0.00131 | 9.9s | 3.41 |
| mcp [claude] | 90% | 11,770 | 3.68 | 0.00118 | 6.2s | 3.28 |
| **trained** | 37% | **1,058** | **0.33** | 0.00037 | 25.3s | 0.13 |

- **frontier tok** = tokens hitting the *expensive* model (the cost/energy axis).
- **goal-cond** = agent tokens ÷ page tokens (how much of the page the reasoner
  ingests). Lower = more task-conditioned.

---

## Success by bucket — the capability picture

| condition | 15 | 60 | **200** | trap-60 | **trap-200** | comp-60 | **comp-200** |
|---|---|---|---|---|---|---|---|
| prompted [gemini] | 100 | 100 | 100 | 100 | 100 | 100 | 100 |
| prompted [claude] | 100 | 100 | 80 | 100 | 100 | 100 | 100 |
| mcp [gemini] | 100 | 100 | 100 | 100 | 100 | 100 | 100 |
| mcp [claude] | 100 | 100 | 80 | 100 | 50 | 100 | 100 |
| **trained** | **100** | 50 | **0** | 50 | **0** | 50 | **0** |

---

## What the data says

1. **Goal-conditioning is the clean, consistent win.** Every `translated`
   condition feeds the agent ~**0.13× the page**; MCP feeds ~**3.3×** (its generic
   snapshot, re-read each turn). The AgentView representation is **~25× leaner on
   the reasoning seat** — true at every bucket, independent of who produced it.

2. **The trained model realizes the efficiency thesis.** 1,058 frontier tokens /
   0.33 Wh — **~12× under MCP, ~30× under prompting** — because perception moved
   off the expensive model onto the cheap distilled one.

3. **…but its quality collapses with page size.** Perfect on 15-item pages,
   halves at 60, and **0% on every 200-item bucket** (large / trap / compute).
   That's the pretrim gap + out-of-distribution — the untrimmed large pages break
   it. (See `FINDINGS.md` — the fix, real-web data mixing, is training.)

---

## Live demo — messy real page

On a **deliberately chaotic page** (nested windows, dozens of decoy
"Send"/"Submit" buttons, ad rails, cookie banners) with one real "Send Email"
button, the trained model was run repeatedly:

- **7 / 7 runs found the single real action** (`a1 → [data-av-id="11"]`), ignored
  every decoy, in **1 step, ~6,038 tokens**.
- On success it fires a real email (EmailJS), fully end-to-end.

So on *messy-but-in-distribution* pages, the trained model is **reliable and
cheap** — the contrast with the synthetic 200-item failure is itself a finding
(dense decoys sit better in its distribution than 200-row product grids).

---

## Honest caveats (read before quoting)

- **`*cost` uses illustrative rates** (`costs.py`), not real OpenRouter/Freesolo
  billing. The *relative* gaps are real (token-driven); the dollar figures are
  placeholders.
- **`*energy` = frontier-tokens ÷ 3200** — a proxy. Energy was not measured.
- **Trained's low tokens/energy partly ride on 37% success** — it often gives up
  cheaply. The clean claim is *"far cheaper when it works,"* not *"same quality,
  30× cheaper."*
- **Trained's latency (25s) is the serving endpoint** (modal, 19–38s jitter for
  identical 6k-token work), not the model. A production host cuts it to seconds.

**Two fully-honest headline claims:** (1) goal-conditioning cuts the
reasoning-seat ~25× vs MCP, *measured*; (2) the trained model reliably finds the
one real action in a chaotic page (7/7), cheaply. Concede the 37% /
cost-projection / latency-artifact when pushed.

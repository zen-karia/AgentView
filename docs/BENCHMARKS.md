# Public benchmarks — what fits, what it costs, what to compare against

Surveyed 2026-07-18 (sources per row). Two families: **static datasets** (score the translator
alone, no browser) and **live environments** (score translator + driver agent + Playwright,
end-to-end). Our contract quirk everywhere: we emit CSS selectors, benchmarks label elements — the
scoring trick is to resolve our selector against the benchmark's provided DOM and compare the hit
to their labeled element.

## The ladder (effort → credibility)

| Priority | Benchmark | Type | Setup | Why |
|---|---|---|---|---|
| 1 | **Mind2Web** (via Multimodal-Mind2Web) | static | 2–6 h | Near-exact contract match; the judge-recognized number |
| 2 | **SWDE** | static | 0–2 h | Tests the `relevant_content` half; an afternoon |
| 3 | **MiniWoB++** | live | 0–2 h | Cheapest live end-to-end sanity number |
| 4 | **REAL (agisdk)** | live | 2–6 h | 2025-era, hosted (no Docker), frontier caps ~41% — headroom; best source of third-party held-out pages (D8) |
| 5 | WebArena-Lite | live | days | Headline credibility (WebRL 42.4% vs GPT-4-Turbo 17.6%) — only if the Docker lift fits the schedule |
| — | WebSRC, WebLINX, WebShop, WebChoreArena, ST-WebAgentBench | mixed | 2 h–days | Secondary/stretch; see notes |

## 1. Mind2Web — the primary static number

- **What**: 2,350 tasks / 137 real websites; per step: `raw_html` + `cleaned_html` snapshot,
  operation (CLICK/TYPE/SELECT — literally our taxonomy), gold element as `backend_node_id` with
  `pos_candidates`. Metrics: Element Accuracy, Operation F1, Step Success Rate. Three splits:
  cross-task / cross-website / cross-domain.
- **Access**: the original HF test splits are gated; use **osunlp/Multimodal-Mind2Web** — public
  test splits WITH the HTML fields (test_task 1,339 actions/177 tasks; test_website 1,019/142;
  test_domain 4,060/694; OpenRAIL). Text-DOM compatible; screenshots optional. Cite numbers as
  "on the Multimodal-Mind2Web test alignment."
- **How we score**: the provided HTML embeds `backend_node_id` attributes → resolve our
  `target_selector` (lxml+cssselect or jsdom), take the hit's backend_node_id, count Element
  Accuracy if it's in `pos_candidates`; map kind/value_hint → Operation F1; both → Step SR.
  Non-unique selectors score as failures (our contract is stricter — stay honest).
- **Adaptations**: (a) pages average 1,135 raw elements — run our pretrim and **report its
  pos-candidate recall separately** (MindAct's own cleaning kept 94.7%; ours is doing the same job,
  so this is a fair, comparable stage); (b) step history is fed as a text prefix of prior action
  strings — fold into the goal line, benchmark-mode template variant, documented.
  **Note (2026-07-18): Flash's context raise to 32k largely defuses the truncation worry** — most
  cleaned Mind2Web/REAL pages now fit the 28k hard gate after pretrim, so trim-recall should be
  high rather than the binding ceiling. Still report it.
- **Compare against**: MindAct Flan-T5-XL (3B FT): 55.1 EleAcc / 52.0 StepSR cross-task,
  42.0/38.9 cross-website. GPT-4 (MCQ prompting): 36.2/30.1/26.4 StepSR. GPT-3.5: 17.4/16.2/18.6.
  ScribeAgent Qwen2-7B-LoRA direct-generation: 26.8/25.6/29.9 (32B: 35.6/32.5/37.3).
  → "Fine-tuned small beats prompted frontier" is the *established pattern* here; our job is to
  reproduce it with a 4B under a stricter grounded contract. (arxiv 2306.06070; 2411.15004)
- **Rule**: eval-only. Never train on any split (D6/D8).

## 2. SWDE — the extraction number (relevant_content)

124,291 real pages, 80 sites, 8 verticals, 32 attributes; ground truth = attribute value strings.
Goal = "extract the <attribute> of this <entity>" → our `relevant_content`. Score: string-match F1
(official) + our stricter selector-resolves-and-text-matches variant. Pages are 2009–2011-era
messy markup — on-thesis. HF subset: hazyresearch/based-swde. Anchors: MarkupLM-class supervised
models ≈ low-90s page-level F1 (verify exact from arxiv 2110.08518 before citing).

## 3. MiniWoB++ — first live number

pip install (Farama-maintained or `browsergym-miniwob`); 100+ widget tasks, deterministic JS
reward, 50–100 episodes/task. Tiny pages (pretrim is a no-op) → isolates translator quality from
trimming. Use the 56-task HTML-T5/AutoWebGLM protocol for comparability: **AutoWebGLM 89.3%,
HTML-T5-XL 85.6%, GPT-4 32.1%** (arxiv 2404.03648, 2307.12856). Exclude drag/timing tasks our
click/type/select vocabulary can't express; disclose.

## 4. REAL — the modern live benchmark + our third-party held-out source

112 tasks on deterministic React/Next.js replicas of 11 real sites (Amazon, DoorDash, Airbnb,
Gmail, LinkedIn, Zillow clones...). `pip install agisdk`, sites are **hosted by them** — zero
Docker. Action tasks scored by deterministic state checks (report these separately from the
LLM-judged retrieval tasks). Frontier ceiling at launch: **Claude 3.7 Sonnet (thinking) 41.1%**
(arxiv 2504.11543; leaderboard realevals.xyz — recheck current top before citing). Modern messy
React DOMs the model never trained on → the sharpest way to satisfy D8's "≥2 held-out tasks on
pages we did not generate," better than static Mind2Web snapshots because success is executable.

## 5. WebArena-Lite — stretch headline

165 human-verified tasks, same 5 self-hosted Docker apps as full WebArena (16 GB+ RAM box, big
disk, GitLab boot pain, reset discipline). Only worth it multi-day. The comparison that writes the
pitch: **WebRL Llama-3.1-8B 42.4% vs GPT-4-Turbo 17.6%** (arxiv 2411.02337). Caveat: WebArena
grids are where our unique-selector contract and 5.5k budget will be most stressed — measure
trim-recall first.

## Integration note

**BrowserGym/AgentLab** (ServiceNow) wraps MiniWoB++, WebArena(-Lite), VisualWebArena, WorkArena,
WebLINX behind one Gym API with raw DOM/HTML observations and lets the agent own its observation
processing — one adapter = our pretrim→translate→drive chain plugged into several benchmarks.
Impedance: BrowserGym addresses elements by injected `bid`; we execute our own selectors through
the underlying Playwright page handle instead (supported).

## Honesty rules for all of it

1. The current smoke adapter will score ~0 on all of these — benchmarks become meaningful after
   Stage B/C. Run **base zero-shot, Gemini, and the a11y-snapshot arm through the same benchmark
   harness now** so the "before" rows exist.
2. Always report our pretrim's gold-element recall alongside any Mind2Web/WebArena number — it is
   the honest ceiling and itself a demo stat.
3. Never let benchmark pages leak into training. Tag any benchmark-derived rows in Mongo as
   `source: mind2web|real|...`, `tier: heldout`.

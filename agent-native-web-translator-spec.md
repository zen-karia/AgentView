# Agent-Native Web Translator - Project Spec

Build spec for Hack the 6ix 2026. Written so an agent (Claude Code) can build directly from it, and so the team can lift sections into the Devpost writeup.

---

## 1. One-liner

A Freesolo-trained model that converts a human-facing webpage plus an agent's current goal into a compact, agent-legible representation (relevant content, available actions, and action schemas), proven by a live demo where an agent completes tasks faster and more reliably using the translated view than the raw page.

---

## 2. Thesis (for the pitch, not the code)

The web is built for human eyes. Agents waste effort parsing visual HTML meant for people. This lands on YC's "Software for Agents" thesis, the next wave of internet users are agents, not humans.

Existing tools (llms.txt, Firecrawl, Jina Reader) translate page *content* statically, and they do it the same way regardless of what the agent is trying to do. This project goes further in three ways that matter.

- Task-conditioned. The translation depends on the agent's current goal, not just the page.
- Action-aware. The output includes the actions available on the page plus their parameter schemas, not only readable content.
- Outcome-trained. The model is trained on whether agents actually succeed, not on imitation of clean text.

Each of those three exists somewhere in isolation. The specific combination is the wedge.

---

## 3. Honest positioning (read before pitching)

The category is not new. Page-to-agent translation ships today. Do not claim "nobody does this." Claim the narrow, true thing.

- Say this. "Firecrawl and llms.txt translate content statically. This is task-conditioned, includes actions, and is trained on agent task success."
- Verify first. Confirm the current capabilities of Firecrawl, Jina Reader, and llms.txt at the event before putting any claim about them in the pitch or Q&A. A judge who knows the space will catch an overclaim.

Uniqueness is the soft criterion for this project. The win comes from executing a known-valuable idea with a trained model and a legible demo, not from the category being untouched.

---

## 4. Hard scope (do not exceed)

Completeness is the criterion most likely to lose points. Scope down so the project is genuinely finished.

- Sites. 3 to 4 fixed, self-hosted demo sites only. A mock e-commerce page, a multi-field form, a docs or search page. No live open-web scraping.
- Tasks. Roughly 15 to 20 tasks, each with a programmatically checkable success condition.
- Models. One small model (the trained translator) plus one large model (teacher and baseline, Gemini).
- Agent. An off-the-shelf ReAct-style loop used as a test harness. Not trained, not elaborate.
- Deliverable form. A single-page web dashboard. Not a browser extension.

If a feature is not on this list, it is out of scope until everything here works.

---

## 5. Architecture

```
[Demo site, self-hosted]
    -> raw HTML/DOM
[Translator model]
    -> (page + agent goal) -> AgentView JSON
[Agent harness, ReAct loop]
    -> uses AgentView -> dispatches actions to the site
[Verifier]
    -> checks task success -> writes to MongoDB
[Dashboard]
    -> reads logs -> renders 3-panel live UI
```

Components.

1. Demo sites. 3 to 4 simple sites hosted locally (React or plain HTML). Each exposes deterministic state so success is checkable.
2. Translator. The model under test. Layer 0 is prompted Gemini. Layer 1 is the Freesolo-trained small model.
3. Agent harness. A ReAct loop (Backboard or a minimal custom loop). Given a task and a view (raw or translated), it attempts the task and emits actions.
4. Verifier. A deterministic check per task. Did the site reach the target state, or return the right data. Emits pass/fail plus step count and token count.
5. Logger. Writes every run to MongoDB.
6. Dashboard. Three panels. Raw page, translated AgentView, and a live agent runner with a raw-versus-translated toggle. Auth0 on login.

---

## 6. Data contracts

Translator input.

```json
{
  "goal": "Add the cheapest blue shirt to the cart",
  "page": {
    "url": "http://localhost:3001/shop",
    "html": "<raw html>",
    "text": "<extracted text>"
  }
}
```

Translator output, the AgentView.

```json
{
  "summary": "Product listing page, 12 items, filterable by color and price",
  "relevant_content": [
    { "id": "p1", "text": "Blue shirt, $19", "meta": { "price": 19, "color": "blue" } }
  ],
  "actions": [
    {
      "name": "add_to_cart",
      "description": "Add a product to the cart",
      "params": { "product_id": { "type": "string", "required": true } },
      "target_selector": "#add-{product_id}"
    }
  ]
}
```

Run log written to MongoDB.

```json
{
  "task_id": "t07",
  "condition": "translated | raw | markdown_baseline",
  "model": "gemini | trained",
  "success": true,
  "steps": 3,
  "tokens": 1840,
  "latency_ms": 2200,
  "timestamp": "2026-07-19T14:22:00Z"
}
```

---

## 7. Freesolo training plan

The three training styles are the same pipeline at increasing strength, run over the logs from Layer 0. Ship after whichever pass is reached. The verifier is the reward function, so build and trust it early.

### Pass 1, SFT (supervised fine-tuning). The floor, always ship this.

- Data. Run Layer 0 (Gemini as translator) across all tasks. Log every (input -> AgentView) pair where the agent succeeded.
- Train. SFT the small model on those successful pairs. It learns the AgentView format and the basic keep-and-surface behavior by imitation.
- Result. A small model that produces valid, useful AgentViews on its own. A legitimate Freesolo submission on its own.

### Pass 2, Distillation. Unlocks the cost story.

- Adds over SFT. Gemini is the explicit teacher, the small model is the student, and the student is trained to match the teacher across many more pages, including auto-generated ones, not only the demo tasks.
- Data boost. Have Gemini generate extra (synthetic page + goal -> AgentView) examples to widen coverage cheaply.
- Result. The small student matches Gemini quality at a fraction of tokens, cost, and latency. This is the Deloitte Green AI number. Measure it and show it.

### Pass 3, Rejection-sampling fine-tuning. The realistic RL, the ceiling.

- Adds over distillation. Optimizes for agent success, not imitation. This is the outcome-trained part that makes the project distinctive.
- Loop.
  1. Run the current small model to produce AgentViews for each task.
  2. Run the agent on them. The verifier returns pass/fail plus step and token cost.
  3. Keep only the AgentViews that led to success, with extra weight on low-step and low-token wins.
  4. SFT on that filtered set.
  5. Repeat for a few rounds.
- Framing for Q&A. Call this "reward-weighted rejection sampling", the same objective as RL without unstable online policy-gradient training. Accurate and defensible. Do not call it PPO.
- Result. Accuracy and step-count improving across rounds, a curve to show on stage.

### Do not do

- No online PPO or policy-gradient RL. Unstable, will not converge in 36 hours, kills completeness.
- No separate process reward model. Over-scoped. The deterministic verifier is the reward.

### Robustness note

Worst case, if Freesolo exposes only a plain fine-tune endpoint, all three passes still work, because distillation and rejection sampling both reduce to SFT on a cleverly chosen dataset. Verify the exact Freesolo API surface at the event.

---

## 8. Freesolo capability coverage

Six capabilities, tiered by how central and how honest each claim is.

Core, the pitch stands on these.
- SFT. The backbone of every pass.
- Distillation. Gemini teacher to small student. Drives the cost story.
- RL as rejection sampling. Outcome-trained, the uniqueness claim.

Strong free value, lean in.
- Eval tooling. The verifier plus the three-lane benchmark harness is a real agent eval suite. Package it as a first-class feature. Strengthens completeness and the Warp dev-tool angle.
- Multi-turn. The agent completes tasks over multiple turns, and the reward lands at the end of the trajectory, so this is genuine multi-turn credit assignment. Freesolo supports multi-turn directly.

Present but light, use without overselling.
- Deploy. The trained model is served behind an API for the dashboard. Table stakes, not a differentiator. Mention it plainly.

Every claim must map to something real in the repo. A Freesolo judge knows the difference between using a technique and name-dropping it.

---

## 9. Build order

Layer 0 before Layer 1 is non-negotiable. The trained model is an upgrade, never a dependency the demo needs to survive.

Phase 0, scaffold.
- Repo, host one demo site, define the AgentView schema, write 5 tasks and their verifiers.

Phase 1, Layer 0 (working system, prompted Gemini).
- Gemini translator to AgentView. Agent harness consumes it. Verifier and MongoDB logging. End to end on one site, visible in a terminal. This is the safety-net demo.

Phase 2, dashboard.
- Three-panel UI with a fake-data mode first, then wired to real logs. Raw-versus-translated toggle. Auth0.

Phase 3, scale content.
- Add the remaining sites and the full task set of 15 to 20.

Phase 4, Layer 1 (Freesolo).
- Generate training data from Phase 1 logs. SFT the small translator. Distill from Gemini. Swap the trained model in behind a flag. Benchmark trained versus Gemini versus raw.

Phase 5, proof and polish.
- Rejection-sampling pass. Pull cost, token, and step deltas. Lock the demo task set so divergence is reliable. Record the video, push the public repo, write the Devpost.

Fallback rule. If behind, ship Phase 1 through 3 (Gemini translator). Still complete and demoable.

---

## 10. Hour plan (about 36 hours, 9:30pm Fri to 9:30am Sun)

- H0 to 3. Pick datasets, host one demo site, set up the gateway and both model connections, define AgentView.
- H3 to 8. Layer 0 end to end in a terminal. Core exists.
- H8 to 14. Three-panel dashboard, fake data first, then real logs. Auth0.
- H14. Placeholder Devpost submission is due before 11:59pm Saturday. Set an alarm. Name the tracks.
- H14 to 22. Generate training data from Layer 0 logs. SFT the small translator. Swap behind a flag. Benchmark.
- H22 to 26. Distillation pass and rejection-sampling pass. Pull the cost and energy numbers. Build the improvement curve.
- H26 to 30. Polish the dashboard. Lock the demo task stream so the divergence happens on cue.
- H30 to 34. Record the video demo. Push the public GitHub repo. Write the Devpost writeup.
- H34 to 36. Rehearse the 3-minute demo. Drill the Q&A answers.

---

## 11. The demo

Three lanes, same task, same site.
- Lane A. Agent on the raw human page. Fumbles, many steps, misreads the UI.
- Lane B. Agent on a generic markdown dump. Better, but drowns in irrelevant content.
- Lane C. Agent on the task-conditioned AgentView. Succeeds in the fewest steps.

Live meters. Success rate, step count, token count per lane. The middle panel shows the translation so a judge sees what was stripped and what was surfaced. Watching an agent fail on the human page and then succeed on the agent-native view is the moment that carries the pitch.

---

## 12. Sponsor tracks

- Freesolo. The trained translator. Core.
- Warp. A dev tool for agent builders, plus the eval harness. Strong.
- Backboard. The agent harness and orchestration. Medium.
- Deloitte, Green AI. Fewer tokens per agent step, measured, demonstrated not claimed. Strong.
- Gemini (MLH). Teacher and baseline. Real use.
- MongoDB (MLH). Logs and training data. Free add.
- Auth0 (MLH). Login. Free add.

Do not force ElevenLabs, Presage, or the payment tracks. They would read as bolted on.

---

## 13. Criteria self-assessment

- Technical difficulty. Strong. A trained model across SFT, distillation, and reward-filtered passes on multi-turn trajectories. The harness and hosting are off-the-shelf, the intelligence is trained.
- Uniqueness. Soft. The category ships already. The task-conditioned, action-aware, outcome-trained wedge is the only defensible claim, and it is subtle. Name the prior art, state the difference precisely.
- Design. Strong. The three-panel dashboard makes the invisible translation visible, and the demo is legible and visceral.
- Completeness. At risk from the number of parts. Controlled entirely by the Layer 0 first discipline and the hard scope.

Honest read. Strong on three criteria, soft on uniqueness, completeness-dependent. A competitive overall showing and a strong Freesolo, Warp, and Deloitte profile. Not a uniqueness favorite, because no agent-infra idea is.

---

## 14. Q&A prep (2 minutes, scored)

- "Isn't this Firecrawl or llms.txt?" Those translate content statically. This is task-conditioned, includes actions, and is trained on agent success. Verify their real capabilities before pitching.
- "How much are libraries doing?" The harness and hosting are off-the-shelf. The translator policy is trained by the team.
- "Does the trained model beat Gemini?" It matches quality at lower cost and fewer tokens. Point at the benchmark.
- "Is this really RL?" Reward-weighted rejection sampling, the same objective as RL without unstable online training.

---

## 15. Stack

React single-page app. Node or Python backend. Translator behind an API. MongoDB. An off-the-shelf ReAct agent. Self-hosted demo sites. Auth0.

---

## 16. Rules and logistics

- All code must be written during the hacking period, which starts 9:30pm Friday.
- A placeholder Devpost submission is required before 11:59pm Saturday to name prize tracks. Editable until 9:30am Sunday.
- A public GitHub repo and a video demo are required.
- The pitch is a live demo. No slides. 1 minute setup, 3 minutes pitch, 2 minutes Q&A, 1 minute feedback.
- Only one HT6 track may be entered (game, beginner, or environmental). This project fits none cleanly, so target overall plus sponsor tracks and skip the HT6 track.

---

## 17. Risks, blunt

- Completeness is the real threat, not the idea. Guard the Layer 0 boundary. A working Gemini version beats a half-trained Freesolo version.
- The verifier is load-bearing. If it is flaky, the training signal is noise. Build it early and trust it.
- Training depends on enough successful Layer 0 runs to learn from. If data is thin, pad it with Gemini-generated synthetic pages.
- Prior-art claims must be verified before they reach a judge.
- Live demo reliability. Lock the demo task set and rehearse. Record a backup run in case something glitches on stage.

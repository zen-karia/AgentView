# Evaluation contract — v1 (FROZEN)

## Headline metric

**Primary:** end-to-end task success rate on the 5 held-out tasks, n=5 trials per task, under the
identical harness (frozen prompt template, pretrim v1, same executor). Only the model is swapped.

**Secondary:** action-level correctness on the held-out page set — does the emitted `actions` array
contain an action whose `target_selector` resolves to the labeled correct element. Report precision
and recall. Also report **element recall** separately (is the correct element present at all in
`relevant_content`/`actions`): MindAct's Recall@k-vs-step-SR split shows filtering misses and
action-formatting misses are different failures — without the split you can't tell which you have.

**Decode settings (pinned for every arm, incl. base zero-shot and Gemini):** temperature 0,
repetition_penalty 1.05–1.08, max_completion_tokens ≈ 2,000, JSON-schema guided decoding
(`response_format`) where the endpoint supports it, loop-detection early stop in the harness.

Validator pass rate is a **data-quality gate, never a headline number.** A model emitting one safe
selector and minimal content passes the validator on every page while being useless.

## Comparison arms (all through the same harness entrypoint)

1. **Base model zero-shot** — captured during base-model selection, before any training. This is the
   "before" number; it cannot be measured honestly after the fact.
2. **Base + our LoRA** — the deliverable.
3. **Gemini teacher** — upper reference, same template, same pretrim.
4. **No-AgentView baseline** — the same agent driven by the raw Playwright accessibility snapshot.
   This arm is the standing answer to "why not just use Playwright MCP?" — it measures what the
   learned translation adds over a rule-based serialization, in task success and tokens per step.

## Held-out policy

- The 5 held-out tasks (page seed + goal + machine-checkable success predicate) are committed to git
  **before the first training example is generated.**
- Site-generator seeds **9000–9999** are reserved for held-out use. The data pipeline must refuse to
  emit training data from any range in [heldout-seeds.json](heldout-seeds.json).
- **≥2 of the 5 tasks run on pages we did not generate** (Mind2Web snapshot or a live public page) —
  held-out seeds of our own generator are still in-distribution and do not answer "you rigged the sites."
- A held-out **page set** of 100–300 (page, goal) pairs is carved out before bulk labeling begins and
  is never touched by the teacher pipeline. It feeds the secondary metric — 5 binary tasks alone
  cannot support a comparative claim.
- Golden examples in `golden/` are format anchors (may appear in prompts or training). They are never
  eval data.

## Log row (MongoDB — every generated example and every eval run)

```json
{
  "source": "parametric | gemini-synthetic | mind2web | webshop | live",
  "tier": "bulk | spine | rft | heldout",
  "seed": 1234,
  "goal": "...",
  "schema_sha": "…", "template_sha": "…", "pretrim_version": "1",
  "validator": { "valid": true, "errors": [] },
  "model": "…", "success": true, "trial": 1, "ts": "…"
}
```

`seed` is the generator seed for `parametric` rows and null/absent for every other source.

Mix cap: `gemini-synthetic` ≤ 50% of any training mix (same model generates and labels those pages —
a closed loop; keep it tagged, capped, and auditable).

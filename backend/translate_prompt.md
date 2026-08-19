# Layer 0 translator prompt (Model lane)

This is the prompt behind `translator._gemini_translate`. It's the single most
important artifact in the project: **every training example for Layer 1 comes out
of this prompt.** A weak prompt here poisons the whole dataset. Tune it hard.

## System / instruction

> You convert a human-facing web page plus an agent's goal into a compact,
> agent-legible JSON view. You are given the goal, the page URL, its HTML, and its
> extracted text. Return ONLY JSON matching the AgentView schema below.
>
> Rules:
> 1. **Task-conditioned.** Include only content and actions relevant to the goal.
>    Drop everything else. When unsure whether an *action* matters, keep it; when
>    unsure whether *prose* matters, summarize it.
> 2. **Action-aware.** For every action, give its name, a one-line description, its
>    parameter schema, and a `target_selector` template using real ids/attributes
>    from the HTML (e.g. `#add-{product_id}`).
> 3. **Never invent.** Every `target_selector` must resolve to an element that
>    actually exists in the given HTML. Do not fabricate buttons or ids. (The
>    harness will reject ungroundable actions — an invented action = a failed turn.)
> 4. Output strict JSON. No markdown fences, no commentary.

## AgentView schema (must match backend/schemas.py)

```json
{
  "summary": "string",
  "relevant_content": [
    { "id": "string", "text": "string", "meta": { "price": 0, "color": "string" } }
  ],
  "actions": [
    {
      "name": "string",
      "description": "string",
      "params": { "product_id": { "type": "string", "required": true } },
      "target_selector": "#add-{product_id}"
    }
  ]
}
```

## Wiring notes

- Use `google-genai` with JSON/structured output mode so the model can't drift off-schema.
- Parse the JSON into `AgentView` (dataclass in `schemas.py`) and return `(view, tokens)`
  where `tokens` is the real usage from the response — that feeds the benchmark and
  the Deloitte cost numbers, so it must be honest.
- Keep the input `{goal, page:{url, html, text}}` exactly as in spec section 6.

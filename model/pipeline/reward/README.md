# GRPO reward: Python port of the AgentView validator

`validator.py` is the pure-Python (lxml + cssselect + jsonschema) port of `src/validate.js`, for Freesolo Flash GRPO reward workers (Python-only — docs/FREESOLO.md). Deps: `pip install lxml cssselect jsonschema`.

**How the GRPO environment calls it:** `score_response()` receives only `response_text`. Parse it as JSON (unparseable → reward 0), re-extract the trimmed page from `example.input` — the frozen prompt template (contracts/prompt-template.md) puts `PAGE:` last, so the page is everything after the final `\nPAGE:\n` marker — then call `validate(output_dict, trimmed_html)`. Per D11 the verdict is a **gate** (invalid → 0, discard), never the reward itself; the success predicate is the reward.

**Documented deviation:** at GRPO runtime `raw_html` is `None`, so every raw-DOM check is skipped — raw-DOM unique resolution, trimmed↔raw structural-path identity, and raw-text grounding — because only the trimmed page is recoverable from the prompt. Pass `raw_html` (the annotated page) wherever it exists (offline filtering, parity tests) to get full `src/validate.js` semantics.

**Parity:** `node scripts/dump-validator-fixtures.js` regenerates `data/fixtures/validator-parity.json` from the golden + smoke manifests and the negative suite; `python pipeline/reward/test_parity.py` must report every fixture matching the Node validator. Where lxml/cssselect could diverge from jsdom (e.g. untranslatable selectors), this port fails closed and rejects.

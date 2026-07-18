# AgentView backend (B1 harness)

The loop: `snapshot -> translate -> agent decides -> ground-check -> execute -> verify -> log`.

## Run it (zero dependencies)

```bash
cd backend
python3 run.py                    # one task, translated condition
python3 run.py --all-conditions   # race raw vs markdown vs translated
```

Expected: `raw` and `markdown_baseline` FAIL, `translated` PASSES. That contrast is
the demo thesis, visible with no API keys and no browser.

## The seams (where each lane plugs in)

| Piece | File | Owner | Status |
|-------|------|-------|--------|
| Data contracts | `schemas.py` | frozen | done |
| Translator (Layer 0 prompt) | `translator.py` `_gemini_translate` | Model | TODO |
| Trained translator (Layer 1) | `translator.py` `_trained_translate` | Model | TODO |
| Agent reasoner | `agent.py` `_gemini_decide` | B1 | TODO |
| Real browser | `driver.py` PlaywrightDriver | B1 | TODO |
| Verifier / grounding | `verifier.py` | B2 | done (extend per task) |
| Tasks + checks | `tasks.py` | B2 | 1 of ~15-20 |
| Mongo logging | `logger.py` | B2 | swap point marked |

## Switches

- `--condition`: `translated | raw | markdown_baseline`
- `--model`: `stub | gemini | trained` (stub is the zero-dep default)

Build order stays Layer 0 (Gemini) before Layer 1 (trained). The trained model is
an upgrade behind the `--model trained` flag, never something the demo depends on.

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

## Run it on a real browser (no API key)

```bash
pip install playwright && playwright install chromium
python3 run.py --driver playwright --all-conditions
```

Same result, but a real Chromium clicks the real demo site. Proves the execution
path independently of any LLM.

## Benchmark (the scoreboard)

```bash
python3 benchmark.py                    # 17 tasks x 3 conditions, stub, in-memory
python3 benchmark.py --driver playwright # real browser, 3 sites
```

Prints success / avg steps / frontier tokens / cost per condition. Holds the agent
constant and varies only the perception layer.

> NOTE: with the default stub translator+agent these results are a SMOKE TEST, not
> proof -- raw "fails" only because the stub can't read HTML. Real capability numbers
> come from `--agent-model gemini`; real cost numbers come from the trained Layer 1
> translator. See the two-milestone note below.

## Run it with a real agent (needs a key)

```bash
export GEMINI_API_KEY=your_key
python3 benchmark.py --model gemini --agent-model gemini --driver playwright
```

## The seams (where each lane plugs in)

| Piece | File | Owner | Status |
|-------|------|-------|--------|
| Data contracts | `schemas.py` | frozen | done |
| Translator (Layer 0) | `translator.py` `_gemini_translate` | Model | built, needs key to verify |
| Trained translator (Layer 1) | `translator.py` `_trained_translate` | Model | TODO |
| Agent reasoner | `agent.py` `_gemini_decide` | B1 | built, needs key |
| Real browser | `playwright_driver.py` | B1 | done |
| Cost/energy model | `costs.py` | B1 | done (illustrative rates) |
| Benchmark | `benchmark.py` | B1 | done |
| Verifier / grounding | `verifier.py` | B2 | done |
| Tasks + checks | `tasks.py` | B2 | 17 across shop/form/docs |
| Demo sites | `sites/` | B2 | shop + form + docs |
| Mongo logging | `logger.py` | B2 | done (set MONGODB_URI) |

## Switches

- `--condition`: `translated | raw | markdown_baseline`
- `--model` (translator): `stub | gemini | trained`
- `--agent-model` (reasoner): `stub | gemini`
- `--driver`: `fake | playwright`

## Two milestones to real numbers

1. **Key** -> real *capability* (Gemini translator + agent on real HTML). Cost story
   still weak (Gemini translator is a frontier model).
2. **Trained model** -> real *cost/energy* (small translator = cheap perception).

Build order stays Layer 0 (Gemini) before Layer 1 (trained). The trained model is an
upgrade behind the `--model trained` flag, never something the demo depends on.

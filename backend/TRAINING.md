# Training the Layer 1 translator on Freesolo (flash)

The model is trained **on Freesolo**, not in this repo. This repo produces the
dataset that goes *in* and calls the model that comes *out*. Docs: https://freesolo.co/docs

## The contract (do not skip)

The training input MUST be the same prompt `_trained_translate` sends at inference.
`datagen.py` guarantees this by building rows through `prompts.py` — the one place
the prompt is defined. **Train on `datagen.py`'s output**, and train==serve holds.

## 0. Install + auth

```bash
uv tool install freesolo-flash
flash login --api-key $FREESOLO_API_KEY
```

## 1. Generate the dataset (needs a Gemini key)

```bash
export GEMINI_API_KEY=...
python3 datagen.py --model gemini --agent-model gemini --driver playwright --repeat 5
# -> dataset/train.jsonl  (Freesolo SFT rows, success-filtered)
```

Stub data (`python3 datagen.py`) only tests the pipeline — it teaches the model to
mimic a hardcoded function. Real data needs `--model gemini`.

## 2. Package the environment + train

```bash
flash env setup                       # scaffold an env; put dataset/train.jsonl in it, publish
# set [environment].id in configs/sft.toml to <your-org>/<env>
flash train configs/sft.toml --dry-run
flash train configs/sft.toml --cost
flash train configs/sft.toml          # -> <run-id>
```

## 3. Deploy + wire it into the demo

```bash
flash deploy <run-id>
flash deployments --json              # copy openai_base_url

export FREESOLO_API_KEY=...
export FREESOLO_BASE_URL=<openai_base_url>
export FREESOLO_MODEL=<run-id>
python3 benchmark.py --model trained --agent-model gemini --driver playwright
```

`--model trained` routes the translator seat to `_trained_translate`, which calls the
deployed model with `response_format` pinned to the AgentView schema.

## 4. Beyond SFT (the spec's passes 2-3)

- **Distillation:** more data — have Gemini translate many synthetic pages, add to the set.
- **Rejection-sampling / RL:** Freesolo's GRPO/OPD use an *environment with a reward
  function*. Your **verifier is that reward** (success + low steps/tokens). Package the
  task loop as a flash environment and switch `algorithm` to `grpo`/`opd`.

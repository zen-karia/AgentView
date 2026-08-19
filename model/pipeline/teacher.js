'use strict';
// Gemini teacher labeler (D6, bulk tier): labels (page, goal) pairs through the
// FROZEN template via Gemini's OpenAI-compatible endpoint, rejection-samples
// through the real validator, and logs EVERY attempt (pass and fail) to Mongo
// so teacher pass-rate is measured from the first batch (PLAN Stage B rule:
// fix the teacher prompt before scaling, not after).
// Run: node --env-file=.env pipeline/teacher.js <seedFrom> <seedTo> [--model gemini-2.5-flash] [--rpm 8]

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { annotate, ANNOTATE_VERSION } = require('../src/annotate');
const { pretrim, PRETRIM_VERSION } = require('../src/pretrim');
const { validate } = require('../src/validate');
const { renderUser, systemPrompt } = require('../src/render');
const log = require('../src/log');

const root = path.join(__dirname, '..');
const HELDOUT = JSON.parse(
  fs.readFileSync(path.join(root, 'contracts', 'heldout-seeds.json'), 'utf8')
).reserved_seed_ranges;
const sha = (f) =>
  crypto.createHash('sha256').update(fs.readFileSync(path.join(root, f))).digest('hex').slice(0, 12);
const SCHEMA_SHA = sha('contracts/agentview.schema.json');
const TEMPLATE_SHA = sha('contracts/prompt-template.md');

const GEMINI_BASE = 'https://generativelanguage.googleapis.com/v1beta/openai';

async function label(model, goal, trimmed) {
  const body = {
    model,
    messages: [
      { role: 'system', content: systemPrompt() },
      { role: 'user', content: renderUser(goal, trimmed) },
    ],
    temperature: 0,
    max_tokens: 3000,
    // NOTE: no response_format — Gemini's OpenAI-compat json_object mode
    // truncates mid-structure with finish_reason "stop" on this thinking model
    // (measured: 81/267 parse failures with it, ~0 without). Plain prompting +
    // fence-strip parses reliably. Labeling needs breadth not depth, and
    // thinking tokens bill as output — keep reasoning effort low.
    reasoning_effort: 'low',
  };
  const resp = await fetch(`${GEMINI_BASE}/chat/completions`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${process.env.GEMINI_API_KEY}` },
    body: JSON.stringify(body),
  });
  if (!resp.ok) throw new Error(`HTTP ${resp.status}: ${(await resp.text()).slice(0, 200)}`);
  const data = await resp.json();
  return data.choices?.[0]?.message?.content ?? '';
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function main() {
  const args = process.argv.slice(2);
  const from = parseInt(args[0], 10);
  const to = parseInt(args[1] ?? args[0], 10);
  const model = args.includes('--model') ? args[args.indexOf('--model') + 1] : 'gemini-3.5-flash';
  const rpm = args.includes('--rpm') ? parseFloat(args[args.indexOf('--rpm') + 1]) : 8;
  if (!Number.isInteger(from) || !process.env.GEMINI_API_KEY) {
    console.error('usage: node --env-file=.env pipeline/teacher.js <seedFrom> <seedTo> [--model m] [--rpm n]');
    process.exit(2);
  }

  fs.mkdirSync(path.join(root, 'data', 'rows'), { recursive: true });
  const outFile = path.join(root, 'data', 'rows', `teacher-${from}-${to}.jsonl`);
  fs.writeFileSync(outFile, ''); // fresh file; rows appended incrementally so kills lose nothing

  let kept = 0;
  let attempts = 0;
  let failures = 0;
  const failReasons = {};
  for (let seed = from; seed <= to; seed++) {
    if (HELDOUT.some(([lo, hi]) => seed >= lo && seed <= hi)) {
      throw new Error(`seed ${seed} is held-out — teacher refuses it`);
    }
    const dir = path.join(root, 'data', 'generated', `seed-${seed}`);
    const { tasks } = JSON.parse(fs.readFileSync(path.join(dir, 'tasks.json'), 'utf8'));
    const raw = annotate(fs.readFileSync(path.join(dir, 'page.html'), 'utf8'));
    const trimmed = pretrim(raw);
    for (const task of tasks) {
      attempts++;
      let verdict = false;
      let errors = [];
      let output = null;
      for (let attempt = 0; attempt < 2 && !verdict; attempt++) {
        try {
          const text = await label(model, task.goal, trimmed);
          const cleaned = text.replace(/^[\s\S]*?<\/think>/, '').replace(/```(?:json)?/g, '').trim();
          output = JSON.parse(cleaned);
          const res = validate(output, trimmed, raw);
          verdict = res.valid;
          errors = res.errors;
        } catch (e) {
          errors = [String(e.message).slice(0, 160)];
        }
      }
      if (verdict) {
        kept++;
        fs.appendFileSync(
          outFile,
          JSON.stringify({
            input: renderUser(task.goal, trimmed),
            output: JSON.stringify(output),
            metadata: {
              tier: 'bulk',
              source: 'parametric-teacher',
              teacher: model,
              seed,
              task_id: task.id,
              schema_sha: SCHEMA_SHA,
              template_sha: TEMPLATE_SHA,
              annotate_version: ANNOTATE_VERSION,
              pretrim_version: PRETRIM_VERSION,
            },
          }) + '\n'
        );
      } else {
        failures++;
        const key = (errors[0] || 'unknown').split(':')[0].slice(0, 60);
        failReasons[key] = (failReasons[key] || 0) + 1;
      }
      if (log.enabled()) {
        await log.logRow('examples', {
          kind: 'teacher-attempt',
          tier: 'bulk',
          source: 'parametric-teacher',
          teacher: model,
          seed,
          task_id: task.id,
          valid: verdict,
          errors: errors.slice(0, 4),
          schema_sha: SCHEMA_SHA,
          template_sha: TEMPLATE_SHA,
        });
      }
      await sleep(Math.ceil(60000 / rpm));
    }
    console.log(`seed ${seed}: ${kept}/${attempts} kept so far`);
  }

  if (log.enabled()) await log.close();

  const rate = attempts ? ((100 * kept) / attempts).toFixed(1) : '0';
  console.log(`DONE teacher=${model}: ${kept}/${attempts} passed the validator (${rate}%) -> ${path.relative(root, outFile)}`);
  if (failures) console.log('fail reasons: ' + JSON.stringify(failReasons));
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});

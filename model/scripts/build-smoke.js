'use strict';
// Builds the smoke-slice training set: validates every case (hard fail on any
// invalid row — rejection sampling applies to hand-authored data too), renders
// the frozen template, and emits Flash's exact {input, output, metadata} JSONL
// plus the system prompt file the Flash environment serves.
// Run: node scripts/build-smoke.js

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { annotate, ANNOTATE_VERSION } = require('../src/annotate');
const { pretrim, approxTokens, PRETRIM_VERSION, PAGE_TOKEN_BUDGET } = require('../src/pretrim');
const { validate } = require('../src/validate');
const { systemPrompt, renderUser } = require('../src/render');

const root = path.join(__dirname, '..');
const manifest = JSON.parse(fs.readFileSync(path.join(root, 'data', 'smoke', 'manifest.json'), 'utf8'));
const envDir = path.join(root, 'flash-env');

const sha = (f) =>
  crypto.createHash('sha256').update(fs.readFileSync(path.join(root, f))).digest('hex').slice(0, 12);
const schemaSha = sha('contracts/agentview.schema.json');
const templateSha = sha('contracts/prompt-template.md');

let failed = 0;
const rows = [];
for (const c of manifest.cases) {
  const raw = annotate(fs.readFileSync(path.join(root, c.page), 'utf8'));
  const trimmed = pretrim(raw);
  const output = JSON.parse(fs.readFileSync(path.join(root, c.output), 'utf8'));
  const res = validate(output, trimmed, raw);
  const input = renderUser(c.goal, trimmed);
  const tokens = approxTokens(input);
  const fit = tokens <= PAGE_TOKEN_BUDGET + 100 ? 'fits' : 'OVER BUDGET';
  console.log(`${res.valid ? 'PASS' : 'FAIL'}  ${c.name}  (~${tokens} input tokens, ${fit})`);
  for (const e of res.errors) console.log(`      - ${e}`);
  if (!res.valid || fit !== 'fits') {
    failed++;
    continue;
  }
  rows.push({
    input,
    output: JSON.stringify(output),
    metadata: {
      tier: 'smoke',
      source: 'handauthored',
      name: c.name,
      page: c.page,
      schema_sha: schemaSha,
      template_sha: templateSha,
      annotate_version: ANNOTATE_VERSION,
      pretrim_version: PRETRIM_VERSION,
    },
  });
}

if (failed > 0) {
  console.log(`\n${failed} case(s) FAILED — nothing emitted.`);
  process.exit(1);
}

fs.mkdirSync(path.join(envDir, 'dataset'), { recursive: true });
fs.writeFileSync(
  path.join(envDir, 'dataset', 'train.jsonl'),
  rows.map((r) => JSON.stringify(r)).join('\n') + '\n'
);
fs.writeFileSync(path.join(envDir, 'system_prompt.txt'), systemPrompt() + '\n');

console.log(`\nEmitted ${rows.length} rows -> flash-env/dataset/train.jsonl`);
console.log(`System prompt -> flash-env/system_prompt.txt (template=${templateSha})`);

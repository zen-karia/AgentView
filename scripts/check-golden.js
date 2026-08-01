'use strict';
// End-to-end check of the frozen contract: pretrims every golden page, runs
// every golden output through the validator, reports token fit and harness
// hashes. Exits non-zero on any failure. Run with: npm run check

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { pretrim, approxTokens, PRETRIM_VERSION, PAGE_TOKEN_BUDGET } = require('../src/pretrim');
const { annotate, ANNOTATE_VERSION } = require('../src/annotate');
const { validate } = require('../src/validate');

const root = path.join(__dirname, '..');
const manifest = JSON.parse(fs.readFileSync(path.join(root, 'golden', 'manifest.json'), 'utf8'));

const sha = (f) =>
  crypto.createHash('sha256').update(fs.readFileSync(path.join(root, f))).digest('hex').slice(0, 12);

console.log(
  `harness: schema=${sha('contracts/agentview.schema.json')} template=${sha('contracts/prompt-template.md')} annotate=v${ANNOTATE_VERSION} pretrim=v${PRETRIM_VERSION}\n`
);

let failed = 0;
for (const c of manifest.cases) {
  // Input pipeline: annotate (stamp data-av-id) -> pretrim. The "raw" DOM the
  // validator/executor sees is the ANNOTATED page — the executor runs the same
  // annotation on the live page before acting.
  const rawHtml = annotate(fs.readFileSync(path.join(root, c.page), 'utf8'));
  const trimmedHtml = pretrim(rawHtml);
  const output = JSON.parse(fs.readFileSync(path.join(root, c.output), 'utf8'));
  const tokens = approxTokens(trimmedHtml);
  const fit = tokens <= PAGE_TOKEN_BUDGET ? 'fits budget' : `OVER ${PAGE_TOKEN_BUDGET} BUDGET`;
  const res = validate(output, trimmedHtml, rawHtml);
  if (!res.valid) failed++;
  console.log(`${res.valid ? 'PASS' : 'FAIL'}  ${c.name}`);
  console.log(`      goal: "${c.goal}"  |  trimmed page ~${tokens} tokens (${fit})`);
  for (const e of res.errors) console.log(`      - ${e}`);
}

console.log(failed === 0 ? '\nAll golden examples pass.' : `\n${failed} golden example(s) FAILED.`);
process.exit(failed === 0 ? 0 : 1);

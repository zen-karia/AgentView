'use strict';
// Dumps validator parity fixtures for the Python reward port
// (pipeline/reward/validator.py). Sources:
//   1. golden/manifest.json          (positive cases — format anchors)
//   2. data/smoke/manifest.json      (positive cases — smoke slice)
//   3. hand-reconstructed negative cases from scripts/check-negative.js
// Each case is run through the REAL pipeline (annotate -> pretrim) and the
// REAL Node validator; the recorded verdict is ground truth the Python port
// must reproduce exactly. Output:
//   data/fixtures/validator-parity.json
//   [{name, trimmed_html, raw_html, output, expected_valid, expected_error_substrings}]
// Run with: node scripts/dump-validator-fixtures.js

const fs = require('fs');
const path = require('path');
const { pretrim } = require('../src/pretrim');
const { annotate } = require('../src/annotate');
const { validate } = require('../src/validate');

const root = path.join(__dirname, '..');
const read = (f) => fs.readFileSync(path.join(root, f), 'utf8');

const fixtures = [];
const seen = new Set();

function addCase(name, trimmedHtml, rawHtml, output, expectedErrorSubstrings) {
  if (seen.has(name)) return; // golden cases repeat inside the smoke manifest
  seen.add(name);
  const res = validate(output, trimmedHtml, rawHtml);
  fixtures.push({
    name,
    trimmed_html: trimmedHtml,
    raw_html: rawHtml,
    output,
    expected_valid: res.valid,
    // For negatives: the substring check-negative.js requires. For positives
    // (and any unexpectedly-failing case): the actual Node validator errors,
    // so the parity test can demand at least one matches.
    expected_error_substrings: res.valid ? [] : (expectedErrorSubstrings || res.errors),
  });
  return res;
}

// ---- 1 + 2: golden and smoke manifests (positives) --------------------------
const pageCache = new Map();
function pipeline(pageFile) {
  if (!pageCache.has(pageFile)) {
    const rawHtml = annotate(read(pageFile));
    pageCache.set(pageFile, { rawHtml, trimmedHtml: pretrim(rawHtml) });
  }
  return pageCache.get(pageFile);
}

for (const manifestFile of ['golden/manifest.json', 'data/smoke/manifest.json']) {
  const manifest = JSON.parse(read(manifestFile));
  for (const c of manifest.cases) {
    const { rawHtml, trimmedHtml } = pipeline(c.page);
    const output = JSON.parse(read(c.output));
    const res = addCase(c.name, trimmedHtml, rawHtml, output);
    if (res && !res.valid) {
      console.error(`WARNING: manifest case "${c.name}" FAILS the Node validator:`);
      for (const e of res.errors) console.error(`  - ${e}`);
    }
  }
}

// ---- 3: negative cases, hand-reconstructed from scripts/check-negative.js ---
const shopRaw = annotate(read('golden/shop.html'));
const shopTrimmed = pretrim(shopRaw);

const widgetHtml = `<!DOCTYPE html><html><head><title>w</title></head><body>
<div class="f">
  <label for="d">Date</label><input id="d" type="date">
  <div id="cb" role="combobox" tabindex="0">Choose…</div>
  <select id="ctry"><option value="us">United States</option><option value="ca">Canada</option></select>
</div></body></html>`;
const widgetRaw = annotate(widgetHtml);
const widgetTrimmed = pretrim(widgetRaw);

const collideHtml = `<!DOCTYPE html><html><head><title>c</title></head><body>
<button class="buy" data-p="${'X'.repeat(200)}YYYYY">Buy A</button>
<noscript><button class="buy2" data-p="${'X'.repeat(200)}…">Buy B</button></noscript>
</body></html>`;
const collideRaw = annotate(collideHtml);
const collideTrimmed = pretrim(collideRaw);

const base = { schema_version: '1', relevant_content: [], actions: [] };
const negatives = [
  {
    name: 'reject: selector targets <body>',
    mustMention: 'banned',
    output: { ...base, actions: [{ id: 'a1', kind: 'click', description: 'x', target_selector: 'body' }] },
  },
  {
    name: 'reject: :nth-child positional selector',
    mustMention: 'banned',
    output: { ...base, actions: [{ id: 'a1', kind: 'click', description: 'x', target_selector: '.grid .itm:nth-child(1) .go' }] },
  },
  {
    name: 'reject: selector matches 4 elements (.go)',
    mustMention: 'matches 4',
    output: { ...base, actions: [{ id: 'a1', kind: 'click', description: 'x', target_selector: '.go' }] },
  },
  {
    name: 'reject: selector matches nothing (#nope)',
    mustMention: 'matches 0',
    output: { ...base, actions: [{ id: 'a1', kind: 'click', description: 'x', target_selector: '#nope' }] },
  },
  {
    name: 'reject: hallucinated content text',
    mustMention: 'verbatim',
    output: { ...base, relevant_content: [{ id: 'c1', text: 'Free shipping on all orders', selector: '.bnr-in' }] },
  },
  {
    name: 'reject: content_ref to nonexistent id',
    mustMention: 'does not exist',
    output: { ...base, actions: [{ id: 'a1', kind: 'click', description: 'x', target_selector: '.nv-c', content_refs: ['c9'] }] },
  },
  {
    name: 'reject: kind=type on a non-input <div>',
    mustMention: 'text-input-capable',
    output: { ...base, actions: [{ id: 'a1', kind: 'type', description: 'x', target_selector: '.nl-b' }] },
  },
  {
    name: 'reject: unknown action kind (schema)',
    mustMention: 'schema',
    output: { ...base, actions: [{ id: 'a1', kind: 'hover', description: 'x', target_selector: '.nv-c' }] },
  },
  {
    name: 'reject: duplicate action ids',
    mustMention: 'duplicate',
    output: {
      ...base,
      actions: [
        { id: 'a1', kind: 'click', description: 'x', target_selector: '.nv-c' },
        { id: 'a1', kind: 'click', description: 'y', target_selector: '.bnr-x' },
      ],
    },
  },
  {
    name: 'reject: comma selector list (was the trimmed-vs-raw divergence attack)',
    mustMention: 'selector lists are banned',
    output: {
      ...base,
      actions: [{ id: 'a1', kind: 'click', description: 'x', target_selector: '[data-sku="hp-01"] svg:empty, [data-sku="hp-02"] svg path' }],
    },
  },
  {
    name: 'reject: truncated-attribute collision resolving to DIFFERENT elements in trimmed vs raw',
    mustMention: 'different element',
    html: [collideTrimmed, collideRaw],
    output: {
      ...base,
      actions: [{ id: 'a1', kind: 'click', description: 'x', target_selector: `[data-p="${'X'.repeat(200)}…"]` }],
    },
  },
  {
    name: 'reject: sibling combinator (+/~) selector',
    mustMention: 'banned',
    output: { ...base, actions: [{ id: 'a1', kind: 'click', description: 'x', target_selector: '.bnr + .grid .go' }] },
  },
  {
    name: 'reject: real on-page text attributed to a broad container (.grid)',
    mustMention: 'tightest',
    output: { ...base, relevant_content: [{ id: 'c1', text: '$249.00', selector: '.grid' }] },
  },
  {
    name: 'reject: lone-ellipsis text (grounding bypass)',
    mustMention: 'groundable',
    output: { ...base, relevant_content: [{ id: 'c1', text: '…', selector: '.cp' }] },
  },
  {
    name: 'reject: whitespace-only text (grounding bypass)',
    mustMention: 'groundable',
    output: { ...base, relevant_content: [{ id: 'c1', text: '   ', selector: '.cp' }] },
  },
  {
    name: 'reject: click on non-interactive element (.cp copyright div)',
    mustMention: 'interactive',
    output: { ...base, actions: [{ id: 'a1', kind: 'click', description: 'x', target_selector: '.cp' }] },
  },
  {
    name: 'reject: click on <title> (head descendant)',
    mustMention: 'interactive',
    output: { ...base, actions: [{ id: 'a1', kind: 'click', description: 'x', target_selector: 'title' }] },
  },
  {
    name: 'reject: kind=type on a native date picker',
    mustMention: 'text-input-capable',
    html: [widgetTrimmed, widgetRaw],
    output: { ...base, actions: [{ id: 'a1', kind: 'type', description: 'x', target_selector: '#d' }] },
  },
  {
    name: 'reject: kind=select on an ARIA combobox div (not native <select>)',
    mustMention: 'native <select>',
    html: [widgetTrimmed, widgetRaw],
    output: { ...base, actions: [{ id: 'a1', kind: 'select', description: 'x', target_selector: '#cb' }] },
  },
  {
    name: 'reject: select value_hint matching no option of the target <select>',
    mustMention: 'no option',
    html: [widgetTrimmed, widgetRaw],
    output: { ...base, actions: [{ id: 'a1', kind: 'select', description: 'x', target_selector: '#ctry', value_hint: 'Australia' }] },
  },
  {
    name: 'reject: value_hint on kind=click',
    mustMention: 'not allowed',
    output: { ...base, actions: [{ id: 'a1', kind: 'click', description: 'x', target_selector: '.nv-c', value_hint: 'x' }] },
  },
];

for (const c of negatives) {
  const [t, r] = c.html || [shopTrimmed, shopRaw];
  const res = addCase(c.name, t, r, c.output, [c.mustMention]);
  if (res && res.valid) {
    console.error(`WARNING: negative case "${c.name}" PASSED the Node validator (expected rejection).`);
  }
}

// ---- write -------------------------------------------------------------------
const outDir = path.join(root, 'data', 'fixtures');
fs.mkdirSync(outDir, { recursive: true });
const outFile = path.join(outDir, 'validator-parity.json');
fs.writeFileSync(outFile, JSON.stringify(fixtures, null, 2));
const nValid = fixtures.filter((f) => f.expected_valid).length;
console.log(`Wrote ${fixtures.length} fixtures (${nValid} valid, ${fixtures.length - nValid} invalid) to ${outFile}`);

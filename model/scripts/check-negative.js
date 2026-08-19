'use strict';
// Negative suite: outputs that MUST be rejected. This is the anti-reward-hacking
// regression test — if any of these ever pass, the validator has a hole that
// RFT will find and exploit. Run via: npm run check

const fs = require('fs');
const path = require('path');
const { pretrim } = require('../src/pretrim');
const { annotate } = require('../src/annotate');
const { validate } = require('../src/validate');

const root = path.join(__dirname, '..');
const rawHtml = annotate(fs.readFileSync(path.join(root, 'golden', 'shop.html'), 'utf8'));
const trimmedHtml = pretrim(rawHtml);

// Crafted page for widget cases the shop page doesn't contain.
const widgetHtml = `<!DOCTYPE html><html><head><title>w</title></head><body>
<div class="f">
  <label for="d">Date</label><input id="d" type="date">
  <div id="cb" role="combobox" tabindex="0">Choose…</div>
  <select id="ctry"><option value="us">United States</option><option value="ca">Canada</option></select>
</div></body></html>`;
const widgetAnnotated = annotate(widgetHtml);
const widgetTrimmed = pretrim(widgetAnnotated);

// Crafted page for the truncated-attribute identity collision: pretrim cuts the
// long data-p to 200 chars + '…', which collides with the noscript button's
// genuine value; noscript is removed from the trimmed DOM, so the selector is
// unique in BOTH DOMs but picks DIFFERENT elements.
const collideHtml = `<!DOCTYPE html><html><head><title>c</title></head><body>
<button class="buy" data-p="${'X'.repeat(200)}YYYYY">Buy A</button>
<noscript><button class="buy2" data-p="${'X'.repeat(200)}…">Buy B</button></noscript>
</body></html>`;
const collideAnnotated = annotate(collideHtml);
const collideTrimmed = pretrim(collideAnnotated);

const base = { schema_version: '1', relevant_content: [], actions: [] };
const cases = [
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
  // ---- regressions from the adversarial review (each was a reproduced bypass) ----
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
    html: [collideTrimmed, collideAnnotated],
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
    html: [widgetTrimmed, widgetAnnotated],
    output: { ...base, actions: [{ id: 'a1', kind: 'type', description: 'x', target_selector: '#d' }] },
  },
  {
    name: 'reject: kind=select on an ARIA combobox div (not native <select>)',
    mustMention: 'native <select>',
    html: [widgetTrimmed, widgetAnnotated],
    output: { ...base, actions: [{ id: 'a1', kind: 'select', description: 'x', target_selector: '#cb' }] },
  },
  {
    name: 'reject: select value_hint matching no option of the target <select>',
    mustMention: 'no option',
    html: [widgetTrimmed, widgetAnnotated],
    output: { ...base, actions: [{ id: 'a1', kind: 'select', description: 'x', target_selector: '#ctry', value_hint: 'Australia' }] },
  },
  {
    name: 'reject: value_hint on kind=click',
    mustMention: 'not allowed',
    output: { ...base, actions: [{ id: 'a1', kind: 'click', description: 'x', target_selector: '.nv-c', value_hint: 'x' }] },
  },
];

let failed = 0;
for (const c of cases) {
  const [t, r] = c.html || [trimmedHtml, rawHtml];
  const res = validate(c.output, t, r);
  const rejected = !res.valid;
  const mentioned = res.errors.some((e) => e.toLowerCase().includes(c.mustMention.toLowerCase()));
  const ok = rejected && mentioned;
  if (!ok) failed++;
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${c.name}`);
  if (!ok) {
    console.log(`      expected rejection mentioning "${c.mustMention}", got valid=${res.valid}`);
    for (const e of res.errors) console.log(`      - ${e}`);
  }
}

console.log(failed === 0 ? '\nAll negative cases correctly rejected.' : `\n${failed} negative case(s) NOT handled.`);
process.exit(failed === 0 ? 0 : 1);

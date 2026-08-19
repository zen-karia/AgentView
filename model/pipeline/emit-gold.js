'use strict';
// Gold-output emitter (D6/D15): the generator knows its own ground truth, so it
// can author complete AgentView JSON outputs — verified-by-construction spine
// data with zero teacher cost. Every row passes the real validator or the run
// fails. Emits Flash-format JSONL and logs each row to Mongo `examples`.
// Held-out seeds are refused unconditionally — this is a TRAINING emitter.
// Run: node --env-file=.env pipeline/emit-gold.js <seedFrom> <seedTo>

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { JSDOM } = require('jsdom');
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
const money = (n) => `$${n.toFixed(2)}`;

function avIdOf(doc, selector) {
  const el = doc.querySelector(selector);
  if (!el) throw new Error(`gold selector missing: ${selector}`);
  const id = el.getAttribute('data-av-id');
  if (!id) throw new Error(`no data-av-id on: ${selector}`);
  return `[data-av-id="${id}"]`;
}

// Build the AgentView output for one generated task from ground truth.
function buildOutput(task, meta, doc) {
  const C = meta.classes;
  const byId = new Map(meta.products.map((p) => [p.sku, p]));
  const content = [];
  const actions = [];
  let c = 0;
  let a = 0;
  const addProduct = (sku, withAction) => {
    const p = byId.get(sku);
    content.push({ id: `c${++c}`, text: p.name, selector: `[data-sku="${sku}"] .${C.title}` });
    content.push({ id: `c${++c}`, text: money(p.price), selector: `[data-sku="${sku}"] .${C.price}` });
    if (withAction) {
      actions.push({
        id: `a${++a}`,
        kind: 'click',
        description: `Add the ${p.name} (${money(p.price)}) to the cart`,
        target_selector: avIdOf(doc, `[data-sku="${sku}"] .${C.add}`),
        content_refs: [`c${c - 1}`, `c${c}`],
      });
    }
  };

  if (task.id === 'add-bundle') {
    content.push({ id: `c${++c}`, text: meta.bundle.title, selector: '.dod-t' });
    content.push({ id: `c${++c}`, text: money(meta.bundle.price), selector: '.dod-p' });
    actions.push({
      id: `a${++a}`,
      kind: 'click',
      description: `Add the ${meta.bundle.title} (${money(meta.bundle.price)}) to the cart`,
      target_selector: avIdOf(doc, '.dod-go'),
      content_refs: ['c1', 'c2'],
    });
  } else if (task.id.startsWith('add-') && task.id !== 'add-cheapest-wireless-hp') {
    addProduct(task.target_sku, true);
  } else if (task.id === 'add-cheapest-wireless-hp') {
    // D1: candidate set — every wireless option plus the data to compare them.
    for (const sku of task.candidate_skus) addProduct(sku, true);
  } else if (task.id === 'dismiss-cookie') {
    content.push({ id: `c${++c}`, text: 'We use cookies to improve recommendations.', selector: `.${C.ck}` });
    actions.push({
      id: `a${++a}`,
      kind: 'click',
      description: 'Accept the cookies and dismiss the banner',
      target_selector: avIdOf(doc, `.${C.ckA}`),
      content_refs: ['c1'],
    });
  } else if (task.id === 'newsletter') {
    content.push({ id: `c${++c}`, text: 'Get deals in your inbox', selector: `.${C.nlT}` });
    actions.push({
      id: `a${++a}`,
      kind: 'type',
      description: 'Enter the email address for the newsletter',
      target_selector: avIdOf(doc, `.${C.nlE}`),
      value_hint: task.email,
      content_refs: ['c1'],
    });
    actions.push({
      id: `a${++a}`,
      kind: 'click',
      description: 'Subscribe to the newsletter',
      target_selector: avIdOf(doc, `.${C.nlB}`),
    });
  } else if (task.id === 'sort-price-asc') {
    actions.push({
      id: `a${++a}`,
      kind: 'select',
      description: 'Sort the product list by price, lowest first',
      target_selector: avIdOf(doc, `select.${C.srt}`),
      value_hint: 'Price: low to high',
    });
  } else if (task.type === 'impossible') {
    // empty/empty is the contract's explicit "cannot advance here" signal
  } else {
    throw new Error(`no gold builder for task ${task.id}`);
  }
  return { schema_version: '1', relevant_content: content, actions };
}

async function main() {
  const [fromArg, toArg] = process.argv.slice(2);
  const from = parseInt(fromArg, 10);
  const to = parseInt(toArg ?? fromArg, 10);
  if (!Number.isInteger(from) || !Number.isInteger(to)) {
    console.error('usage: node pipeline/emit-gold.js <seedFrom> <seedTo>');
    process.exit(2);
  }
  const rows = [];
  let pages = 0;
  for (let seed = from; seed <= to; seed++) {
    if (HELDOUT.some(([lo, hi]) => seed >= lo && seed <= hi)) {
      throw new Error(`seed ${seed} is held-out — training emitter refuses it`);
    }
    const dir = path.join(root, 'data', 'generated', `seed-${seed}`);
    if (!fs.existsSync(dir)) throw new Error(`missing ${dir} — generate first`);
    const { meta, tasks } = JSON.parse(fs.readFileSync(path.join(dir, 'tasks.json'), 'utf8'));
    const raw = annotate(fs.readFileSync(path.join(dir, 'page.html'), 'utf8'));
    const trimmed = pretrim(raw);
    const doc = new JSDOM(trimmed).window.document;
    pages++;
    for (const task of tasks) {
      const output = buildOutput(task, meta, doc);
      const res = validate(output, trimmed, raw);
      if (!res.valid) {
        console.error(`INVALID gold row seed=${seed} task=${task.id}:`);
        for (const e of res.errors) console.error(`  - ${e}`);
        process.exit(1);
      }
      rows.push({
        input: renderUser(task.goal, trimmed),
        output: JSON.stringify(output),
        metadata: {
          tier: 'spine',
          source: 'parametric-gold',
          seed,
          task_id: task.id,
          schema_sha: SCHEMA_SHA,
          template_sha: TEMPLATE_SHA,
          annotate_version: ANNOTATE_VERSION,
          pretrim_version: PRETRIM_VERSION,
        },
      });
    }
  }

  fs.mkdirSync(path.join(root, 'data', 'rows'), { recursive: true });
  const outFile = path.join(root, 'data', 'rows', `gold-${from}-${to}.jsonl`);
  fs.writeFileSync(outFile, rows.map((r) => JSON.stringify(r)).join('\n') + '\n');
  fs.writeFileSync(path.join(root, 'flash-env', 'system_prompt.txt'), systemPrompt() + '\n');

  let logged = 0;
  if (log.enabled()) {
    const res = await log.logRows(
      'examples',
      rows.map((r) => ({ kind: 'example', ...r.metadata, goal_chars: r.input.length }))
    );
    logged = res.logged;
    await log.close();
  }
  console.log(`${rows.length} gold rows from ${pages} pages -> ${path.relative(root, outFile)} (all validator-passed; ${logged} logged to Mongo)`);
}

main().catch((e) => {
  console.error(e.message || e);
  process.exit(1);
});

'use strict';
// Mind2Web TRAIN-split ingestion (amended D6: the TRAIN split is allowed for
// training; test splits stay eval-only/forbidden — this file hard-refuses any
// other split). Converts CLICK/TYPE/SELECT steps into validator-passed
// AgentView bulk-tier training rows:
//   fetch train rows (HF datasets-server, spread offsets to diversify sites)
//   -> annotate() -> pretrim() -> construct gold action + grounded content
//   deterministically (no LLM) -> validate() gate -> Flash JSONL row.
// Every attempt (pass and fail) is logged to Mongo 'examples' (kind:'m2w-ingest').
//
// Usage: node --env-file=.env pipeline/ingest-m2w-train.js --n 300

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { JSDOM } = require('jsdom');
const { annotate, ANNOTATE_VERSION } = require('../src/annotate');
const { pretrim, approxTokens, PRETRIM_VERSION, PAGE_TOKEN_BUDGET } = require('../src/pretrim');
const { validate } = require('../src/validate');
const { renderUser } = require('../src/render');
const log = require('../src/log');

const root = path.join(__dirname, '..');
const sha = (f) =>
  crypto.createHash('sha256').update(fs.readFileSync(path.join(root, f))).digest('hex').slice(0, 12);
const SCHEMA_SHA = sha('contracts/agentview.schema.json');
const TEMPLATE_SHA = sha('contracts/prompt-template.md');

// ---- D6 split policy: TRAIN ONLY. -----------------------------------------
const SPLIT = 'train';
function assertTrainSplit(split) {
  if (split !== 'train') {
    throw new Error(
      `D6 violation: split "${split}" is forbidden for training data. ` +
        'Mind2Web test splits (test_website/test_task/test_domain) are eval-only.'
    );
  }
}
assertTrainSplit(SPLIT);

// Mirrors src/validate.js NON_TYPEABLE_INPUT — skip TYPE steps the validator
// would reject rather than burning them as discards.
const NON_TYPEABLE_INPUT = new Set([
  'hidden', 'submit', 'button', 'checkbox', 'radio', 'file', 'image', 'reset', 'range', 'color',
  'date', 'time', 'month', 'week', 'datetime-local',
]);

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function arg(name, dflt) {
  const i = process.argv.indexOf(`--${name}`);
  return i === -1 ? dflt : process.argv[i + 1];
}

function norm(s) {
  return s.replace(/\s+/g, ' ').trim();
}

// True if every segment appears in hay, in order, without overlap (validator's rule).
function containsInOrder(hay, segments) {
  let idx = 0;
  for (const seg of segments) {
    const found = hay.indexOf(seg, idx);
    if (found === -1) return false;
    idx = found + seg.length;
  }
  return true;
}

// ---- Fetch: spread offsets >=100 apart across the ~7,775-action split ------
async function fetchSteps(want) {
  const steps = [];
  const seenUid = new Set();
  const offsets = [];
  for (let o = 0; o < 7775; o += 100) offsets.push(o);
  for (const offset of offsets) {
    if (steps.length >= want) break;
    assertTrainSplit(SPLIT);
    const url = `https://datasets-server.huggingface.co/rows?dataset=osunlp%2FMultimodal-Mind2Web&config=default&split=${encodeURIComponent(SPLIT)}&offset=${offset}&length=20`;
    let resp;
    for (let attempt = 0; attempt < 3; attempt++) {
      try {
        resp = await fetch(url);
      } catch {
        resp = null;
      }
      if (resp && resp.ok) break;
      if (resp && resp.status === 404) break;
      await sleep(2000 * (attempt + 1));
    }
    if (!resp || !resp.ok) {
      console.error(`fetch failed at offset ${offset}: HTTP ${resp ? resp.status : 'network'}`);
      continue;
    }
    const data = await resp.json();
    for (const { row } of data.rows || []) {
      if (steps.length >= want) break;
      if (seenUid.has(row.action_uid)) continue;
      let op;
      try {
        op = JSON.parse(row.operation);
      } catch {
        continue;
      }
      if (!['CLICK', 'TYPE', 'SELECT'].includes(op.op)) continue;
      if (!row.cleaned_html) continue;
      const gold = (row.pos_candidates || [])
        .map((c) => {
          try {
            const parsed = JSON.parse(c);
            return parsed.backend_node_id || JSON.parse(parsed.attributes).backend_node_id;
          } catch {
            return null;
          }
        })
        .filter(Boolean);
      if (!gold.length) continue;
      seenUid.add(row.action_uid);
      const history = (row.action_reprs || []).slice(0, row.target_action_index ?? 0);
      steps.push({
        website: row.website,
        annotation_id: row.annotation_id,
        action_uid: row.action_uid,
        op: op.op,
        value: op.value || '',
        goal:
          row.confirmed_task +
          (history.length ? ` Previous actions already completed: ${history.join('; ')}` : ''),
        gold,
        html: row.cleaned_html,
      });
    }
    process.stdout.write(`\rfetched ${steps.length}/${want} candidate steps (offset ${offset})   `);
    await sleep(250);
  }
  process.stdout.write('\n');
  return steps;
}

// ---- Deterministic construction --------------------------------------------
// Selector for the gold element: [data-av-id="N"] when annotate stamped it
// (unique by construction), else the backend_node_id attribute itself — valid
// CSS and unique per document when it is. Uniqueness verified in BOTH DOMs.
function selectorFor(el, goldId, trimmedDoc, rawDoc) {
  const av = el.getAttribute('data-av-id');
  if (av) {
    const s = `[data-av-id="${av}"]`;
    if (trimmedDoc.querySelectorAll(s).length === 1 && rawDoc.querySelectorAll(s).length === 1) return s;
  }
  const s = `[backend_node_id="${goldId}"]`;
  if (trimmedDoc.querySelectorAll(s).length === 1 && rawDoc.querySelectorAll(s).length === 1) return s;
  return null;
}

// Short human label for an element, from its text/attributes (no LLM).
function labelFor(el) {
  const cand =
    norm(el.textContent || '') ||
    norm(el.getAttribute('aria-label') || '') ||
    norm(el.getAttribute('placeholder') || '') ||
    norm(el.getAttribute('title') || '') ||
    norm(el.getAttribute('alt') || '') ||
    norm(el.getAttribute('value') || '') ||
    norm(el.getAttribute('name') || '') ||
    norm(el.getAttribute('id') || '');
  return cand.slice(0, 80);
}

function describe(kind, el) {
  const tag = el.tagName.toLowerCase();
  const label = labelFor(el);
  let d;
  if (kind === 'click') {
    const noun =
      tag === 'a' ? 'link' : tag === 'button' || (el.getAttribute('role') || '') === 'button' ? 'button' : tag === 'input' ? 'input' : 'element';
    d = label ? `Click the "${label}" ${noun}` : `Click the ${noun}`;
  } else if (kind === 'type') {
    d = label ? `Type into the "${label}" field` : 'Type into the text field';
  } else {
    d = label ? `Choose an option from the "${label}" dropdown` : 'Choose an option from the dropdown';
  }
  return d.slice(0, 200);
}

// Pre-flight kind/element compatibility (mirrors validator) so incompatible
// gold elements are skipped with a named reason instead of a validator discard.
function kindCheck(op, el) {
  const tag = el.tagName.toLowerCase();
  if (op === 'TYPE') {
    const inputType = (el.getAttribute('type') || 'text').toLowerCase();
    const ok =
      tag === 'textarea' ||
      (tag === 'input' && !NON_TYPEABLE_INPUT.has(inputType)) ||
      el.hasAttribute('contenteditable') ||
      ['textbox', 'searchbox'].includes((el.getAttribute('role') || '').toLowerCase());
    return ok ? null : 'type-target-not-typeable';
  }
  if (op === 'SELECT') {
    return tag === 'select' ? null : 'select-target-not-native-select';
  }
  return null; // click compatibility is ancestry-dependent; leave to validator
}

// relevant_content from the gold element itself, honoring the validator's
// tightest-element rule: if any child element also contains the text, emit
// nothing (empty relevant_content is valid per schema).
function contentFor(el, selector) {
  const t = norm(el.textContent || '');
  if (!t) return [];
  const text = t.slice(0, 200).trim();
  const segments = text.split('…').map(norm).filter(Boolean);
  if (!segments.length) return [];
  for (const child of el.children) {
    if (containsInOrder(norm(child.textContent), segments)) return [];
  }
  return [{ id: 'c1', text, selector }];
}

function buildOutput(step, trimmedDoc, rawDoc) {
  // Try each gold backend_node_id until one yields a unique, compatible target.
  let reason = 'gold-not-in-trimmed-dom';
  for (const goldId of step.gold) {
    const nodes = trimmedDoc.querySelectorAll(`[backend_node_id="${goldId}"]`);
    if (nodes.length === 0) continue; // pretrim casualty for this candidate
    if (nodes.length > 1) {
      reason = 'duplicate-backend-node-id';
      continue;
    }
    const el = nodes[0];
    const kc = kindCheck(step.op, el);
    if (kc) {
      reason = kc;
      continue;
    }
    const selector = selectorFor(el, goldId, trimmedDoc, rawDoc);
    if (!selector) {
      reason = 'no-unique-selector';
      continue;
    }
    const kind = step.op === 'CLICK' ? 'click' : step.op === 'TYPE' ? 'type' : 'select';
    const action = { id: 'a1', kind, description: describe(kind, el), target_selector: selector };
    if (kind === 'type') {
      if (!step.value || step.value.length > 200) {
        reason = step.value ? 'type-value-too-long' : 'type-missing-value';
        continue;
      }
      action.value_hint = step.value;
    } else if (kind === 'select') {
      // value_hint must map to an existing option label/value (validator rule);
      // when it doesn't, emit the action without a hint — still schema-valid.
      if (step.value && step.value.length <= 200) {
        const hint = norm(step.value).toLowerCase();
        const matches = Array.from(el.querySelectorAll('option')).some(
          (o) =>
            norm(o.textContent).toLowerCase() === hint ||
            (o.getAttribute('value') || '').toLowerCase() === hint
        );
        if (matches) action.value_hint = step.value;
      }
    }
    const relevant_content = contentFor(el, selector);
    if (relevant_content.length) action.content_refs = ['c1'];
    return { output: { schema_version: '1', relevant_content, actions: [action] } };
  }
  return { reason };
}

// ---- Main -------------------------------------------------------------------
async function main() {
  assertTrainSplit(SPLIT);
  const want = parseInt(arg('n', '300'), 10);
  if (!Number.isInteger(want) || want < 1) {
    console.error('usage: node --env-file=.env pipeline/ingest-m2w-train.js --n 300');
    process.exit(2);
  }

  fs.mkdirSync(path.join(root, 'data', 'rows'), { recursive: true });
  const outFile = path.join(root, 'data', 'rows', 'm2w-train.jsonl');
  // Append-safe: never truncate; skip action_uids already emitted so reruns
  // extend the file instead of duplicating rows.
  const emitted = new Set();
  if (fs.existsSync(outFile)) {
    for (const line of fs.readFileSync(outFile, 'utf8').split('\n')) {
      if (!line.trim()) continue;
      try {
        emitted.add(JSON.parse(line).metadata.action_uid);
      } catch {}
    }
  }
  if (emitted.size) console.log(`resuming: ${emitted.size} action_uids already in ${path.relative(root, outFile)}`);

  const steps = await fetchSteps(want);
  console.log(
    `fetched ${steps.length} candidate steps from ${new Set(steps.map((s) => s.website)).size} websites (split=${SPLIT})`
  );

  const stats = { attempted: 0, kept: 0, skipped_dup: 0, inputTokens: 0 };
  const discard = {};
  const websites = new Set();
  const bump = (k) => {
    discard[k] = (discard[k] || 0) + 1;
  };

  for (const step of steps) {
    if (emitted.has(step.action_uid)) {
      stats.skipped_dup++;
      continue;
    }
    stats.attempted++;
    let verdict = false;
    let reason = null;
    let errors = [];
    let output = null;
    try {
      const raw = annotate(step.html);
      const trimmed = pretrim(raw);
      if (approxTokens(trimmed) > PAGE_TOKEN_BUDGET) {
        reason = 'over-token-budget';
      } else {
        const trimmedDoc = new JSDOM(trimmed).window.document;
        const rawDoc = new JSDOM(raw).window.document;
        const built = buildOutput(step, trimmedDoc, rawDoc);
        if (!built.output) {
          reason = built.reason;
        } else {
          output = built.output;
          const res = validate(output, trimmed, raw);
          verdict = res.valid;
          errors = res.errors;
          if (!verdict) reason = 'validator:' + (errors[0] || 'unknown').split(':').slice(0, 2).join(':').slice(0, 80);
        }
      }
      if (verdict) {
        stats.kept++;
        websites.add(step.website);
        const input = renderUser(step.goal, trimmed);
        stats.inputTokens += approxTokens(input);
        fs.appendFileSync(
          outFile,
          JSON.stringify({
            input,
            output: JSON.stringify(output),
            metadata: {
              tier: 'bulk',
              source: 'mind2web-train',
              website: step.website,
              annotation_id: step.annotation_id,
              action_uid: step.action_uid,
              schema_sha: SCHEMA_SHA,
              template_sha: TEMPLATE_SHA,
              annotate_version: ANNOTATE_VERSION,
              pretrim_version: PRETRIM_VERSION,
            },
          }) + '\n'
        );
        emitted.add(step.action_uid);
      } else {
        bump(reason || 'unknown');
      }
    } catch (e) {
      reason = 'exception:' + String(e.message).slice(0, 80);
      bump(reason);
    }
    if (log.enabled()) {
      await log.logRow('examples', {
        kind: 'm2w-ingest',
        tier: 'bulk',
        source: 'mind2web-train',
        split: SPLIT,
        website: step.website,
        annotation_id: step.annotation_id,
        action_uid: step.action_uid,
        op: step.op,
        valid: verdict,
        reason: verdict ? null : reason,
        errors: errors.slice(0, 4),
        schema_sha: SCHEMA_SHA,
        template_sha: TEMPLATE_SHA,
      });
    }
    process.stdout.write(verdict ? '.' : 'x');
    if (stats.attempted % 25 === 0) {
      console.log(
        ` [${stats.attempted}] kept ${stats.kept} (${((100 * stats.kept) / stats.attempted).toFixed(1)}%)`
      );
    }
  }

  const summary = {
    kind: 'm2w-ingest-summary',
    split: SPLIT,
    attempted: stats.attempted,
    kept: stats.kept,
    keep_rate: stats.attempted ? +(stats.kept / stats.attempted).toFixed(3) : 0,
    skipped_already_emitted: stats.skipped_dup,
    discard_reasons: discard,
    websites_covered: websites.size,
    avg_input_tokens: stats.kept ? Math.round(stats.inputTokens / stats.kept) : 0,
    out_file: path.relative(root, outFile),
  };
  if (log.enabled()) {
    await log.logRow('examples', summary);
    await log.close();
  }
  console.log('\n' + JSON.stringify(summary, null, 2));
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});

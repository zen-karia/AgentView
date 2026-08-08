'use strict';
// Mind2Web sample eval: pulls N CLICK-step rows from the public
// Multimodal-Mind2Web test_website split (HF datasets-server API — no bulk
// download), runs them through the standard input pipeline and any
// OpenAI-compatible arm, and scores official-style Element Accuracy:
// strict = a predicted action's resolved element carries a gold
// backend_node_id; lenient = ancestor/descendant of one. Also reports the
// model-independent PRETRIM GOLD SURVIVAL rate (is the gold element still
// present in the trimmed page?) — the ceiling for any model.
// EVAL-ONLY data (D6/D8). Deterministic row choice: fixed offsets, CLICK ops,
// deduped by annotation_id.
//
// Usage: node --env-file=.env pipeline/eval-m2w-sample.js --arm <name> \
//   --base-url <url> --model <id> --key-env FLASH_API_KEY [--n 40] [--rpm 0]

const { JSDOM } = require('jsdom');
const { annotate } = require('../src/annotate');
const { pretrim, approxTokens, PAGE_TOKEN_BUDGET } = require('../src/pretrim');
const { validate } = require('../src/validate');
const { systemPrompt, renderUser } = require('../src/render');
const log = require('../src/log');

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function arg(name, dflt) {
  const i = process.argv.indexOf(`--${name}`);
  return i === -1 ? dflt : process.argv[i + 1];
}

async function fetchRows(want) {
  const rows = [];
  const seen = new Set();
  for (const offset of [0, 20, 40, 60, 80, 100, 120, 140, 160, 180, 220, 260, 300, 340]) {
    if (rows.length >= want) break;
    const url = `https://datasets-server.huggingface.co/rows?dataset=osunlp%2FMultimodal-Mind2Web&config=default&split=test_website&offset=${offset}&length=20`;
    const resp = await fetch(url);
    if (!resp.ok) continue;
    const data = await resp.json();
    for (const { row } of data.rows || []) {
      if (rows.length >= want) break;
      if (seen.has(row.annotation_id)) continue;
      let op;
      try {
        op = JSON.parse(row.operation);
      } catch {
        continue;
      }
      if (op.op !== 'CLICK' || !row.cleaned_html) continue;
      const gold = (row.pos_candidates || [])
        .map((c) => {
          try {
            return JSON.parse(JSON.parse(c).attributes).backend_node_id;
          } catch {
            return null;
          }
        })
        .filter(Boolean);
      if (!gold.length) continue;
      seen.add(row.annotation_id);
      const history = (row.action_reprs || []).slice(0, row.target_action_index ?? 0);
      rows.push({
        website: row.website,
        annotation_id: row.annotation_id,
        goal: row.confirmed_task + (history.length ? ` Previous actions already completed: ${history.join('; ')}` : ''),
        gold,
        html: row.cleaned_html,
      });
    }
  }
  return rows;
}

async function callArm(cfg, goal, trimmed) {
  const body = {
    model: cfg.model,
    messages: [
      { role: 'system', content: systemPrompt() },
      { role: 'user', content: renderUser(goal, trimmed) },
    ],
    temperature: 0,
    max_tokens: 2000,
  };
  if (cfg.repPenalty !== false) body.repetition_penalty = 1.08;
  const resp = await fetch(`${cfg.baseUrl.replace(/\/$/, '')}/chat/completions`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${cfg.key}` },
    body: JSON.stringify(body),
  });
  if (resp.status === 400 && cfg.repPenalty !== false) {
    cfg.repPenalty = false;
    return callArm(cfg, goal, trimmed);
  }
  if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
  const data = await resp.json();
  return data.choices?.[0]?.message?.content ?? '';
}

function goldHit(rawDoc, output, goldIds) {
  const goldEls = goldIds
    .map((id) => rawDoc.querySelector(`[backend_node_id="${id}"]`))
    .filter(Boolean);
  let strict = false;
  let lenient = false;
  for (const a of output.actions || []) {
    let el;
    try {
      const nodes = rawDoc.querySelectorAll(a.target_selector);
      el = nodes.length === 1 ? nodes[0] : null;
    } catch {
      el = null;
    }
    if (!el) continue;
    if (goldIds.includes(el.getAttribute('backend_node_id'))) strict = true;
    if (goldEls.some((g) => g.contains(el) || el.contains(g))) lenient = true;
  }
  return { strict, lenient };
}

async function main() {
  const cfg = {
    arm: arg('arm'),
    baseUrl: arg('base-url'),
    model: arg('model'),
    key: process.env[arg('key-env', 'FLASH_API_KEY')],
    repPenalty: true,
  };
  const want = parseInt(arg('n', '40'), 10);
  const rpm = parseFloat(arg('rpm', '0'));
  if (!cfg.arm || !cfg.baseUrl || !cfg.model || !cfg.key) {
    console.error('need --arm --base-url --model and key');
    process.exit(2);
  }

  const rows = await fetchRows(want);
  console.log(`fetched ${rows.length} CLICK steps from ${new Set(rows.map((r) => r.website)).size} websites`);

  const stats = { n: 0, survived: 0, valid: 0, strict: 0, lenient: 0, over_budget: 0, errors: 0 };
  for (const r of rows) {
    stats.n++;
    const raw = annotate(r.html);
    const trimmed = pretrim(raw);
    const trimmedDoc = new JSDOM(trimmed).window.document;
    const rawDoc = new JSDOM(raw).window.document;
    const survived = r.gold.some((id) => trimmedDoc.querySelector(`[backend_node_id="${id}"]`));
    if (survived) stats.survived++;
    if (approxTokens(trimmed) > PAGE_TOKEN_BUDGET) stats.over_budget++;

    const row = { kind: 'eval-m2w-sample', arm: cfg.arm, model: cfg.model, website: r.website, survived };
    try {
      const text = await callArm(cfg, r.goal, trimmed);
      const cleaned = text.replace(/^[\s\S]*?<\/think>/, '').replace(/```(?:json)?/g, '').trim();
      const output = JSON.parse(cleaned);
      row.valid = validate(output, trimmed, raw).valid;
      if (row.valid) stats.valid++;
      const hit = goldHit(rawDoc, output, r.gold);
      row.strict = hit.strict;
      row.lenient = hit.lenient;
      if (hit.strict) stats.strict++;
      if (hit.lenient) stats.lenient++;
    } catch (e) {
      stats.errors++;
      row.error = String(e.message).slice(0, 120);
    }
    if (log.enabled()) await log.logRow('eval', row);
    process.stdout.write(row.strict ? 'S' : row.lenient ? 'l' : row.valid ? '.' : 'x');
    if (rpm > 0) await sleep(Math.ceil(60000 / rpm));
  }

  const summary = {
    kind: 'eval-m2w-sample-summary',
    arm: cfg.arm,
    n: stats.n,
    pretrim_gold_survival: stats.n ? +(stats.survived / stats.n).toFixed(3) : 0,
    over_budget_pages: stats.over_budget,
    valid_rate: stats.n ? +(stats.valid / stats.n).toFixed(3) : 0,
    element_acc_strict: stats.n ? +(stats.strict / stats.n).toFixed(3) : 0,
    element_acc_lenient: stats.n ? +(stats.lenient / stats.n).toFixed(3) : 0,
    call_errors: stats.errors,
  };
  if (log.enabled()) {
    await log.logRow('eval', summary);
    await log.close();
  }
  console.log('\n' + JSON.stringify(summary, null, 2));
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});

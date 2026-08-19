'use strict';
// Eval harness (D7): runs an arm (any OpenAI-compatible endpoint) over held-out
// generated tasks and scores action-level correctness against gold elements.
// Metrics per EVAL.md: validator pass (gate), element recall (does a predicted
// action target the gold element), step match (element + kind), full task
// match (all gold actions matched), impossible-goal handling. Every row and
// the summary land in Mongo `eval`.
//
// Usage:
//   node --env-file=.env pipeline/eval.js --arm flash-2b-base \
//     --base-url https://.../v1 --model <run-id> --key-env FLASH_API_KEY \
//     --seeds 9010-9014 [--max 40] [--rpm 0]

const fs = require('fs');
const path = require('path');
const { JSDOM } = require('jsdom');
const { annotate } = require('../src/annotate');
const { pretrim } = require('../src/pretrim');
const { validate } = require('../src/validate');
const { systemPrompt, renderUser } = require('../src/render');
const log = require('../src/log');

const root = path.join(__dirname, '..');
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function arg(name, dflt) {
  const i = process.argv.indexOf(`--${name}`);
  return i === -1 ? dflt : process.argv[i + 1];
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
  if (cfg.repPenalty) body.repetition_penalty = 1.08;
  const resp = await fetch(`${cfg.baseUrl.replace(/\/$/, '')}/chat/completions`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${cfg.key}` },
    body: JSON.stringify(body),
  });
  if (resp.status === 400 && cfg.repPenalty) {
    cfg.repPenalty = false; // endpoint rejects the extension param — retry clean
    return callArm(cfg, goal, trimmed);
  }
  if (!resp.ok) throw new Error(`HTTP ${resp.status}: ${(await resp.text()).slice(0, 160)}`);
  const data = await resp.json();
  return data.choices?.[0]?.message?.content ?? '';
}

function scoreTask(task, output, rawDoc) {
  if (task.type === 'impossible') {
    const ok = output.actions.length === 0 && output.relevant_content.length === 0;
    return { impossible_correct: ok, gold_total: 0, gold_matched: 0, full: ok };
  }
  const predicted = output.actions.map((a) => ({
    kind: a.kind,
    el: (() => {
      try {
        const nodes = rawDoc.querySelectorAll(a.target_selector);
        return nodes.length === 1 ? nodes[0] : null;
      } catch {
        return null;
      }
    })(),
  }));
  let matched = 0;
  for (const g of task.gold_actions) {
    const goldEl = rawDoc.querySelector(g.selector);
    const hit = predicted.some((p) => p.el && goldEl && p.el.isSameNode(goldEl) && p.kind === g.kind);
    if (hit) matched++;
  }
  return {
    gold_total: task.gold_actions.length,
    gold_matched: matched,
    full: matched === task.gold_actions.length,
  };
}

async function main() {
  const cfg = {
    arm: arg('arm'),
    baseUrl: arg('base-url'),
    model: arg('model'),
    key: process.env[arg('key-env', 'FLASH_API_KEY')],
    repPenalty: true,
  };
  const seedsSpec = arg('seeds', '9010-9014');
  const max = parseInt(arg('max', '40'), 10);
  const rpm = parseFloat(arg('rpm', '0'));
  if (!cfg.arm || !cfg.baseUrl || !cfg.model || !cfg.key) {
    console.error('need --arm --base-url --model and a key in --key-env');
    process.exit(2);
  }
  const [sFrom, sTo] = seedsSpec.split('-').map(Number);

  const stats = {
    n: 0, unparseable: 0, valid: 0,
    gold_total: 0, gold_matched: 0, full: 0, full_n: 0,
    impossible_n: 0, impossible_correct: 0,
    latency_ms: 0,
  };
  outer: for (let seed = sFrom; seed <= (sTo || sFrom); seed++) {
    const dir = path.join(root, 'data', 'generated', `seed-${seed}`);
    const { tasks } = JSON.parse(fs.readFileSync(path.join(dir, 'tasks.json'), 'utf8'));
    const raw = annotate(fs.readFileSync(path.join(dir, 'page.html'), 'utf8'));
    const trimmed = pretrim(raw);
    const rawDoc = new JSDOM(raw).window.document;
    for (const task of tasks) {
      if (stats.n >= max) break outer;
      stats.n++;
      const t0 = Date.now();
      let row = { arm: cfg.arm, model: cfg.model, seed, task_id: task.id, kind: 'eval' };
      try {
        const text = await callArm(cfg, task.goal, trimmed);
        row.latency_ms = Date.now() - t0;
        stats.latency_ms += row.latency_ms;
        const cleaned = text.replace(/^[\s\S]*?<\/think>/, '').replace(/```(?:json)?/g, '').trim();
        const output = JSON.parse(cleaned);
        const res = validate(output, trimmed, raw);
        row.valid = res.valid;
        if (res.valid) stats.valid++;
        const s = scoreTask(task, res.valid ? output : { actions: [], relevant_content: [] }, rawDoc);
        Object.assign(row, s);
        if (task.type === 'impossible') {
          stats.impossible_n++;
          if (res.valid && s.impossible_correct) stats.impossible_correct++;
        } else {
          stats.gold_total += s.gold_total;
          stats.gold_matched += res.valid ? s.gold_matched : 0;
          stats.full_n++;
          if (res.valid && s.full) stats.full++;
        }
      } catch (e) {
        row.valid = false;
        row.error = String(e.message).slice(0, 160);
        stats.unparseable++;
        if (task.type === 'impossible') stats.impossible_n++;
        else {
          stats.full_n++;
          stats.gold_total += task.gold_actions.length;
        }
      }
      if (log.enabled()) await log.logRow('eval', row);
      process.stdout.write(row.valid ? (row.full ? 'F' : '.') : 'x');
      if (rpm > 0) await sleep(Math.ceil(60000 / rpm));
    }
  }

  const summary = {
    kind: 'eval-summary',
    arm: cfg.arm,
    model: cfg.model,
    seeds: seedsSpec,
    n: stats.n,
    valid_rate: stats.n ? +(stats.valid / stats.n).toFixed(3) : 0,
    element_recall: stats.gold_total ? +(stats.gold_matched / stats.gold_total).toFixed(3) : 0,
    task_full_match: stats.full_n ? +(stats.full / stats.full_n).toFixed(3) : 0,
    impossible_correct: stats.impossible_n ? +(stats.impossible_correct / stats.impossible_n).toFixed(3) : null,
    avg_latency_ms: stats.n ? Math.round(stats.latency_ms / stats.n) : 0,
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

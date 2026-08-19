'use strict';
// Mind2Web held-out scoring adapter (D7/D8: the >=2-of-5 third-party tasks).
// Runs an arm (any OpenAI-compatible endpoint) over the two Mind2Web tasks in
// eval/heldout-tasks.json (kind: "mind2web") and scores each predicted action
// against the task's gold_backend_node_ids.
//
// Input pipeline is IDENTICAL to everything else: annotate(raw) -> pretrim().
// Mind2Web cleaned_html carries backend_node_id as a literal attribute; the
// annotate() step adds data-av-id on top — both coexist, and scoring resolves
// the model's target_selector in the ANNOTATED raw DOM, then compares
// backend_node_id against the gold set:
//   strict_hit  — resolved element's own backend_node_id is in the gold set
//   lenient_hit — resolved element is an ancestor or descendant of an element
//                 whose backend_node_id is in the gold set (containment either
//                 direction; strict implies lenient)
// Validator verdict is reported but informational here — Mind2Web pages are
// real-web, and the gate metric is the element hit.
//
// Benchmark-mode goal variant (documented): when the task's history array is
// non-empty, ' Previous actions already completed: ' + history.join('; ') is
// appended to the goal string before rendering.
//
// Eval-mode sizing: pages may exceed PAGE_TOKEN_BUDGET — the adapter reports
// the trimmed token count and whether it fits, but NEVER truncates the page
// for the model call.
//
// Usage:
//   node pipeline/eval-m2w.js --arm sft-2b-v0 \
//     --base-url https://.../v1 --model <run-id> --key-env FLASH_API_KEY
//   node pipeline/eval-m2w.js --self-test     (no network, no key needed)

const fs = require('fs');
const path = require('path');
const { JSDOM } = require('jsdom');
const { annotate } = require('../src/annotate');
const { pretrim, approxTokens, PAGE_TOKEN_BUDGET } = require('../src/pretrim');
const { validate } = require('../src/validate');
const { systemPrompt, renderUser } = require('../src/render');
const log = require('../src/log');

const root = path.join(__dirname, '..');

function arg(name, dflt) {
  const i = process.argv.indexOf(`--${name}`);
  return i === -1 ? dflt : process.argv[i + 1];
}

function flag(name) {
  return process.argv.includes(`--${name}`);
}

// Same shape as pipeline/eval.js callArm: temperature 0, max_tokens 2000,
// repetition_penalty 1.08 with a clean retry if the endpoint 400s on it.
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

// Resolve a predicted selector in the annotated raw DOM. A selector counts
// only if it parses and matches exactly one element (same discipline as the
// validator / pipeline/eval.js).
function resolveOne(rawDoc, selector) {
  try {
    const nodes = rawDoc.querySelectorAll(selector);
    return nodes.length === 1 ? nodes[0] : null;
  } catch {
    return null;
  }
}

// Score predicted actions against gold_backend_node_ids in the annotated raw
// DOM. Returns { strict_hit, lenient_hit, strict_selector, lenient_selector,
// resolved: <count of predictions that resolved uniquely> }.
function scoreActions(rawDoc, actions, goldIds) {
  const gold = new Set(goldIds.map(String));
  const goldEls = [];
  for (const id of gold) {
    // backend_node_id is a plain attribute in Mind2Web cleaned_html.
    rawDoc.querySelectorAll(`[backend_node_id="${id}"]`).forEach((el) => goldEls.push(el));
  }
  const res = {
    strict_hit: false, lenient_hit: false,
    strict_selector: null, lenient_selector: null,
    resolved: 0,
  };
  for (const a of actions || []) {
    const el = resolveOne(rawDoc, a.target_selector);
    if (!el) continue;
    res.resolved++;
    const own = el.getAttribute('backend_node_id');
    if (own !== null && gold.has(own)) {
      res.strict_hit = true;
      if (!res.strict_selector) res.strict_selector = a.target_selector;
    }
    // Lenient: containment in either direction with any gold element
    // (el.contains(el) is true, so a strict hit is also a lenient hit).
    if (goldEls.some((g) => g.contains(el) || el.contains(g))) {
      res.lenient_hit = true;
      if (!res.lenient_selector) res.lenient_selector = a.target_selector;
    }
  }
  return res;
}

function loadTasks() {
  const meta = JSON.parse(fs.readFileSync(path.join(root, 'eval', 'heldout-tasks.json'), 'utf8'));
  return meta.third_party_tasks.filter((t) => t.kind === 'mind2web');
}

function prepPage(task) {
  const rawHtml = fs.readFileSync(path.join(root, task.page), 'utf8');
  const annotated = annotate(rawHtml);
  const trimmed = pretrim(annotated);
  const tokens = approxTokens(trimmed);
  return {
    annotated,
    trimmed,
    tokens,
    fits_budget: tokens <= PAGE_TOKEN_BUDGET,
    rawDoc: new JSDOM(annotated).window.document,
  };
}

function benchmarkGoal(task) {
  let goal = task.goal;
  if (Array.isArray(task.history) && task.history.length) {
    goal += ' Previous actions already completed: ' + task.history.join('; ');
  }
  return goal;
}

// --self-test: prove the scoring logic on the real m2w pages without any
// model call. Constructs synthetic outputs whose selectors resolve to (a) a
// gold element -> strict must be true, (b) a non-gold, non-contained element
// -> both must be false, (c) a descendant of a gold element -> lenient true,
// strict false. Exits non-zero on any assertion failure.
function selfTest() {
  const tasks = loadTasks();
  let failures = 0;
  const assert = (cond, label) => {
    console.log(`  ${cond ? 'PASS' : 'FAIL'}  ${label}`);
    if (!cond) failures++;
  };

  for (const task of tasks) {
    console.log(`self-test: ${task.website} (${task.page})`);
    const { rawDoc } = prepPage(task);
    const goldId = String(task.gold_backend_node_ids[0]);
    const goldSel = `[backend_node_id="${goldId}"]`;
    const goldEl = resolveOne(rawDoc, goldSel);
    assert(goldEl !== null, `gold element ${goldSel} resolves uniquely in annotated raw DOM`);
    if (!goldEl) continue;

    // (a) selector resolving to the gold element itself -> strict + lenient.
    let s = scoreActions(rawDoc, [{ target_selector: goldSel }], task.gold_backend_node_ids);
    assert(s.strict_hit === true, `gold selector -> strict_hit=true`);
    assert(s.lenient_hit === true, `gold selector -> lenient_hit=true`);

    // (b) a non-gold element outside any gold subtree -> both false.
    const goldSet = new Set(task.gold_backend_node_ids.map(String));
    const goldEls = Array.from(goldSet).flatMap((id) =>
      Array.from(rawDoc.querySelectorAll(`[backend_node_id="${id}"]`))
    );
    let missEl = null;
    for (const el of rawDoc.querySelectorAll('[backend_node_id]')) {
      const id = el.getAttribute('backend_node_id');
      if (goldSet.has(id)) continue;
      if (goldEls.some((g) => g.contains(el) || el.contains(g))) continue;
      const sel = `[backend_node_id="${id}"]`;
      if (resolveOne(rawDoc, sel)) { missEl = sel; break; }
    }
    assert(missEl !== null, `found an unrelated element to use as a miss probe`);
    if (missEl) {
      s = scoreActions(rawDoc, [{ target_selector: missEl }], task.gold_backend_node_ids);
      assert(s.strict_hit === false, `miss selector ${missEl} -> strict_hit=false`);
      assert(s.lenient_hit === false, `miss selector ${missEl} -> lenient_hit=false`);
    }

    // (c) a descendant of the gold element -> lenient true, strict false
    // (skipped when the gold element has no addressable non-gold descendant).
    let descSel = null;
    for (const child of goldEl.querySelectorAll('[backend_node_id]')) {
      const id = child.getAttribute('backend_node_id');
      if (goldSet.has(id)) continue;
      const sel = `[backend_node_id="${id}"]`;
      if (resolveOne(rawDoc, sel)) { descSel = sel; break; }
    }
    if (descSel) {
      s = scoreActions(rawDoc, [{ target_selector: descSel }], task.gold_backend_node_ids);
      assert(s.strict_hit === false, `descendant selector ${descSel} -> strict_hit=false`);
      assert(s.lenient_hit === true, `descendant selector ${descSel} -> lenient_hit=true`);
    } else {
      console.log(`  SKIP  no addressable non-gold descendant of gold element (containment case covered by other page)`);
    }

    // (d) non-resolving / multi-match selectors never score.
    s = scoreActions(rawDoc, [{ target_selector: 'div' }, { target_selector: ':::garbage' }], task.gold_backend_node_ids);
    assert(s.strict_hit === false && s.lenient_hit === false, `ambiguous + unparseable selectors -> no hit`);
  }

  console.log(failures === 0 ? '\nself-test: ALL PASS' : `\nself-test: ${failures} FAILURE(S)`);
  process.exit(failures === 0 ? 0 : 1);
}

async function main() {
  if (flag('self-test')) return selfTest();

  const cfg = {
    arm: arg('arm'),
    baseUrl: arg('base-url'),
    model: arg('model'),
    key: process.env[arg('key-env', 'FLASH_API_KEY')],
    repPenalty: true,
  };
  if (!cfg.arm || !cfg.baseUrl || !cfg.model || !cfg.key) {
    console.error('need --arm --base-url --model and a key in --key-env (or run --self-test)');
    process.exit(2);
  }

  const tasks = loadTasks();
  const results = [];
  for (const task of tasks) {
    const page = prepPage(task);
    const goal = benchmarkGoal(task);
    const row = {
      kind: 'eval-m2w',
      arm: cfg.arm,
      model: cfg.model,
      website: task.website,
      annotation_id: task.annotation_id,
      trimmed_tokens: page.tokens,
      fits_budget: page.fits_budget,
      valid: false,
      strict_hit: false,
      lenient_hit: false,
    };
    console.log(`\n== ${task.website} — trimmed ~${page.tokens} tokens ` +
      `(${page.fits_budget ? 'fits' : 'EXCEEDS'} PAGE_TOKEN_BUDGET=${PAGE_TOKEN_BUDGET}; not truncated — eval mode)`);
    const t0 = Date.now();
    try {
      const text = await callArm(cfg, goal, page.trimmed);
      row.latency_ms = Date.now() - t0;
      const cleaned = text.replace(/^[\s\S]*?<\/think>/, '').replace(/```(?:json)?/g, '').trim();
      const output = JSON.parse(cleaned);
      const v = validate(output, page.trimmed, page.annotated);
      row.valid = v.valid;
      row.validator_errors = v.errors.slice(0, 5);
      const actions = Array.isArray(output.actions) ? output.actions : [];
      row.n_actions = actions.length;
      const s = scoreActions(page.rawDoc, actions, task.gold_backend_node_ids);
      Object.assign(row, s);
    } catch (e) {
      row.latency_ms = Date.now() - t0;
      row.error = String(e.message).slice(0, 200);
    }
    results.push(row);
    console.log(JSON.stringify({
      website: row.website, valid: row.valid,
      strict_hit: row.strict_hit, lenient_hit: row.lenient_hit,
      strict_selector: row.strict_selector || null,
      lenient_selector: row.lenient_selector || null,
      n_actions: row.n_actions ?? null, resolved: row.resolved ?? null,
      latency_ms: row.latency_ms, error: row.error || null,
    }, null, 2));
    if (log.enabled()) await log.logRow('eval', row);
  }

  const summary = {
    kind: 'eval-m2w-summary',
    arm: cfg.arm,
    model: cfg.model,
    n: results.length,
    valid: results.filter((r) => r.valid).length,
    strict_hits: results.filter((r) => r.strict_hit).length,
    lenient_hits: results.filter((r) => r.lenient_hit).length,
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

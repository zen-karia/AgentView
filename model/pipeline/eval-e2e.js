'use strict';
// END-TO-END eval (EVAL.md primary metric): the full product loop.
//   translator arm -> AgentView JSON -> driver agent picks actions ->
//   Playwright executes on the live page -> success predicate judges.
// The driver (default gemini-3.5-flash) receives ONLY the goal + the
// translator's JSON — never the page — which is exactly the architecture
// claim: the small model translates, the frontier model decides cheaply.
// --driver none = execute all emitted actions in order (no selection step).
//
// Usage:
//   node --env-file=.env pipeline/eval-e2e.js --arm sft-2b-v0 \
//     --base-url <url> --model <run-id> --key-env FLASH_API_KEY \
//     --seeds 9001-9003 [--driver gemini-3.5-flash|none]

const fs = require('fs');
const path = require('path');
const { chromium } = require('playwright');
const { annotate } = require('../src/annotate');
const { pretrim } = require('../src/pretrim');
const { validate } = require('../src/validate');
const { systemPrompt, renderUser } = require('../src/render');
const { annotateLive, executeAction } = require('./executor');
const log = require('../src/log');

const root = path.join(__dirname, '..');
const GEMINI_BASE = 'https://generativelanguage.googleapis.com/v1beta/openai';

function arg(name, dflt) {
  const i = process.argv.indexOf(`--${name}`);
  return i === -1 ? dflt : process.argv[i + 1];
}

async function callTranslator(cfg, goal, trimmed) {
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
    cfg.repPenalty = false; // endpoint rejects the extension param — retry clean
    return callTranslator(cfg, goal, trimmed);
  }
  if (!resp.ok) throw new Error(`translator HTTP ${resp.status}: ${(await resp.text()).slice(0, 120)}`);
  const data = await resp.json();
  return data.choices?.[0]?.message?.content ?? '';
}

async function callDriver(driverModel, goal, output) {
  const body = {
    model: driverModel,
    messages: [
      {
        role: 'system',
        content:
          'You are the driver agent. You receive a GOAL and an AgentView JSON describing relevant page content and available actions. Decide which actions to execute and in what order to accomplish the goal. Use relevant_content to compare candidates (e.g. prices) before choosing. Reply with ONLY a JSON array of action ids in execution order, e.g. ["a2"] or ["a1","a3"]. Choose the minimal set that accomplishes the goal.',
      },
      { role: 'user', content: `GOAL: ${goal}\n\nAGENTVIEW:\n${JSON.stringify(output)}` },
    ],
    temperature: 0,
    max_tokens: 1500,
    reasoning_effort: 'low',
  };
  const resp = await fetch(`${GEMINI_BASE}/chat/completions`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${process.env.GEMINI_API_KEY}` },
    body: JSON.stringify(body),
  });
  if (!resp.ok) throw new Error(`driver HTTP ${resp.status}`);
  const data = await resp.json();
  const text = (data.choices?.[0]?.message?.content ?? '').replace(/```(?:json)?/g, '').trim();
  const ids = JSON.parse(text);
  if (!Array.isArray(ids)) throw new Error('driver did not return an array');
  return ids;
}

async function main() {
  const cfg = {
    arm: arg('arm'),
    baseUrl: arg('base-url'),
    model: arg('model'),
    key: process.env[arg('key-env', 'FLASH_API_KEY')],
  };
  const driverModel = arg('driver', 'gemini-3.5-flash');
  const seedsSpec = arg('seeds', '9001-9003');
  const [sFrom, sTo] = seedsSpec.split('-').map(Number);
  if (!cfg.arm || !cfg.baseUrl || !cfg.model || !cfg.key) {
    console.error('need --arm --base-url --model and a key in --key-env');
    process.exit(2);
  }
  if (driverModel !== 'none' && !process.env.GEMINI_API_KEY) {
    console.error('driver needs GEMINI_API_KEY (or pass --driver none)');
    process.exit(2);
  }

  const browser = await chromium.launch();
  const stats = { n: 0, success: 0, invalid: 0, driver_err: 0, exec_err: 0 };
  for (let seed = sFrom; seed <= (sTo || sFrom); seed++) {
    const dir = path.join(root, 'data', 'generated', `seed-${seed}`);
    const { tasks } = JSON.parse(fs.readFileSync(path.join(dir, 'tasks.json'), 'utf8'));
    const rawHtml = annotate(fs.readFileSync(path.join(dir, 'page.html'), 'utf8'));
    const trimmed = pretrim(rawHtml);
    const pageUrl = 'file:///' + path.join(dir, 'page.html').replace(/\\/g, '/');

    for (const task of tasks) {
      if (task.type !== 'actionable') continue;
      stats.n++;
      const row = { kind: 'eval-e2e', arm: cfg.arm, model: cfg.model, driver: driverModel, seed, task_id: task.id };
      let stage = 'translate';
      try {
        const text = await callTranslator(cfg, task.goal, trimmed);
        const cleaned = text.replace(/^[\s\S]*?<\/think>/, '').replace(/```(?:json)?/g, '').trim();
        const output = JSON.parse(cleaned);
        const res = validate(output, trimmed, rawHtml);
        row.valid = res.valid;
        if (!res.valid) {
          stats.invalid++;
          row.success = false;
          throw Object.assign(new Error('invalid translator output'), { soft: true });
        }
        stage = 'drive';
        let ids;
        if (driverModel === 'none') {
          ids = output.actions.map((a) => a.id);
        } else {
          ids = await callDriver(driverModel, task.goal, output);
        }
        row.driver_ids = ids;
        stage = 'execute';
        const byId = new Map(output.actions.map((a) => [a.id, a]));
        const page = await browser.newPage();
        await page.goto(pageUrl);
        await annotateLive(page);
        for (const id of ids) {
          const a = byId.get(id);
          if (!a) throw new Error(`driver chose unknown action ${id}`);
          await executeAction(page, a);
        }
        stage = 'judge';
        row.success = await page.evaluate((expr) => {
          try {
            return !!(0, eval)(expr);
          } catch {
            return false;
          }
        }, task.predicate);
        await page.close();
        if (row.success) stats.success++;
      } catch (e) {
        if (!e.soft) {
          if (stage === 'translate') stats.translate_err = (stats.translate_err || 0) + 1;
          else if (stage === 'drive') stats.driver_err++;
          else if (stage === 'execute') stats.exec_err++;
          row.error = `${stage}: ${String(e.message).slice(0, 120)}`;
          row.success = false;
        }
      }
      if (log.enabled()) await log.logRow('eval', row);
      process.stdout.write(row.success ? 'S' : 'x');
    }
  }
  await browser.close();

  const summary = {
    kind: 'eval-e2e-summary',
    arm: cfg.arm,
    driver: driverModel,
    seeds: seedsSpec,
    n: stats.n,
    task_success_rate: stats.n ? +(stats.success / stats.n).toFixed(3) : 0,
    invalid_outputs: stats.invalid,
    translate_errors: stats.translate_err || 0,
    driver_errors: stats.driver_err,
    exec_errors: stats.exec_err,
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

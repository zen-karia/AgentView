'use strict';
// The no-AgentView baseline arm (D7/D18): the same driver model works from the
// raw Playwright ACCESSIBILITY SNAPSHOT instead of AgentView JSON. This is the
// measured answer to "why not just use the a11y tree?" — same pages, same
// goals, same success predicates, same driver; only the page representation
// differs. Steps are grounded by role/name/text (the only handles an a11y
// snapshot offers), resolved via Playwright getByRole/getByText.
//
// Usage: node --env-file=.env pipeline/eval-a11y.js --seeds 9001-9003 [--driver gemini-3.5-flash]

const fs = require('fs');
const path = require('path');
const { chromium } = require('playwright');
const { annotate } = require('../src/annotate');
const { pretrim, approxTokens } = require('../src/pretrim');
const log = require('../src/log');

const root = path.join(__dirname, '..');
const GEMINI_BASE = 'https://generativelanguage.googleapis.com/v1beta/openai';

function arg(name, dflt) {
  const i = process.argv.indexOf(`--${name}`);
  return i === -1 ? dflt : process.argv[i + 1];
}

async function callDriver(model, goal, snapshot) {
  const body = {
    model,
    messages: [
      {
        role: 'system',
        content:
          'You are a web agent. You receive a GOAL and the accessibility snapshot of a page. Decide the steps to accomplish the goal. Reply with ONLY a JSON array of steps, each {"kind":"click"|"type"|"select","target":{"role":"...","name":"..."} or {"text":"..."},"value":"..."}. "value" only for type/select (for select use the visible option label). Prefer role+name targets; use text only when no role fits. Minimal steps.',
      },
      { role: 'user', content: `GOAL: ${goal}\n\nACCESSIBILITY SNAPSHOT:\n${snapshot}` },
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
  const steps = JSON.parse(text);
  if (!Array.isArray(steps)) throw new Error('driver did not return an array');
  return steps;
}

function locate(page, target) {
  if (target?.role) return page.getByRole(target.role, target.name ? { name: target.name } : {}).first();
  if (target?.text) return page.getByText(target.text, { exact: false }).first();
  throw new Error('step has no usable target');
}

async function executeStep(page, step) {
  const loc = locate(page, step.target);
  if (step.kind === 'click') await loc.click({ timeout: 3000 });
  else if (step.kind === 'type') await loc.fill(step.value ?? '', { timeout: 3000 });
  else if (step.kind === 'select') {
    try {
      await loc.selectOption({ label: step.value }, { timeout: 3000 });
    } catch {
      await loc.selectOption(step.value, { timeout: 3000 });
    }
  } else throw new Error(`unknown kind ${step.kind}`);
}

async function main() {
  const driverModel = arg('driver', 'gemini-3.5-flash');
  const seedsSpec = arg('seeds', '9001-9003');
  const [sFrom, sTo] = seedsSpec.split('-').map(Number);
  if (!process.env.GEMINI_API_KEY) {
    console.error('needs GEMINI_API_KEY');
    process.exit(2);
  }

  const browser = await chromium.launch();
  const stats = { n: 0, success: 0, driver_err: 0, exec_err: 0, snap_tokens: 0, trim_tokens: 0 };
  for (let seed = sFrom; seed <= (sTo || sFrom); seed++) {
    const dir = path.join(root, 'data', 'generated', `seed-${seed}`);
    const { tasks } = JSON.parse(fs.readFileSync(path.join(dir, 'tasks.json'), 'utf8'));
    const pageUrl = 'file:///' + path.join(dir, 'page.html').replace(/\\/g, '/');
    const trimmedTokens = approxTokens(pretrim(annotate(fs.readFileSync(path.join(dir, 'page.html'), 'utf8'))));

    for (const task of tasks) {
      if (task.type !== 'actionable') continue;
      stats.n++;
      const row = { kind: 'eval-a11y', arm: 'a11y-snapshot', driver: driverModel, seed, task_id: task.id };
      let stage = 'snapshot';
      try {
        const page = await browser.newPage();
        await page.goto(pageUrl);
        const snapshot = await page.locator('html').ariaSnapshot();
        row.snap_tokens = approxTokens(snapshot);
        row.trim_tokens = trimmedTokens;
        stats.snap_tokens += row.snap_tokens;
        stats.trim_tokens += trimmedTokens;
        stage = 'drive';
        const steps = await callDriver(driverModel, task.goal, snapshot);
        row.steps = steps.length;
        stage = 'execute';
        for (const s of steps) await executeStep(page, s);
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
        if (stage === 'drive') stats.driver_err++;
        else if (stage === 'execute') stats.exec_err++;
        row.error = `${stage}: ${String(e.message).split('\n')[0].slice(0, 120)}`;
        row.success = false;
      }
      if (log.enabled()) await log.logRow('eval', row);
      process.stdout.write(row.success ? 'S' : 'x');
    }
  }
  await browser.close();

  const summary = {
    kind: 'eval-a11y-summary',
    arm: 'a11y-snapshot',
    driver: driverModel,
    seeds: seedsSpec,
    n: stats.n,
    task_success_rate: stats.n ? +(stats.success / stats.n).toFixed(3) : 0,
    driver_errors: stats.driver_err,
    exec_errors: stats.exec_err,
    avg_snapshot_tokens: stats.n ? Math.round(stats.snap_tokens / stats.n) : 0,
    avg_trimmed_tokens: stats.n ? Math.round(stats.trim_tokens / stats.n) : 0,
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

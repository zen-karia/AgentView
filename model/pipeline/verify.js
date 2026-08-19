'use strict';
// The verifier (D6): loads a generated page in real Chromium, injects the SAME
// data-av-id annotation as src/annotate.js, executes an action sequence, and
// evaluates the task's success predicate in the live page. This is the ground
// truth for the spine tier, the GRPO reward, and the primary eval metric.
//
// Usage:
//   node --env-file=.env pipeline/verify.js data/generated/seed-1 [--task <id>] [--no-act]
// --no-act runs predicates WITHOUT executing actions: every actionable task's
// predicate must then be false (sanity check that predicates aren't trivially true).

const fs = require('fs');
const path = require('path');
const { chromium } = require('playwright');
const { ANNOTATE_VERSION } = require('../src/annotate');
const { annotateLive, executeAction } = require('./executor');
const log = require('../src/log');

async function main() {
  const args = process.argv.slice(2);
  const dirArg = args[0];
  const noAct = args.includes('--no-act');
  const taskFlag = args.indexOf('--task');
  const onlyTask = taskFlag !== -1 ? args[taskFlag + 1] : null;
  if (!dirArg) {
    console.error('usage: node pipeline/verify.js <siteDir> [--task <id>] [--no-act]');
    process.exit(2);
  }
  const dir = path.resolve(dirArg);
  const { meta, tasks } = JSON.parse(fs.readFileSync(path.join(dir, 'tasks.json'), 'utf8'));
  const pageUrl = 'file:///' + path.join(dir, 'page.html').replace(/\\/g, '/');

  const browser = await chromium.launch();
  const results = [];
  for (const task of tasks) {
    if (onlyTask && task.id !== onlyTask) continue;
    if (task.type === 'impossible') {
      results.push({ task: task.id, status: 'SKIP (impossible-goal task — translator eval only)' });
      continue;
    }
    const page = await browser.newPage();
    await page.goto(pageUrl);
    await annotateLive(page);
    let error = null;
    if (!noAct) {
      for (const a of task.gold_actions) {
        try {
          await executeAction(page, a);
        } catch (e) {
          error = `${a.kind} ${a.selector}: ${e.message.split('\n')[0]}`;
          break;
        }
      }
    }
    const holds = error
      ? false
      : await page.evaluate((expr) => {
          try {
            return !!(0, eval)(expr);
          } catch {
            return false;
          }
        }, task.predicate);
    await page.close();

    const pass = noAct ? !holds : holds;
    results.push({
      task: task.id,
      status: `${pass ? 'PASS' : 'FAIL'}${noAct ? ' (sanity: predicate false without actions)' : ''}${error ? ` — action error: ${error}` : ''}`,
      pass,
    });
  }
  await browser.close();

  console.log(`${path.basename(dir)} (seed ${meta.seed})${noAct ? ' — NO-ACT SANITY MODE' : ''}`);
  for (const r of results) console.log(`  ${r.status.padEnd(10).slice(0, 4)}  ${r.task}  ${r.status.includes('—') ? r.status.split('—')[1] : ''}`);
  const failed = results.filter((r) => r.pass === false).length;

  if (log.enabled()) {
    await log.logRows(
      'verify',
      results
        .filter((r) => r.pass !== undefined)
        .map((r) => ({
          kind: noAct ? 'verify-sanity' : 'verify',
          seed: meta.seed,
          task: r.task,
          pass: r.pass,
          annotate_version: ANNOTATE_VERSION,
        }))
    );
    await log.close();
  }

  console.log(failed === 0 ? 'All verifiable tasks OK.' : `${failed} task(s) FAILED.`);
  process.exit(failed === 0 ? 0 : 1);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});

'use strict';
// One-shot held-out freeze (D8). Assembles and writes eval/ :
//   1. Three demo tasks picked from reserved-seed generated sites (9001-9003)
//      — fully executable with success predicates.
//   2. Two third-party tasks from Mind2Web (Multimodal-Mind2Web test_website
//      split via the HF datasets-server API) — action-level ground truth:
//      the model's target_selector must resolve to an element whose
//      backend_node_id is in the labeled positive set.
//   3. pageset-manifest.json — the held-out PAGE set (seeds 9010-9059) with
//      sha256 of every page, for leakage audits.
// Then flips contracts/heldout-seeds.json tasks_committed. Deterministic:
// Mind2Web rows are chosen by fixed criteria from a fixed offset window.
// Run once: node scripts/freeze-heldout.js

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { JSDOM } = require('jsdom');

const root = path.join(__dirname, '..');
const evalDir = path.join(root, 'eval');
const sha256 = (buf) => crypto.createHash('sha256').update(buf).digest('hex');

// --- 1. demo tasks from reserved seeds --------------------------------------
// Fixed picks: prefer the most demo-worthy task type available per seed.
const DEMO_PREFS = [
  { seed: 9001, prefer: ['add-cheapest-wireless-hp', 'newsletter', 'sort-price-asc'] },
  { seed: 9002, prefer: ['newsletter', 'sort-price-asc', 'dismiss-cookie'] },
  { seed: 9003, prefer: ['sort-price-asc', 'dismiss-cookie', 'add-cheapest-wireless-hp'] },
];

function pickDemoTasks() {
  const picked = [];
  const used = new Set();
  for (const { seed, prefer } of DEMO_PREFS) {
    const { tasks } = JSON.parse(
      fs.readFileSync(path.join(root, 'data', 'generated', `seed-${seed}`, 'tasks.json'), 'utf8')
    );
    const order = [...prefer, ...tasks.filter((t) => t.type === 'actionable').map((t) => t.id)];
    const chosen = order
      .map((id) => tasks.find((t) => t.id === id && t.type === 'actionable'))
      .find((t) => t && !used.has(t.id));
    if (!chosen) throw new Error(`no pickable task for seed ${seed}`);
    used.add(chosen.id);
    picked.push({
      kind: 'generated',
      seed,
      page: `data/generated/seed-${seed}/page.html`,
      task_id: chosen.id,
      goal: chosen.goal,
      predicate: chosen.predicate,
    });
  }
  return picked;
}

// --- 2. third-party tasks from Mind2Web -------------------------------------
async function fetchMind2Web() {
  const chosen = [];
  // Deterministic scan: fixed offsets, first qualifying row per DISTINCT website.
  for (const offset of [0, 20, 40, 60, 80, 120, 160, 200]) {
    if (chosen.length === 2) break;
    const url = `https://datasets-server.huggingface.co/rows?dataset=osunlp%2FMultimodal-Mind2Web&config=default&split=test_website&offset=${offset}&length=20`;
    const resp = await fetch(url);
    if (!resp.ok) throw new Error(`HF datasets-server ${resp.status}`);
    const data = await resp.json();
    for (const { row } of data.rows) {
      if (chosen.length === 2) break;
      if (chosen.some((c) => c.website === row.website || c.annotation_id === row.annotation_id)) continue;
    let op;
    try {
      op = JSON.parse(row.operation);
    } catch {
      continue;
    }
    if (op.op !== 'CLICK') continue; // action-level scoring is cleanest on clicks
    const pos = (row.pos_candidates || [])
      .map((c) => {
        try {
          return JSON.parse(JSON.parse(c).attributes).backend_node_id;
        } catch {
          return null;
        }
      })
      .filter(Boolean);
    if (!pos.length || !row.cleaned_html) continue;
    // sanity: the html must parse and contain at least one labeled element
    const doc = new JSDOM(row.cleaned_html).window.document;
    const found = pos.some((id) => doc.querySelector(`[backend_node_id="${id}"]`));
    if (!found) continue;
      chosen.push({
        kind: 'mind2web',
        website: row.website,
        annotation_id: row.annotation_id,
        action_uid: row.action_uid,
        goal: row.confirmed_task,
        history: row.action_reprs?.slice(0, row.target_action_index ?? 0) ?? [],
        gold_backend_node_ids: pos,
        html: row.cleaned_html,
      });
    }
  }
  if (chosen.length < 2) throw new Error(`only ${chosen.length} usable Mind2Web rows across scan window`);
  return chosen;
}

// --- 3. page-set manifest ----------------------------------------------------
function pagesetManifest() {
  const entries = [];
  for (let seed = 9010; seed <= 9059; seed++) {
    const dir = path.join(root, 'data', 'generated', `seed-${seed}`);
    const page = fs.readFileSync(path.join(dir, 'page.html'));
    const { tasks } = JSON.parse(fs.readFileSync(path.join(dir, 'tasks.json'), 'utf8'));
    entries.push({ seed, page_sha256: sha256(page), goals: tasks.length });
  }
  return entries;
}

async function main() {
  fs.mkdirSync(path.join(evalDir, 'heldout-tasks'), { recursive: true });

  const demo = pickDemoTasks();
  const m2w = await fetchMind2Web();
  const thirdParty = m2w.map((t, i) => {
    const dir = path.join(evalDir, 'heldout-tasks', `m2w-${i + 1}`);
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(path.join(dir, 'page.html'), t.html);
    const rec = {
      kind: t.kind,
      website: t.website,
      annotation_id: t.annotation_id,
      action_uid: t.action_uid,
      goal: t.goal,
      history: t.history,
      gold_backend_node_ids: t.gold_backend_node_ids,
      page: `eval/heldout-tasks/m2w-${i + 1}/page.html`,
      page_sha256: sha256(t.html),
    };
    fs.writeFileSync(path.join(dir, 'task.json'), JSON.stringify(rec, null, 2) + '\n');
    const { html, ...summary } = t;
    return { ...summary, page: rec.page, page_sha256: rec.page_sha256 };
  });

  const manifest = {
    frozen_at: new Date().toISOString(),
    rule: 'These 5 tasks and the page set below are EVAL-ONLY. No training example may derive from these pages/seeds (enforced by the generator blocklist and Mongo source tags).',
    demo_tasks: demo,
    third_party_tasks: thirdParty,
  };
  fs.writeFileSync(path.join(evalDir, 'heldout-tasks.json'), JSON.stringify(manifest, null, 2) + '\n');

  const pageset = {
    frozen_at: manifest.frozen_at,
    seeds: '9010-9059 (regenerate: node pipeline/generate-site.js <seed> --heldout)',
    entries: pagesetManifest(),
  };
  fs.writeFileSync(path.join(evalDir, 'pageset-manifest.json'), JSON.stringify(pageset, null, 2) + '\n');

  const hs = JSON.parse(fs.readFileSync(path.join(root, 'contracts', 'heldout-seeds.json'), 'utf8'));
  hs.heldout_tasks_committed = true;
  hs.tasks_manifest = 'eval/heldout-tasks.json';
  fs.writeFileSync(path.join(root, 'contracts', 'heldout-seeds.json'), JSON.stringify(hs, null, 2) + '\n');

  console.log('5 held-out tasks frozen:');
  for (const t of demo) console.log(`  [generated seed ${t.seed}] ${t.goal}`);
  for (const t of thirdParty) console.log(`  [mind2web ${t.website}] ${String(t.goal).slice(0, 80)}...`);
  console.log(`page set: ${pageset.entries.length} pages hashed (seeds 9010-9059, ${pageset.entries.reduce((a, e) => a + e.goals, 0)} goals)`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});

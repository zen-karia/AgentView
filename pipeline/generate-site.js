'use strict';
// Seeded site generator (D6): every page ships with its own ground truth.
// Emits data/generated/seed-<n>/{page.html, tasks.json} where each task is
// {goal, gold_actions, predicate} — the predicate is a JS expression evaluated
// in the live page by pipeline/verify.js, and gold_actions let us test the
// verifier itself. Same seed → identical page (mulberry32 PRNG, no Date/random).
// Held-out seeds (contracts/heldout-seeds.json) are refused without --heldout.
// State write-back (D3): all interactions mirror state into DOM attributes.
// Run: node pipeline/generate-site.js <seed> [--heldout]

const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..');
const HELDOUT = JSON.parse(
  fs.readFileSync(path.join(root, 'contracts', 'heldout-seeds.json'), 'utf8')
).reserved_seed_ranges;

// --- seeded PRNG ---------------------------------------------------------
function mulberry32(a) {
  return function () {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const pick = (rng, arr) => arr[Math.floor(rng() * arr.length)];
const chance = (rng, p) => rng() < p;
const int = (rng, lo, hi) => lo + Math.floor(rng() * (hi - lo + 1));
function shuffle(rng, arr) {
  const a = arr.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

// --- content pools --------------------------------------------------------
const POOL = [
  { sku: 'hp-01', name: 'SoundMax Pro Wireless Headphones', price: 89.99, cat: 'headphones', wireless: true },
  { sku: 'hp-02', name: 'AudioPhile X2 Wireless Headphones', price: 249.0, cat: 'headphones', wireless: true },
  { sku: 'hp-03', name: 'BassKing Wired Headphones', price: 34.99, cat: 'headphones', wireless: false },
  { sku: 'hp-04', name: 'NimbusLite Wireless Headphones', price: 59.0, cat: 'headphones', wireless: true },
  { sku: 'hp-05', name: 'StudioOne Monitor Headphones', price: 129.0, cat: 'headphones', wireless: false },
  { sku: 'eb-01', name: 'SoundMax Buds Air Wireless Earbuds', price: 59.99, cat: 'earbuds', wireless: true },
  { sku: 'eb-02', name: 'Volt Pods Mini Wireless Earbuds', price: 34.5, cat: 'earbuds', wireless: true },
  { sku: 'eb-03', name: 'AquaBuds Sport Earbuds', price: 44.0, cat: 'earbuds', wireless: true },
  { sku: 'sp-01', name: 'BoomBox Mini Bluetooth Speaker', price: 59.99, cat: 'speakers', wireless: true },
  { sku: 'sp-02', name: 'BassKing Tower Speaker', price: 189.0, cat: 'speakers', wireless: false },
  { sku: 'sp-03', name: 'PartyCube 360 Speaker', price: 79.0, cat: 'speakers', wireless: true },
  { sku: 'cb-01', name: 'Volt 100W USB-C Cable 2m', price: 12.99, cat: 'cables', wireless: false },
  { sku: 'cb-02', name: 'HDMI 2.1 Braided Cable 3m', price: 18.5, cat: 'cables', wireless: false },
  { sku: 'ch-01', name: 'Volt 65W GaN Wall Charger', price: 29.99, cat: 'charging', wireless: false },
  { sku: 'ch-02', name: 'MagPad Wireless Charger', price: 24.5, cat: 'charging', wireless: true },
  { sku: 'pb-01', name: 'Volt PowerBank 20000mAh', price: 44.99, cat: 'charging', wireless: false },
];

const SHOP_NAMES = ['gadgetbin', 'techtrove', 'wirewarehouse', 'audioalley'];

// Class-name schemes: same page anatomy, different (messy) vocabulary per seed.
const SCHEMES = [
  { wr: 'wr', grid: 'grid', item: 'itm', media: 'im', title: 't', meta: 'mt', price: 'pr', was: 'was', stock: 'st', add: 'go', nav: 'nv', navItem: 'nv-i', cart: 'nv-c', bnr: 'bnr', bnrIn: 'bnr-in', bnrX: 'bnr-x', ck: 'ckb', ckA: 'ck-a', ckD: 'ck-d', nl: 'nl', nlT: 'nl-t', nlE: 'nl-e', nlB: 'nl-b', ft: 'ft', srt: 'ssel' },
  { wr: 'page', grid: 'plist', item: 'card', media: 'thumb', title: 'ttl', meta: 'row', price: 'amt', was: 'strk', stock: 'avail', add: 'atc', nav: 'topnav', navItem: 'tn-l', cart: 'tn-cart', bnr: 'promo', bnrIn: 'promo-in', bnrX: 'promo-x', ck: 'cookiebar', ckA: 'cb-ok', ckD: 'cb-no', nl: 'subscribe', nlT: 'sub-t', nlE: 'sub-e', nlB: 'sub-b', ft: 'footer', srt: 'sortsel' },
  { wr: 'main-wrap', grid: 'gr', item: 'pi', media: 'pic', title: 'nm', meta: 'ln', price: 'prc', was: 'old', stock: 'stk', add: 'buy', nav: 'hdr-nav', navItem: 'h-l', cart: 'h-cart', bnr: 'hero-strip', bnrIn: 'hs-in', bnrX: 'hs-close', ck: 'gdpr', ckA: 'g-acc', ckD: 'g-dec', nl: 'newsl', nlT: 'n-t', nlE: 'n-e', nlB: 'n-go', ft: 'btm', srt: 'os' },
];

const SVG = '<svg viewBox="0 0 64 64"><path d="M4 32c0-15.5 12.5-28 28-28s28 12.5 28 28v14a6 6 0 0 1-6 6h-4a4 4 0 0 1-4-4V36a4 4 0 0 1 4-4h6c0-13.3-10.7-24-24-24S8 18.7 8 32h6a4 4 0 0 1 4 4v12a4 4 0 0 1-4 4h-4a6 6 0 0 1-6-6z"/></svg>';

// v2 archetypes (Stage D loop 1 — targets the observed OOD failures: bundle
// distractors and scheme overfit). VERSION GATE: pages for already-committed
// seed ranges must regenerate byte-identically forever, so v2 features apply
// only to fresh ranges. v1: seeds 1-299 (training) and 9000-9099 (committed
// held-out). v2: 300-8999 and 9100-9999. v2 draws happen strictly AFTER all
// v1 draws so v1 outputs are untouched.
function isV2(seed) {
  return (seed >= 300 && seed <= 8999) || (seed >= 9100 && seed <= 9999);
}
const SCHEMES_V2_EXTRA = [
  { wr: 'shell', grid: 'products', item: 'prod-card', media: 'prod-img', title: 'prod-name', meta: 'prow', price: 'p-now', was: 'p-old', stock: 'p-stock', add: 'add-btn', nav: 'menu', navItem: 'menu-it', cart: 'menu-cart', bnr: 'ticker', bnrIn: 'ticker-in', bnrX: 'ticker-x', ck: 'consent', ckA: 'c-yes', ckD: 'c-no', nl: 'mailing', nlT: 'ml-t', nlE: 'ml-in', nlB: 'ml-go', ft: 'foot', srt: 'orderby' },
  { wr: 'container-x', grid: 'lst', item: 'li-p', media: 'i-w', title: 'h-p', meta: 'pr-w', price: 'val', was: 'val-x', stock: 'inv', add: 'cta-c', nav: 'bar', navItem: 'bar-a', cart: 'bar-crt', bnr: 'strip', bnrIn: 'strip-c', bnrX: 'strip-k', ck: 'ck-wall', ckA: 'ck-y', ckD: 'ck-n', nl: 'letter', nlT: 'lt-h', nlE: 'lt-f', nlB: 'lt-s', ft: 'base', srt: 'srt-dd' },
];

function money(n) {
  return `$${n.toFixed(2)}`;
}

function generate(seed) {
  const rng = mulberry32(seed);
  const v2 = isV2(seed);
  // Same single rng draw for both versions; only the candidate list differs.
  const C = pick(rng, v2 ? SCHEMES.concat(SCHEMES_V2_EXTRA) : SCHEMES);
  const shop = pick(rng, SHOP_NAMES);
  const products = shuffle(rng, POOL).slice(0, int(rng, 6, 10));
  const feats = {
    cookie: chance(rng, 0.5),
    banner: chance(rng, 0.6),
    newsletter: chance(rng, 0.7),
    sort: chance(rng, 0.6),
    wrapDepth: int(rng, 1, 3),
  };
  const email = `user${int(rng, 100, 999)}@example.com`;

  // --- page ---------------------------------------------------------------
  const cards = products
    .map((p) => {
      const was = chance(rng, 0.4) ? `<span class="${C.was}">${money(p.price * (1.2 + rng() * 0.5))}</span>` : '';
      return `<div class="${C.item}" data-sku="${p.sku}">
  <div class="${C.media}">${SVG}</div>
  <div class="${C.title}">${p.name}</div>
  <div class="${C.meta}"><span class="${C.price}">${money(p.price)}</span>${was}</div>
  <div class="${C.stock}">In stock</div>
  <div class="${C.add}" onclick="av_add('${p.sku}')">Add to cart</div>
</div>`;
    })
    .join('\n');

  let grid = `<div class="${C.grid}">\n${cards}\n</div>`;
  for (let i = 0; i < feats.wrapDepth; i++) grid = `<div class="jw${i}">${grid}</div>`;

  let html = `<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8">
<title>${shop} — audio &amp; accessories</title>
<style>.${C.item}{border:1px solid #e5e5e5;padding:10px}.${C.grid}{display:grid;grid-template-columns:repeat(3,1fr);gap:12px}.${C.add}{background:#e8590c;color:#fff;padding:6px;text-align:center;cursor:pointer}.${C.was}{text-decoration:line-through;color:#999;margin-left:6px}</style>
<script>
window.__st={cart:[],nl:false};
function av_add(s){window.__st.cart.push(s);document.body.setAttribute('data-cart',window.__st.cart.join(','));var n=document.getElementById('cno');if(n)n.textContent=String(window.__st.cart.length);}
function av_nl(){window.__st.nl=true;document.body.setAttribute('data-nl','1');}
function av_ck(){var e=document.querySelector('.${C.ck}');if(e)e.remove();}
</script>
</head>
<body>
${feats.cookie ? `<div class="${C.ck}">We use cookies to improve recommendations.
  <span class="${C.ckA}" onclick="av_ck()">Accept</span>
  <span class="${C.ckD}" onclick="av_ck()">Decline</span>
</div>` : ''}
${feats.banner ? `<div class="${C.bnr}"><div class="${C.bnrIn}">SEASONAL SALE — up to ${int(rng, 20, 60)}% off audio gear. <span class="${C.bnrX}" onclick="this.parentNode.parentNode.remove()">✕</span></div></div>` : ''}
<div class="${C.wr}">
  <div class="${C.nav}">
    <div class="${C.navItem}" onclick="location.href='/'">Home</div>
    <div class="${C.navItem}" onclick="location.href='/deals'">Deals</div>
    <div class="${C.navItem} ${C.cart}" onclick="location.href='/cart'">Cart (<span id="cno">0</span>)</div>
  </div>
  ${feats.sort ? `<div class="tb">Sort:
    <select class="${C.srt}" onchange="document.body.setAttribute('data-sort',this.value)">
      <option value="feat">Featured</option>
      <option value="plh">Price: low to high</option>
      <option value="phl">Price: high to low</option>
      <option value="rate">Avg. rating</option>
    </select>
  </div>` : ''}
  ${grid}
  ${feats.newsletter ? `<div class="${C.nl}">
    <div class="${C.nlT}">Get deals in your inbox</div>
    <input class="${C.nlE}" placeholder="you@email.com">
    <div class="${C.nlB}" onclick="av_nl()">Subscribe</div>
  </div>` : ''}
  <div class="${C.ft}">
    <a href="/shipping">Shipping Policy</a>
    <a href="/returns">Returns</a>
    <a href="/contact">Contact</a>
    <div class="cp">© 2026 ${shop} ltd.</div>
  </div>
</div>
</body>
</html>
`;

  // --- tasks (ground truth) ------------------------------------------------
  const tasks = [];
  for (const p of shuffle(rng, products).slice(0, 2)) {
    tasks.push({
      id: `add-${p.sku}`,
      type: 'actionable',
      goal: `Add the ${p.name} to the cart`,
      target_sku: p.sku,
      gold_actions: [{ kind: 'click', selector: `[data-sku="${p.sku}"] .${C.add}` }],
      predicate: `window.__st.cart.includes('${p.sku}')`,
    });
  }
  const wirelessHp = products.filter((p) => p.cat === 'headphones' && p.wireless);
  if (wirelessHp.length >= 2) {
    const cheapest = wirelessHp.reduce((a, b) => (a.price < b.price ? a : b));
    tasks.push({
      id: 'add-cheapest-wireless-hp',
      type: 'actionable',
      goal: 'Add the cheapest wireless headphones to the cart',
      target_sku: cheapest.sku,
      candidate_skus: wirelessHp.map((w) => w.sku),
      gold_actions: [{ kind: 'click', selector: `[data-sku="${cheapest.sku}"] .${C.add}` }],
      predicate: `window.__st.cart.includes('${cheapest.sku}')`,
    });
  }
  if (feats.cookie) {
    tasks.push({
      id: 'dismiss-cookie',
      type: 'actionable',
      goal: 'Dismiss the cookie banner',
      gold_actions: [{ kind: 'click', selector: `.${C.ckA}` }],
      predicate: `!document.querySelector('.${C.ck}')`,
    });
  }
  if (feats.newsletter) {
    tasks.push({
      id: 'newsletter',
      type: 'actionable',
      goal: `Sign up for the newsletter with the email ${email}`,
      email,
      gold_actions: [
        { kind: 'type', selector: `.${C.nlE}`, value: email },
        { kind: 'click', selector: `.${C.nlB}` },
      ],
      predicate: `document.querySelector('.${C.nlE}').value==='${email}' && window.__st.nl===true`,
    });
  }
  if (feats.sort) {
    tasks.push({
      id: 'sort-price-asc',
      type: 'actionable',
      goal: 'Sort the products by price from low to high',
      gold_actions: [{ kind: 'select', selector: `select.${C.srt}`, value: 'Price: low to high' }],
      predicate: `document.querySelector('select.${C.srt}').value==='plh'`,
    });
  }
  tasks.push({
    id: 'impossible',
    type: 'impossible',
    goal: 'Track the status of an existing order',
    gold_actions: [],
    predicate: 'true',
  });

  // ---- v2 sections: all rng draws strictly AFTER the v1 sequence -----------
  const metaProducts = products.map((p) => ({ sku: p.sku, name: p.name, price: p.price }));
  let bundleMeta = null;
  let grid2Skus = [];
  if (v2) {
    let inserts = '';
    // Second grid ("more products", long-page tier). Non-headphones only, so
    // the v1 cheapest-wireless-headphones task's ground truth stays correct.
    if (chance(rng, 0.7)) {
      const used = new Set(products.map((p) => p.sku));
      const rest = POOL.filter((p) => !used.has(p.sku) && p.cat !== 'headphones');
      const grid2 = shuffle(rng, rest).slice(0, int(rng, 4, 6));
      grid2Skus = grid2.map((p) => p.sku);
      const cards2 = grid2
        .map((p) => {
          const was = chance(rng, 0.4) ? `<span class="${C.was}">${money(p.price * (1.2 + rng() * 0.5))}</span>` : '';
          return `<div class="${C.item}" data-sku="${p.sku}">
  <div class="${C.media}">${SVG}</div>
  <div class="${C.title}">${p.name}</div>
  <div class="${C.meta}"><span class="${C.price}">${money(p.price)}</span>${was}</div>
  <div class="${C.stock}">In stock</div>
  <div class="${C.add}" onclick="av_add('${p.sku}')">Add to cart</div>
</div>`;
        })
        .join('\n');
      inserts += `<div class="more-h">You may also like</div>\n<div class="${C.grid}">\n${cards2}\n</div>\n`;
      metaProducts.push(...grid2.map((p) => ({ sku: p.sku, name: p.name, price: p.price })));
      const g2pick = pick(rng, grid2);
      tasks.splice(tasks.length - 1, 0, {
        id: `add-${g2pick.sku}`,
        type: 'actionable',
        goal: `Add the ${g2pick.name} to the cart`,
        target_sku: g2pick.sku,
        gold_actions: [{ kind: 'click', selector: `[data-sku="${g2pick.sku}"] .${C.add}` }],
        predicate: `window.__st.cart.includes('${g2pick.sku}')`,
      });
    }
    // Deal-of-the-day bundle: the distractor class the megashop probe exposed.
    if (chance(rng, 0.8) && products.length >= 2) {
      const a = pick(rng, products);
      let b = pick(rng, products);
      if (b.sku === a.sku) b = products[(products.indexOf(a) + 1) % products.length];
      const bp = Math.round((a.price + b.price) * 0.85 * 100) / 100;
      const title = `${a.name} + ${b.name} bundle`;
      bundleMeta = { id: 'bd-1', title, price: bp };
      inserts += `<div class="dod" data-bundle="bd-1"><div class="dod-h">Deal of the day</div><div class="dod-t">${title}</div><div class="dod-p">${money(bp)}</div><div class="dod-go" onclick="av_add('bd-1')">Add bundle to cart</div></div>\n`;
      tasks.splice(tasks.length - 1, 0, {
        id: 'add-bundle',
        type: 'actionable',
        goal: `Add the deal-of-the-day bundle to the cart`,
        gold_actions: [{ kind: 'click', selector: '.dod-go' }],
        predicate: `window.__st.cart.includes('bd-1')`,
      });
    }
    if (inserts) html = html.replace(`<div class="${C.ft}">`, `${inserts}<div class="${C.ft}">`);
  }

  return {
    html,
    tasks,
    meta: {
      seed,
      gen_version: v2 ? 2 : 1,
      scheme: (v2 ? SCHEMES.concat(SCHEMES_V2_EXTRA) : SCHEMES).indexOf(C),
      classes: C,
      shop,
      products: metaProducts,
      grid2: grid2Skus,
      bundle: bundleMeta,
      feats,
    },
  };
}

// --- CLI -------------------------------------------------------------------
const args = process.argv.slice(2);
const seed = parseInt(args[0], 10);
const heldoutFlag = args.includes('--heldout');
if (!Number.isInteger(seed)) {
  console.error('usage: node pipeline/generate-site.js <seed> [--heldout]');
  process.exit(2);
}
const reserved = HELDOUT.some(([lo, hi]) => seed >= lo && seed <= hi);
if (reserved && !heldoutFlag) {
  console.error(`seed ${seed} is RESERVED for held-out eval (contracts/heldout-seeds.json). Use --heldout only for eval assets.`);
  process.exit(1);
}
if (!reserved && heldoutFlag) {
  console.error(`--heldout given but seed ${seed} is not in a reserved range — held-out assets must use reserved seeds.`);
  process.exit(1);
}

const out = generate(seed);
const dir = path.join(root, 'data', 'generated', `seed-${seed}`);
fs.mkdirSync(dir, { recursive: true });
fs.writeFileSync(path.join(dir, 'page.html'), out.html);
fs.writeFileSync(path.join(dir, 'tasks.json'), JSON.stringify({ meta: out.meta, tasks: out.tasks }, null, 2) + '\n');
console.log(`seed ${seed}: ${out.meta.products.length} products, scheme ${out.meta.scheme}, feats ${JSON.stringify(out.meta.feats)}`);
console.log(`  ${out.tasks.length} tasks -> ${path.relative(root, dir)}`);

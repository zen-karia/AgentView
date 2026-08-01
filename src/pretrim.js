'use strict';
// Pretrim v1 (FROZEN). The model's input contract: every consumer of a page
// (teacher labeling, training, RFT rollouts, eval, demo) sees pretrim(rawHtml),
// never raw HTML. It removes whole non-content elements (script/style/...)
// and truncates attribute/text junk, but never removes an element an action
// could target.
//
// Guarantee (exact): for selectors that survive the validator — no :*-child
// family, no +/~ sibling combinators — an element's structural path
// (tag + same-tag sibling index chain) is identical in trimmed and raw DOM.
// The validator asserts per-example that a selector picks the SAME element in
// both DOMs; pretrim alone does NOT guarantee that for arbitrary selectors
// (adjacency, :empty, and truncated attribute values all differ under trim).
// Residual risk, accepted for v1: both sides are parsed with jsdom, while the
// executor drives Chromium; a sampled Playwright-side audit of selector
// resolution is planned (see DECISIONS.md D4).

const { JSDOM } = require('jsdom');

// v2 = the input pipeline is annotate(raw) -> pretrim(annotated): data-av-id
// ids are stamped on interactive elements first (src/annotate.js), then junk
// is trimmed. Bumped from v1 when the Flash 8192-token context cap forced the
// page budget down and the annotation step was added.
const PRETRIM_VERSION = '2';
const REMOVE_TAGS = ['script', 'style', 'link', 'meta', 'noscript', 'template'];
// These attributes (plus aria-*) are never truncated. Everything else —
// including data-* — is capped at ATTR_CAP so one attribute (src data-URIs,
// inline handlers, framework data-props JSON blobs) can't eat the token
// budget. A truncated value ends in '…'; the prompt template forbids building
// selectors from such values, and the validator's raw-DOM resolution rejects
// any that slip through.
const KEEP_FULL_ATTRS = new Set([
  'id', 'class', 'name', 'role', 'type', 'placeholder', 'href',
  'value', 'alt', 'title', 'for', 'action', 'method', 'data-av-id',
]);
const ATTR_CAP = 200;
const TEXT_CAP = 300;
// Flash raised sub-10B context to 32,768 (verified server-side 2026-07-18:
// --cost/--dry-run accept max_context_tokens=32768). Two-tier budget:
// TARGET is the soft ceiling most examples should sit under (long context
// inflates VRAM → pricier GPU class: 0.8B@32k quoted on a B200 vs A100@8k);
// BUDGET is the hard fit gate (32,768 − ~800 template − ~2,000 output − slack).
// A deliberate long-page slice (~15% of data, ReaderLM-style short→long mix)
// may run up to BUDGET; everything else should fit TARGET.
const PAGE_TOKEN_TARGET = 12000;
const PAGE_TOKEN_BUDGET = 28000;

function pretrim(html) {
  const dom = new JSDOM(html);
  const doc = dom.window.document;
  const NodeFilter = dom.window.NodeFilter;

  doc.querySelectorAll(REMOVE_TAGS.join(',')).forEach((el) => el.remove());
  // Keep the <svg> element (selectable structure), drop its path soup.
  doc.querySelectorAll('svg').forEach((el) => { el.innerHTML = ''; });

  const comments = [];
  const cw = doc.createTreeWalker(doc.documentElement, NodeFilter.SHOW_COMMENT);
  while (cw.nextNode()) comments.push(cw.currentNode);
  comments.forEach((n) => n.remove());

  const texts = [];
  const tw = doc.createTreeWalker(doc.documentElement, NodeFilter.SHOW_TEXT);
  while (tw.nextNode()) texts.push(tw.currentNode);
  for (const t of texts) {
    // Whitespace is significant inside pre/textarea — truncate only there.
    let preserve = false;
    for (let p = t.parentElement; p; p = p.parentElement) {
      const tag = p.tagName.toLowerCase();
      if (tag === 'pre' || tag === 'textarea') { preserve = true; break; }
    }
    let s = preserve ? t.textContent : t.textContent.replace(/\s+/g, ' ');
    if (s.length > TEXT_CAP) s = s.slice(0, TEXT_CAP) + '…';
    t.textContent = s;
  }

  doc.querySelectorAll('*').forEach((el) => {
    for (const attr of Array.from(el.attributes)) {
      const name = attr.name.toLowerCase();
      if (KEEP_FULL_ATTRS.has(name) || name.startsWith('aria-')) continue;
      if (attr.value.length > ATTR_CAP) {
        el.setAttribute(attr.name, attr.value.slice(0, ATTR_CAP) + '…');
      }
    }
  });

  // Preserve the raw document's doctype PRESENCE: injecting one into a
  // doctype-less page would flip quirks mode to standards mode and change
  // selector case-sensitivity semantics vs the live page.
  const doctype = doc.doctype ? '<!doctype html>\n' : '';
  return doctype + doc.documentElement.outerHTML;
}

// Rough token estimate for budget checks: ~3.5 chars/token for ASCII, but
// non-ASCII scripts (CJK etc.) tokenize at roughly 1 token per character.
function approxTokens(s) {
  let ascii = 0;
  let other = 0;
  for (const ch of s) {
    if (ch.codePointAt(0) < 0x80) ascii++;
    else other++;
  }
  return Math.ceil(ascii / 3.5 + other);
}

module.exports = { pretrim, approxTokens, PRETRIM_VERSION, PAGE_TOKEN_BUDGET, PAGE_TOKEN_TARGET, TEXT_CAP, ATTR_CAP };

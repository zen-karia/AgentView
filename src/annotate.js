'use strict';
// Annotate v1: stamps deterministic data-av-id attributes on interactive
// elements BEFORE pretrim. Every production DOM-to-LLM system (BrowserGym's
// bid attribute, Stagehand's EncodedId map, Playwright MCP's aria refs) mints
// harness-side ids rather than trusting model-authored locators; we keep the
// CSS-selector contract intact by making the id a selectable attribute:
// [data-av-id="7"] is a normal CSS selector, unique by construction.
// The SAME traversal must run on the live page (Playwright evaluate with the
// logic below) before executing, so ids exist in both worlds. Ids are
// document-order sequential — deterministic for a given HTML string.

const { JSDOM } = require('jsdom');

const ANNOTATE_VERSION = '1';
const INTERACTIVE_TAGS = new Set([
  'a', 'button', 'input', 'select', 'textarea', 'summary', 'label', 'option', 'details',
]);
const INTERACTIVE_ROLES = new Set([
  'button', 'link', 'menuitem', 'menuitemcheckbox', 'menuitemradio', 'tab', 'checkbox',
  'radio', 'switch', 'option', 'treeitem', 'combobox', 'listbox', 'searchbox', 'textbox',
]);

function isInteractive(el) {
  const tag = el.tagName.toLowerCase();
  if (INTERACTIVE_TAGS.has(tag)) return true;
  if (
    el.hasAttribute('onclick') ||
    el.hasAttribute('tabindex') ||
    el.hasAttribute('contenteditable')
  ) return true;
  return INTERACTIVE_ROLES.has((el.getAttribute('role') || '').toLowerCase());
}

function annotate(html) {
  const dom = new JSDOM(html);
  const doc = dom.window.document;
  let n = 0;
  doc.querySelectorAll('*').forEach((el) => {
    if (isInteractive(el)) el.setAttribute('data-av-id', String(++n));
  });
  const doctype = doc.doctype ? '<!doctype html>\n' : '';
  return doctype + doc.documentElement.outerHTML;
}

module.exports = { annotate, ANNOTATE_VERSION };

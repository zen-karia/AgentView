'use strict';
// Shared Playwright execution layer: live-page annotation (mirrors
// src/annotate.js exactly — criteria imported from it) and action execution.
// Used by verify.js (gold actions) and eval-e2e.js (model+driver actions).

const { INTERACTIVE_TAGS, INTERACTIVE_ROLES } = require('../src/annotate');

async function annotateLive(page) {
  await page.evaluate(
    ({ tags, roles }) => {
      let n = 0;
      document.querySelectorAll('*').forEach((el) => {
        const tag = el.tagName.toLowerCase();
        const role = (el.getAttribute('role') || '').toLowerCase();
        const interactive =
          tags.includes(tag) ||
          el.hasAttribute('onclick') ||
          el.hasAttribute('tabindex') ||
          el.hasAttribute('contenteditable') ||
          roles.includes(role);
        if (interactive) el.setAttribute('data-av-id', String(++n));
      });
    },
    { tags: INTERACTIVE_TAGS, roles: INTERACTIVE_ROLES }
  );
}

async function executeAction(page, a) {
  const selector = a.selector || a.target_selector;
  const value = a.value ?? a.value_hint;
  if (a.kind === 'click') {
    await page.click(selector, { timeout: 3000 });
  } else if (a.kind === 'type') {
    await page.fill(selector, value ?? '', { timeout: 3000 });
  } else if (a.kind === 'select') {
    try {
      await page.selectOption(selector, { label: value }, { timeout: 3000 });
    } catch {
      await page.selectOption(selector, value, { timeout: 3000 });
    }
  } else {
    throw new Error(`unknown action kind: ${a.kind}`);
  }
}

module.exports = { annotateLive, executeAction };

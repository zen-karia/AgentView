'use strict';
// Renders the FROZEN prompt template (contracts/prompt-template.md) into the
// system prompt and per-example user prompt. This file is the ONLY renderer —
// teacher labeling, training data emission, eval, and demo all go through it,
// so the template file stays the single source of truth (D9).

const fs = require('fs');
const path = require('path');

const TEMPLATE_PATH = path.join(__dirname, '..', 'contracts', 'prompt-template.md');

function sections() {
  const md = fs.readFileSync(TEMPLATE_PATH, 'utf8');
  const sys = md.split(/^## System\s*$/m)[1];
  const usr = sys.split(/^## User\s*$/m);
  return { system: usr[0].trim(), userTemplate: md.split(/^## User\s*$/m)[1].trim() };
}

function systemPrompt() {
  return sections().system;
}

// split/join instead of .replace: goal/page content may contain `$` patterns.
function renderUser(goal, trimmedPage) {
  return sections().userTemplate.split('{goal}').join(goal).split('{page}').join(trimmedPage);
}

module.exports = { systemPrompt, renderUser, TEMPLATE_PATH };

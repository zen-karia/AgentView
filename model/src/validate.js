'use strict';
// AgentView validator v1. Every teacher output, synthetic example, and model
// output passes through validate() or is discarded (rejection sampling).
// Checks, in order: schema conformance, id uniqueness, content_refs integrity,
// selector rules (parses; matches exactly one element in BOTH trimmed and raw
// DOM *and the same element in each*, verified by structural path; no
// html/body; no :*-child family; no +/~ sibling combinators), text grounding
// (verbatim extract of the tightest element, grounded in trimmed AND raw DOM),
// interactivity for click targets, and kind/element compatibility.

const Ajv = require('ajv/dist/2020');
const { JSDOM } = require('jsdom');
const schema = require('../contracts/agentview.schema.json');

const ajv = new Ajv({ allErrors: true });
const schemaValidate = ajv.compile(schema);

const BANNED_PSEUDO = /:(?:nth-child|nth-last-child|first-child|last-child|only-child)\b/i;
// Input types where kind=type makes no sense (native pickers included: keyboard
// typing into date/time inputs is locale-dependent and unreliable to execute).
const NON_TYPEABLE_INPUT = new Set([
  'hidden', 'submit', 'button', 'checkbox', 'radio', 'file', 'image', 'reset', 'range', 'color',
  'date', 'time', 'month', 'week', 'datetime-local',
]);
const CLICKABLE_TAGS = new Set([
  'a', 'button', 'input', 'select', 'textarea', 'summary', 'label', 'option', 'details',
]);
const CLICKABLE_ROLES = new Set([
  'button', 'link', 'menuitem', 'menuitemcheckbox', 'menuitemradio', 'tab', 'checkbox',
  'radio', 'switch', 'option', 'treeitem', 'combobox', 'listbox', 'searchbox', 'textbox',
]);

function norm(s) {
  return s.replace(/\s+/g, ' ').trim();
}

// Canonical structural address: tag + index among same-tag siblings, from the
// root down. Pretrim only removes script/style/link/meta/noscript/template
// elements and svg internals, so for every surviving element this path is
// identical in trimmed and raw DOM — which lets us assert that a selector
// picked the SAME element in both, not merely one element in each.
function structuralPath(el) {
  const parts = [];
  let cur = el;
  while (cur && cur.parentElement) {
    let i = 0;
    let sib = cur;
    while ((sib = sib.previousElementSibling)) {
      if (sib.tagName === cur.tagName) i++;
    }
    parts.push(`${cur.tagName.toLowerCase()}[${i}]`);
    cur = cur.parentElement;
  }
  parts.push(cur ? cur.tagName.toLowerCase() : '?');
  return parts.reverse().join('/');
}

// True if every segment appears in hay, in order, without overlap.
function containsInOrder(hay, segments) {
  let idx = 0;
  for (const seg of segments) {
    const found = hay.indexOf(seg, idx);
    if (found === -1) return false;
    idx = found + seg.length;
  }
  return true;
}

// A click is executable if the element is natively interactive, carries an
// interactivity marker, or sits inside such an element (events bubble).
function isClickable(el) {
  for (let cur = el; cur; cur = cur.parentElement) {
    const tag = cur.tagName.toLowerCase();
    if (tag === 'body' || tag === 'html') return false;
    if (CLICKABLE_TAGS.has(tag)) return true;
    if (
      cur.hasAttribute('onclick') ||
      cur.hasAttribute('tabindex') ||
      cur.hasAttribute('contenteditable') ||
      cur.hasAttribute('href')
    ) return true;
    if (CLICKABLE_ROLES.has((cur.getAttribute('role') || '').toLowerCase())) return true;
  }
  return false;
}

function resolveUnique(doc, selector, where, id, errors) {
  let nodes;
  try {
    nodes = doc.querySelectorAll(selector);
  } catch {
    errors.push(`${id}: selector does not parse (${where} DOM): ${selector}`);
    return null;
  }
  if (nodes.length !== 1) {
    errors.push(`${id}: selector matches ${nodes.length} elements in ${where} DOM (must be exactly 1): ${selector}`);
    return null;
  }
  const el = nodes[0];
  const tag = el.tagName.toLowerCase();
  if (tag === 'html' || tag === 'body') {
    errors.push(`${id}: selector targets <${tag}> — banned`);
    return null;
  }
  return el;
}

function validate(output, trimmedHtml, rawHtml) {
  const errors = [];

  if (!schemaValidate(output)) {
    for (const e of schemaValidate.errors) errors.push(`schema: ${e.instancePath || '/'} ${e.message}`);
    return { valid: false, errors };
  }

  const trimmed = new JSDOM(trimmedHtml).window.document;
  const raw = new JSDOM(rawHtml).window.document;

  const cIds = new Set();
  for (const c of output.relevant_content) {
    if (cIds.has(c.id)) errors.push(`${c.id}: duplicate content id`);
    cIds.add(c.id);
  }
  const aIds = new Set();
  for (const a of output.actions) {
    if (aIds.has(a.id)) errors.push(`${a.id}: duplicate action id`);
    aIds.add(a.id);
    for (const ref of a.content_refs || []) {
      if (!cIds.has(ref)) errors.push(`${a.id}: content_ref ${ref} does not exist in relevant_content`);
    }
  }

  const checkSelector = (id, selector) => {
    if (BANNED_PSEUDO.test(selector)) {
      errors.push(`${id}: :*-child pseudo-classes are banned (use :*-of-type): ${selector}`);
      return null;
    }
    // Sibling combinators are banned: pretrim removes script/style siblings, so
    // adjacency in the model's view is not adjacency on the live page. Comma
    // selector lists are banned outright: their branches can match different
    // elements in trimmed vs raw DOM while staying unique in each.
    // (Attribute values are masked first so [href="/a+b"] isn't a false hit.)
    const masked = selector.replace(/\[[^\]]*\]/g, '[]');
    if (/[+~]/.test(masked)) {
      errors.push(`${id}: sibling combinators + and ~ are banned (adjacency differs under pretrim): ${selector}`);
      return null;
    }
    if (masked.includes(',')) {
      errors.push(`${id}: comma selector lists are banned (one element per selector): ${selector}`);
      return null;
    }
    const trimmedEl = resolveUnique(trimmed, selector, 'trimmed', id, errors);
    if (!trimmedEl) return null;
    const rawEl = resolveUnique(raw, selector, 'raw', id, errors);
    if (!rawEl) return null;
    // Same COUNT in both DOMs is not enough (comma lists, truncated-attribute
    // collisions): assert both DOMs picked the same element.
    if (structuralPath(trimmedEl) !== structuralPath(rawEl)) {
      errors.push(`${id}: selector resolves to a different element in the raw DOM than in the trimmed DOM: ${selector}`);
      return null;
    }
    return { trimmedEl, rawEl };
  };

  for (const c of output.relevant_content) {
    const r = checkSelector(c.id, c.selector);
    if (!r) continue;
    // '…' marks pretrim truncation; the segments around it must each be
    // grounded, in order, in BOTH the trimmed element (what the model saw)
    // and the raw element (what actually exists on the page).
    const segments = c.text.split('…').map(norm).filter(Boolean);
    if (!segments.length) {
      errors.push(`${c.id}: text has no groundable content`);
      continue;
    }
    if (!containsInOrder(norm(r.trimmedEl.textContent), segments)) {
      errors.push(`${c.id}: text is not a verbatim extract of the target element's text`);
      continue;
    }
    if (!containsInOrder(norm(r.rawEl.textContent), segments)) {
      errors.push(`${c.id}: text is not grounded in the raw page (pretrim artifact)`);
      continue;
    }
    // Anti-misattribution: if a child element already contains the text, the
    // selector must point at that tighter element, not a broad container.
    for (const child of r.trimmedEl.children) {
      if (containsInOrder(norm(child.textContent), segments)) {
        errors.push(`${c.id}: text must target the tightest element containing it (a descendant also contains it): ${c.selector}`);
        break;
      }
    }
  }

  for (const a of output.actions) {
    const r = checkSelector(a.id, a.target_selector);
    if (!r) continue;
    const el = r.rawEl;
    const tag = el.tagName.toLowerCase();
    if (a.kind === 'click') {
      if (!isClickable(el)) {
        errors.push(`${a.id}: kind=click must target an interactive element (native control, onclick/tabindex/role marker, or inside one), got <${tag}>`);
      }
      if (a.value_hint !== undefined) {
        errors.push(`${a.id}: value_hint is not allowed on kind=click`);
      }
    } else if (a.kind === 'type') {
      const inputType = (el.getAttribute('type') || 'text').toLowerCase();
      const ok =
        tag === 'textarea' ||
        (tag === 'input' && !NON_TYPEABLE_INPUT.has(inputType)) ||
        el.hasAttribute('contenteditable') ||
        ['textbox', 'searchbox'].includes((el.getAttribute('role') || '').toLowerCase());
      if (!ok) errors.push(`${a.id}: kind=type must target a text-input-capable element, got <${tag}>`);
    } else if (a.kind === 'select') {
      // v1: native <select> only. Custom ARIA dropdowns are driven with click
      // (open) + click (option) — selectOption() has no meaning for them.
      if (tag !== 'select') {
        errors.push(`${a.id}: kind=select must target a native <select> element, got <${tag}>`);
      } else if (a.value_hint !== undefined) {
        // value_hint must be executable: it maps to an existing option's
        // visible label or value attribute (checked against the raw page).
        const hint = norm(a.value_hint).toLowerCase();
        const ok = Array.from(el.querySelectorAll('option')).some(
          (o) => norm(o.textContent).toLowerCase() === hint || (o.getAttribute('value') || '').toLowerCase() === hint
        );
        if (!ok) errors.push(`${a.id}: value_hint "${a.value_hint}" matches no option label or value of the target <select>`);
      }
    }
  }

  return { valid: errors.length === 0, errors };
}

module.exports = { validate };

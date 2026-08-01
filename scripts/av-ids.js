'use strict';
// Authoring helper: prints every interactive element of a page with the
// data-av-id that annotate() will assign it. Usage: node scripts/av-ids.js <page.html>

const fs = require('fs');
const { JSDOM } = require('jsdom');
const { annotate } = require('../src/annotate');

const html = annotate(fs.readFileSync(process.argv[2], 'utf8'));
const doc = new JSDOM(html).window.document;
doc.querySelectorAll('[data-av-id]').forEach((el) => {
  const txt = (el.textContent || '').replace(/\s+/g, ' ').trim().slice(0, 50);
  const hint = el.getAttribute('class') || el.getAttribute('id') || el.getAttribute('href') || '';
  console.log(
    `${el.getAttribute('data-av-id').padStart(3)}  <${el.tagName.toLowerCase()}>  ${hint.padEnd(20)} "${txt}"`
  );
});

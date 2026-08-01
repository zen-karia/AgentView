'use strict';
// The inference harness: sends (goal, page) through the FROZEN template to any
// OpenAI-compatible endpoint and validates the response with the real
// validator. Used identically for the Flash adapter, base zero-shot
// (OpenRouter/HF), and Gemini — only base URL/model/key change (D7).
//
// Usage:
//   FLASH_API_KEY=... node pipeline/infer.js <base_url> <model> <page.html> "<goal>"
// Decode settings pinned per D17.

const fs = require('fs');
const { annotate } = require('../src/annotate');
const { pretrim } = require('../src/pretrim');
const { validate } = require('../src/validate');
const { systemPrompt, renderUser } = require('../src/render');

async function main() {
  const [baseUrl, model, pagePath, goal] = process.argv.slice(2);
  if (!baseUrl || !model || !pagePath || goal === undefined) {
    console.error('usage: node pipeline/infer.js <base_url> <model> <page.html> "<goal>"');
    process.exit(2);
  }
  const apiKey = process.env.FLASH_API_KEY || process.env.OPENAI_API_KEY;
  if (!apiKey) {
    console.error('set FLASH_API_KEY (or OPENAI_API_KEY)');
    process.exit(2);
  }

  const raw = annotate(fs.readFileSync(pagePath, 'utf8'));
  const trimmed = pretrim(raw);

  const body = {
    model,
    messages: [
      { role: 'system', content: systemPrompt() },
      { role: 'user', content: renderUser(goal, trimmed) },
    ],
    temperature: 0,
    max_tokens: 2000,
    // D17: anti-degeneration guard (vLLM-compatible extension param).
    repetition_penalty: 1.08,
  };

  const t0 = Date.now();
  const resp = await fetch(`${baseUrl.replace(/\/$/, '')}/chat/completions`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` },
    body: JSON.stringify(body),
  });
  const ms = Date.now() - t0;
  if (!resp.ok) {
    console.error(`HTTP ${resp.status}: ${await resp.text()}`);
    process.exit(1);
  }
  const data = await resp.json();
  const text = data.choices?.[0]?.message?.content ?? '';
  console.log(`--- raw response (${ms} ms, ${data.usage?.completion_tokens ?? '?'} completion tokens) ---`);
  console.log(text);

  let parsed;
  try {
    // tolerate accidental code fences and <think> blocks
    const cleaned = text.replace(/^[\s\S]*?<\/think>/, '').replace(/```(?:json)?/g, '').trim();
    parsed = JSON.parse(cleaned);
  } catch (e) {
    console.log(`\nVERDICT: FAIL — response is not parseable JSON (${e.message})`);
    process.exit(1);
  }
  const res = validate(parsed, trimmed, raw);
  console.log(`\nVERDICT: ${res.valid ? 'PASS — valid AgentView output' : 'FAIL — validator rejected'}`);
  for (const err of res.errors) console.log(`  - ${err}`);
  process.exit(res.valid ? 0 : 1);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});

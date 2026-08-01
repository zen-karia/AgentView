'use strict';
// Connection smoke test. Run: npm run mongo:ping   (requires .env with MONGODB_URI)

const { enabled, logRow, close } = require('../src/log');

async function main() {
  if (!enabled()) {
    console.error('MONGODB_URI is not set. Copy .env.example to .env and fill it in.');
    process.exit(2);
  }
  const t0 = Date.now();
  const res = await logRow('meta', { kind: 'ping', note: 'connection smoke test' });
  console.log(`OK — wrote ${res.logged} doc to '${process.env.MONGODB_DB || 'agentview'}.meta' in ${Date.now() - t0} ms`);
  await close();
}

main().catch((e) => {
  console.error(`FAILED: ${e.message}`);
  console.error('Common causes: your IP is not in Atlas Network Access; wrong password; user lacks readWrite.');
  process.exit(1);
});

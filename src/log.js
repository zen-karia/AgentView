'use strict';
// MongoDB logging layer (D12): every generated example and every eval/inference
// call becomes a row. Row shape per contracts/EVAL.md. Reads MONGODB_URI from
// the environment (run scripts with: node --env-file=.env <script>).
// No-ops gracefully when MONGODB_URI is unset so pipelines never break on it.

const { MongoClient } = require('mongodb');

let clientPromise = null;

function enabled() {
  return Boolean(process.env.MONGODB_URI);
}

function client() {
  if (!clientPromise) {
    clientPromise = new MongoClient(process.env.MONGODB_URI, {
      serverSelectionTimeoutMS: 8000,
    }).connect();
  }
  return clientPromise;
}

async function logRows(collection, docs) {
  if (!enabled() || !docs.length) return { logged: 0 };
  const c = await client();
  const db = c.db(process.env.MONGODB_DB || 'agentview');
  const stamped = docs.map((d) => ({ ...d, ts: d.ts || new Date() }));
  const res = await db.collection(collection).insertMany(stamped);
  return { logged: res.insertedCount };
}

async function logRow(collection, doc) {
  return logRows(collection, [doc]);
}

async function close() {
  if (clientPromise) {
    const c = await clientPromise;
    await c.close();
    clientPromise = null;
  }
}

module.exports = { enabled, logRow, logRows, close };

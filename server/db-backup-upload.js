#!/usr/bin/env node
/** Upload SQLite snapshot to Supabase (used on interval and SIGTERM). */
const fs = require('fs');
const path = require('path');
const Database = require('better-sqlite3');

const dbPath = process.argv[2];
if (!dbPath) {
  console.error('Usage: node db-backup-upload.js <path-to-wc2026.db>');
  process.exit(1);
}

const url = process.env.SUPABASE_URL?.replace(/\/$/, '');
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
const bucket = process.env.SUPABASE_DB_BUCKET || 'app-db';
const object = 'wc2026.db';

if (!url || !key) {
  process.exit(0);
}

if (!fs.existsSync(dbPath)) {
  process.exit(0);
}

const tmp = `${dbPath}.upload-${process.pid}`;
const db = new Database(dbPath, { readonly: true });
db.backup(tmp);
db.close();

async function main() {
  const body = fs.readFileSync(tmp);
  const endpoint = `${url}/storage/v1/object/${bucket}/${object}`;
  const res = await fetch(endpoint, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${key}`,
      apikey: key,
      'Content-Type': 'application/octet-stream',
      'x-upsert': 'true',
    },
    body,
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Upload ${res.status}: ${text}`);
  }
}

main()
  .then(() => {
    fs.unlinkSync(tmp);
    process.exit(0);
  })
  .catch((err) => {
    console.error(err.message || err);
    try {
      fs.unlinkSync(tmp);
    } catch {
      /* ignore */
    }
    process.exit(1);
  });

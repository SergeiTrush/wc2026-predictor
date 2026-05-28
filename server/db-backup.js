const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');

const BUCKET = process.env.SUPABASE_DB_BUCKET || 'app-db';
const OBJECT = 'wc2026.db';
const uploadScript = path.join(__dirname, 'db-backup-upload.js');

function enabled() {
  // Render Starter + disk: SQLite already persists under DATA_DIR
  if (process.env.DATA_DIR === '/var/data' && process.env.RENDER) return false;
  return Boolean(process.env.SUPABASE_URL && process.env.SUPABASE_SERVICE_ROLE_KEY);
}

function storageUrl() {
  const base = process.env.SUPABASE_URL.replace(/\/$/, '');
  return `${base}/storage/v1/object/${BUCKET}/${OBJECT}`;
}

/** Download remote DB before SQLite opens (cold start on Render). */
function restoreSync(dbPath) {
  if (!enabled()) return;
  const tmp = `${dbPath}.remote`;
  const script = `
    const url = ${JSON.stringify(storageUrl())};
    const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
    fetch(url, { headers: { Authorization: 'Bearer ' + key, apikey: key } })
      .then(async (r) => {
        if (r.status === 404) process.exit(0);
        if (!r.ok) { console.error('DB restore HTTP', r.status); process.exit(1); }
        require('fs').writeFileSync(${JSON.stringify(tmp)}, Buffer.from(await r.arrayBuffer()));
      })
      .catch((e) => { console.error('DB restore failed', e.message); process.exit(1); });
  `;
  try {
    execFileSync(process.execPath, ['-e', script], {
      stdio: 'inherit',
      timeout: 60000,
      env: process.env,
    });
    if (fs.existsSync(tmp) && fs.statSync(tmp).size > 0) {
      fs.mkdirSync(path.dirname(dbPath), { recursive: true });
      fs.copyFileSync(tmp, dbPath);
      console.log('Restored SQLite from Supabase storage');
    }
  } catch (err) {
    console.warn('DB restore skipped:', err.message || err);
  } finally {
    try {
      if (fs.existsSync(tmp)) fs.unlinkSync(tmp);
    } catch {
      /* ignore */
    }
  }
}

function backupSync(dbPath) {
  if (!enabled() || !fs.existsSync(dbPath)) return;
  execFileSync(process.execPath, [uploadScript, dbPath], {
    stdio: 'inherit',
    timeout: 120000,
    env: process.env,
  });
}

function scheduleBackups(dbPath) {
  if (!enabled()) return;
  const intervalMs = Number(process.env.DB_BACKUP_INTERVAL_MS) || 60000;
  console.log(`DB backup to Supabase every ${intervalMs / 1000}s`);
  const run = () => {
    try {
      backupSync(dbPath);
    } catch (err) {
      console.error('DB backup failed:', err.message || err);
    }
  };
  run();
  const timer = setInterval(run, intervalMs);
  if (timer.unref) timer.unref();

  const flush = () => {
    clearInterval(timer);
    try {
      backupSync(dbPath);
    } catch (err) {
      console.error('DB backup on shutdown failed:', err.message || err);
    }
  };
  process.on('SIGTERM', flush);
  process.on('SIGINT', flush);
}

module.exports = { enabled, restoreSync, scheduleBackups, backupSync };

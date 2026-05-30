#!/usr/bin/env node
/**
 * Frees the API port before dev server start (stale node from a previous run).
 */
const { execSync } = require('child_process');

const port = Number(process.env.PORT || 3001);

try {
  const out = execSync(`lsof -ti :${port}`, { encoding: 'utf8' }).trim();
  if (!out) process.exit(0);

  const pids = [...new Set(out.split('\n').map((s) => s.trim()).filter(Boolean))];
  for (const pid of pids) {
    if (Number(pid) === process.pid) continue;
    console.log(`[free-port] Stopping stale process ${pid} on port ${port}`);
    try {
      process.kill(Number(pid), 'SIGTERM');
    } catch (e) {
      if (e.code !== 'ESRCH') throw e;
    }
  }
} catch (e) {
  if (e.status === 1) process.exit(0);
  throw e;
}

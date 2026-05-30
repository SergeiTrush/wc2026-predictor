#!/usr/bin/env node
/**
 * Export all WC 2026 squads to server/data/squads.json via Bzzoiro BSD.
 *
 * Usage:
 *   npm run export:squads
 */
const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..');
if (fs.existsSync(path.join(root, '.env'))) {
  for (const line of fs.readFileSync(path.join(root, '.env'), 'utf8').split('\n')) {
    const m = line.match(/^([A-Z0-9_]+)=(.*)$/);
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2].trim();
  }
}

const { GROUPS } = require('../server/data/groups');
const bzzoiroProvider = require('../server/squad-providers/bzzoiro');
const { SQUADS_PATH } = require('../server/squad-providers/local');

const ALL_TEAMS = Object.values(GROUPS).flat();

function countWithNumbers(teams) {
  let total = 0;
  let withNum = 0;
  for (const list of Object.values(teams)) {
    total += list.length;
    withNum += list.filter((p) => p.number != null).length;
  }
  return { total, withNum };
}

async function main() {
  if (!bzzoiroProvider.isEnabled()) {
    console.error('Set BZZOIRO_API_TOKEN in .env (register free at https://sports.bzzoiro.com/register)');
    process.exit(1);
  }

  const delayMs = Number(process.env.EXPORT_SQUAD_DELAY_MS || 400);
  console.log('WC 2026 squad export via Bzzoiro BSD');
  console.log(`Teams expected: ${ALL_TEAMS.length}\n`);

  const teams = await bzzoiroProvider.exportAllSquads({ delayMs });
  if (!teams || !Object.keys(teams).length) {
    console.error('No squads returned from Bzzoiro.');
    process.exit(1);
  }

  const { total, withNum } = countWithNumbers(teams);
  const payload = {
    updated_at: new Date().toISOString(),
    source: 'bzzoiro',
    teams,
  };

  fs.mkdirSync(path.dirname(SQUADS_PATH), { recursive: true });
  fs.writeFileSync(SQUADS_PATH, `${JSON.stringify(payload, null, 2)}\n`);

  console.log('=== Export complete ===');
  console.log(`File: ${SQUADS_PATH}`);
  console.log(`Teams: ${Object.keys(teams).length}/${ALL_TEAMS.length}`);
  console.log(`Players: ${total}`);
  console.log(`With jersey #: ${withNum} (${total ? Math.round((withNum / total) * 100) : 0}%)`);

  const missing = ALL_TEAMS.filter((t) => !teams[t]?.length);
  if (missing.length) {
    console.log(`\nMissing teams (${missing.length}):`);
    for (const t of missing) console.log(`  - ${t}`);
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});

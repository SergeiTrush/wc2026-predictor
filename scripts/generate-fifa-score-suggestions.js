#!/usr/bin/env node
/**
 * Writes server/data/fifa-score-suggestions.json from FIFA Play Zone matchStats.json.
 * Usage: node scripts/generate-fifa-score-suggestions.js
 */
const { refreshCache } = require('../server/fifa-score-suggestions');

async function main() {
  const byKey = await refreshCache({ persist: true });
  console.log(
    `Wrote ${Object.keys(byKey).length} FIFA quick-pick sets to server/data/fifa-score-suggestions.json`
  );
}

main().catch((err) => {
  console.error(err.message || err);
  process.exit(1);
});

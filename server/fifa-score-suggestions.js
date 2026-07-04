const fs = require('fs');
const path = require('path');
const { GROUP, KNOCKOUT } = require('./data/wc2026-schedule');
const { kickoffEt } = require('../shared/kickoff');
const { matchLabelToBracketSlot, isKnockoutStage } = require('./data/bracket-slots');

const FIFA_MATCH_STATS_URL = 'https://play.fifa.com/json/match_predictor/matchStats.json';
const CACHE_FILE = path.join(__dirname, 'data/fifa-score-suggestions.json');
const OVERRIDES_FILE = path.join(__dirname, 'data/fifa-score-overrides.json');
const CACHE_TTL_MS = 2 * 60 * 60 * 1000;
const GROUP_MATCH_STATS_MAX = 72;
const FIFA_KNOCKOUT_R32_START = 73;
const FIFA_KNOCKOUT_R32_COUNT = 16;
const FIFA_KNOCKOUT_R16_START = 89;
const FIFA_KNOCKOUT_R16_COUNT = 8;

const THIRD_PLACE_FALLBACK_SUGGESTIONS = [
  { home: 2, away: 1, score: '2-1', prob: 0.3 },
  { home: 2, away: 2, score: '2-2', prob: 0.25 },
  { home: 1, away: 1, score: '1-1', prob: 0.2 },
];

let cache = { at: 0, byKey: null, diskMtime: 0 };

function suggestionKey(home, away, kickoffOrDate) {
  return `${home}|${away}|${String(kickoffOrDate || '').slice(0, 10)}`;
}

function bracketSlotKey(slotId) {
  return `slot:${slotId}`;
}

function sortScheduleEntries(entries) {
  return entries
    .map((entry, originalIndex) => ({
      entry,
      kickoffMs: new Date(kickoffEt(entry[2], entry[3])).getTime(),
      originalIndex,
    }))
    .sort((a, b) => a.kickoffMs - b.kickoffMs || a.originalIndex - b.originalIndex);
}

function knockoutFallbackForStage(stage) {
  if (!stage || stage === 'group' || stage === 'round_of_32' || stage === 'round_of_16') return null;
  if (stage === 'third_place') return THIRD_PLACE_FALLBACK_SUGGESTIONS;
  // FIFA quick-picks are not available for QF, SF, or the final yet.
  return null;
}

function bracketSlotForMatch(match) {
  if (!match) return null;
  return match.bracket_slot_id || matchLabelToBracketSlot(match.match_label);
}

function formatQuickPicks(statsEntry) {
  if (!statsEntry?.quickPicks?.length) return null;
  return statsEntry.quickPicks.slice(0, 3).map((pick) => ({
    home: pick.homeScore,
    away: pick.awayScore,
    score: `${pick.homeScore}-${pick.awayScore}`,
    prob: pick.percentage / 100,
  }));
}

function loadOverrides() {
  try {
    if (!fs.existsSync(OVERRIDES_FILE)) return {};
    return JSON.parse(fs.readFileSync(OVERRIDES_FILE, 'utf8'));
  } catch {
    return {};
  }
}

function readStaticCacheFromDisk() {
  try {
    if (!fs.existsSync(CACHE_FILE)) return { byKey: {}, mtime: 0 };
    const stat = fs.statSync(CACHE_FILE);
    const data = JSON.parse(fs.readFileSync(CACHE_FILE, 'utf8'));
    return { byKey: data.byKey || data, mtime: stat.mtimeMs };
  } catch {
    return { byKey: {}, mtime: 0 };
  }
}

function loadStaticCache() {
  return readStaticCacheFromDisk().byKey;
}

function mergeCacheFromDisk() {
  const { byKey, mtime } = readStaticCacheFromDisk();
  if (!cache.byKey || mtime > cache.diskMtime) {
    cache.byKey = { ...byKey, ...loadOverrides() };
    cache.diskMtime = mtime;
    cache.at = Date.now();
  }
}

async function fetchJson(url) {
  const res = await fetch(url, {
    headers: { Accept: 'application/json', 'User-Agent': 'wc2026-predictor/1.0' },
  });
  if (!res.ok) {
    throw new Error(`FIFA HTTP ${res.status} for ${url}`);
  }
  return res.json();
}

/**
 * FIFA matchStats.json keys 1–72 follow strict kickoff-time order, not group order.
 * Our GROUP array lists matches by group letter within each matchday window, so
 * whenever two groups' kickoffs interleave the positions diverge. Sort chronologically
 * before mapping to align with FIFA's numbering.
 */
async function fetchFromFifa() {
  const stats = await fetchJson(FIFA_MATCH_STATS_URL);
  const byKey = {};

  const sortedGroup = sortScheduleEntries(GROUP.slice(0, GROUP_MATCH_STATS_MAX));
  sortedGroup.forEach(({ entry }, fifaPos) => {
    const [home, away, date, time] = entry;
    const suggestions = formatQuickPicks(stats[String(fifaPos + 1)]);
    if (!suggestions) return;
    byKey[suggestionKey(home, away, kickoffEt(date, time))] = suggestions;
  });

  const sortedR32 = sortScheduleEntries(
    KNOCKOUT.filter((entry) => entry[4] === 'round_of_32').slice(0, FIFA_KNOCKOUT_R32_COUNT)
  );
  sortedR32.forEach(({ entry }, r32Pos) => {
    const matchLabel = entry[5];
    const slotId = matchLabelToBracketSlot(matchLabel);
    const suggestions = formatQuickPicks(stats[String(FIFA_KNOCKOUT_R32_START + r32Pos)]);
    if (!suggestions || !slotId) return;
    byKey[bracketSlotKey(slotId)] = suggestions;
  });

  const sortedR16 = sortScheduleEntries(
    KNOCKOUT.filter((entry) => entry[4] === 'round_of_16').slice(0, FIFA_KNOCKOUT_R16_COUNT)
  );
  sortedR16.forEach(({ entry }, r16Pos) => {
    const matchLabel = entry[5];
    const slotId = matchLabelToBracketSlot(matchLabel);
    const suggestions = formatQuickPicks(stats[String(FIFA_KNOCKOUT_R16_START + r16Pos)]);
    if (!suggestions || !slotId) return;
    byKey[bracketSlotKey(slotId)] = suggestions;
  });

  return byKey;
}

async function refreshCache({ persist = false } = {}) {
  const byKey = { ...await fetchFromFifa(), ...loadOverrides() };
  cache.byKey = byKey;
  cache.at = Date.now();

  if (persist) {
    fs.writeFileSync(
      CACHE_FILE,
      JSON.stringify({ generatedAt: new Date().toISOString(), byKey }, null, 2)
    );
    cache.diskMtime = fs.statSync(CACHE_FILE).mtimeMs;
  }

  return byKey;
}

async function ensureCache() {
  mergeCacheFromDisk();

  if (cache.byKey && Date.now() - cache.at < CACHE_TTL_MS) {
    return cache.byKey;
  }

  if (Date.now() - cache.at >= CACHE_TTL_MS) {
    try {
      await refreshCache();
    } catch (err) {
      console.warn('FIFA score suggestions refresh failed:', err.message);
    }
  }

  return cache.byKey;
}

function getSuggestionsForMatch(match, byKey) {
  if (!match) return null;

  const slotId = bracketSlotForMatch(match);
  const knockout = isKnockoutStage(match.stage);

  if (slotId) {
    const fromSlot = byKey[bracketSlotKey(slotId)];
    if (fromSlot) return fromSlot;
    if (knockout) return knockoutFallbackForStage(match.stage);
  }

  if (!knockout && match.home_team && match.away_team && match.kickoff) {
    const fromTeams = byKey[suggestionKey(match.home_team, match.away_team, match.kickoff)];
    if (fromTeams) return fromTeams;
  }

  return null;
}

/** In-memory/disk cache only — never blocks on FIFA network. */
function getSuggestionsMapSync() {
  mergeCacheFromDisk();
  return cache.byKey || {};
}

function scheduleSuggestionsRefreshIfStale() {
  mergeCacheFromDisk();
  if (cache.byKey && Date.now() - cache.at < CACHE_TTL_MS) return;
  setImmediate(() => {
    refreshCache().catch((err) => {
      console.warn('FIFA score suggestions background refresh failed:', err.message);
    });
  });
}

async function getSuggestionsMap() {
  return ensureCache();
}

function startFifaScoreSuggestionsScheduler() {
  const hasStatic = fs.existsSync(CACHE_FILE);

  const run = () => {
    refreshCache({ persist: true }).catch((err) => {
      console.warn('FIFA score suggestions sync failed:', err.message);
    });
  };

  if (hasStatic) {
    mergeCacheFromDisk();
  }

  setTimeout(run, 6000);
  setInterval(run, CACHE_TTL_MS);
  console.log('FIFA score suggestions: scheduled refresh every 2 h');
}

module.exports = {
  suggestionKey,
  bracketSlotKey,
  formatQuickPicks,
  fetchFromFifa,
  refreshCache,
  getSuggestionsMap,
  getSuggestionsMapSync,
  scheduleSuggestionsRefreshIfStale,
  getSuggestionsForMatch,
  knockoutFallbackForStage,
  startFifaScoreSuggestionsScheduler,
};

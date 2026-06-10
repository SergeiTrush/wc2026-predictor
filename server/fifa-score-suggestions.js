const fs = require('fs');
const path = require('path');
const { GROUP } = require('./data/wc2026-schedule');
const { kickoffEt } = require('../shared/kickoff');

const FIFA_MATCH_STATS_URL = 'https://play.fifa.com/json/match_predictor/matchStats.json';
const CACHE_FILE = path.join(__dirname, 'data/fifa-score-suggestions.json');
const OVERRIDES_FILE = path.join(__dirname, 'data/fifa-score-overrides.json');
const CACHE_TTL_MS = 2 * 60 * 60 * 1000;
const GROUP_MATCH_STATS_MAX = 72;

let cache = { at: 0, byKey: null };

function suggestionKey(home, away, kickoffOrDate) {
  return `${home}|${away}|${String(kickoffOrDate || '').slice(0, 10)}`;
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

function loadStaticCache() {
  try {
    if (!fs.existsSync(CACHE_FILE)) return {};
    const data = JSON.parse(fs.readFileSync(CACHE_FILE, 'utf8'));
    return data.byKey || data;
  } catch {
    return {};
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

  const sorted = GROUP.slice(0, GROUP_MATCH_STATS_MAX)
    .map((entry, originalIndex) => ({
      entry,
      kickoffMs: new Date(kickoffEt(entry[2], entry[3])).getTime(),
      originalIndex,
    }))
    .sort((a, b) => a.kickoffMs - b.kickoffMs || a.originalIndex - b.originalIndex);

  sorted.forEach(({ entry }, fifaPos) => {
    const [home, away, date, time] = entry;
    const suggestions = formatQuickPicks(stats[String(fifaPos + 1)]);
    if (!suggestions) return;
    byKey[suggestionKey(home, away, kickoffEt(date, time))] = suggestions;
  });

  return byKey;
}

async function refreshCache({ persist = false } = {}) {
  const byKey = { ...await fetchFromFifa(), ...loadOverrides() };
  cache = { at: Date.now(), byKey };

  if (persist) {
    fs.writeFileSync(
      CACHE_FILE,
      JSON.stringify({ generatedAt: new Date().toISOString(), byKey }, null, 2)
    );
  }

  return byKey;
}

async function ensureCache() {
  if (cache.byKey && Date.now() - cache.at < CACHE_TTL_MS) {
    return cache.byKey;
  }

  if (!cache.byKey) {
    cache.byKey = { ...loadStaticCache(), ...loadOverrides() };
    cache.at = Date.now();
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
  if (!match?.home_team || !match?.away_team || !match?.kickoff) return null;
  return byKey[suggestionKey(match.home_team, match.away_team, match.kickoff)] || null;
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
    cache.byKey = { ...loadStaticCache(), ...loadOverrides() };
    cache.at = Date.now();
  }

  setTimeout(run, 6000);
  setInterval(run, CACHE_TTL_MS);
  console.log('FIFA score suggestions: scheduled refresh every 2 h');
}

module.exports = {
  suggestionKey,
  formatQuickPicks,
  fetchFromFifa,
  refreshCache,
  getSuggestionsMap,
  getSuggestionsForMatch,
  startFifaScoreSuggestionsScheduler,
};

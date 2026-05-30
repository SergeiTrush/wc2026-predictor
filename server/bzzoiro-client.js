const API_BASE = process.env.BZZOIRO_API_BASE || 'https://sports.bzzoiro.com/api/v2';

function isEnabled() {
  return Boolean(process.env.BZZOIRO_API_TOKEN?.trim());
}

function getConfig() {
  return {
    leagueId: process.env.BZZOIRO_LEAGUE_ID
      ? Number(process.env.BZZOIRO_LEAGUE_ID)
      : null,
    intervalMs: Number(process.env.RESULTS_SYNC_INTERVAL_MS || 15 * 60 * 1000),
    maxEventFetches: Number(process.env.RESULTS_SYNC_MAX_EVENTS || 15),
  };
}

async function apiFetch(path) {
  const token = process.env.BZZOIRO_API_TOKEN?.trim();
  if (!token) throw new Error('BZZOIRO_API_TOKEN is not set');

  const res = await fetch(`${API_BASE}${path}`, {
    headers: { Authorization: `Token ${token}` },
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(data.detail || data.error || `Bzzoiro HTTP ${res.status}`);
  }
  return data;
}

module.exports = { isEnabled, getConfig, apiFetch, API_BASE };

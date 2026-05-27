const TOKEN_KEY = 'wc2026_token';

export function getToken() {
  return localStorage.getItem(TOKEN_KEY);
}

export function setToken(token) {
  if (token) localStorage.setItem(TOKEN_KEY, token);
  else localStorage.removeItem(TOKEN_KEY);
}

async function request(path, options = {}) {
  const headers = { 'Content-Type': 'application/json', ...options.headers };
  const token = getToken();
  if (token) headers.Authorization = `Bearer ${token}`;

  const res = await fetch(`/api${path}`, { ...options, headers });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(data.error || 'Request failed');
  }
  return data;
}

export const api = {
  register: (name, password) =>
    request('/auth/register', { method: 'POST', body: JSON.stringify({ name, password }) }),
  login: (name, password) =>
    request('/auth/login', { method: 'POST', body: JSON.stringify({ name, password }) }),
  me: () => request('/auth/me'),
  tournament: () => request('/tournament'),
  leagues: () => request('/leagues'),
  createLeague: (name) =>
    request('/leagues', { method: 'POST', body: JSON.stringify({ name }) }),
  joinLeague: (code) =>
    request('/leagues/join', { method: 'POST', body: JSON.stringify({ code }) }),
  leaderboard: (leagueId) => request(`/leagues/${leagueId}/leaderboard`),
  matches: (params = {}) => {
    const q = new URLSearchParams(params).toString();
    return request(`/matches${q ? `?${q}` : ''}`);
  },
  savePrediction: (matchId, homeScore, awayScore) =>
    request('/predictions', {
      method: 'POST',
      body: JSON.stringify({ matchId, homeScore, awayScore }),
    }),
  setResult: (matchId, homeScore, awayScore) =>
    request(`/matches/${matchId}/result`, {
      method: 'PUT',
      body: JSON.stringify({ homeScore, awayScore }),
    }),
};

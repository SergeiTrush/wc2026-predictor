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
  if (!res.ok) throw new Error(data.error || 'Ошибка запроса');
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
  league: (id) => request(`/leagues/${id}`),
  createLeague: (name) =>
    request('/leagues', { method: 'POST', body: JSON.stringify({ name }) }),
  joinLeague: (code) =>
    request('/leagues/join', { method: 'POST', body: JSON.stringify({ code }) }),
  updateLeague: (id, name) =>
    request(`/leagues/${id}`, { method: 'PATCH', body: JSON.stringify({ name }) }),
  deleteLeague: (id) => request(`/leagues/${id}`, { method: 'DELETE' }),
  suspendMember: (leagueId, userId) =>
    request(`/leagues/${leagueId}/members/${userId}/suspend`, { method: 'POST' }),
  leaderboard: (leagueId) => request(`/leagues/${leagueId}/leaderboard`),
  getBracket: (leagueId) => request(`/leagues/${leagueId}/bracket`),
  saveBracket: (leagueId, picks, strict = false) =>
    request(`/leagues/${leagueId}/bracket${strict ? '?strict=1' : ''}`, {
      method: 'PUT',
      body: JSON.stringify({ picks }),
    }),
  matchdays: () => request('/matchdays'),
  matches: (params = {}) => {
    const q = new URLSearchParams(params).toString();
    return request(`/matches${q ? `?${q}` : ''}`);
  },
  savePrediction: (body) =>
    request('/predictions', { method: 'POST', body: JSON.stringify(body) }),
  setResult: (matchId, body) =>
    request(`/matches/${matchId}/result`, { method: 'PUT', body: JSON.stringify(body) }),
};

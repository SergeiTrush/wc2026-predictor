const TOKEN_KEY = 'wc2026_token';

export function getToken() {
  return localStorage.getItem(TOKEN_KEY);
}

export function setToken(token) {
  if (token) localStorage.setItem(TOKEN_KEY, token);
  else localStorage.removeItem(TOKEN_KEY);
}

function apiErrorMessage(status, data, path) {
  if (data?.error) return data.error;
  if (status === 404) {
    if (path?.includes('friend-predictions') || path?.includes('/predictions')) {
      return 'Не удалось загрузить прогнозы друзей — перезапустите сервер: npm run dev';
    }
    if (path?.includes('/teams/') && path?.includes('/players')) {
      return 'Список игроков недоступен — перезапустите API: cd prediction-app && npm run dev';
    }
    return 'Сервер устарел — остановите и снова запустите: cd prediction-app && npm run dev';
  }
  if (status === 502 || status === 503) {
    return 'API не запущен. В отдельном терминале: cd prediction-app && npm run dev';
  }
  if (status >= 500) {
    return 'Ошибка сервера — остановите (Ctrl+C) и снова запустите: cd prediction-app && npm run dev';
  }
  return 'Ошибка запроса';
}

async function request(path, options = {}) {
  const headers = { 'Content-Type': 'application/json', ...options.headers };
  const token = getToken();
  if (token) headers.Authorization = `Bearer ${token}`;

  let res;
  try {
    res = await fetch(`/api${path}`, { ...options, headers });
  } catch {
    throw new Error(
      'Не удалось подключиться к API. Запустите сервер: cd prediction-app && npm run dev'
    );
  }

  const text = await res.text();
  let data = {};
  if (text) {
    try {
      data = JSON.parse(text);
    } catch {
      if (!res.ok) {
        const isHtml = text.trimStart().startsWith('<');
        const err = new Error(
          isHtml && res.status === 404
            ? 'API не запущен или устарел. В терминале: cd prediction-app && npm run dev'
            : apiErrorMessage(res.status, null, path)
        );
        err.status = res.status;
        throw err;
      }
    }
  }
  if (!res.ok) {
    const err = new Error(apiErrorMessage(res.status, data, path));
    err.status = res.status;
    throw err;
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
  league: (id) => request(`/leagues/${id}`),
  leagueSettings: (id) => request(`/leagues/${id}/settings`),
  createLeague: (name) =>
    request('/leagues', { method: 'POST', body: JSON.stringify({ name }) }),
  joinLeague: (code) =>
    request('/leagues/join', { method: 'POST', body: JSON.stringify({ code }) }),
  updateLeague: (id, name) =>
    request(`/leagues/${id}`, { method: 'PATCH', body: JSON.stringify({ name }) }),
  deleteLeague: (id) => request(`/leagues/${id}`, { method: 'DELETE' }),
  suspendMember: (leagueId, userId) =>
    request(`/leagues/${leagueId}/members/${userId}/suspend`, { method: 'POST' }),
  leaderboard: (leagueId, matchday) =>
    request(`/leagues/${leagueId}/leaderboard${matchday ? `?matchday=${encodeURIComponent(matchday)}` : ''}`),
  userMatchdayPoints: (leagueId, userId) =>
    request(`/leagues/${leagueId}/users/${userId}/matchday-points`),
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
  /** All tournament matches for a league (with predictions). */
  async allMatches(leagueId) {
    let data;
    try {
      data = await this.matches({ leagueId, all: '1' });
    } catch (e) {
      if (e.status === 403) throw e;
      data = await this.matches({ leagueId });
    }
    const count = data.matches?.length ?? 0;
    if (count < 80) {
      try {
        const full = await this.matches({ leagueId, matchday: '2026-06-11' });
        if ((full.matches?.length ?? 0) > count) {
          data = full;
        }
      } catch (e) {
        if (e.status === 403) throw e;
        /* keep partial list */
      }
    }
    if (!data.matches?.length) {
      throw new Error('Матчи не найдены — перезапустите сервер: npm run dev');
    }
    return data;
  },
  savePrediction: (body) =>
    request('/predictions', { method: 'POST', body: JSON.stringify(body) }),
  setBooster: (body) =>
    request('/predictions/booster', { method: 'POST', body: JSON.stringify(body) }),
  matchFriendPredictions: (leagueId, matchId) =>
    request(`/matches/${matchId}/friend-predictions?leagueId=${leagueId}`),
  teamPlayers: (teamName) =>
    request(`/teams/${encodeURIComponent(teamName)}/players`),
  setResult: (matchId, body) =>
    request(`/matches/${matchId}/result`, { method: 'PUT', body: JSON.stringify(body) }),
  clearResult: (matchId, leagueId) =>
    request(`/matches/${matchId}/result?leagueId=${leagueId}`, { method: 'DELETE' }),
  resultsSyncStatus: () => request('/results/sync-status'),
  syncResults: () => request('/results/sync', { method: 'POST' }),
};

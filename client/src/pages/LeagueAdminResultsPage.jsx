import { useEffect, useState, useMemo, useRef } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { api } from '../api';
import { IconBack } from '../components/AuthExitButton';
import { teamFlag, formatMatchTime } from '../utils';
import { redirectIfLeagueForbidden } from '../leagueAccess';

function AdminMatchRow({ match, leagueId, onSaved }) {
  const finished = match.home_score != null && match.away_score != null;
  const [home, setHome] = useState(finished ? String(match.home_score) : '');
  const [away, setAway] = useState(finished ? String(match.away_score) : '');
  const [firstTeam, setFirstTeam] = useState(match.first_scorer_team || '');
  const [firstPlayer, setFirstPlayer] = useState(match.first_scorer_player || '');
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState('');

  const save = async () => {
    const h = parseInt(home, 10);
    const a = parseInt(away, 10);
    if (Number.isNaN(h) || Number.isNaN(a) || h < 0 || a < 0) {
      setMsg('Укажите счёт');
      return;
    }
    setSaving(true);
    setMsg('');
    try {
      await api.setResult(match.id, {
        leagueId: Number(leagueId),
        homeScore: h,
        awayScore: a,
        firstScorerTeam: firstTeam || null,
        firstScorerPlayer: firstPlayer || null,
      });
      setMsg('✓ Сохранено');
      onSaved();
      setTimeout(() => setMsg(''), 2000);
    } catch (e) {
      setMsg(e.message);
    } finally {
      setSaving(false);
    }
  };

  const clear = async () => {
    if (!confirm('Удалить результат этого матча?')) return;
    setSaving(true);
    setMsg('');
    try {
      await api.clearResult(match.id, Number(leagueId));
      setHome('');
      setAway('');
      setFirstTeam('');
      setFirstPlayer('');
      setMsg('Результат удалён');
      onSaved();
    } catch (e) {
      setMsg(e.message);
    } finally {
      setSaving(false);
    }
  };

  const label = match.group_name ? `Группа ${match.group_name}` : match.match_label;

  return (
    <div className={`admin-match-row ${finished ? 'admin-match-done' : ''}`}>
      <div className="admin-match-meta">
        <span>{formatMatchTime(match.kickoff)}</span>
        <span>{label}</span>
      </div>
      <div className="admin-match-teams">
        <span>
          {teamFlag(match.home_team)} {match.home_team}
        </span>
        <span className="admin-score-inputs">
          <input
            type="text"
            inputMode="numeric"
            className="admin-score-in"
            value={home}
            onChange={(e) => setHome(e.target.value.replace(/\D/g, '').slice(0, 2))}
            aria-label="Голы хозяев"
          />
          <span>:</span>
          <input
            type="text"
            inputMode="numeric"
            className="admin-score-in"
            value={away}
            onChange={(e) => setAway(e.target.value.replace(/\D/g, '').slice(0, 2))}
            aria-label="Голы гостей"
          />
        </span>
        <span>
          {match.away_team} {teamFlag(match.away_team)}
        </span>
      </div>
      <div className="admin-match-extra">
        <label>
          Первая команда
          <select value={firstTeam} onChange={(e) => setFirstTeam(e.target.value)}>
            <option value="">—</option>
            <option value="home">{match.home_team}</option>
            <option value="away">{match.away_team}</option>
            <option value="none">Никто / 0:0</option>
          </select>
        </label>
        <label>
          Первый гол (игрок)
          <input
            type="text"
            placeholder="Фамилия"
            value={firstPlayer}
            onChange={(e) => setFirstPlayer(e.target.value)}
          />
        </label>
      </div>
      <div className="admin-match-actions">
        <button type="button" className="btn-primary btn-admin-save" disabled={saving} onClick={save}>
          {saving ? '…' : 'Сохранить результат'}
        </button>
        {finished && (
          <button type="button" className="btn-admin-clear" disabled={saving} onClick={clear}>
            Сбросить
          </button>
        )}
        {msg && <span className="admin-match-msg">{msg}</span>}
      </div>
    </div>
  );
}

export default function LeagueAdminResultsPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [league, setLeague] = useState(null);
  const [matches, setMatches] = useState([]);
  const [filter, setFilter] = useState('pending');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const headerRef = useRef(null);
  const [headerHeight, setHeaderHeight] = useState(0);

  const refreshMatches = () => {
    api.allMatches(id).then((d) => setMatches(d.matches || [])).catch(() => {});
  };

  useEffect(() => {
    setLoading(true);
    Promise.all([api.league(id), api.allMatches(id)])
      .then(([leagueData, matchData]) => {
        setLeague(leagueData.league);
        if (!leagueData.league.is_owner) {
          setError('Только владелец лиги может вводить результаты');
          return;
        }
        setMatches(matchData.matches || []);
      })
      .catch((e) => {
        if (redirectIfLeagueForbidden(e, navigate)) return;
        setError(e.message);
      })
      .finally(() => setLoading(false));
  }, [id, navigate]);

  useEffect(() => {
    const el = headerRef.current;
    if (!el) return;
    const update = () => setHeaderHeight(el.offsetHeight);
    update();
    const ro = new ResizeObserver(update);
    ro.observe(el);
    return () => ro.disconnect();
  }, [league?.name, matches.length, filter]);

  const filtered = useMemo(() => {
    let list = [...matches];
    if (filter === 'pending') {
      list = list.filter((m) => m.home_score == null || m.away_score == null);
    } else if (filter === 'done') {
      list = list.filter((m) => m.home_score != null && m.away_score != null);
    }
    return list.sort((a, b) => a.kickoff.localeCompare(b.kickoff));
  }, [matches, filter]);

  const pendingCount = matches.filter((m) => m.home_score == null || m.away_score == null).length;

  if (loading) {
    return (
      <div
        aria-busy="true"
        aria-live="polite"
        style={{
          minHeight: '100vh',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          background: 'transparent',
        }}
      >
        <p className="empty-hint" style={{ margin: 0 }}>
          <span style={{ color: '#ffffff' }}>Загрузка…</span>
        </p>
      </div>
    );
  }

  if (error || !league?.is_owner) {
    return (
      <div className="app-root">
        <div className="app-header settings-header">
          <div className="settings-header-row">
            <button
              type="button"
              className="header-icon-btn header-icon-btn--back"
              aria-label="Назад"
              onClick={() => navigate(`/league/${id}`)}
            >
              <IconBack />
            </button>
            <h1 className="settings-header-title">Ввод результатов</h1>
          </div>
        </div>
        <p className="error-banner" style={{ margin: '1rem' }}>
          {error || 'Нет доступа'}
        </p>
      </div>
    );
  }

  return (
    <div className="app-root">
      <div ref={headerRef} className="admin-top-fixed">
        <div className="app-header settings-header admin-results-header">
          <div className="settings-header-row">
            <button
              type="button"
              className="header-icon-btn header-icon-btn--back"
              aria-label="Назад"
              onClick={() => navigate(`/league/${id}`)}
            >
              <IconBack />
            </button>
            <h1 className="settings-header-title">Ввод результатов</h1>
          </div>
          <p className="admin-subtitle">
            {league.name} · без результата: {pendingCount} из {matches.length}
          </p>
        </div>

        <div className="admin-filters">
          <button
            type="button"
            className={filter === 'pending' ? 'active' : ''}
            onClick={() => setFilter('pending')}
          >
            Без результата
          </button>
          <button
            type="button"
            className={filter === 'done' ? 'active' : ''}
            onClick={() => setFilter('done')}
          >
            С результатом
          </button>
          <button
            type="button"
            className={filter === 'all' ? 'active' : ''}
            onClick={() => setFilter('all')}
          >
            Все
          </button>
        </div>
      </div>

      <div className="admin-results-body" style={{ paddingTop: headerHeight }}>
        <div className="page-content admin-results-list">
        {filtered.length === 0 && (
          <p className="empty-hint">
            {filter === 'pending' ? 'Все матчи с результатами — отлично!' : 'Нет матчей в этой категории'}
          </p>
        )}
        {filtered.map((m) => (
          <AdminMatchRow key={m.id} match={m} leagueId={id} onSaved={refreshMatches} />
        ))}
        </div>
      </div>
    </div>
  );
}

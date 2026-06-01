import { useCallback, useEffect, useState, useMemo, useRef } from 'react';
import { useNavigate, useOutletContext, useParams } from 'react-router-dom';
import { api, isSessionExpiredError } from '../api';
import { teamFlag, formatMatchTime, matchHasStoredScore, matchIsFinished, adminMatchScores, matchHasAdminResult, isMatchInPlayWindow, matchIsLive } from '../utils';
import { createEffectGuard, redirectIfLeagueForbidden } from '../leagueAccess';
import { loadMatchSquads } from '../teamSquads';
import {
  matchdaysFromMatches,
  filterMatchesByDay,
  pickDefaultMatchday,
  formatMatchdayTabDate,
  isKnockoutMatch,
} from '../matchdays';
import FirstTeamSelect from '../components/FirstTeamSelect';
import FirstPlayerSelect, { NO_FIRST_SCORER } from '../components/FirstPlayerSelect';
import { resolveFirstTeamName } from '../predictionExtras';
import { useConfirm } from '../context/ConfirmContext';

function AdminMatchRow({ match, leagueId, onSaved }) {
  const { confirm } = useConfirm();
  const scores = adminMatchScores(match);
  const hasStoredScore = matchHasStoredScore(match);
  const hasScore = matchHasAdminResult(match);
  const [home, setHome] = useState(scores ? String(scores.home) : '');
  const [away, setAway] = useState(scores ? String(scores.away) : '');
  const [matchFinished, setMatchFinished] = useState(matchIsFinished(match));
  const [finalHome, setFinalHome] = useState(
    scores?.finalHome != null
      ? String(scores.finalHome)
      : match.final_home_score != null
        ? String(match.final_home_score)
        : ''
  );
  const [finalAway, setFinalAway] = useState(
    scores?.finalAway != null
      ? String(scores.finalAway)
      : match.final_away_score != null
        ? String(match.final_away_score)
        : ''
  );
  const [firstTeam, setFirstTeam] = useState(match.first_scorer_team || '');
  const [firstPlayer, setFirstPlayer] = useState(match.first_scorer_player || '');
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState('');
  const [squadPlayers, setSquadPlayers] = useState(null);
  const [squadTeams, setSquadTeams] = useState(null);
  const [squadLoading, setSquadLoading] = useState(false);
  const [squadError, setSquadError] = useState('');
  const knockout = isKnockoutMatch(match);

  const applyMatchFields = (saved, { keepFinalOnMissing = false } = {}) => {
    if (!saved) return;
    setHome(saved.home_score != null ? String(saved.home_score) : '');
    setAway(saved.away_score != null ? String(saved.away_score) : '');
    if (saved.final_home_score != null) {
      setFinalHome(String(saved.final_home_score));
    } else if (!keepFinalOnMissing) {
      setFinalHome('');
    }
    if (saved.final_away_score != null) {
      setFinalAway(String(saved.final_away_score));
    } else if (!keepFinalOnMissing) {
      setFinalAway('');
    }
    setFirstTeam(saved.first_scorer_team || '');
    setFirstPlayer(saved.first_scorer_player || '');
    setMatchFinished(matchIsFinished(saved));
  };

  useEffect(() => {
    const nextScores = adminMatchScores(match);
    setHome(nextScores ? String(nextScores.home) : '');
    setAway(nextScores ? String(nextScores.away) : '');
    if (nextScores?.finalHome != null) {
      setFinalHome(String(nextScores.finalHome));
    } else {
      setFinalHome(match.final_home_score != null ? String(match.final_home_score) : '');
    }
    if (nextScores?.finalAway != null) {
      setFinalAway(String(nextScores.finalAway));
    } else {
      setFinalAway(match.final_away_score != null ? String(match.final_away_score) : '');
    }
    setFirstTeam(match.first_scorer_team || '');
    setFirstPlayer(match.first_scorer_player || '');
    setMatchFinished(matchIsFinished(match));
  }, [
    match.id,
    match.home_score,
    match.away_score,
    match.is_finished,
    match.final_home_score,
    match.final_away_score,
    match.first_scorer_team,
    match.first_scorer_player,
    match.liveScore?.homeScore,
    match.liveScore?.awayScore,
    match.liveScore?.regulationHomeScore,
    match.liveScore?.regulationAwayScore,
    match.liveScore?.status,
  ]);

  useEffect(() => {
    setSquadPlayers(null);
    setSquadTeams(null);
    setSquadLoading(false);
    setSquadError('');
  }, [match.id]);

  const loadSquadPlayers = useCallback(() => {
    if (squadLoading) return;
    if (squadTeams !== null && !squadError) return;

    setSquadLoading(true);
    setSquadError('');
    loadMatchSquads(match.home_team, match.away_team)
      .then((data) => {
        setSquadTeams(data.teams || []);
        setSquadPlayers(data.players || []);
        setSquadError(data.warnings?.length ? data.warnings.join(' · ') : '');
      })
      .catch((e) => {
        setSquadTeams([]);
        setSquadPlayers([]);
        setSquadError(e?.message || 'Не удалось загрузить игроков');
      })
      .finally(() => setSquadLoading(false));
  }, [squadLoading, squadTeams, squadError, match.home_team, match.away_team]);

  useEffect(() => {
    const needsSquad =
      (match.first_scorer_player && match.first_scorer_player !== 'none') ||
      (match.first_scorer_team && match.first_scorer_team !== 'none');
    if (!needsSquad) return;
    loadSquadPlayers();
  }, [match.id, match.first_scorer_player, match.first_scorer_team, loadSquadPlayers]);

  const selectedTeamName = useMemo(
    () => resolveFirstTeamName(firstTeam, match.home_team, match.away_team),
    [firstTeam, match.home_team, match.away_team]
  );

  const filteredSquadTeams = useMemo(() => {
    if (!Array.isArray(squadTeams)) return squadTeams;
    if (!selectedTeamName) return [];
    return squadTeams.filter((entry) => entry.team === selectedTeamName);
  }, [squadTeams, selectedTeamName]);

  const playerOptions = useMemo(() => {
    if (!Array.isArray(squadPlayers)) return [];
    if (firstTeam === 'none' || !selectedTeamName) return [];
    return squadPlayers.filter((p) => p.team === selectedTeamName);
  }, [squadPlayers, selectedTeamName, firstTeam]);

  const onFirstTeamChange = (next) => {
    setFirstTeam(next);
    if (next === 'none') {
      setFirstPlayer(NO_FIRST_SCORER);
      return;
    }
    const teamName = resolveFirstTeamName(next, match.home_team, match.away_team);
    if (!teamName || !firstPlayer || firstPlayer === NO_FIRST_SCORER) return;
    const stillValid = squadPlayers?.some((p) => {
      const name = (p.name || p.surname || '').trim();
      return name === firstPlayer && p.team === teamName;
    });
    if (!stillValid) setFirstPlayer('');
  };

  const playerPlaceholder = squadLoading
    ? 'Загрузка…'
    : squadError
      ? 'Нет списка игроков'
      : Array.isArray(squadPlayers) && squadPlayers.length === 0
        ? 'Состав не найден'
        : selectedTeamName
          ? 'Игрок команды'
          : 'Сначала выберите команду';

  const save = async () => {
    const h = parseInt(home, 10);
    const a = parseInt(away, 10);
    if (Number.isNaN(h) || Number.isNaN(a) || h < 0 || a < 0) {
      setMsg('Укажите счёт');
      return;
    }
    let fh = null;
    let fa = null;
    if (knockout) {
      if (finalHome !== '' || finalAway !== '') {
        if (finalHome === '' || finalAway === '') {
          setMsg('Укажите оба значения итогового счёта');
          return;
        }
        fh = parseInt(finalHome, 10);
        fa = parseInt(finalAway, 10);
        if (Number.isNaN(fh) || Number.isNaN(fa) || fh < 0 || fa < 0) {
          setMsg('Укажите итоговый счёт');
          return;
        }
      }
    }
    setSaving(true);
    setMsg('');
    const finishedChecked = matchFinished;
    try {
      const payload = {
        leagueId: Number(leagueId),
        homeScore: h,
        awayScore: a,
        firstScorerTeam: firstTeam || null,
        firstScorerPlayer: firstPlayer || null,
        isFinished: finishedChecked,
      };
      if (knockout) {
        payload.finalHomeScore = fh;
        payload.finalAwayScore = fa;
      }
      const { match: saved } = await api.setResult(match.id, payload);
      const merged = saved
        ? {
            ...saved,
            is_finished: finishedChecked ? 1 : 0,
            isFinished: finishedChecked,
            final_home_score: saved.final_home_score ?? fh,
            final_away_score: saved.final_away_score ?? fa,
          }
        : null;
      applyMatchFields(merged, { keepFinalOnMissing: true });
      if (knockout && fh != null && saved?.final_home_score == null) {
        setMsg('Счёт сохранён, но итоговый счёт не записался — перезапустите сервер (npm run dev)');
      } else {
        setMsg('✓ Сохранено');
      }
      onSaved(merged);
      setTimeout(() => setMsg(''), knockout && fh != null && saved?.final_home_score == null ? 5000 : 2000);
    } catch (e) {
      setMsg(e.message);
    } finally {
      setSaving(false);
    }
  };

  const clear = async () => {
    const ok = await confirm({
      title: 'Удалить результат этого матча?',
      message: 'Счёт, первый гол и статус матча будут сброшены.',
      confirmLabel: 'Удалить',
      danger: true,
    });
    if (!ok) return;
    setSaving(true);
    setMsg('');
    try {
      await api.clearResult(match.id, Number(leagueId));
      setHome('');
      setAway('');
      setFinalHome('');
      setFinalAway('');
      setFirstTeam('');
      setFirstPlayer('');
      setMatchFinished(false);
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
    <div className={`admin-match-row ${matchFinished ? 'admin-match-done' : hasScore ? 'admin-match-live' : ''}`}>
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

      {knockout && (
        <div className="admin-final-score">
          <span className="admin-final-score-label">Итоговый счет</span>
          <span className="admin-final-score-inputs">
            <input
              type="text"
              inputMode="numeric"
              className="admin-final-score-in"
              value={finalHome}
              onChange={(e) => setFinalHome(e.target.value.replace(/\D/g, '').slice(0, 2))}
              aria-label="Итоговый счёт хозяев"
            />
            <span className="admin-final-score-sep">:</span>
            <input
              type="text"
              inputMode="numeric"
              className="admin-final-score-in"
              value={finalAway}
              onChange={(e) => setFinalAway(e.target.value.replace(/\D/g, '').slice(0, 2))}
              aria-label="Итоговый счёт гостей"
            />
          </span>
          <span className="admin-final-score-spacer" aria-hidden="true" />
        </div>
      )}

      <div className="admin-match-extra">
        <label>
          Первая команда
          <FirstTeamSelect
            className="custom-select--full"
            triggerVariant="modal"
            pickerTitle="Первая команда"
            value={firstTeam}
            onChange={onFirstTeamChange}
            homeTeam={match.home_team}
            awayTeam={match.away_team}
          />
        </label>
        <label>
          Первый гол (игрок)
          <FirstPlayerSelect
            className="custom-select--full"
            triggerVariant="modal"
            pickerTitle="Первый гол (игрок)"
            value={firstPlayer}
            onChange={setFirstPlayer}
            teams={filteredSquadTeams}
            players={playerOptions}
            loading={squadLoading}
            disabled={!selectedTeamName && firstTeam !== 'none'}
            placeholder={playerPlaceholder}
            title={squadError || undefined}
            teamHint={selectedTeamName}
            onOpen={loadSquadPlayers}
          />
        </label>
        {squadError && <p className="squad-hint squad-hint--error admin-squad-hint">{squadError}</p>}
      </div>
      <label className="admin-match-finished">
        <input
          type="checkbox"
          className="admin-match-finished-input"
          checked={matchFinished}
          onChange={(e) => setMatchFinished(e.target.checked)}
        />
        <span className="admin-match-finished-label">Матч завершён</span>
        {hasScore && !matchFinished && <span className="admin-match-live-tag">LIVE</span>}
      </label>
      <div className="admin-match-actions">
        <button type="button" className="btn-primary btn-admin-save" disabled={saving} onClick={save}>
          {saving ? '…' : 'Сохранить результат'}
        </button>
        {hasStoredScore && (
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
  const { league: layoutLeague } = useOutletContext() || {};
  const [league, setLeague] = useState(layoutLeague ?? null);
  const [matches, setMatches] = useState([]);
  const [selectedDay, setSelectedDay] = useState(null);
  const [filter, setFilter] = useState('pending');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const listRef = useRef(null);
  const matchdays = useMemo(() => matchdaysFromMatches(matches), [matches]);

  const refreshMatches = (savedMatch) => {
    if (savedMatch?.id != null) {
      setMatches((prev) =>
        prev.map((m) => {
          if (Number(m.id) !== Number(savedMatch.id)) return m;
          return {
            ...m,
            ...savedMatch,
            is_finished: savedMatch.is_finished ?? m.is_finished,
            isFinished:
              savedMatch.isFinished != null
                ? savedMatch.isFinished
                : Number(savedMatch.is_finished ?? m.is_finished) === 1,
            final_home_score: savedMatch.final_home_score ?? m.final_home_score,
            final_away_score: savedMatch.final_away_score ?? m.final_away_score,
          };
        })
      );
      return Promise.resolve();
    }
    return api
      .allMatches(id)
      .then((d) => setMatches(d.matches || []))
      .catch(() => {});
  };

  useEffect(() => {
    if (layoutLeague) setLeague(layoutLeague);
  }, [layoutLeague]);

  useEffect(() => {
    const guard = createEffectGuard();
    setLoading(true);
    setError('');

    const leaguePromise = layoutLeague
      ? Promise.resolve({ league: layoutLeague })
      : api.league(id);

    Promise.all([leaguePromise, api.allMatches(id)])
      .then(([leagueData, matchData]) => {
        if (!guard.isActive()) return;
        setLeague(leagueData.league);
        setMatches(matchData.matches || []);
      })
      .catch((e) => {
        if (!guard.isActive()) return;
        if (redirectIfLeagueForbidden(e, navigate)) return;
        if (isSessionExpiredError(e)) return;
        setError(e.message);
      })
      .finally(() => {
        if (!guard.isActive()) return;
        setLoading(false);
      });

    return guard.cancel;
  }, [id, navigate, layoutLeague]);

  useEffect(() => {
    if (!matchdays.length) return;
    setSelectedDay((prev) => {
      if (prev && matchdays.some((d) => d.day === prev.day)) {
        return matchdays.find((d) => d.day === prev.day);
      }
      return pickDefaultMatchday(matchdays);
    });
  }, [matchdays]);

  const dayMatches = useMemo(() => {
    if (!selectedDay?.day) return matches;
    const filtered = filterMatchesByDay(matches, selectedDay.day);
    return filtered.length > 0 ? filtered : matches;
  }, [matches, selectedDay?.day]);

  const filtered = useMemo(() => {
    let list = [...dayMatches];
    if (filter === 'pending') {
      list = list.filter((m) => !matchHasAdminResult(m));
    } else if (filter === 'done') {
      list = list.filter((m) => matchHasAdminResult(m));
    }
    return list.sort((a, b) => a.kickoff.localeCompare(b.kickoff));
  }, [dayMatches, filter]);

  const doneCount = dayMatches.filter((m) => matchHasAdminResult(m)).length;
  const activeMd = selectedDay || matchdays[0];

  useEffect(() => {
    listRef.current?.scrollTo({ top: 0, behavior: 'smooth' });
  }, [filter, selectedDay?.day]);

  useEffect(() => {
    const needsLivePoll = matches.some((m) => isMatchInPlayWindow(m) || matchIsLive(m));
    if (!needsLivePoll) return;

    const poll = () => {
      if (document.visibilityState === 'hidden') return;
      api
        .allMatches(id)
        .then((d) => setMatches(d.matches || []))
        .catch(() => {});
    };

    const timer = setInterval(poll, 60000);
    return () => clearInterval(timer);
  }, [matches, id]);

  if (loading) {
    return (
      <div className="league-page-loading" aria-busy="true" aria-live="polite">
        <p>Загрузка…</p>
      </div>
    );
  }

  if (error) {
    return (
      <p className="error-banner league-admin-error">{error}</p>
    );
  }

  return (
    <div className="admin-results-page-inner">
      <div className="admin-top-fixed">
        {matchdays.length > 0 && (
          <>
            <div className="matchday-tabs">
              {matchdays.map((md) => (
                <button
                  key={md.day}
                  type="button"
                  className={`matchday-tab ${selectedDay?.day === md.day ? 'active' : ''}`}
                  onClick={() => setSelectedDay(md)}
                >
                  <span className="matchday-tab-md">{md.label}</span>
                  <span className="matchday-tab-date">{formatMatchdayTabDate(md.day)}</span>
                </button>
              ))}
            </div>

            {activeMd && dayMatches.length > 0 && (
              <div className="matchday-progress">
                <div className="matchday-progress-label">
                  <span>
                    {activeMd.label} · {formatMatchdayTabDate(activeMd.day)}
                  </span>
                  <span>
                    {doneCount}/{dayMatches.length} с результатом
                  </span>
                </div>
                <div className="matchday-progress-bar">
                  <div
                    className="matchday-progress-fill"
                    style={{
                      width: `${Math.round((doneCount / dayMatches.length) * 100)}%`,
                    }}
                  />
                </div>
              </div>
            )}
          </>
        )}

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

      <div className="admin-results-body" ref={listRef}>
        <div className="page-content admin-results-list">
        {filtered.length === 0 && (
          <p className="empty-hint">
            {filter === 'pending'
              ? 'Все матчи с результатами — отлично!'
              : filter === 'done'
                ? 'Пока нет матчей с результатом в этом туре'
                : 'Нет матчей в этой категории'}
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

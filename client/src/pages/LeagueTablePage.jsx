import { Fragment, useEffect, useState, useCallback, useMemo, useRef } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { api } from '../api';
import ScoringModal from '../components/ScoringModal';
import { formatDateTime } from '../utils';
import { redirectIfLeagueForbidden } from '../leagueAccess';
import { matchdaysFromMatches, formatMatchdayTabDate } from '../matchdays';

const MATCHDAY_TAGS = [
  { day: 'md1', label: 'MD1' },
  { day: 'md2', label: 'MD2' },
  { day: 'md3', label: 'MD3' },
  { day: 'round_of_32', label: '1/16' },
  { day: 'round_of_16', label: '1/8' },
  { day: 'quarter_final', label: '1/4' },
  { day: 'semi_final', label: '1/2' },
  { day: 'third_place', label: '3-е' },
  { day: 'final', label: 'Финал' },
];

const SYNC_DISABLED_MSG = (
  <>
    Автосинхронизация выключена. Добавьте BZZOIRO_API_TOKEN на сервере (
    <a href="https://sports.bzzoiro.com/register" target="_blank" rel="noopener noreferrer">
      sports.bzzoiro.com
    </a>
    ).
  </>
);

function formatSyncTime(iso) {
  if (!iso) return 'ещё не было';
  return formatDateTime(iso);
}

function formatLeaderboardPoints(row) {
  if (row.hasProvisional) {
    return (
      <span className="leaderboard-points leaderboard-points--live" title="Предварительно по текущему счёту">
        ~{row.points}
      </span>
    );
  }
  return row.points;
}

function formatDayPoints(dayStats) {
  const pts = dayStats?.points ?? 0;
  if (dayStats?.hasProvisional) return `~${pts}`;
  return String(pts);
}

export default function LeagueTablePage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [leaderboard, setLeaderboard] = useState([]);
  const [syncStatus, setSyncStatus] = useState(null);
  const [syncing, setSyncing] = useState(false);
  const [syncMsg, setSyncMsg] = useState('');
  const [showScoring, setShowScoring] = useState(false);
  const [matchdays, setMatchdays] = useState([]);
  const [selectedDayKey, setSelectedDayKey] = useState(null);
  const [expandedUserId, setExpandedUserId] = useState(null);
  const [userBreakdown, setUserBreakdown] = useState({});
  const [pageReady, setPageReady] = useState(false);

  const loadLeaderboard = useCallback(() => {
    api
      .leaderboard(id, selectedDayKey)
      .then((d) => setLeaderboard(d.leaderboard))
      .catch((e) => {
        if (redirectIfLeagueForbidden(e, navigate)) return;
        setSyncMsg(e.message);
      });
  }, [id, navigate, selectedDayKey]);

  useEffect(() => {
    let active = true;
    setPageReady(false);
    setSelectedDayKey(null);

    Promise.allSettled([api.leaderboard(id), api.allMatches(id), api.resultsSyncStatus()]).then((results) => {
      if (!active) return;

      const [leaderboardResult, matchesResult, syncResult] = results;

      if (leaderboardResult.status === 'fulfilled') {
        setLeaderboard(leaderboardResult.value.leaderboard || []);
      } else {
        const e = leaderboardResult.reason;
        if (!redirectIfLeagueForbidden(e, navigate)) setSyncMsg(e.message);
      }

      if (matchesResult.status === 'fulfilled') {
        const days = matchdaysFromMatches(matchesResult.value.matches || []);
        setMatchdays(days);
      } else {
        const e = matchesResult.reason;
        if (!redirectIfLeagueForbidden(e, navigate)) setSyncMsg(e.message);
      }

      if (syncResult.status === 'fulfilled') {
        setSyncStatus(syncResult.value);
      } else {
        setSyncStatus({ enabled: false });
      }

      setPageReady(true);
    });

    return () => {
      active = false;
    };
  }, [id, navigate]);

  useEffect(() => {
    if (!pageReady) return;
    loadLeaderboard();
  }, [pageReady, loadLeaderboard]);

  const lastSyncRef = useRef(null);

  useEffect(() => {
    if (syncStatus?.lastSync) {
      lastSyncRef.current = syncStatus.lastSync;
    }
  }, [syncStatus?.lastSync]);

  useEffect(() => {
    if (!pageReady || !syncStatus?.enabled) return;

    const pollIntervalMs = Math.min(60000, Math.max(30000, (syncStatus.intervalMs || 600000) / 10));

    const pollSync = async () => {
      if (document.visibilityState === 'hidden' || syncing) return;
      try {
        const status = await api.resultsSyncStatus();
        const prev = lastSyncRef.current;
        if (status.lastSync && status.lastSync !== prev) {
          lastSyncRef.current = status.lastSync;
          setSyncStatus(status);
          loadLeaderboard();
          setUserBreakdown({});
          setExpandedUserId(null);
        } else {
          setSyncStatus(status);
        }
      } catch {
        /* ignore background poll errors */
      }
    };

    const timer = setInterval(pollSync, pollIntervalMs);
    return () => clearInterval(timer);
  }, [pageReady, syncStatus?.enabled, syncStatus?.intervalMs, syncing, loadLeaderboard]);

  useEffect(() => {
    if (!pageReady) return;

    const pollLeaderboard = () => {
      if (document.visibilityState === 'hidden' || syncing) return;
      loadLeaderboard();
    };

    const timer = setInterval(pollLeaderboard, 60000);
    return () => clearInterval(timer);
  }, [pageReady, syncing, loadLeaderboard]);

  const tableTitle = useMemo(() => {
    if (!selectedDayKey) return 'Таблица лиги';
    const selectedTag = MATCHDAY_TAGS.find((x) => x.day === selectedDayKey);
    return `Таблица лиги · ${selectedTag?.label || selectedDayKey}`;
  }, [selectedDayKey]);

  const loadUserBreakdown = useCallback(
    async (userId) => {
      if (!matchdays.length || userBreakdown[userId]?.loaded || userBreakdown[userId]?.loading) return;

      setUserBreakdown((prev) => ({
        ...prev,
        [userId]: { loading: true, loaded: false, statsByDay: {}, error: '' },
      }));

      try {
        const data = await api.userMatchdayPoints(id, userId);
        const statsByDay = data.pointsByDay || {};
        setUserBreakdown((prev) => ({
          ...prev,
          [userId]: { loading: false, loaded: true, statsByDay, error: '' },
        }));
      } catch (e) {
        try {
          // Fallback for stale API servers without /users/:userId/matchday-points
          const results = await Promise.all(
            matchdays.map(async (md) => {
              const d = await api.leaderboard(id, md.day);
              const row = d.leaderboard?.find((x) => Number(x.userId) === Number(userId));
              return [
                md.day,
                {
                  points: row?.points ?? 0,
                  scoredMatches: row?.scoredMatches ?? 0,
                  totalMatches: row?.totalMatches ?? 0,
                },
              ];
            })
          );
          const statsByDay = Object.fromEntries(results);
          setUserBreakdown((prev) => ({
            ...prev,
            [userId]: { loading: false, loaded: true, statsByDay, error: '' },
          }));
        } catch (fallbackErr) {
          setUserBreakdown((prev) => ({
            ...prev,
            [userId]: {
              loading: false,
              loaded: false,
              statsByDay: {},
              error: fallbackErr.message || e.message || 'Не удалось загрузить очки по турам',
            },
          }));
        }
      }
    },
    [id, matchdays, userBreakdown]
  );

  const toggleUser = (userId) => {
    setExpandedUserId((prev) => (prev === userId ? null : userId));
    if (expandedUserId !== userId) {
      loadUserBreakdown(userId);
    }
  };

  const runSync = async () => {
    setSyncing(true);
    setSyncMsg('');
    try {
      const result = await api.syncResults();
      setSyncMsg(
        `Обновлено: ${result.updated ?? 0}${result.cleared ? `, сброшено: ${result.cleared}` : ''}`
      );
      loadLeaderboard();
      setUserBreakdown({});
      const status = await api.resultsSyncStatus();
      setSyncStatus(status);
    } catch (e) {
      setSyncMsg(e.message);
    } finally {
      setSyncing(false);
    }
  };

  if (!pageReady) {
    return (
      <div className="league-page-loading" aria-busy="true" aria-live="polite">
        <p>Загрузка таблицы…</p>
      </div>
    );
  }

  return (
    <>
      <div className="page-content page-content--table">
        {syncStatus && syncStatus.enabled && (
          <div className="sync-status-card">
            <p className="sync-status-text">
              Последняя синхронизация: {formatSyncTime(syncStatus.lastSync)}
            </p>
            <button
              type="button"
              className="btn-primary btn-sync"
              disabled={syncing}
              onClick={runSync}
            >
              {syncing ? 'Загрузка…' : 'Обновить результаты'}
            </button>
            {syncMsg && <p className="sync-status-msg">{syncMsg}</p>}
          </div>
        )}
        {syncStatus && !syncStatus.enabled && (
          <div className="sync-status-card">
            <p className="sync-status-text">{SYNC_DISABLED_MSG}</p>
          </div>
        )}

        <div style={{ marginBottom: '0.8rem' }}>
          <div
            className="matchday-tabs"
            style={{
              display: 'flex',
              flexWrap: 'wrap',
              gap: '0.35rem',
              padding: 0,
              marginBottom: '0.1rem',
              background: 'transparent',
              borderBottom: 'none',
              boxShadow: 'none',
            }}
          >
          <button
            type="button"
            className={`matchday-tab ${selectedDayKey == null ? 'active' : ''}`}
            onClick={() => setSelectedDayKey(null)}
            title="Все туры"
            style={{
              border: selectedDayKey == null ? '1px solid #facc15' : '1px solid rgba(147, 197, 253, 0.45)',
              borderRadius: '9999px',
              padding: '0.28rem 0.72rem',
              minWidth: '3.8rem',
              background: selectedDayKey == null ? '#facc15' : 'rgba(10, 26, 61, 0.55)',
              color: selectedDayKey == null ? '#0b2257' : '#dbeafe',
              fontSize: '0.78rem',
              fontWeight: 600,
              letterSpacing: '0.01em',
              boxShadow:
                selectedDayKey == null
                  ? '0 0 0 1px rgba(250, 204, 21, 0.25)'
                  : 'inset 0 0 0 1px rgba(59, 130, 246, 0.12)',
              cursor: 'pointer',
              transition: 'all 160ms ease',
            }}
          >
            <span className="matchday-tab-md" style={{ fontSize: '0.7rem', fontWeight: 700 }}>
              Все
            </span>
          </button>
          {MATCHDAY_TAGS.map((tag) => {
            const hasMatchday = matchdays.some((md) => md.day === tag.day);
            return (
              <button
                key={tag.day}
                type="button"
                className={`matchday-tab ${selectedDayKey === tag.day ? 'active' : ''}`}
                onClick={() => setSelectedDayKey(tag.day)}
                title={hasMatchday ? formatMatchdayTabDate(tag.day) : tag.label}
                style={{
                  border:
                    selectedDayKey === tag.day
                      ? '1px solid #facc15'
                      : '1px solid rgba(147, 197, 253, 0.45)',
                  borderRadius: '9999px',
                  padding: '0.28rem 0.72rem',
                  minWidth: '3.8rem',
                  background: selectedDayKey === tag.day ? '#facc15' : 'rgba(10, 26, 61, 0.55)',
                  color: selectedDayKey === tag.day ? '#0b2257' : '#dbeafe',
                  fontSize: '0.78rem',
                  fontWeight: 600,
                  letterSpacing: '0.01em',
                  boxShadow:
                    selectedDayKey === tag.day
                      ? '0 0 0 1px rgba(250, 204, 21, 0.25)'
                      : 'inset 0 0 0 1px rgba(59, 130, 246, 0.12)',
                  cursor: 'pointer',
                  transition: 'all 160ms ease',
                }}
              >
                <span className="matchday-tab-md" style={{ fontSize: '0.7rem', fontWeight: 700 }}>
                  {tag.label}
                </span>
              </button>
            );
          })}
          </div>
        </div>

        <div className="table-toolbar">
          <h2 className="table-toolbar-title">{tableTitle}</h2>
          <button
            type="button"
            className="btn-scoring-help"
            onClick={() => setShowScoring(true)}
          >
            Как начисляются очки?
          </button>
        </div>

        <div className="leaderboard-table-scroll">
        <table className="leaderboard-table">
          <thead>
            <tr>
              <th>#</th>
              <th>Игрок</th>
              <th>Очки</th>
            </tr>
          </thead>
          <tbody>
            {leaderboard.map((row, i) => {
              const open = expandedUserId === row.userId;
              const breakdown = userBreakdown[row.userId];

              return (
                <Fragment key={row.userId}>
                  <tr
                    onClick={() => toggleUser(row.userId)}
                    style={{ cursor: 'pointer' }}
                  >
                    <td>{i + 1}</td>
                    <td>
                      {row.name}
                      {row.isOwner ? <span className="owner-badge">Владелец</span> : null}
                      <span
                        aria-hidden="true"
                        style={{
                          marginLeft: '0.45rem',
                          color: open ? '#facc15' : '#93c5fd',
                          fontSize: '0.78rem',
                          fontWeight: 700,
                          display: 'inline-block',
                          width: '0.75rem',
                          textAlign: 'center',
                        }}
                      >
                        {open ? '▾' : '▸'}
                      </span>
                    </td>
                    <td>{formatLeaderboardPoints(row)}</td>
                  </tr>
                  {open && (
                    <tr>
                      <td colSpan={3}>
                        <div style={{ padding: '0.65rem 0.2rem 0.25rem' }}>
                          {breakdown?.loading && <p className="empty-hint">Загрузка очков по турам…</p>}
                          {breakdown?.error && <p className="error-banner">{breakdown.error}</p>}
                          {!breakdown?.loading && !breakdown?.error && matchdays.length > 0 && (
                            <table
                              style={{
                                width: '100%',
                                borderCollapse: 'collapse',
                                fontSize: '0.86rem',
                                color: '#9ed0ff',
                              }}
                            >
                              <thead>
                                <tr>
                                  <th
                                    style={{
                                      textAlign: 'left',
                                      fontWeight: 700,
                                      padding: '0 0 0.35rem',
                                      borderBottom: '1px solid rgba(147, 197, 253, 0.25)',
                                    }}
                                  >
                                    Этап
                                  </th>
                                  <th
                                    style={{
                                      textAlign: 'right',
                                      fontWeight: 700,
                                      padding: '0 0 0.35rem',
                                      borderBottom: '1px solid rgba(147, 197, 253, 0.25)',
                                    }}
                                  >
                                    Очки
                                  </th>
                                </tr>
                              </thead>
                              <tbody>
                                {matchdays.map((md) => (
                                  <tr key={`${row.userId}-${md.day}`}>
                                    <td
                                      style={{
                                        padding: '0.22rem 0',
                                        borderBottom: '1px solid rgba(147, 197, 253, 0.12)',
                                        fontWeight: 600,
                                      }}
                                    >
                                      {md.label}
                                    </td>
                                    <td
                                      style={{
                                        padding: '0.22rem 0',
                                        borderBottom: '1px solid rgba(147, 197, 253, 0.12)',
                                        textAlign: 'right',
                                        fontWeight: 600,
                                      }}
                                    >
                                      {formatDayPoints(breakdown?.statsByDay?.[md.day])} оч.
                                    </td>
                                  </tr>
                                ))}
                              </tbody>
                            </table>
                          )}
                        </div>
                      </td>
                    </tr>
                  )}
                </Fragment>
              );
            })}
          </tbody>
        </table>
        {leaderboard.length === 0 && (
          <p className="empty-hint">
            Очки появятся после начала матчей (предварительно — по текущему счёту) или после финального свистка
          </p>
        )}
        </div>
      </div>

      {showScoring && <ScoringModal onClose={() => setShowScoring(false)} />}
    </>
  );
}

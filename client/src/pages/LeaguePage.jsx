import { useEffect, useState, useCallback, useMemo, useRef } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { api } from '../api';
import {
  matchdaysFromMatches,
  filterMatchesByDay,
  pickDefaultMatchday,
  formatMatchdayTabDate,
  matchdayKey,
} from '../matchdays';
import AppHeader from '../components/AppHeader';
import LeagueMoreMenu from '../components/LeagueMoreMenu';
import MatchCard from '../components/MatchCard';
import { isMatchLiveScoreBarVisible } from '../utils';
import { redirectIfLeagueForbidden } from '../leagueAccess';

function scrollPageTop() {
  window.scrollTo({ top: 0, left: 0, behavior: 'auto' });
  if (document.documentElement) document.documentElement.scrollTop = 0;
  if (document.body) document.body.scrollTop = 0;
  if (document.scrollingElement) document.scrollingElement.scrollTop = 0;
  const root = document.getElementById('root');
  if (root) root.scrollTop = 0;
  const appRoot = document.querySelector('.app-root');
  if (appRoot) appRoot.scrollTop = 0;
}

export default function LeaguePage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [league, setLeague] = useState(null);
  const [allMatches, setAllMatches] = useState([]);
  const [matchdays, setMatchdays] = useState([]);
  const [selected, setSelected] = useState(null);
  const [loadingMatches, setLoadingMatches] = useState(true);
  const [loadingLeague, setLoadingLeague] = useState(true);
  const [uiReady, setUiReady] = useState(false);
  const [error, setError] = useState('');
  const [menuOpen, setMenuOpen] = useState(false);
  const topRef = useRef(null);
  const [topHeight, setTopHeight] = useState(0);

  const loadAll = useCallback(
    async ({ silent = false } = {}) => {
      if (!silent) setLoadingMatches(true);
      setError('');
      try {
        const { matches } = await api.allMatches(id);
        const list = matches || [];
        setAllMatches(list);
        const days = matchdaysFromMatches(list);
        setMatchdays(days);
        setSelected((prev) => {
          if (prev && days.some((d) => d.day === prev.day)) {
            return days.find((d) => d.day === prev.day);
          }
          return pickDefaultMatchday(days);
        });
      } catch (e) {
        if (redirectIfLeagueForbidden(e, navigate)) return;
        setError(e.message);
      } finally {
        if (!silent) setLoadingMatches(false);
      }
    },
    [id, navigate]
  );

  useEffect(() => {
    setUiReady(false);
    setLoadingLeague(true);
    scrollPageTop();
    api
      .league(id)
      .then((d) => {
        setLeague(d.league);
      })
      .catch((e) => {
        if (redirectIfLeagueForbidden(e, navigate)) return;
        setError(e.message);
      })
      .finally(() => setLoadingLeague(false));
    loadAll();
  }, [id, loadAll, navigate]);

  useEffect(() => {
    if (loadingLeague || loadingMatches) return;
    let raf1 = 0;
    let raf2 = 0;
    // Ensure page is at top BEFORE revealing full UI.
    raf1 = requestAnimationFrame(() => {
      scrollPageTop();
      raf2 = requestAnimationFrame(() => {
        scrollPageTop();
        setUiReady(true);
      });
    });
    return () => {
      if (raf1) cancelAnimationFrame(raf1);
      if (raf2) cancelAnimationFrame(raf2);
    };
  }, [loadingLeague, loadingMatches]);

  const matches = useMemo(() => {
    const list = !selected?.day
      ? allMatches
      : (() => {
          const filtered = filterMatchesByDay(allMatches, selected.day);
          return filtered.length > 0 ? filtered : allMatches;
        })();
    return [...list].sort((a, b) => String(a.kickoff).localeCompare(String(b.kickoff)));
  }, [allMatches, selected]);

  const onSaved = () => loadAll({ silent: true });

  const activeMd = selected || matchdays[0];
  const progress = useMemo(() => {
    if (activeMd?.count) {
      return { done: activeMd.predicted ?? 0, total: activeMd.count };
    }
    const done = matches.filter((m) => m.prediction?.home_pred != null).length;
    return { done, total: matches.length };
  }, [activeMd, matches]);

  const friendsActive = matches.reduce((n, m) => n + (m.friendsPredicted > 0 ? 1 : 0), 0);
  const boosterMatch = useMemo(() => {
    if (!selected?.day) return null;
    return (
      allMatches.find((m) => {
        return matchdayKey(m) === selected.day && Number(m.prediction?.booster) === 1;
      }) ?? null
    );
  }, [allMatches, selected?.day]);
  const boosterMatchId = boosterMatch?.id ?? null;
  const boosterLocked = boosterMatch ? isMatchLiveScoreBarVisible(boosterMatch) : false;
  const boosterUsed = boosterMatchId != null;
  const isPageLoading = !uiReady;

  useEffect(() => {
    const el = topRef.current;
    if (!el) return;

    const update = () => setTopHeight(el.offsetHeight);
    update();

    const ro = new ResizeObserver(update);
    ro.observe(el);
    return () => ro.disconnect();
  }, [matchdays.length, friendsActive, league, activeMd, progress.total, boosterUsed]);

  return (
    <div className="app-root">
      {isPageLoading ? (
        <div className="auth-page" aria-busy="true" aria-live="polite">
          <p>Загрузка матчей…</p>
        </div>
      ) : (
        <>
          <div className="league-top-fixed" ref={topRef}>
            <AppHeader
              active="matches"
              leagueId={id}
              onOpenMenu={() => setMenuOpen(true)}
              isOwner={Boolean(Number(league?.is_owner))}
            />

            <div className="predictor-hero">
              <h2>ЧМ 2026 — прогнозы матчей</h2>
              <p>
                {allMatches.length > 0
                  ? `${allMatches.length} матчей · счёт, первый гол, бустер на тур`
                  : 'Счёт, первый гол, один бустер на тур — как в Euro Predictor'}
              </p>
            </div>

            {friendsActive > 0 && league && (
              <div className="social-banner">Друзья в лиге «{league.name}» уже сделали прогнозы →</div>
            )}

            {matchdays.length > 0 && (
              <>
                <div className="matchday-tabs">
                  {matchdays.map((md) => (
                    <button
                      key={md.day}
                      type="button"
                      className={`matchday-tab ${selected?.day === md.day ? 'active' : ''}`}
                      onClick={() => setSelected(md)}
                    >
                      <span className="matchday-tab-md">{md.label}</span>
                      <span className="matchday-tab-date">{formatMatchdayTabDate(md.day)}</span>
                    </button>
                  ))}
                </div>

                {activeMd && progress.total > 0 && (
                  <div className="matchday-progress">
                    <div className="matchday-progress-label">
                      <span>
                        {activeMd.label} · {formatMatchdayTabDate(activeMd.day)}
                      </span>
                      <span>
                        {progress.done}/{progress.total} матчей
                      </span>
                    </div>
                    <div className="matchday-progress-bar">
                      <div
                        className="matchday-progress-fill"
                        style={{ width: `${Math.round((progress.done / progress.total) * 100)}%` }}
                      />
                    </div>
                    {!boosterUsed && progress.done > 0 && (
                      <p className="matchday-hint">
                        Один бустер на тур — нажми «Переставить бустер» на выбранном матче
                      </p>
                    )}
                  </div>
                )}
              </>
            )}

          </div>

          <div className="page-content" style={{ paddingTop: topHeight }}>
            {error && <div className="error-banner">{error}</div>}
            {matches.map((m) => (
              <MatchCard
                key={m.id}
                match={m}
                leagueId={id}
                boosterMatchId={boosterMatchId}
                boosterLocked={boosterLocked}
                onSaved={onSaved}
              />
            ))}
            {!error && matches.length === 0 && (
              <p className="empty-hint">
                {allMatches.length === 0
                  ? 'Матчи не найдены. Перезапустите сервер: npm run dev'
                  : 'Нет матчей на выбранный тур — выбери другой MD выше.'}
              </p>
            )}
          </div>

          <LeagueMoreMenu leagueId={id} open={menuOpen} onClose={() => setMenuOpen(false)} />
        </>
      )}
    </div>
  );
}

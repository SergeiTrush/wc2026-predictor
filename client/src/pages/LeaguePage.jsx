import { useEffect, useLayoutEffect, useState, useCallback, useMemo, useRef } from 'react';
import { useNavigate, useOutletContext, useParams } from 'react-router-dom';
import { api, isSessionExpiredError } from '../api';
import {
  matchdaysFromMatches,
  filterMatchesByDay,
  pickDefaultMatchday,
  formatMatchdayTabDate,
  matchdayKey,
} from '../matchdays';
import MatchCard from '../components/MatchCard';
import { isMatchLiveScoreBarVisible, isMatchInPlayWindow, matchHasResult, matchIsFinished } from '../utils';
import { redirectIfLeagueForbidden } from '../leagueAccess';

export default function LeaguePage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { league: layoutLeague } = useOutletContext() || {};
  const [league, setLeague] = useState(layoutLeague ?? null);
  const [allMatches, setAllMatches] = useState([]);
  const [matchdays, setMatchdays] = useState([]);
  const [selected, setSelected] = useState(null);
  const [loadingMatches, setLoadingMatches] = useState(true);
  const [loadingLeague, setLoadingLeague] = useState(true);
  const [uiReady, setUiReady] = useState(false);
  const [error, setError] = useState('');
  const topRef = useRef(null);
  const tabsRef = useRef(null);
  const matchesContainerRef = useRef(null);
  const filterScrollPositions = useRef({ schedule: 0, finished: 0, live: 0 });
  const prevFilterRef = useRef('live');

  const scrollToTop = useCallback(() => {
    filterScrollPositions.current = { schedule: 0, finished: 0, live: 0 };
    if (matchesContainerRef.current) matchesContainerRef.current.scrollTop = 0;
  }, []);

  const [filter, setFilter] = useState('live');
  const autoFilterRef = useRef(false);

  const switchFilter = useCallback((newFilter) => {
    if (matchesContainerRef.current) {
      filterScrollPositions.current[filter] = matchesContainerRef.current.scrollTop;
    }
    setFilter(newFilter);
  }, [filter]);

  useEffect(() => {
    if (!tabsRef.current || !selected) return;
    const activeBtn = tabsRef.current.querySelector('.matchday-tab.active');
    activeBtn?.scrollIntoView({ block: 'nearest', inline: 'center', behavior: 'smooth' });
  }, [selected, uiReady]);

  const loadAll = useCallback(
    async ({ silent = false, signal } = {}) => {
      if (!silent) setLoadingMatches(true);
      if (!silent) setError('');
      try {
        const { matches } = await api.allMatches(id, signal);
        if (signal?.aborted) return;
        const list = matches || [];
        setAllMatches(list);
        const days = matchdaysFromMatches(list);
        setMatchdays(days);
        setSelected((prev) => {
          if (prev && days.some((d) => d.day === prev.day)) {
            return days.find((d) => d.day === prev.day);
          }
          return pickDefaultMatchday(days, list);
        });
      } catch (e) {
        if (e.name === 'AbortError') return;
        if (redirectIfLeagueForbidden(e, navigate)) return;
        if (isSessionExpiredError(e)) return;
        setError(e.message);
      } finally {
        if (signal?.aborted) return;
        if (!silent) setLoadingMatches(false);
      }
    },
    [id, navigate]
  );

  useEffect(() => {
    if (layoutLeague) setLeague(layoutLeague);
  }, [layoutLeague]);

  useEffect(() => {
    const controller = new AbortController();
    setUiReady(false);
    setLoadingLeague(!layoutLeague);
    scrollToTop();
    if (!layoutLeague) {
      api
        .league(id, controller.signal)
        .then((d) => {
          if (controller.signal.aborted) return;
          setLeague(d.league);
        })
        .catch((e) => {
          if (controller.signal.aborted || e.name === 'AbortError') return;
          if (redirectIfLeagueForbidden(e, navigate)) return;
          if (isSessionExpiredError(e)) return;
          setError(e.message);
        })
        .finally(() => {
          if (controller.signal.aborted) return;
          setLoadingLeague(false);
        });
    } else {
      setLoadingLeague(false);
    }
    loadAll({ signal: controller.signal });
    return () => controller.abort();
  }, [id, loadAll, navigate, layoutLeague?.id, scrollToTop]);

  useEffect(() => {
    if (loadingLeague || loadingMatches) return;
    let raf1 = 0;
    let raf2 = 0;
    raf1 = requestAnimationFrame(() => {
      scrollToTop();
      raf2 = requestAnimationFrame(() => {
        scrollToTop();
        setUiReady(true);
      });
    });
    return () => {
      if (raf1) cancelAnimationFrame(raf1);
      if (raf2) cancelAnimationFrame(raf2);
    };
  }, [loadingLeague, loadingMatches, scrollToTop]);

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
    const done = matches.filter(
      (m) => m.prediction?.home_pred != null && m.prediction?.away_pred != null
    ).length;
    return { done, total: matches.length };
  }, [matches]);

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
    autoFilterRef.current = false;
  }, [selected?.day]);

  useEffect(() => {
    if (autoFilterRef.current || !matches.length) return;
    const hasLive = matches.some((m) => new Date(m.kickoff).getTime() <= Date.now() && !matchIsFinished(m));
    const hasSchedule = matches.some((m) => new Date(m.kickoff).getTime() > Date.now());
    setFilter(hasLive ? 'live' : hasSchedule ? 'schedule' : 'finished');
    autoFilterRef.current = true;
  }, [matches]);

  useEffect(() => {
    if (prevFilterRef.current === filter) return;
    prevFilterRef.current = filter;
    if (matchesContainerRef.current) {
      matchesContainerRef.current.scrollTop =
        filteredMatches.length > 0 ? (filterScrollPositions.current[filter] ?? 0) : 0;
    }
  }, [filter]); // eslint-disable-line react-hooks/exhaustive-deps

  const filteredMatches = useMemo(() => {
    let list = matches;
    if (filter === 'schedule') list = matches.filter((m) => new Date(m.kickoff).getTime() > Date.now());
    else if (filter === 'finished') list = matches.filter((m) => matchIsFinished(m));
    else if (filter === 'live') list = matches.filter((m) => new Date(m.kickoff).getTime() <= Date.now() && !matchIsFinished(m));
    const byKickoff = (a, b) => String(a.kickoff).localeCompare(String(b.kickoff));
    return [...list].sort(filter === 'finished' ? (a, b) => byKickoff(b, a) : byKickoff);
  }, [matches, filter]);

  const scheduleCount = matches.filter((m) => new Date(m.kickoff).getTime() > Date.now()).length;
  const finishedCount = matches.filter((m) => matchIsFinished(m)).length;
  const liveCount = matches.filter((m) => new Date(m.kickoff).getTime() <= Date.now() && !matchIsFinished(m)).length;
  const filterCount = filter === 'schedule' ? scheduleCount : filter === 'live' ? liveCount : finishedCount;
  const filterLabel = filter === 'schedule' ? 'запланировано' : filter === 'live' ? 'live' : 'завершено';

  useLayoutEffect(() => {
    const el = topRef.current;
    if (!el) return;

    const update = () => {
      document.documentElement.style.setProperty('--league-top-height', `${el.offsetHeight}px`);
    };
    update();

    const ro = new ResizeObserver(update);
    ro.observe(el);
    window.addEventListener('resize', update);
    return () => {
      ro.disconnect();
      window.removeEventListener('resize', update);
    };
  }, [matchdays.length, friendsActive, league, activeMd, progress.total, boosterUsed, isPageLoading]);

  useEffect(() => {
    if (!selected?.day) return;
    scrollToTop();
  }, [selected?.day, scrollToTop]);

  useEffect(() => {
    const needsLivePoll = allMatches.some(isMatchInPlayWindow);
    if (!needsLivePoll) return;

    const poll = () => {
      if (document.visibilityState === 'hidden') return;
      loadAll({ silent: true });
    };

    const timer = setInterval(poll, 10000);
    return () => clearInterval(timer);
  }, [allMatches, loadAll]);

  // Fire a one-shot fetch exactly when the next unstarted match kicks off
  useEffect(() => {
    const now = Date.now();
    const nextKickoff = allMatches
      .filter((m) => m.kickoff && !matchHasResult(m))
      .map((m) => new Date(m.kickoff).getTime())
      .filter((t) => t > now)
      .sort((a, b) => a - b)[0];

    if (!nextKickoff) return;
    const delay = nextKickoff - now;
    const timer = setTimeout(() => loadAll({ silent: true }), delay);
    return () => clearTimeout(timer);
  }, [allMatches, loadAll]);

  if (isPageLoading) {
    return (
      <div className="league-page-loading" aria-busy="true" aria-live="polite">
        <p>Загрузка матчей…</p>
      </div>
    );
  }

  return (
    <>
      <div className="league-top-fixed" ref={topRef}>
        <div className="predictor-hero">
          <h2>ЧМ 2026 — прогнозы матчей</h2>
          <p>
            {allMatches.length > 0
              ? `${allMatches.length} матчей · счёт, первый гол, бустер на тур`
              : 'Счёт, первый гол, один бустер на тур'}
          </p>
        </div>

        {friendsActive > 0 && league && (
          <div className="social-banner">Друзья в лиге «{league.name}» уже сделали прогнозы →</div>
        )}

        {matchdays.length > 0 && (
          <>
            <div className="matchday-tabs" ref={tabsRef}>
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
                    {filterCount}/{progress.total} {filterLabel}
                  </span>
                </div>
                <div className="matchday-progress-bar">
                  <div
                    className="matchday-progress-fill"
                    style={{ width: `${Math.round((filterCount / progress.total) * 100)}%` }}
                  />
                </div>
                {!boosterUsed && !boosterLocked && (
                  <p className="matchday-hint">
                      Один бустер на тур - не забудьте поставить
                  </p>
                )}
              </div>
            )}

            <div className="admin-filters">
              <button type="button" className={filter === 'schedule' ? 'active' : ''} onClick={() => switchFilter('schedule')}>
                Расписание
              </button>
              <button type="button" className={filter === 'finished' ? 'active' : ''} onClick={() => switchFilter('finished')}>
                Завершенные
              </button>
              <button type="button" className={filter === 'live' ? 'active' : ''} onClick={() => switchFilter('live')}>
                LIVE
              </button>
            </div>
          </>
        )}
      </div>

      <div className="league-matches-container" ref={matchesContainerRef}>
        <div className="page-content page-content--matches">
          {error && <div className="error-banner">{error}</div>}
          {filteredMatches.map((m) => (
            <MatchCard
              key={m.id}
              match={m}
              leagueId={id}
              boosterMatchId={boosterMatchId}
              boosterLocked={boosterLocked}
              onSaved={onSaved}
            />
          ))}
          {!error && filteredMatches.length === 0 && (
            <p className="empty-hint">
              {allMatches.length === 0
                ? 'Матчи не найдены. Перезапустите сервер: npm run dev'
                : filter === 'live'
                  ? 'Нет матчей в прямом эфире в этом туре'
                  : filter === 'finished'
                    ? 'Нет завершённых матчей в этом туре'
                    : 'Нет предстоящих матчей в этом туре'}
            </p>
          )}
        </div>
      </div>
    </>
  );
}

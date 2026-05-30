import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { Outlet, useLocation, useNavigate, useParams } from 'react-router-dom';
import { api } from '../api';
import { redirectIfLeagueForbidden } from '../leagueAccess';
import AppHeader from './AppHeader';

function shellPageClass(pathname, leagueId) {
  const base = `/league/${leagueId}`;
  if (pathname.includes(`${base}/admin/results`)) return 'admin-results-page';
  if (pathname.includes(`${base}/table`)) return 'league-table-page';
  if (pathname.includes(`${base}/settings`)) return 'league-settings-page';
  return 'league-matches-page';
}

function activeTab(pathname, leagueId) {
  const base = `/league/${leagueId}`;
  if (pathname.includes(`${base}/admin/results`)) return 'results';
  if (pathname.includes(`${base}/settings`)) return 'settings';
  if (pathname.includes(`${base}/table`)) return 'table';
  return 'matches';
}

export default function LeagueLayout() {
  const { id } = useParams();
  const navigate = useNavigate();
  const location = useLocation();
  const headerRef = useRef(null);
  const [status, setStatus] = useState('loading');
  const [league, setLeague] = useState(null);
  const [shellHeaderHeight, setShellHeaderHeight] = useState(96);

  const pageClass = useMemo(
    () => shellPageClass(location.pathname, id),
    [location.pathname, id]
  );
  const active = useMemo(() => activeTab(location.pathname, id), [location.pathname, id]);

  useEffect(() => {
    let cancelled = false;
    setStatus('loading');

    api
      .league(id)
      .then((d) => {
        if (!cancelled) {
          setLeague(d.league);
          setStatus('allowed');
        }
      })
      .catch((e) => {
        if (cancelled) return;
        if (redirectIfLeagueForbidden(e, navigate)) return;
        setStatus('denied');
      });

    return () => {
      cancelled = true;
    };
  }, [id, navigate]);

  useLayoutEffect(() => {
    const el = headerRef.current;
    if (!el) return;

    const update = () => {
      const h = el.offsetHeight;
      setShellHeaderHeight(h);
      document.documentElement.style.setProperty('--shell-header-height', `${h}px`);
    };
    update();

    const ro = new ResizeObserver(update);
    ro.observe(el);
    window.addEventListener('resize', update);
    return () => {
      ro.disconnect();
      window.removeEventListener('resize', update);
    };
  }, [status, active]);

  const shellHeader = (
    <div className="league-shell-header" ref={headerRef}>
      <AppHeader active={active} leagueId={id} isOwner={!!league?.is_owner} />
    </div>
  );

  if (status === 'denied') return null;

  return (
    <div className={`app-root league-shell ${pageClass}`}>
      {shellHeader}
      <main className="league-shell-body">
        {status === 'loading' ? (
          <div className="league-page-loading" aria-busy="true" aria-live="polite">
            <p>Загрузка…</p>
          </div>
        ) : (
          <Outlet context={{ league, shellHeaderHeight }} />
        )}
      </main>
    </div>
  );
}

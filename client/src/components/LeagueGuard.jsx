import { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { api } from '../api';
import { redirectIfLeagueForbidden } from '../leagueAccess';

/** Blocks league routes until the user is an active (non-suspended) member. */
export default function LeagueGuard({ children }) {
  const { id } = useParams();
  const navigate = useNavigate();
  const [status, setStatus] = useState('loading');

  useEffect(() => {
    let cancelled = false;
    setStatus('loading');

    api
      .league(id)
      .then(() => {
        if (!cancelled) setStatus('allowed');
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

  if (status === 'loading') {
    return (
      <div className="auth-page">
        <p>Загрузка…</p>
      </div>
    );
  }

  if (status !== 'allowed') return null;

  return children;
}

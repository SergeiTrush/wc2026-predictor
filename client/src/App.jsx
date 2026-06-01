import { useEffect, useState } from 'react';
import { Routes, Route, Navigate, useNavigate, useParams } from 'react-router-dom';
import { api, AUTH_TOKEN_KEY, getToken, setToken, setUnauthorizedHandler } from './api';
import LoginPage from './pages/LoginPage';
import DashboardPage from './pages/DashboardPage';
import LeaguePage from './pages/LeaguePage';
import LeagueTablePage from './pages/LeagueTablePage';
import LeagueSettingsPage from './pages/LeagueSettingsPage';
import LeagueAdminResultsPage from './pages/LeagueAdminResultsPage';
import LeagueLayout from './components/LeagueLayout';

function LeagueMatchesRedirect() {
  const { id } = useParams();
  return <Navigate to={`/league/${id}`} replace />;
}

function App() {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);
  const navigate = useNavigate();

  useEffect(() => {
    setUnauthorizedHandler(() => {
      setUser(null);
      navigate('/login', { replace: true });
    });
    return () => setUnauthorizedHandler(null);
  }, [navigate]);

  useEffect(() => {
    const token = getToken();
    if (!token) {
      setLoading(false);
      return;
    }
    api
      .me()
      .then((d) => setUser(d.user))
      .catch(() => setToken(null))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    const onStorage = (e) => {
      if (e.key !== AUTH_TOKEN_KEY) return;
      if (!e.newValue) {
        setUser(null);
        return;
      }
      api
        .me()
        .then((d) => setUser(d.user))
        .catch(() => {
          setToken(null);
          setUser(null);
        });
    };
    window.addEventListener('storage', onStorage);
    return () => window.removeEventListener('storage', onStorage);
  }, []);

  const onAuth = (data) => {
    setToken(data.token);
    setUser(data.user);
    navigate('/');
  };

  const onLogout = () => {
    setToken(null);
    setUser(null);
    navigate('/login');
  };

  if (loading) {
    return (
      <div className="auth-page" aria-busy="true" aria-live="polite">
        <p>Загрузка…</p>
      </div>
    );
  }

  return (
    <Routes>
      <Route
        path="/login"
        element={user ? <Navigate to="/" replace /> : <LoginPage onAuth={onAuth} />}
      />
      <Route
        path="/"
        element={user ? <DashboardPage user={user} onLogout={onLogout} /> : <Navigate to="/login" replace />}
      />
      <Route
        path="/league/:id"
        element={user ? <LeagueLayout /> : <Navigate to="/login" replace />}
      >
        <Route index element={<LeaguePage />} />
        <Route path="table" element={<LeagueTablePage />} />
        <Route path="settings" element={<LeagueSettingsPage />} />
        <Route path="admin/results" element={<LeagueAdminResultsPage />} />
      </Route>
      <Route path="/league/:id/matches" element={<LeagueMatchesRedirect />} />
      <Route path="*" element={<Navigate to={user ? '/' : '/login'} replace />} />
    </Routes>
  );
}

export default App;

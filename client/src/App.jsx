import { useEffect, useState } from 'react';
import { Routes, Route, Navigate, useNavigate } from 'react-router-dom';
import { api, getToken, setToken } from './api';
import LoginPage from './pages/LoginPage';
import DashboardPage from './pages/DashboardPage';
import LeaguePage from './pages/LeaguePage';
import LeagueTablePage from './pages/LeagueTablePage';
import LeagueSettingsPage from './pages/LeagueSettingsPage';
import LeagueAdminResultsPage from './pages/LeagueAdminResultsPage';
import LeagueGuard from './components/LeagueGuard';

function App() {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);
  const navigate = useNavigate();

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
        element={
          user ? (
            <LeagueGuard>
              <LeaguePage />
            </LeagueGuard>
          ) : (
            <Navigate to="/login" replace />
          )
        }
      />
      <Route
        path="/league/:id/matches"
        element={
          user ? (
            <LeagueGuard>
              <LeaguePage />
            </LeagueGuard>
          ) : (
            <Navigate to="/login" replace />
          )
        }
      />
      <Route
        path="/league/:id/table"
        element={
          user ? (
            <LeagueGuard>
              <LeagueTablePage />
            </LeagueGuard>
          ) : (
            <Navigate to="/login" replace />
          )
        }
      />
      <Route
        path="/league/:id/settings"
        element={
          user ? (
            <LeagueGuard>
              <LeagueSettingsPage />
            </LeagueGuard>
          ) : (
            <Navigate to="/login" replace />
          )
        }
      />
      <Route
        path="/league/:id/admin/results"
        element={
          user ? (
            <LeagueGuard>
              <LeagueAdminResultsPage />
            </LeagueGuard>
          ) : (
            <Navigate to="/login" replace />
          )
        }
      />
      <Route path="*" element={<Navigate to={user ? '/' : '/login'} replace />} />
    </Routes>
  );
}

export default App;

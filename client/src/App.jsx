import { useEffect, useState } from 'react';
import { Routes, Route, Navigate, useNavigate } from 'react-router-dom';
import { api, getToken, setToken } from './api';
import LoginPage from './pages/LoginPage';
import DashboardPage from './pages/DashboardPage';
import BracketPage from './pages/BracketPage';
import LeaguePage from './pages/LeaguePage';
import LeagueGroupsPage from './pages/LeagueGroupsPage';
import LeagueTablePage from './pages/LeagueTablePage';
import LeagueSettingsPage from './pages/LeagueSettingsPage';

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

  if (loading) {
    return (
      <div className="auth-page">
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
        element={user ? <DashboardPage user={user} /> : <Navigate to="/login" replace />}
      />
      <Route
        path="/league/:id"
        element={user ? <BracketPage /> : <Navigate to="/login" replace />}
      />
      <Route
        path="/league/:id/matches"
        element={user ? <LeaguePage /> : <Navigate to="/login" replace />}
      />
      <Route
        path="/league/:id/groups"
        element={user ? <LeagueGroupsPage /> : <Navigate to="/login" replace />}
      />
      <Route
        path="/league/:id/table"
        element={user ? <LeagueTablePage /> : <Navigate to="/login" replace />}
      />
      <Route
        path="/league/:id/settings"
        element={user ? <LeagueSettingsPage user={user} /> : <Navigate to="/login" replace />}
      />
      <Route path="*" element={<Navigate to={user ? '/' : '/login'} replace />} />
    </Routes>
  );
}

export default App;

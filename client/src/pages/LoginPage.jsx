import { useState } from 'react';
import { api } from '../api';

export default function LoginPage({ onAuth }) {
  const [isRegister, setIsRegister] = useState(false);
  const [name, setName] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const submit = async (e) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      const data = isRegister
        ? await api.register(name, password)
        : await api.login(name, password);
      onAuth(data);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="auth-page">
      <div className="card auth-card">
        <div className="logo" style={{ marginBottom: '1.5rem' }}>
          <div className="logo-icon">⚽</div>
          <div>
            <h1>WC 2026 Predictor</h1>
            <p>USA · Mexico · Canada</p>
          </div>
        </div>
        <h2>{isRegister ? 'Create account' : 'Welcome back'}</h2>
        <p className="subtitle">
          Predict scores with friends — Euro-style scoring, private leagues.
        </p>
        {error && <div className="error-banner">{error}</div>}
        <form onSubmit={submit}>
          <div className="form-group">
            <label>Display name</label>
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. Alex"
              required
              autoComplete="username"
            />
          </div>
          <div className="form-group">
            <label>Password</label>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="Min 4 characters"
              required
              minLength={4}
              autoComplete={isRegister ? 'new-password' : 'current-password'}
            />
          </div>
          <button type="submit" className="btn btn-primary" style={{ width: '100%' }} disabled={loading}>
            {loading ? 'Please wait…' : isRegister ? 'Sign up' : 'Log in'}
          </button>
        </form>
        <p className="auth-toggle">
          {isRegister ? 'Already have an account?' : 'New here?'}{' '}
          <button type="button" onClick={() => setIsRegister(!isRegister)}>
            {isRegister ? 'Log in' : 'Sign up'}
          </button>
        </p>
      </div>
    </div>
  );
}

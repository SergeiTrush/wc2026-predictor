import { useState } from 'react';
import { api } from '../api';
import PasswordInput from '../components/PasswordInput';

export default function LoginPage({ onAuth }) {
  const [isRegister, setIsRegister] = useState(false);
  const [name, setName] = useState('');
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const submit = async (e) => {
    e.preventDefault();
    setError('');
    if (isRegister && !/^[a-zA-Z0-9 ._'-]+$/.test(name.trim())) {
      setError('Имя должно содержать только латинские символы');
      return;
    }
    if (isRegister && password !== confirm) {
      setError('Пароли не совпадают');
      return;
    }
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
      <div className="auth-card">
        <img src="/wc2026-logo.png" alt="" className="auth-hero-logo" />
        <h1 className="auth-hero-title">Match Predictor</h1>
        <p className="auth-hero-event">
          <span className="auth-hero-event-label">World Cup</span>
          <span className="auth-hero-event-year">2026</span>
        </p>
        {error && <div className="error-banner">{error}</div>}
        <form onSubmit={submit}>
          <div className="form-group">
            <label>Имя</label>
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              required
            />
          </div>
          <div className="form-group">
            <label>Пароль</label>
            <PasswordInput
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              minLength={4}
            />
          </div>
          {isRegister && (
            <div className="form-group">
              <label>Подтверждение пароля</label>
              <PasswordInput
                value={confirm}
                onChange={(e) => setConfirm(e.target.value)}
                required
                minLength={4}
              />
            </div>
          )}
          <button type="submit" className="btn-primary" disabled={loading}>
            {loading ? 'Подождите…' : isRegister ? 'Создать аккаунт' : 'Войти'}
          </button>
        </form>
        <p style={{ textAlign: 'center', marginTop: '1rem', fontSize: '0.85rem', color: 'var(--text-dim)' }}>
          {isRegister ? 'Уже есть аккаунт?' : 'Новичок?'}{' '}
          <button
            type="button"
            style={{ background: 'none', border: 'none', color: 'var(--yellow)', cursor: 'pointer' }}
            onClick={() => setIsRegister(!isRegister)}
          >
            {isRegister ? 'Войти' : 'Регистрация'}
          </button>
        </p>
      </div>
    </div>
  );
}

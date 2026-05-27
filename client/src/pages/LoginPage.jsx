import { useState } from 'react';
import { api } from '../api';

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
        <h1>🏆 ЧМ 2026</h1>
        <p className="subtitle">
          {isRegister ? 'Создай аккаунт и играй с друзьями' : 'Войди, чтобы делать прогнозы'}
        </p>
        {error && <div className="error-banner">{error}</div>}
        <form onSubmit={submit}>
          <div className="form-group">
            <label>Имя</label>
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Например, Андрей"
              required
            />
          </div>
          <div className="form-group">
            <label>Пароль</label>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              minLength={4}
            />
          </div>
          {isRegister && (
            <div className="form-group">
              <label>Подтверждение пароля</label>
              <input
                type="password"
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

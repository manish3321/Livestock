import { useState, type FormEvent } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { ApiRequestError } from '../api/client';
import { useAuth } from '../auth/auth-context';

export function LoginPage() {
  const { signIn } = useAuth();
  const { t } = useTranslation();
  const navigate = useNavigate();
  const location = useLocation();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState(false);
  const [unreachable, setUnreachable] = useState(false);
  const [busy, setBusy] = useState(false);

  const onSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError(false);
    setUnreachable(false);
    try {
      await signIn(email, password);
      const from = (location.state as { from?: { pathname: string } } | null)?.from;
      navigate(from?.pathname ?? '/dashboard', { replace: true });
    } catch (err) {
      const status = err instanceof ApiRequestError ? err.error.statusCode : undefined;
      const message = err instanceof Error ? err.message : '';
      setUnreachable(
        status === 405 ||
          status === 404 ||
          status === 502 ||
          status === 503 ||
          /Method Not Allowed|Failed to fetch|NetworkError/i.test(message),
      );
      setError(true);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="login-wrap">
      <section className="login-hero">
        <p className="login-kicker">{t('appName')}</p>
        <h1>{t('login.heroTitle')}</h1>
        <p>{t('login.heroBody')}</p>
        <ul className="login-points">
          <li>{t('login.point1')}</li>
          <li>{t('login.point2')}</li>
          <li>{t('login.point3')}</li>
        </ul>
      </section>
      <div className="login-panel">
        <form className="card login-card" onSubmit={(e) => void onSubmit(e)}>
          <p className="login-kicker muted">{t('appName')}</p>
          <h1>{t('login.title')}</h1>
          <p style={{ color: 'var(--color-text-secondary)', marginTop: 0, fontSize: '1.05rem' }}>
            {t('login.subtitle')}
          </p>
          <div className="field">
            <label htmlFor="email">{t('login.email')}</label>
            <p className="field-hint">{t('login.emailHint')}</p>
            <input
              id="email"
              type="email"
              autoComplete="username"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
            />
          </div>
          <div className="field">
            <label htmlFor="password">{t('login.password')}</label>
            <p className="field-hint">{t('login.passwordHint')}</p>
            <input
              id="password"
              type="password"
              autoComplete="current-password"
              required
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
          </div>
          {error && (
            <p className="error-text">{t(unreachable ? 'login.serverUnreachable' : 'login.failed')}</p>
          )}
          <button className="btn block" type="submit" disabled={busy}>
            {busy ? t('common.loading') : t('login.submit')}
          </button>
        </form>
      </div>
    </div>
  );
}

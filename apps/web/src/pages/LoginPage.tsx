import { useState, type FormEvent } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { ApiRequestError } from '../api/client';
import { useAuth } from '../auth/auth-context';
import { setLocale } from '../i18n';

export function LoginPage() {
  const { signIn } = useAuth();
  const { t, i18n } = useTranslation();
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
      <aside className="login-hero" aria-hidden={false}>
        <span className="login-mark" style={{ color: '#fff' }}>
          <svg width="40" height="40" viewBox="0 0 28 28" fill="none">
            <rect width="28" height="28" rx="8" fill="rgba(255,255,255,0.18)" />
            <path
              d="M8 18.5c2.2-4.2 4.6-6.5 6-6.5s3.8 2.3 6 6.5"
              stroke="#fff"
              strokeWidth="1.7"
              strokeLinecap="round"
            />
            <circle cx="14" cy="10" r="2.2" fill="#fff" />
          </svg>
        </span>
        <p className="login-kicker" style={{ color: 'rgba(255,255,255,0.75)', opacity: 1 }}>
          {t('appName')}
        </p>
        <h2>{t('login.heroTitle')}</h2>
        <p>{t('login.heroBody')}</p>
        <ul className="login-points">
          <li>{t('login.point1')}</li>
          <li>{t('login.point2')}</li>
          <li>{t('login.point3')}</li>
        </ul>
      </aside>
      <div className="login-panel">
        <form className="card login-card" onSubmit={(e) => void onSubmit(e)}>
          <span className="login-mark" aria-hidden="true">
            <svg width="32" height="32" viewBox="0 0 28 28" fill="none">
              <rect width="28" height="28" rx="8" fill="currentColor" />
              <path
                d="M8 18.5c2.2-4.2 4.6-6.5 6-6.5s3.8 2.3 6 6.5"
                stroke="#fff"
                strokeWidth="1.7"
                strokeLinecap="round"
              />
              <circle cx="14" cy="10" r="2.2" fill="#fff" />
            </svg>
          </span>
          <p className="login-kicker">{t('appName')}</p>
          <h1>{t('login.title')}</h1>
          <p className="login-pocket">{t('login.pocket')}</p>
          <div className="field">
            <label htmlFor="email">{t('login.email')}</label>
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
          <p className="login-bilingual">
            {t('login.bilingualNote')}
            {' · '}
            <button
              type="button"
              className="btn ghost"
              style={{ minHeight: 28, display: 'inline', padding: '0 4px' }}
              onClick={() => setLocale(i18n.language === 'en' ? 'ne' : 'en')}
            >
              {i18n.language === 'en' ? 'नेपाली' : 'English'}
            </button>
          </p>
        </form>
      </div>
    </div>
  );
}

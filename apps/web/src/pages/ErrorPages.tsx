import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';

export function ForbiddenPage() {
  const { t } = useTranslation();
  return (
    <div className="page-state">
      <h1>403</h1>
      <p>{t('errors.forbidden')}</p>
      <Link className="btn secondary" to="/dashboard">
        {t('nav.dashboard')}
      </Link>
    </div>
  );
}

export function NotFoundPage() {
  const { t } = useTranslation();
  return (
    <div className="page-state">
      <h1>404</h1>
      <p>{t('errors.notFound')}</p>
      <Link className="btn secondary" to="/dashboard">
        {t('nav.dashboard')}
      </Link>
    </div>
  );
}

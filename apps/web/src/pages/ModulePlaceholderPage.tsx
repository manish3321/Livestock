import { useTranslation } from 'react-i18next';
import type { ModuleKey } from '@farm/contracts';

/**
 * Placeholder for a scaffolded module. Each module becomes a vertical
 * slice when its approved UI design is supplied.
 */
export function ModulePlaceholderPage({ module }: { module: ModuleKey }) {
  const { t } = useTranslation();
  return (
    <div>
      <h1>{t(`nav.${module}`)}</h1>
      <div className="card">
        <h2 style={{ marginTop: 0 }}>{t('placeholder.title')}</h2>
        <p style={{ color: 'var(--color-text-secondary)', marginBottom: 0 }}>
          {t('placeholder.body')}
        </p>
      </div>
    </div>
  );
}

import { useTranslation } from 'react-i18next';

export function LoadingState() {
  const { t } = useTranslation();
  return (
    <div className="page-state rise-in">
      <div className="page-state-icon" aria-hidden="true">
        …
      </div>
      <strong style={{ color: 'var(--color-text-primary)' }}>{t('common.loading')}</strong>
      <span>{t('common.loadingHint')}</span>
    </div>
  );
}

export function EmptyState({ message }: { message?: string }) {
  const { t } = useTranslation();
  return (
    <div className="page-state rise-in">
      <div className="page-state-icon" aria-hidden="true">
        ○
      </div>
      <strong style={{ color: 'var(--color-text-primary)' }}>
        {message ?? t('common.empty')}
      </strong>
      <span>{t('common.emptyHint')}</span>
    </div>
  );
}

export function ErrorState({
  message,
  onRetry,
}: {
  message?: string;
  onRetry?: () => void;
}) {
  const { t } = useTranslation();
  return (
    <div className="page-state rise-in">
      <div
        className="page-state-icon"
        style={{ background: 'var(--color-danger-subtle)', color: 'var(--color-danger)' }}
        aria-hidden="true"
      >
        !
      </div>
      <strong style={{ color: 'var(--color-text-primary)' }}>
        {message ?? t('errors.generic')}
      </strong>
      <span>{t('errors.retryHint')}</span>
      {onRetry && (
        <button className="btn secondary" onClick={onRetry}>
          {t('common.retry')}
        </button>
      )}
    </div>
  );
}

import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import type { MarkerCohortDto } from '@farm/contracts';
import { listCohort } from '../../api/animals';
import { ErrorState, LoadingState } from '../../components/PageState';

const CACHE_KEY = 'farm.cohort.cache';

function readCache(): MarkerCohortDto | null {
  try {
    const raw = localStorage.getItem(CACHE_KEY);
    return raw ? (JSON.parse(raw) as MarkerCohortDto) : null;
  } catch {
    return null;
  }
}

function writeCache(data: MarkerCohortDto): void {
  localStorage.setItem(CACHE_KEY, JSON.stringify(data));
}

export function CohortPage() {
  const { t } = useTranslation();
  const [offline, setOffline] = useState(!navigator.onLine);
  const cached = readCache();

  const query = useQuery({
    queryKey: ['marker-cohort'],
    queryFn: listCohort,
    enabled: navigator.onLine,
    retry: 0,
  });

  useEffect(() => {
    if (query.data) writeCache(query.data);
  }, [query.data]);

  useEffect(() => {
    const on = () => setOffline(false);
    const off = () => setOffline(true);
    window.addEventListener('online', on);
    window.addEventListener('offline', off);
    return () => {
      window.removeEventListener('online', on);
      window.removeEventListener('offline', off);
    };
  }, []);

  const data = query.data ?? cached;
  const groups = data?.groups ?? [];

  return (
    <div className="cohort-page">
      <Link to="/shed" className="back-link">
        ← {t('nav.shed')}
      </Link>
      <div className="page-header">
        <h1>{t('cohort.title')}</h1>
      </div>
      <p className="muted">{t('cohort.subtitle')}</p>
      {(offline || (!navigator.onLine && cached)) && <p className="muted">{t('cohort.offline')}</p>}
      {query.isLoading && !data && <LoadingState />}
      {query.isError && !data && <ErrorState onRetry={() => query.refetch()} />}
      {data && groups.length === 0 && <p className="muted">{t('cohort.empty')}</p>}
      {groups.map((group) => (
        <section key={group.meaning} className="cohort-group">
          <h2>
            {t(`cohort.meaning.${group.meaning}`)} · {t(`cohort.color.${group.color}`)}
          </h2>
          <ul className="cohort-list">
            {group.animals.map((a) => (
              <li key={a.markerId} className="cohort-row">
                {a.photoUrl ? (
                  <img className="cohort-thumb" src={a.photoUrl} alt="" width={56} height={56} />
                ) : (
                  <span className="cohort-thumb cohort-thumb-empty" aria-hidden>
                    {a.shortNo?.slice(0, 1) ?? '?'}
                  </span>
                )}
                <div className="cohort-who">
                  <strong className="cohort-short">{a.shortNo ?? a.herdNumber ?? '—'}</strong>
                  <span>
                    {a.shed ?? t('cohort.noPen')}
                    {a.name ? ` · ${a.name}` : ''}
                  </span>
                  {a.validUntil && (
                    <span className="muted">
                      {t('cohort.until', { date: a.validUntil.slice(0, 10) })}
                    </span>
                  )}
                </div>
              </li>
            ))}
          </ul>
        </section>
      ))}
    </div>
  );
}

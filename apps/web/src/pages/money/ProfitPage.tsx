import { useQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { effectivePrice, profitRanking } from '../../api/milk';
import { ErrorState, LoadingState } from '../../components/PageState';
import { useAuth } from '../../auth/auth-context';

/** Headline morning screen. Ranked. Never suggests culling. */
export function ProfitPage() {
  const { t } = useTranslation();
  const { can } = useAuth();
  const priceQ = useQuery({ queryKey: ['effective-price'], queryFn: effectivePrice, enabled: can('finance:read') });
  const rankQ = useQuery({ queryKey: ['profit-rank'], queryFn: profitRanking, enabled: can('finance:read') });

  if (!can('finance:read')) {
    return (
      <div>
        <h1>{t('profit.title')}</h1>
        <p className="muted">{t('profit.workersHidden')}</p>
      </div>
    );
  }
  if (rankQ.isLoading) return <LoadingState />;
  if (rankQ.isError) return <ErrorState onRetry={() => rankQ.refetch()} />;

  const price = priceQ.data;
  const rows = rankQ.data ?? [];

  return (
    <div>
      <h1>{t('profit.title')}</h1>
      <p className="muted">{t('profit.subtitle')}</p>
      <div className="profit-price">
        {t('profit.effective')}: <strong>NPR {price?.effectivePrice.toFixed(2) ?? '—'}</strong>
        {price?.headlineRate ? ` · ${t('profit.headline')} ${price.headlineRate.toFixed(2)}` : ''}
      </div>
      <table className="data-table">
        <thead>
          <tr>
            <th>{t('profit.animal')}</th>
            <th>{t('profit.litres')}</th>
            <th>{t('profit.revenue')}</th>
            <th>{t('profit.feedPerL')}</th>
            <th>{t('profit.profitCol')}</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.animalId} className={r.bottomDecile ? 'profit-low' : undefined}>
              <td>
                <strong>{r.herdNumber ?? r.tag}</strong> {r.name ?? ''}
              </td>
              <td>{r.litres30d.toFixed(1)}</td>
              <td>{r.revenue.toFixed(0)}</td>
              <td>{r.feedCostPerLitre != null ? r.feedCostPerLitre.toFixed(1) : '—'}</td>
              <td>{r.profit.toFixed(0)}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <p className="muted">{t('profit.noCull')}</p>
    </div>
  );
}

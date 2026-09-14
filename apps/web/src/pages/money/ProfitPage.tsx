import { useQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { listProfitability } from '../../api/animals';
import { ErrorState, LoadingState } from '../../components/PageState';
import { useAuth } from '../../auth/auth-context';

/** Headline morning screen. Ranked. Never suggests culling. */
export function ProfitPage() {
  const { t } = useTranslation();
  const { can } = useAuth();
  const rankQ = useQuery({
    queryKey: ['animals', 'profitability'],
    queryFn: () => listProfitability({ sort: 'profit_desc' }),
    enabled: can('finance:read'),
  });

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

  const data = rankQ.data;
  const rows = data?.items ?? [];
  const priceLabel =
    data?.priceSource === 'payments' ? t('profit.priceFromPayments') : t('profit.priceFallback');

  return (
    <div>
      <h1>{t('profit.title')}</h1>
      <p className="muted">{t('profit.subtitle')}</p>
      <div className="profit-price">
        {t('profit.effective')}: <strong>NPR {data?.price.toFixed(2) ?? '—'}</strong>
        {data?.headlineRate != null ? ` · ${t('profit.headline')} ${data.headlineRate.toFixed(2)}` : ''}
        <span className="muted"> · {priceLabel}</span>
      </div>
      <table className="data-table">
        <thead>
          <tr>
            <th>{t('profit.rank')}</th>
            <th>{t('profit.animal')}</th>
            <th>{t('profit.litres')}</th>
            <th>{t('profit.feedPerL')}</th>
            <th>{t('profit.costPerL')}</th>
            <th>{t('profit.profitCol')}</th>
            <th>{t('profit.trend')}</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.animalId} className={r.bottomDecile ? 'profit-low' : undefined}>
              <td>{r.rank ?? ''}</td>
              <td>
                <strong>{r.shortNo ?? r.herdNumber ?? r.tag}</strong> {r.name ?? ''}
              </td>
              <td>{(r.litres ?? r.litres30d).toFixed(1)}</td>
              <td>{r.feedCostPerLitre != null ? r.feedCostPerLitre.toFixed(1) : '—'}</td>
              <td>{r.costPerLitre != null ? r.costPerLitre.toFixed(1) : '—'}</td>
              <td>{r.profit.toFixed(0)}</td>
              <td>{r.trend === 'up' ? '↑' : r.trend === 'down' ? '↓' : '→'}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <p className="muted">{t('profit.noCull')}</p>
    </div>
  );
}

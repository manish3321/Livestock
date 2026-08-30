import { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { formatNPR, type PnlQuery } from '@farm/contracts';
import { getPnl, type PnlStream } from '../../api/pnl';
import { DataTable, type Column } from '../../components/DataTable';
import { ErrorState, LoadingState } from '../../components/PageState';
import { StatusChip } from '../../components/StatusChip';

export function PnlPage() {
  const { t } = useTranslation();
  const currentYear = new Date().getFullYear();
  const [period, setPeriod] = useState<PnlQuery['period']>('monthly');
  const [year, setYear] = useState(currentYear);

  const query = useQuery({
    queryKey: ['pnl', period, year],
    queryFn: () => getPnl({ period, year }),
  });

  const columns = useMemo<Column<PnlStream>[]>(
    () => [
      { key: 'name', header: t('pnl.stream'), render: (row) => row.name },
      {
        key: 'revenue',
        header: t('pnl.revenue'),
        render: (row) => formatNPR(row.revenue),
      },
      {
        key: 'expense',
        header: t('pnl.expense'),
        render: (row) => formatNPR(row.expense),
      },
      {
        key: 'margin',
        header: t('pnl.margin'),
        render: (row) => formatNPR(row.margin),
      },
      {
        key: 'flag',
        header: t('pnl.status'),
        render: (row) =>
          row.lossMaking ? (
            <StatusChip status="SICK" label={t('pnl.lossMaking')} />
          ) : (
            <StatusChip status="ACTIVE" label={t('pnl.profitable')} />
          ),
      },
    ],
    [t],
  );

  return (
    <div>
      <div className="page-header">
        <div>
          <h1>{t('nav.pnl')}</h1>
          <p className="page-subtitle">{t('pnl.subtitle')}</p>
        </div>
      </div>

      <div className="toolbar">
        <div className="chip-row">
          {(['monthly', 'quarterly', 'yearly'] as const).map((value) => (
            <button
              key={value}
              type="button"
              className={`filter-chip ${period === value ? 'active' : ''}`}
              onClick={() => setPeriod(value)}
            >
              {t(`pnl.period.${value}`)}
            </button>
          ))}
        </div>
        <select
          value={year}
          onChange={(e) => setYear(Number(e.target.value))}
          aria-label={t('pnl.year')}
        >
          {Array.from({ length: 6 }, (_, i) => currentYear - i).map((y) => (
            <option key={y} value={y}>
              {y}
            </option>
          ))}
        </select>
      </div>

      {query.isLoading && <LoadingState />}
      {query.isError && <ErrorState onRetry={() => void query.refetch()} />}
      {query.data && (
        <>
          <div className="stats-grid" style={{ marginBottom: 24 }}>
            <div className="stat-card">
              <span className="stat-label">{t('pnl.revenue')}</span>
              <span className="stat-value">{formatNPR(query.data.totals.revenue)}</span>
            </div>
            <div className="stat-card">
              <span className="stat-label">{t('pnl.expense')}</span>
              <span className="stat-value">{formatNPR(query.data.totals.expense)}</span>
            </div>
            <div className="stat-card">
              <span className="stat-label">{t('pnl.margin')}</span>
              <span className="stat-value">{formatNPR(query.data.totals.margin)}</span>
            </div>
            <div className="stat-card">
              <span className="stat-label">{t('pnl.feedPercent')}</span>
              <span className="stat-value">
                {query.data.feedPercentOfRevenue != null
                  ? `${Math.round(query.data.feedPercentOfRevenue * 100)}%`
                  : '—'}
              </span>
            </div>
            <div className="stat-card">
              <span className="stat-label">{t('pnl.healthPercent')}</span>
              <span className="stat-value">
                {query.data.healthPercentOfRevenue != null
                  ? `${Math.round(query.data.healthPercentOfRevenue * 100)}%`
                  : '—'}
              </span>
            </div>
            <div className="stat-card">
              <span className="stat-label">{t('pnl.profitPerAnimal')}</span>
              <span className="stat-value">
                {query.data.profitPerAnimal != null
                  ? formatNPR(query.data.profitPerAnimal)
                  : '—'}
              </span>
            </div>
          </div>
          <DataTable
            columns={columns}
            rows={query.data.streams}
            rowKey={(row) => row.name}
          />
        </>
      )}
    </div>
  );
}

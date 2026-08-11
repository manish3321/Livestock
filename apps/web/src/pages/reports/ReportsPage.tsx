import { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import type { HerdBatchKind } from '@farm/contracts';
import { useAuth } from '../../auth/auth-context';
import {
  downloadHerdMonthlyCsv,
  getHerdMonthly,
  type HerdMonthlyReport,
} from '../../api/batches';
import {
  downloadAnimalInventoryCsv,
  getAnimalInventoryReport,
  getFarmOverview,
  getHealthSummary,
  type ReportSummary,
} from '../../api/reports';
import { ErrorState, LoadingState } from '../../components/PageState';
import { downloadTablePdf } from '../../lib/pdf';

type ReportKind = 'farm-overview' | 'animal-inventory' | 'health-summary';

export function ReportsPage() {
  const { t } = useTranslation();
  const { can } = useAuth();
  const now = new Date();
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [active, setActive] = useState<ReportKind | null>(null);
  const [year, setYear] = useState(now.getFullYear());
  const [month, setMonth] = useState(now.getMonth() + 1);
  const [kind, setKind] = useState<HerdBatchKind | 'ALL'>('ALL');
  const [showMonthly, setShowMonthly] = useState(false);

  const queryParams = {
    from: from ? new Date(from) : undefined,
    to: to ? new Date(to) : undefined,
  };

  const report = useQuery({
    queryKey: ['reports', active, from, to],
    queryFn: () => {
      if (active === 'farm-overview') return getFarmOverview(queryParams);
      if (active === 'animal-inventory') return getAnimalInventoryReport(queryParams);
      return getHealthSummary(queryParams);
    },
    enabled: active !== null,
  });

  const monthlyQuery = {
    year,
    month,
    ...(kind === 'ALL' ? {} : { kind }),
  };

  const monthly = useQuery({
    queryKey: ['reports', 'herd-monthly', year, month, kind],
    queryFn: () => getHerdMonthly(monthlyQuery),
    enabled: showMonthly,
  });

  const cards: { kind: ReportKind; title: string; body: string }[] = [
    {
      kind: 'farm-overview',
      title: t('reports.farmOverview'),
      body: t('reports.farmOverviewBody'),
    },
    {
      kind: 'animal-inventory',
      title: t('reports.animalInventory'),
      body: t('reports.animalInventoryBody'),
    },
    {
      kind: 'health-summary',
      title: t('reports.healthSummary'),
      body: t('reports.healthSummaryBody'),
    },
  ];

  const years = useMemo(() => {
    const y = now.getFullYear();
    return [y, y - 1, y - 2];
  }, [now]);

  return (
    <div>
      <div className="page-header">
        <div>
          <h1>{t('nav.reports')}</h1>
          <p className="page-subtitle">{t('reports.subtitle')}</p>
        </div>
        {can('export:data') && (
          <div className="page-actions">
            <button
              className="btn secondary"
              type="button"
              onClick={() => void downloadAnimalInventoryCsv(queryParams)}
            >
              {t('reports.downloadCsv')}
            </button>
          </div>
        )}
      </div>

      <div className="card" style={{ marginBottom: 24 }}>
        <h2>{t('reports.monthlyHerd')}</h2>
        <p className="muted">{t('reports.monthlyHerdBody')}</p>
        <div className="toolbar" style={{ marginTop: 12 }}>
          <div className="field" style={{ marginBottom: 0 }}>
            <label htmlFor="rep-year">{t('reports.year')}</label>
            <select
              id="rep-year"
              value={year}
              onChange={(e) => setYear(Number(e.target.value))}
            >
              {years.map((y) => (
                <option key={y} value={y}>
                  {y}
                </option>
              ))}
            </select>
          </div>
          <div className="field" style={{ marginBottom: 0 }}>
            <label htmlFor="rep-month">{t('reports.month')}</label>
            <select
              id="rep-month"
              value={month}
              onChange={(e) => setMonth(Number(e.target.value))}
            >
              {Array.from({ length: 12 }, (_, i) => i + 1).map((m) => (
                <option key={m} value={m}>
                  {m}
                </option>
              ))}
            </select>
          </div>
          <div className="field" style={{ marginBottom: 0 }}>
            <label htmlFor="rep-kind">{t('reports.kind')}</label>
            <select
              id="rep-kind"
              value={kind}
              onChange={(e) => setKind(e.target.value as HerdBatchKind | 'ALL')}
            >
              <option value="ALL">{t('reports.kindAll')}</option>
              <option value="LIVESTOCK">{t('reports.kindLivestock')}</option>
              <option value="POULTRY">{t('reports.kindPoultry')}</option>
              <option value="FISH">{t('reports.kindFish')}</option>
            </select>
          </div>
        </div>
        <div className="page-actions" style={{ marginTop: 12 }}>
          <button
            className="btn"
            type="button"
            onClick={() => setShowMonthly(true)}
          >
            {t('reports.viewMonthly')}
          </button>
          {can('export:data') && (
            <>
              <button
                className="btn secondary"
                type="button"
                onClick={() => void downloadHerdMonthlyCsv(monthlyQuery)}
              >
                {t('reports.downloadMonthlyCsv')}
              </button>
              <button
                className="btn secondary"
                type="button"
                disabled={!monthly.data?.rows.length}
                onClick={() => {
                  const data = monthly.data;
                  if (!data) return;
                  downloadTablePdf(
                    `${t('reports.monthlyHerd')} ${year}-${String(month).padStart(2, '0')}`,
                    `herd-monthly-${year}-${String(month).padStart(2, '0')}.pdf`,
                    [
                      t('reports.kind'),
                      t('reports.category'),
                      t('reports.batchName'),
                      t('reports.current'),
                      t('reports.dead'),
                      t('reports.diedThisMonth'),
                      t('reports.sickThisMonth'),
                    ],
                    data.rows.map((row) => [
                      row.kind,
                      row.category,
                      row.name,
                      row.currentCount,
                      row.deadCount,
                      row.diedThisMonth,
                      row.sickLoggedThisMonth,
                    ]),
                  );
                }}
              >
                {t('reports.downloadMonthlyPdf')}
              </button>
            </>
          )}
        </div>

        {showMonthly && (
          <div style={{ marginTop: 16 }}>
            {monthly.isLoading && <LoadingState />}
            {monthly.isError && (
              <ErrorState onRetry={() => void monthly.refetch()} />
            )}
            {monthly.data && <MonthlyHerdTable data={monthly.data} />}
          </div>
        )}
      </div>

      <div className="toolbar">
        <div className="field" style={{ marginBottom: 0 }}>
          <label htmlFor="rep-from">{t('reports.from')}</label>
          <input
            id="rep-from"
            type="date"
            value={from}
            onChange={(e) => setFrom(e.target.value)}
          />
        </div>
        <div className="field" style={{ marginBottom: 0 }}>
          <label htmlFor="rep-to">{t('reports.to')}</label>
          <input id="rep-to" type="date" value={to} onChange={(e) => setTo(e.target.value)} />
        </div>
      </div>

      <div className="card-grid">
        {cards.map((card) => (
          <div key={card.kind} className="card">
            <h2>{card.title}</h2>
            <p className="muted">{card.body}</p>
            <button
              className="btn"
              type="button"
              onClick={() => setActive(card.kind)}
            >
              {t('reports.view')}
            </button>
          </div>
        ))}
      </div>

      {active && (
        <div className="card" style={{ marginTop: 24 }}>
          <div className="page-header" style={{ marginBottom: 12 }}>
            <h2>{cards.find((c) => c.kind === active)?.title}</h2>
            <button className="btn secondary" type="button" onClick={() => setActive(null)}>
              {t('common.cancel')}
            </button>
          </div>
          {report.isLoading && <LoadingState />}
          {report.isError && <ErrorState onRetry={() => void report.refetch()} />}
          {report.data && <ReportJson data={report.data} />}
        </div>
      )}
    </div>
  );
}

function MonthlyHerdTable({ data }: { data: HerdMonthlyReport }) {
  const { t } = useTranslation();
  return (
    <div>
      <p className="muted">
        {data.totals.batches} · {t('reports.current')}: {data.totals.currentHeadcount} ·{' '}
        {t('reports.diedThisMonth')}: {data.totals.diedThisMonth} ·{' '}
        {t('reports.sickThisMonth')}: {data.totals.sickLoggedThisMonth}
      </p>
      {data.rows.length === 0 ? (
        <p className="muted">{t('common.empty')}</p>
      ) : (
        <div className="table-wrap">
          <table className="data-table">
            <thead>
              <tr>
                <th>{t('reports.kind')}</th>
                <th>{t('reports.category')}</th>
                <th>{t('reports.batchName')}</th>
                <th>{t('reports.current')}</th>
                <th>{t('reports.dead')}</th>
                <th>{t('reports.diedThisMonth')}</th>
                <th>{t('reports.sickThisMonth')}</th>
              </tr>
            </thead>
            <tbody>
              {data.rows.map((row) => (
                <tr key={row.id}>
                  <td>{row.kind}</td>
                  <td>{row.category}</td>
                  <td>{row.name}</td>
                  <td>{row.currentCount}</td>
                  <td>{row.deadCount}</td>
                  <td>{row.diedThisMonth}</td>
                  <td>{row.sickLoggedThisMonth}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

function ReportJson({ data }: { data: ReportSummary }) {
  return (
    <pre className="report-json">{JSON.stringify(data, null, 2)}</pre>
  );
}

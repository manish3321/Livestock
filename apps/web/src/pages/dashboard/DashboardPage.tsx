import { useMemo } from 'react';
import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import {
  formatDate,
  formatDateTime,
  formatNPR,
  modulesForRole,
  SPECIES_LABEL,
  type Species,
} from '@farm/contracts';

function batchDistributionLabel(key: string): string {
  const parts = key.split(':');
  const kind = parts.length > 1 ? parts[0]! : '';
  const category = parts.length > 1 ? parts.slice(1).join(':') : key;
  const cat =
    SPECIES_LABEL[category as Species] ??
    category.charAt(0) + category.slice(1).toLowerCase();
  if (!kind) return cat;
  const kindLabel =
    kind === 'LIVESTOCK'
      ? 'Livestock'
      : kind === 'POULTRY'
        ? 'Poultry'
        : kind === 'FISH'
          ? 'Fish'
          : kind;
  return `${kindLabel} · ${cat}`;
}
import { useAuth } from '../../auth/auth-context';
import { getDashboardSummary } from '../../api/dashboard';
import { ModuleIcon } from '../../components/ModuleIcon';
import { ErrorState, LoadingState } from '../../components/PageState';
import { StatusChip } from '../../components/StatusChip';

export function DashboardPage() {
  const { t, i18n } = useTranslation();
  const { user, can } = useAuth();
  const showFinance = can('finance:read');

  const query = useQuery({
    queryKey: ['dashboard', 'summary'],
    queryFn: getDashboardSummary,
  });

  const greeting = useMemo(() => {
    const hour = new Date().getHours();
    if (hour < 12) return t('dashboard.goodMorning');
    if (hour < 17) return t('dashboard.goodAfternoon');
    return t('dashboard.goodEvening');
  }, [t, i18n.language]);

  const todayLabel = useMemo(
    () =>
      new Intl.DateTimeFormat(i18n.language === 'ne' ? 'ne-NP' : 'en-GB', {
        weekday: 'long',
        day: 'numeric',
        month: 'long',
        year: 'numeric',
      }).format(new Date()),
    [i18n.language],
  );

  if (query.isLoading) return <LoadingState />;
  if (query.isError || !query.data) {
    return <ErrorState onRetry={() => void query.refetch()} />;
  }

  const data = query.data;
  const species = data.speciesDistribution ?? [];
  const alerts = data.alerts ?? {
    healthOverdue: [],
    inventoryCritical: [],
    pendingApprovals: [],
    inventoryExpiring: [],
    unpaidRevenue: [],
  };
  const activity = data.recentActivity ?? [];
  const maxSpecies = Math.max(1, ...species.map((s) => s.count));
  const urgentCount =
    alerts.healthOverdue.length + alerts.inventoryCritical.length;
  const shortcuts = (user ? modulesForRole(user.role) : []).filter(
    (m) => m !== 'dashboard',
  );

  return (
    <div>
      <div className="greeting-block rise-in">
        <h1 className="greeting-title">
          {greeting}
          {user?.name ? `, ${user.name.split(' ')[0]}` : ''}
        </h1>
        <p className="greeting-date">{todayLabel}</p>
      </div>

      <section
        className="weather-strip rise-in rise-in-delay-1"
        aria-label={t('dashboard.weather')}
      >
        <div>
          <div className="weather-temp">+24°C</div>
          <div style={{ fontWeight: 700, marginTop: 8, fontSize: '1.05rem' }}>
            {t('dashboard.farmWeather')} — {user?.farmName ?? 'Farm'}
          </div>
        </div>
        <div className="weather-meta">
          <span>
            {t('dashboard.humidity')}: <strong>62%</strong>
          </span>
          <span>
            {t('dashboard.wind')}: <strong>8 m/s</strong>
          </span>
          <span>
            {t('dashboard.location')}: <strong>Nepal</strong>
          </span>
        </div>
      </section>

      <div className="section-block rise-in rise-in-delay-2">
        <div className="section-head">
          <div>
            <h2 className="section-title">{t('dashboard.quickAccess')}</h2>
            <p className="section-hint">{t('dashboard.quickAccessHint')}</p>
          </div>
        </div>
        <div className="shortcut-grid">
          {shortcuts.map((m) => (
            <Link key={m} to={`/${m}`} className="shortcut-tile">
              <span className="shortcut-icon">
                <ModuleIcon module={m} size={26} />
              </span>
              {t(`nav.${m}`)}
            </Link>
          ))}
        </div>
      </div>

      {urgentCount > 0 && (
        <Link to="/health" className="urgent-banner">
          <span>
            ! {t('dashboard.urgentAttention', { count: urgentCount })}
          </span>
          <span aria-hidden="true">→</span>
        </Link>
      )}

      <div className="section-block rise-in rise-in-delay-3">
        <div className="section-head">
          <div>
            <h2 className="section-title">{t('dashboard.atAGlance')}</h2>
            <p className="section-hint">{t('dashboard.atAGlanceHint')}</p>
          </div>
        </div>
        <div className="stats-grid">
          <div className="stat-card">
            <span className="stat-label">{t('dashboard.animals')}</span>
            <span className="stat-value">{data.animalCount}</span>
          </div>
          {showFinance && (
            <>
              <div className="stat-card">
                <span className="stat-label">{t('dashboard.revenue')}</span>
                <span className="stat-value">
                  {formatNPR(data.revenueTotal ?? 0)}
                </span>
              </div>
              <div className="stat-card">
                <span className="stat-label">{t('dashboard.expenses')}</span>
                <span className="stat-value">
                  {formatNPR(data.expenseTotal ?? 0)}
                </span>
              </div>
              <div className="stat-card">
                <span className="stat-label">{t('dashboard.netProfit')}</span>
                <span className="stat-value">
                  {formatNPR(data.netProfit ?? 0)}
                </span>
              </div>
            </>
          )}
        </div>
      </div>

      {showFinance && data.financeTrend && data.financeTrend.length > 0 && (
        <div className="card section-block">
          <div className="section-head">
            <div>
              <h2 className="section-title">{t('dashboard.financeTrend')}</h2>
              <p className="section-hint">{t('dashboard.financeTrendHint')}</p>
            </div>
          </div>
          <FinanceTrendChart data={data.financeTrend} />
        </div>
      )}

      <div className="detail-grid section-block">
        <div className="card">
          <div className="section-head">
            <div>
              <h2 className="section-title">{t('dashboard.speciesDistribution')}</h2>
              <p className="section-hint">{t('dashboard.speciesHint')}</p>
            </div>
          </div>
          {species.length === 0 ? (
            <p className="muted">{t('common.empty')}</p>
          ) : (
            <ul className="bar-list">
              {species.map((row) => (
                <li key={row.species}>
                  <div className="bar-meta">
                    <span>
                      {batchDistributionLabel(row.species)}
                    </span>
                    <span>{row.count}</span>
                  </div>
                  <div className="bar-track">
                    <div
                      className="bar-fill"
                      style={{ width: `${(row.count / maxSpecies) * 100}%` }}
                    />
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>

        <div className="card">
          <div className="section-head">
            <div>
              <h2 className="section-title">{t('dashboard.alerts')}</h2>
              <p className="section-hint">{t('dashboard.alertsHint')}</p>
            </div>
          </div>
          <div className="alert-stack">
            <AlertBlock
              title={t('dashboard.healthOverdue')}
              count={alerts.healthOverdue.length}
              items={alerts.healthOverdue}
              status="SICK"
            />
            <AlertBlock
              title={t('dashboard.inventoryCritical')}
              count={alerts.inventoryCritical.length}
              items={alerts.inventoryCritical}
              status="CRITICAL"
            />
            <AlertBlock
              title={t('dashboard.pendingApprovals')}
              count={alerts.pendingApprovals.length}
              items={alerts.pendingApprovals}
              status="PENDING"
            />
            <AlertBlock
              title={t('dashboard.inventoryExpiring')}
              count={(alerts.inventoryExpiring ?? []).length}
              items={alerts.inventoryExpiring ?? []}
              status="LOW"
            />
            {showFinance && (
              <AlertBlock
                title={t('dashboard.unpaidRevenue')}
                count={(alerts.unpaidRevenue ?? []).length}
                items={alerts.unpaidRevenue ?? []}
                status="PENDING"
              />
            )}
          </div>
        </div>
      </div>

      <div className="card section-block">
        <div className="section-head">
          <div>
            <h2 className="section-title">{t('dashboard.recentActivity')}</h2>
            <p className="section-hint">{t('dashboard.activityHint')}</p>
          </div>
        </div>
        {activity.length === 0 ? (
          <p className="muted">{t('common.empty')}</p>
        ) : (
          <ul className="activity-list">
            {activity.map((item) => (
              <li key={item.id}>
                <div>
                  <strong>{item.kind}</strong>
                  <span className="muted"> · {item.summary}</span>
                </div>
                <span className="muted">{formatDateTime(item.createdAt)}</span>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}

function FinanceTrendChart({
  data,
}: {
  data: Array<{ month: string; revenue: number; expenses: number }>;
}) {
  const max = Math.max(1, ...data.flatMap((d) => [d.revenue, d.expenses]));
  const w = 560;
  const h = 160;
  const pad = 28;
  const innerW = w - pad * 2;
  const innerH = h - pad * 2;
  const step = innerW / Math.max(1, data.length - 1);

  const revPoints = data
    .map((d, i) => {
      const x = pad + i * step;
      const y = pad + innerH - (d.revenue / max) * innerH;
      return `${x},${y}`;
    })
    .join(' ');
  const expPoints = data
    .map((d, i) => {
      const x = pad + i * step;
      const y = pad + innerH - (d.expenses / max) * innerH;
      return `${x},${y}`;
    })
    .join(' ');

  return (
    <div className="trend-chart">
      <svg viewBox={`0 0 ${w} ${h}`} role="img" aria-label="Revenue vs expenses">
        <polyline
          fill="none"
          stroke="var(--color-brand, #2d5532)"
          strokeWidth="3"
          points={revPoints}
        />
        <polyline
          fill="none"
          stroke="var(--color-danger, #b45309)"
          strokeWidth="3"
          points={expPoints}
        />
        {data.map((d, i) => (
          <text
            key={d.month}
            x={pad + i * step}
            y={h - 6}
            textAnchor="middle"
            fontSize="10"
            fill="currentColor"
          >
            {d.month.slice(5)}
          </text>
        ))}
      </svg>
      <div className="trend-legend">
        <span className="trend-legend-rev">Revenue</span>
        <span className="trend-legend-exp">Expenses</span>
      </div>
    </div>
  );
}

function AlertBlock({
  title,
  count,
  items,
  status,
}: {
  title: string;
  count: number;
  items: { id: string; title: string; detail?: string | null; dueAt?: string | null }[];
  status: string;
}) {
  return (
    <div className="alert-block">
      <div className="alert-block-head">
        <span>{title}</span>
        <StatusChip status={status} label={String(count)} />
      </div>
      {items.length === 0 ? (
        <p className="muted">{'—'}</p>
      ) : (
        <ul className="alert-items">
          {items.slice(0, 5).map((item) => (
            <li key={item.id}>
              {item.title}
              {item.dueAt ? ` · ${formatDate(item.dueAt)}` : ''}
              {item.detail ? ` · ${item.detail}` : ''}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

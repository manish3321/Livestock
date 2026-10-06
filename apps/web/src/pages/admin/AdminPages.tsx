import { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { formatDateTime } from '@farm/contracts';
import { useAuth } from '../../auth/auth-context';
import { api } from '../../api/client';
import { toQuery } from '../../api/query';
import { DataTable, type Column } from '../../components/DataTable';
import { ErrorState, LoadingState } from '../../components/PageState';

export { AdminMembersPage } from './MembersPage';

interface AuditRow {
  id: string;
  action: string;
  entityType: string | null;
  entityId: string | null;
  createdAt: string;
  userId: string | null;
}

export function AdminAuditPage() {
  const { t } = useTranslation();
  const { can } = useAuth();

  const query = useQuery({
    queryKey: ['admin', 'audit'],
    queryFn: () =>
      api<{ items: AuditRow[] }>(`/v1/audit${toQuery({ page: 1, pageSize: 100 })}`),
    enabled: can('audit:read'),
  });

  const columns = useMemo<Column<AuditRow>[]>(
    () => [
      {
        key: 'when',
        header: t('common.date'),
        render: (r) => formatDateTime(r.createdAt),
      },
      { key: 'action', header: t('admin.action'), render: (r) => r.action },
      {
        key: 'entity',
        header: t('admin.entity'),
        render: (r) => [r.entityType, r.entityId].filter(Boolean).join(' ') || '—',
      },
    ],
    [t],
  );

  if (!can('audit:read')) return <p className="muted">{t('errors.forbidden')}</p>;
  if (query.isLoading) return <LoadingState />;
  if (query.isError) return <ErrorState onRetry={() => void query.refetch()} />;

  return (
    <div>
      <div className="page-header">
        <div>
          <h1>{t('admin.audit')}</h1>
          <p className="page-subtitle">{t('admin.auditSubtitle')}</p>
        </div>
      </div>
      <DataTable columns={columns} rows={query.data?.items ?? []} rowKey={(r) => r.id} />
    </div>
  );
}

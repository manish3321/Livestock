import { FormEvent, useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import {
  INVENTORY_ALERT_LEVELS,
  INVENTORY_CATEGORIES,
  formatDate,
  formatNPR,
  inventoryAlertLevel,
  type InventoryAlertLevel,
  type InventoryCreate,
  type StockMovementCreate,
} from '@farm/contracts';
import {
  addMovement,
  createInventory,
  listInventory,
  listMovements,
  requestRestock,
  updateInventory,
  type InventoryDto,
} from '../../api/inventory';
import { useAuth } from '../../auth/auth-context';
import { DataTable, type Column } from '../../components/DataTable';
import { ErrorState, LoadingState } from '../../components/PageState';
import { StatusChip } from '../../components/StatusChip';

const emptyForm = (): Partial<InventoryCreate> => ({
  category: 'FEED',
  currentStock: 0,
  minimumStock: 0,
  unit: 'kg',
});

const MOVEMENT_TYPES = ['IN', 'OUT', 'ADJUST'] as const;

export function InventoryPage() {
  const { t } = useTranslation();
  const { can } = useAuth();
  const qc = useQueryClient();
  const [alert, setAlert] = useState<InventoryAlertLevel | ''>('');
  const [editingId, setEditingId] = useState<string | null>(null);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState<Partial<InventoryCreate>>(emptyForm());
  const [restockQty, setRestockQty] = useState<Record<string, string>>({});
  const [moveType, setMoveType] = useState<StockMovementCreate['type']>('IN');
  const [moveQty, setMoveQty] = useState('');
  const [moveReason, setMoveReason] = useState('');
  const [error, setError] = useState<string | null>(null);

  const query = useQuery({
    queryKey: ['inventory', alert],
    queryFn: () => listInventory({ pageSize: 100, alert: alert || undefined }),
  });

  const movementsQ = useQuery({
    queryKey: ['inventory', expandedId, 'movements'],
    queryFn: () => listMovements(expandedId!),
    enabled: Boolean(expandedId),
  });

  const save = useMutation({
    mutationFn: async () => {
      const payload: InventoryCreate = {
        name: form.name!,
        category: form.category!,
        unit: form.unit!,
        currentStock: Number(form.currentStock),
        minimumStock: Number(form.minimumStock),
        unitCost: form.unitCost,
        expiryDate: form.expiryDate,
        supplier: form.supplier,
        batchLotNumber: form.batchLotNumber,
        notes: form.notes,
        withdrawalDaysMilk: form.withdrawalDaysMilk,
        withdrawalDaysMeat: form.withdrawalDaysMeat,
      };
      if (editingId) return updateInventory(editingId, payload);
      return createInventory(payload);
    },
    onSuccess: () => {
      setShowForm(false);
      setEditingId(null);
      setForm(emptyForm());
      setError(null);
      void qc.invalidateQueries({ queryKey: ['inventory'] });
    },
    onError: (err: Error) => setError(err.message),
  });

  const restock = useMutation({
    mutationFn: ({ id, quantity }: { id: string; quantity: number }) =>
      requestRestock(id, { quantity }),
    onSuccess: (_data, vars) => {
      setRestockQty((prev) => ({ ...prev, [vars.id]: '' }));
      void qc.invalidateQueries({ queryKey: ['inventory'] });
    },
  });

  const movementMut = useMutation({
    mutationFn: () =>
      addMovement(expandedId!, {
        type: moveType,
        quantity: Number(moveQty),
        reason: moveReason || undefined,
      }),
    onSuccess: () => {
      setMoveQty('');
      setMoveReason('');
      void qc.invalidateQueries({ queryKey: ['inventory'] });
    },
  });

  const startEdit = (row: InventoryDto) => {
    setEditingId(row.id);
    setShowForm(true);
    setForm({
      name: row.name,
      category: row.category as InventoryCreate['category'],
      unit: row.unit,
      currentStock: row.currentStock,
      minimumStock: row.minimumStock,
      unitCost: row.unitCost ?? undefined,
      expiryDate: row.expiryDate ? new Date(row.expiryDate) : undefined,
      supplier: row.supplier ?? undefined,
      batchLotNumber: row.batchLotNumber ?? undefined,
      notes: row.notes ?? undefined,
      withdrawalDaysMilk: row.withdrawalDaysMilk,
      withdrawalDaysMeat: row.withdrawalDaysMeat,
    });
  };

  const columns = useMemo<Column<InventoryDto>[]>(
    () => [
      { key: 'name', header: t('inventory.name'), render: (row) => row.name },
      { key: 'category', header: t('inventory.category'), render: (row) => row.category },
      {
        key: 'stock',
        header: t('inventory.stock'),
        render: (row) => `${row.currentStock} / ${row.minimumStock} ${row.unit}`,
      },
      {
        key: 'valuation',
        header: t('inventory.valuation'),
        render: (row) =>
          row.valuation != null ? formatNPR(row.valuation) : '—',
      },
      {
        key: 'alert',
        header: t('inventory.alert'),
        render: (row) => {
          const level =
            row.alertLevel ?? inventoryAlertLevel(row.currentStock, row.minimumStock);
          return <StatusChip status={level} />;
        },
      },
      {
        key: 'expiry',
        header: t('inventory.expiryDate'),
        render: (row) => (row.expiryDate ? formatDate(row.expiryDate) : '—'),
      },
      {
        key: 'actions',
        header: t('common.actions'),
        render: (row) => (
          <div className="page-actions">
            <button
              className="btn secondary"
              type="button"
              onClick={() =>
                setExpandedId((prev) => (prev === row.id ? null : row.id))
              }
            >
              {expandedId === row.id
                ? t('inventory.hideMovements')
                : t('inventory.movements')}
            </button>
            {can('inventory:write') && (
              <button className="btn secondary" type="button" onClick={() => startEdit(row)}>
                {t('common.edit')}
              </button>
            )}
            {can('inventory:restock-request') && (
              <>
                <input
                  type="number"
                  min="0.01"
                  step="0.01"
                  style={{ width: 88, minHeight: 36 }}
                  placeholder={t('inventory.qty')}
                  value={restockQty[row.id] ?? ''}
                  onChange={(e) =>
                    setRestockQty((prev) => ({ ...prev, [row.id]: e.target.value }))
                  }
                />
                <button
                  className="btn"
                  type="button"
                  disabled={restock.isPending || !restockQty[row.id]}
                  onClick={() =>
                    restock.mutate({
                      id: row.id,
                      quantity: Number(restockQty[row.id]),
                    })
                  }
                >
                  {t('inventory.restock')}
                </button>
              </>
            )}
          </div>
        ),
      },
    ],
    [t, can, restock.isPending, restockQty, expandedId],
  );

  const onSubmit = (e: FormEvent) => {
    e.preventDefault();
    if (!form.name?.trim() || !form.unit?.trim()) {
      setError(t('inventory.requiredFields'));
      return;
    }
    save.mutate();
  };

  return (
    <div>
      <div className="page-header">
        <div>
          <h1>{t('nav.inventory')}</h1>
          <p className="page-subtitle">{t('inventory.subtitle')}</p>
        </div>
        {can('inventory:write') && (
          <div className="page-actions">
            <button
              className="btn"
              type="button"
              onClick={() => {
                setEditingId(null);
                setForm(emptyForm());
                setShowForm((v) => !v);
              }}
            >
              {showForm && !editingId ? t('common.cancel') : t('inventory.add')}
            </button>
          </div>
        )}
      </div>

      <div className="toolbar">
        <div className="chip-row">
          <button
            type="button"
            className={`filter-chip ${alert === '' ? 'active' : ''}`}
            onClick={() => setAlert('')}
          >
            {t('common.filterAll')}
          </button>
          {INVENTORY_ALERT_LEVELS.map((level) => (
            <button
              key={level}
              type="button"
              className={`filter-chip ${alert === level ? 'active' : ''}`}
              onClick={() => setAlert(level)}
            >
              {level}
            </button>
          ))}
        </div>
      </div>

      {showForm && (
        <form className="card form-card" onSubmit={onSubmit} style={{ marginBottom: 24 }}>
          <h2>{editingId ? t('inventory.edit') : t('inventory.add')}</h2>
          <div className="form-grid">
            <div className="field">
              <label htmlFor="inv-name">{t('inventory.name')}</label>
              <input
                id="inv-name"
                required
                value={form.name ?? ''}
                onChange={(e) => setForm((prev) => ({ ...prev, name: e.target.value }))}
              />
            </div>
            <div className="field">
              <label htmlFor="inv-cat">{t('inventory.category')}</label>
              <select
                id="inv-cat"
                value={form.category}
                onChange={(e) =>
                  setForm((prev) => ({
                    ...prev,
                    category: e.target.value as InventoryCreate['category'],
                  }))
                }
              >
                {INVENTORY_CATEGORIES.map((c) => (
                  <option key={c} value={c}>
                    {c}
                  </option>
                ))}
              </select>
            </div>
            <div className="field">
              <label htmlFor="inv-unit">{t('inventory.unit')}</label>
              <input
                id="inv-unit"
                required
                value={form.unit ?? ''}
                onChange={(e) => setForm((prev) => ({ ...prev, unit: e.target.value }))}
              />
            </div>
            <div className="field">
              <label htmlFor="inv-stock">{t('inventory.currentStock')}</label>
              <input
                id="inv-stock"
                type="number"
                min="0"
                step="0.01"
                required
                value={form.currentStock ?? ''}
                onChange={(e) =>
                  setForm((prev) => ({
                    ...prev,
                    currentStock: e.target.value ? Number(e.target.value) : 0,
                  }))
                }
              />
            </div>
            <div className="field">
              <label htmlFor="inv-min">{t('inventory.minimumStock')}</label>
              <input
                id="inv-min"
                type="number"
                min="0"
                step="0.01"
                required
                value={form.minimumStock ?? ''}
                onChange={(e) =>
                  setForm((prev) => ({
                    ...prev,
                    minimumStock: e.target.value ? Number(e.target.value) : 0,
                  }))
                }
              />
            </div>
            <div className="field">
              <label htmlFor="inv-cost">{t('inventory.unitCost')}</label>
              <input
                id="inv-cost"
                type="number"
                min="0"
                step="0.01"
                value={form.unitCost ?? ''}
                onChange={(e) =>
                  setForm((prev) => ({
                    ...prev,
                    unitCost: e.target.value ? Number(e.target.value) : undefined,
                  }))
                }
              />
            </div>
            <div className="field">
              <label htmlFor="inv-wd-milk">{t('inventory.withdrawalDaysMilk')}</label>
              <input
                id="inv-wd-milk"
                type="number"
                min="0"
                max="90"
                value={form.withdrawalDaysMilk ?? 0}
                onChange={(e) =>
                  setForm((prev) => ({
                    ...prev,
                    withdrawalDaysMilk: e.target.value ? Number(e.target.value) : 0,
                  }))
                }
              />
            </div>
            <div className="field">
              <label htmlFor="inv-wd-meat">{t('inventory.withdrawalDaysMeat')}</label>
              <input
                id="inv-wd-meat"
                type="number"
                min="0"
                max="90"
                value={form.withdrawalDaysMeat ?? 0}
                onChange={(e) =>
                  setForm((prev) => ({
                    ...prev,
                    withdrawalDaysMeat: e.target.value ? Number(e.target.value) : 0,
                  }))
                }
              />
            </div>
            <div className="field">
              <label htmlFor="inv-supplier">{t('inventory.supplier')}</label>
              <input
                id="inv-supplier"
                value={form.supplier ?? ''}
                onChange={(e) =>
                  setForm((prev) => ({ ...prev, supplier: e.target.value || undefined }))
                }
              />
            </div>
          </div>
          {error && <p className="error-text">{error}</p>}
          <div className="page-actions">
            <button
              className="btn secondary"
              type="button"
              onClick={() => {
                setShowForm(false);
                setEditingId(null);
              }}
            >
              {t('common.cancel')}
            </button>
            <button className="btn" type="submit" disabled={save.isPending}>
              {t('common.save')}
            </button>
          </div>
        </form>
      )}

      {query.isLoading && <LoadingState />}
      {query.isError && <ErrorState onRetry={() => void query.refetch()} />}
      {query.data && (
        <>
          <p className="result-count">
            {t('common.resultCount', { count: query.data.total })}
          </p>
          <DataTable columns={columns} rows={query.data.items} rowKey={(r) => r.id} />
        </>
      )}

      {expandedId && (
        <div className="card" style={{ marginTop: 24 }}>
          <h2>{t('inventory.movements')}</h2>
          {can('inventory:write') && (
            <form
              className="inline-form"
              style={{ flexWrap: 'wrap', marginBottom: 16 }}
              onSubmit={(e) => {
                e.preventDefault();
                if (!moveQty || Number(moveQty) <= 0) return;
                movementMut.mutate();
              }}
            >
              <select
                value={moveType}
                onChange={(e) =>
                  setMoveType(e.target.value as StockMovementCreate['type'])
                }
                aria-label={t('inventory.movementType')}
              >
                {MOVEMENT_TYPES.map((type) => (
                  <option key={type} value={type}>
                    {type}
                  </option>
                ))}
              </select>
              <input
                type="number"
                min="0.01"
                step="0.01"
                placeholder={t('inventory.qty')}
                value={moveQty}
                onChange={(e) => setMoveQty(e.target.value)}
                required
              />
              <input
                placeholder={t('inventory.reason')}
                value={moveReason}
                onChange={(e) => setMoveReason(e.target.value)}
              />
              <button className="btn" type="submit" disabled={movementMut.isPending}>
                {t('inventory.addMovement')}
              </button>
            </form>
          )}
          {movementsQ.isLoading && <LoadingState />}
          {movementsQ.isError && (
            <ErrorState onRetry={() => void movementsQ.refetch()} />
          )}
          {movementsQ.data && movementsQ.data.length > 0 ? (
            <ul className="activity-list">
              {movementsQ.data.map((m) => (
                <li key={m.id}>
                  <div>
                    <strong>{m.type}</strong>
                    <span className="muted">
                      {' '}
                      · {m.quantity}
                      {m.reason ? ` · ${m.reason}` : ''}
                    </span>
                  </div>
                  <span className="muted">
                    {new Date(m.createdAt).toLocaleString()}
                  </span>
                </li>
              ))}
            </ul>
          ) : (
            !movementsQ.isLoading && <p className="muted">{t('common.empty')}</p>
          )}
        </div>
      )}
    </div>
  );
}

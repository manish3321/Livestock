import { useCallback, useEffect, useMemo, useState } from 'react';
import { Alert, FlatList, StyleSheet, View } from 'react-native';
import {
  APPROVAL_STATUSES,
  EXPENSE_CATEGORIES,
  formatNPR,
  type ApprovalStatus,
  type ExpenseBudgetUpsert,
  type ExpenseCategory,
  type RecurringExpenseCreate,
} from '@farm/contracts';
import { enqueueExpense } from '../core/scan-round';
import { AppShell } from '../components/AppShell';
import { ChipSelect, Field, FormActions } from '../components/forms';
import {
  Button,
  Card,
  ChipRow,
  EmptyState,
  ErrorText,
  FilterChip,
  ListRow,
  Muted,
  PageHeader,
  ScreenScroll,
  SectionTitle,
  StatusChip,
} from '../components/ui';
import { useLocale } from '../locale/LocaleProvider';
import { useFarm } from '../state/FarmProvider';
import { useAccess } from '../hooks/useAccess';
import { ApiError, type MobileExpense } from '../api/http-farm-api';
import { toQuery } from '../api/query';
import { space } from '../theme/tokens';

type Budget = { id: string; category?: string; amount?: number; spent?: number; actual?: number };
type Recurring = {
  id: string;
  category: string;
  amount: number;
  description: string;
  dayOfMonth?: number;
};

type Panel = 'list' | 'create' | 'budget' | 'recurring';

export function ExpensesScreen() {
  const { api, store, persist, syncNow, revision } = useFarm();
  const { t } = useLocale();
  const { can, commercial } = useAccess();
  const now = new Date();
  const [items, setItems] = useState<MobileExpense[]>([]);
  const [budgets, setBudgets] = useState<Budget[]>([]);
  const [recurring, setRecurring] = useState<Recurring[]>([]);
  const [panel, setPanel] = useState<Panel>('list');
  const [amount, setAmount] = useState('');
  const [description, setDescription] = useState('');
  const [supplier, setSupplier] = useState('');
  const [category, setCategory] = useState<ExpenseCategory>('FEED');
  const [status, setStatus] = useState<ApprovalStatus | ''>('');
  const [budgetYear, setBudgetYear] = useState(now.getFullYear());
  const [budgetMonth, setBudgetMonth] = useState(now.getMonth() + 1);
  const [budgetAmount, setBudgetAmount] = useState('');
  const [budgetCategory, setBudgetCategory] = useState<ExpenseCategory>('FEED');
  const [recAmount, setRecAmount] = useState('');
  const [recDesc, setRecDesc] = useState('');
  const [recCategory, setRecCategory] = useState<ExpenseCategory>('FEED');
  const [recDay, setRecDay] = useState('1');
  const [error, setError] = useState<string | null>(null);
  void revision;

  const load = useCallback(async () => {
    try {
      const [page, budgetRows, recurringRows] = await Promise.all([
        api.listExpenses(1),
        api
          .get<Budget[]>(
            `/v1/expenses/budgets${toQuery({ year: budgetYear, month: budgetMonth })}`,
          )
          .catch(() => []),
        api.get<Recurring[]>('/v1/expenses/recurring').catch(() => []),
      ]);
      setItems(page.items);
      setBudgets(Array.isArray(budgetRows) ? budgetRows : []);
      setRecurring(Array.isArray(recurringRows) ? recurringRows : []);
      setError(null);
    } catch {
      /* keep cached list */
    }
  }, [api, budgetMonth, budgetYear]);

  useEffect(() => {
    void load();
  }, [load, revision]);

  const filtered = useMemo(
    () => (status === '' ? items : items.filter((i) => String(i.status) === status)),
    [items, status],
  );

  const submit = async () => {
    const value = Number(amount);
    if (!description.trim() || !Number.isFinite(value) || value <= 0) {
      setError(t('expenses.requiredFields'));
      return;
    }
    const body = {
      category,
      amount: value,
      expenseDate: new Date(),
      description: description.trim(),
      supplier: supplier.trim() || undefined,
    };
    try {
      await api.createExpense(body);
      setAmount('');
      setDescription('');
      setSupplier('');
      setPanel('list');
      await load();
    } catch (err) {
      enqueueExpense(store, {
        ...body,
        expenseDate: new Date().toISOString(),
      });
      persist();
      void syncNow();
      if (err instanceof ApiError && err.status === 0) setError(t('native.offline'));
      else setError(err instanceof Error ? err.message : t('login.serverUnreachable'));
    }
  };

  const saveBudget = async () => {
    const value = Number(budgetAmount);
    if (!Number.isFinite(value) || value < 0) {
      setError(t('expenses.requiredFields'));
      return;
    }
    const body: ExpenseBudgetUpsert = {
      category: budgetCategory,
      year: budgetYear,
      month: budgetMonth,
      amount: value,
    };
    try {
      await api.put('/v1/expenses/budgets', body);
      await load();
      Alert.alert(t('expenses.budget'));
    } catch (err) {
      setError(err instanceof Error ? err.message : t('errors.generic'));
    }
  };

  const saveRecurring = async () => {
    const value = Number(recAmount);
    if (!recDesc.trim() || !Number.isFinite(value) || value <= 0) {
      setError(t('expenses.requiredFields'));
      return;
    }
    const body: RecurringExpenseCreate = {
      category: recCategory,
      amount: value,
      description: recDesc.trim(),
      dayOfMonth: Math.min(28, Math.max(1, Number(recDay) || 1)),
    };
    try {
      await api.post('/v1/expenses/recurring', body);
      setRecAmount('');
      setRecDesc('');
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : t('errors.generic'));
    }
  };

  const generateMonth = async () => {
    try {
      const result = await api.post<{ created: number }>('/v1/expenses/recurring/generate-month');
      Alert.alert(t('expenses.recurring'), `Created ${result.created ?? 0}`);
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : t('errors.generic'));
    }
  };

  const review = async (id: string, decision: 'APPROVE' | 'REJECT') => {
    try {
      await api.reviewExpense(id, { decision });
      await load();
    } catch (err) {
      if (err instanceof ApiError && err.status === 403) setError(t('native.escalateDenied'));
      else setError(err instanceof Error ? err.message : t('login.serverUnreachable'));
    }
  };

  const canReview = (row: MobileExpense) => {
    if (row.status === 'PENDING' && can('expenses:approve')) return true;
    if (row.status === 'ESCALATED' && can('expenses:approve-escalated')) return true;
    return false;
  };

  return (
    <AppShell module="expenses">
      <PageHeader
        title={t('nav.expenses')}
        subtitle={t('expenses.subtitle')}
        actions={
          can('expenses:submit') ? (
            <Button
              label={panel === 'create' ? t('common.cancel') : t('expenses.submit')}
              onPress={() => setPanel((p) => (p === 'create' ? 'list' : 'create'))}
            />
          ) : null
        }
      />
      <View style={styles.body}>
        {error ? <ErrorText message={error} /> : null}

        <ChipRow>
          <FilterChip label={t('common.filterAll')} active={panel === 'list' && status === ''} onPress={() => { setPanel('list'); setStatus(''); }} />
          {APPROVAL_STATUSES.map((s) => (
            <FilterChip key={s} label={s} active={panel === 'list' && status === s} onPress={() => { setPanel('list'); setStatus(s); }} />
          ))}
          {commercial ? (
            <>
              <FilterChip label={t('expenses.budget')} active={panel === 'budget'} onPress={() => setPanel('budget')} />
              <FilterChip
                label={t('expenses.recurring') !== 'expenses.recurring' ? t('expenses.recurring') : 'Recurring'}
                active={panel === 'recurring'}
                onPress={() => setPanel('recurring')}
              />
            </>
          ) : null}
        </ChipRow>

        {panel === 'budget' && commercial ? (
          <ScreenScroll>
            <Card>
              <SectionTitle>{t('expenses.budget')}</SectionTitle>
              <Muted>
                {budgetYear}-{String(budgetMonth).padStart(2, '0')}
              </Muted>
              <ChipRow>
                {[now.getFullYear(), now.getFullYear() - 1].map((y) => (
                  <FilterChip key={y} label={String(y)} active={budgetYear === y} onPress={() => setBudgetYear(y)} />
                ))}
              </ChipRow>
              <ChipRow>
                {Array.from({ length: 12 }, (_, i) => i + 1).map((m) => (
                  <FilterChip
                    key={m}
                    label={String(m)}
                    active={budgetMonth === m}
                    onPress={() => setBudgetMonth(m)}
                  />
                ))}
              </ChipRow>
              {budgets.map((b) => (
                <Muted key={b.id}>
                  {b.category}: {formatNPR(b.spent ?? b.actual ?? 0)} / {formatNPR(b.amount ?? 0)}
                </Muted>
              ))}
              {can('expenses:submit') || can('expenses:approve') ? (
                <>
                  <ChipSelect
                    label={t('expenses.category')}
                    options={[...EXPENSE_CATEGORIES]}
                    value={budgetCategory}
                    onChange={setBudgetCategory}
                  />
                  <Field
                    label={t('expenses.amount')}
                    value={budgetAmount}
                    onChangeText={setBudgetAmount}
                    keyboardType="decimal-pad"
                  />
                  <Button label={t('common.save')} onPress={() => void saveBudget()} />
                </>
              ) : null}
            </Card>
          </ScreenScroll>
        ) : null}

        {panel === 'recurring' && commercial ? (
          <ScreenScroll>
            <Card>
              <SectionTitle>
                {t('expenses.recurring') !== 'expenses.recurring' ? t('expenses.recurring') : 'Recurring'}
              </SectionTitle>
              {recurring.length === 0 ? <Muted>—</Muted> : null}
              {recurring.map((r) => (
                <ListRow
                  key={r.id}
                  title={`${r.category} · ${formatNPR(r.amount)}`}
                  subtitle={r.description}
                  meta={`Day ${r.dayOfMonth ?? 1}`}
                />
              ))}
              <Button label="Generate this month" onPress={() => void generateMonth()} variant="secondary" />
              <ChipSelect
                label={t('expenses.category')}
                options={[...EXPENSE_CATEGORIES]}
                value={recCategory}
                onChange={setRecCategory}
              />
              <Field label={t('expenses.amount')} value={recAmount} onChangeText={setRecAmount} keyboardType="decimal-pad" />
              <Field label={t('expenses.description')} value={recDesc} onChangeText={setRecDesc} />
              <Field label="Day of month" value={recDay} onChangeText={setRecDay} keyboardType="number-pad" />
              <FormActions>
                <Button label={t('common.save')} onPress={() => void saveRecurring()} />
              </FormActions>
            </Card>
          </ScreenScroll>
        ) : null}

        {panel === 'create' ? (
          <ScreenScroll>
            <Card>
              <ChipSelect
                label={t('expenses.category')}
                options={[...EXPENSE_CATEGORIES]}
                value={category}
                onChange={setCategory}
              />
              <Field
                label={t('expenses.amount')}
                value={amount}
                onChangeText={setAmount}
                keyboardType="decimal-pad"
              />
              <Field label={t('expenses.supplier')} value={supplier} onChangeText={setSupplier} />
              <Field
                label={t('expenses.description')}
                value={description}
                onChangeText={setDescription}
                multiline
              />
              <FormActions>
                <Button label={t('common.save')} onPress={() => void submit()} />
              </FormActions>
            </Card>
          </ScreenScroll>
        ) : null}

        {panel === 'list' ? (
          <FlatList
            data={filtered}
            keyExtractor={(item) => item.id}
            contentContainerStyle={styles.list}
            ListEmptyComponent={<EmptyState message={t('native.noExpenses')} />}
            renderItem={({ item }) => (
              <View style={styles.row}>
                <ListRow
                  title={`${item.category} · ${formatNPR(item.amount)}`}
                  subtitle={item.description}
                />
                <StatusChip status={String(item.status)} />
                {canReview(item) ? (
                  <ChipRow>
                    <Button
                      label={t('expenses.approve')}
                      onPress={() => void review(item.id, 'APPROVE')}
                    />
                    <Button
                      label={t('expenses.reject')}
                      variant="danger"
                      onPress={() => void review(item.id, 'REJECT')}
                    />
                  </ChipRow>
                ) : null}
              </View>
            )}
          />
        ) : null}
      </View>
    </AppShell>
  );
}

const styles = StyleSheet.create({
  body: { flex: 1, paddingHorizontal: 16 },
  list: { paddingBottom: 48 },
  row: { marginBottom: space.sm, gap: 8 },
});

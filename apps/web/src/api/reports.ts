import type { ReportQuery } from '@farm/contracts';
import { api, getAccessToken } from './client';
import { toQuery } from './query';

export type ReportSummary = Record<string, unknown>;

export function getFarmOverview(query: Partial<ReportQuery> = {}): Promise<ReportSummary> {
  return api(`/v1/reports/farm-overview${toQuery(query)}`);
}

export function getAnimalInventoryReport(
  query: Partial<ReportQuery> = {},
): Promise<ReportSummary> {
  return api(`/v1/reports/animal-inventory${toQuery(query)}`);
}

export function getHealthSummary(query: Partial<ReportQuery> = {}): Promise<ReportSummary> {
  return api(`/v1/reports/health-summary${toQuery(query)}`);
}

export async function downloadAnimalInventoryCsv(
  query: Partial<ReportQuery> = {},
): Promise<void> {
  const token = getAccessToken();
  const res = await fetch(`/v1/reports/animal-inventory.csv${toQuery(query)}`, {
    headers: token ? { authorization: `Bearer ${token}` } : {},
  });
  if (!res.ok) throw new Error('Export failed');
  const blob = await res.blob();
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `animal-inventory-${new Date().toISOString().slice(0, 10)}.csv`;
  a.click();
  URL.revokeObjectURL(url);
}

export function getPeriodReport(
  kind: 'daily' | 'weekly' | 'quarterly' | 'annual',
  date?: Date,
): Promise<ReportSummary> {
  return api(`/v1/reports/period${toQuery({ kind, date })}`);
}

export function getDailyReport(date?: string): Promise<ReportSummary> {
  return api(`/v1/reports/daily${toQuery({ date })}`);
}

export function getMonthlyReport(year: number, month: number): Promise<ReportSummary> {
  return api(`/v1/reports/monthly${toQuery({ year, month })}`);
}

export function getCooperativeReport(from?: string, to?: string): Promise<ReportSummary> {
  return api(`/v1/reports/cooperative${toQuery({ from, to })}`);
}

export function getVaccinationProof(from?: string, to?: string, disease?: string): Promise<ReportSummary> {
  return api(`/v1/reports/vaccination-proof${toQuery({ from, to, disease })}`);
}

export function getInsuranceClaim(animalId: string): Promise<ReportSummary> {
  return api(`/v1/reports/insurance-claim${toQuery({ animalId })}`);
}

export function getVetHistory(animalId: string): Promise<ReportSummary> {
  return api(`/v1/reports/vet-history/${animalId}`);
}

export async function downloadPeriodCsv(
  kind: 'daily' | 'weekly' | 'quarterly' | 'annual',
): Promise<void> {
  const token = getAccessToken();
  const res = await fetch(`/v1/reports/period.csv${toQuery({ kind })}`, {
    headers: token ? { authorization: `Bearer ${token}` } : {},
  });
  if (!res.ok) throw new Error('Export failed');
  const blob = await res.blob();
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `period-${kind}-${new Date().toISOString().slice(0, 10)}.csv`;
  a.click();
  URL.revokeObjectURL(url);
}

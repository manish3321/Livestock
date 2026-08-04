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

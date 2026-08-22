import type {
  BatchEconomicsDto,
  BatchFeedCreate,
  BatchHarvestCreate,
  BatchIllnessCreate,
  BatchMortalityCreate,
  BatchSamplingCreate,
  BatchWaterQualityCreate,
  HerdBatchCreate,
  HerdBatchListQuery,
  HerdBatchUpdate,
  HerdMonthlyReportQuery,
  PageResult,
} from '@farm/contracts';
import { api } from './client';
import { toQuery } from './query';

export interface HerdBatchDto {
  id: string;
  farmId: string;
  kind: string;
  category: string;
  name: string;
  ageFromMonths: number | null;
  ageToMonths: number | null;
  initialCount: number;
  currentCount: number;
  deadCount: number;
  sickCount: number;
  sickByCondition: Record<string, number>;
  notes: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface IllnessDto {
  id: string;
  batchId: string;
  condition: string;
  count: number;
  occurredAt: string;
  resolvedAt: string | null;
  notes: string | null;
  createdAt: string;
}

export interface MortalityDto {
  id: string;
  batchId: string;
  count: number;
  reason: string | null;
  occurredAt: string;
  createdAt: string;
}

export interface WaterQualityDto {
  id: string;
  batchId: string;
  recordedAt: string;
  temperatureC: number | null;
  ph: number | null;
  dissolvedO2: number | null;
  notes: string | null;
  createdAt: string;
}

export interface SamplingDto {
  id: string;
  batchId: string;
  sampledAt: string;
  sampleCount: number;
  totalWeightGrams: number;
  estimatedCount: number;
  avgWeightGrams: number;
  notes: string | null;
  createdAt: string;
}

export interface HarvestDto {
  id: string;
  batchId: string;
  quantityKg: number;
  fishCount: number | null;
  quality: string | null;
  occurredAt: string;
  notes: string | null;
  createdAt: string;
}

export interface FeedDto {
  id: string;
  batchId: string;
  quantityKg: number;
  feedType: string | null;
  inventoryItemId: string | null;
  occurredAt: string;
  notes: string | null;
  createdAt: string;
}

export function listBatches(
  query: Partial<HerdBatchListQuery> = {},
): Promise<PageResult<HerdBatchDto>> {
  return api(`/v1/batches${toQuery(query)}`);
}

export function getBatch(id: string): Promise<HerdBatchDto> {
  return api(`/v1/batches/${id}`);
}

export function getBatchEconomics(id: string): Promise<BatchEconomicsDto> {
  return api(`/v1/batches/${id}/economics`);
}

export function createBatch(body: HerdBatchCreate): Promise<HerdBatchDto> {
  return api('/v1/batches', { method: 'POST', body: JSON.stringify(body) });
}

export function updateBatch(id: string, body: HerdBatchUpdate): Promise<HerdBatchDto> {
  return api(`/v1/batches/${id}`, { method: 'PATCH', body: JSON.stringify(body) });
}

export function deleteBatch(id: string): Promise<void> {
  return api(`/v1/batches/${id}`, { method: 'DELETE' });
}

export function listIllness(batchId: string): Promise<IllnessDto[]> {
  return api(`/v1/batches/${batchId}/illness`);
}

export function addIllness(batchId: string, body: BatchIllnessCreate): Promise<IllnessDto> {
  return api(`/v1/batches/${batchId}/illness`, {
    method: 'POST',
    body: JSON.stringify(body),
  });
}

export function listMortality(batchId: string): Promise<MortalityDto[]> {
  return api(`/v1/batches/${batchId}/mortality`);
}

export function addMortality(
  batchId: string,
  body: BatchMortalityCreate,
): Promise<MortalityDto> {
  return api(`/v1/batches/${batchId}/mortality`, {
    method: 'POST',
    body: JSON.stringify(body),
  });
}

export function listWaterQuality(batchId: string): Promise<WaterQualityDto[]> {
  return api(`/v1/batches/${batchId}/water-quality`);
}

export function addWaterQuality(
  batchId: string,
  body: BatchWaterQualityCreate,
): Promise<WaterQualityDto> {
  return api(`/v1/batches/${batchId}/water-quality`, {
    method: 'POST',
    body: JSON.stringify(body),
  });
}

export function listSampling(batchId: string): Promise<SamplingDto[]> {
  return api(`/v1/batches/${batchId}/sampling`);
}

export function addSampling(
  batchId: string,
  body: BatchSamplingCreate,
): Promise<SamplingDto> {
  return api(`/v1/batches/${batchId}/sampling`, {
    method: 'POST',
    body: JSON.stringify(body),
  });
}

export function listHarvest(batchId: string): Promise<HarvestDto[]> {
  return api(`/v1/batches/${batchId}/harvest`);
}

export function addHarvest(
  batchId: string,
  body: BatchHarvestCreate,
): Promise<HarvestDto> {
  return api(`/v1/batches/${batchId}/harvest`, {
    method: 'POST',
    body: JSON.stringify(body),
  });
}

export function listFeed(batchId: string): Promise<FeedDto[]> {
  return api(`/v1/batches/${batchId}/feed`);
}

export function addFeed(batchId: string, body: BatchFeedCreate): Promise<FeedDto> {
  return api(`/v1/batches/${batchId}/feed`, {
    method: 'POST',
    body: JSON.stringify(body),
  });
}

export interface HerdMonthlyReport {
  year: number;
  month: number;
  kind: string;
  totals: {
    batches: number;
    currentHeadcount: number;
    deadTotal: number;
    diedThisMonth: number;
    sickLoggedThisMonth: number;
  };
  rows: Array<{
    id: string;
    kind: string;
    category: string;
    name: string;
    ageFromMonths: number | null;
    ageToMonths: number | null;
    initialCount: number;
    currentCount: number;
    deadCount: number;
    diedThisMonth: number;
    sickLoggedThisMonth: number;
    sickByCondition: Record<string, number>;
  }>;
}

export function getHerdMonthly(
  query: HerdMonthlyReportQuery,
): Promise<HerdMonthlyReport> {
  return api(`/v1/reports/herd-monthly${toQuery(query)}`);
}

export async function downloadHerdMonthlyCsv(
  query: HerdMonthlyReportQuery,
): Promise<void> {
  const { getAccessToken } = await import('./client');
  const token = getAccessToken();
  const res = await fetch(`/v1/reports/herd-monthly.csv${toQuery(query)}`, {
    headers: token ? { authorization: `Bearer ${token}` } : {},
  });
  if (!res.ok) throw new Error('Download failed');
  const blob = await res.blob();
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `herd-monthly-${query.year}-${String(query.month).padStart(2, '0')}.csv`;
  a.click();
  URL.revokeObjectURL(url);
}

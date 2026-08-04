import type {
  FishBatchCreate,
  FishSamplingCreate,
  PageResult,
  WaterQualityCreate,
} from '@farm/contracts';
import { api } from './client';
import { toQuery } from './query';

export interface FishBatchDto {
  id: string;
  farmId: string;
  name: string;
  species: string;
  stockingDate: string;
  estimatedCount: number;
  avgWeightGrams: number;
  ageDays: number;
  notes: string | null;
  harvestedAt: string | null;
  createdAt: string;
  updatedAt: string;
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

export interface FishSamplingDto {
  id: string;
  batchId: string;
  sampledAt: string;
  sampleCount: number;
  totalWeightGrams: number;
  avgWeightGrams: number;
  estimatedCount: number | null;
  notes: string | null;
  createdAt: string;
}

export interface FishBatchDetailDto extends FishBatchDto {
  waterQuality: WaterQualityDto[];
  samplings: FishSamplingDto[];
}

export function listFish(
  query: { page?: number; pageSize?: number } = {},
): Promise<PageResult<FishBatchDto>> {
  return api(`/v1/fish${toQuery(query)}`);
}

export function getFish(id: string): Promise<FishBatchDetailDto> {
  return api(`/v1/fish/${id}`);
}

export function createFish(body: FishBatchCreate): Promise<FishBatchDto> {
  return api('/v1/fish', { method: 'POST', body: JSON.stringify(body) });
}

export function addSampling(id: string, body: FishSamplingCreate): Promise<FishSamplingDto> {
  return api(`/v1/fish/${id}/sampling`, {
    method: 'POST',
    body: JSON.stringify(body),
  });
}

export function addWaterQuality(
  id: string,
  body: WaterQualityCreate,
): Promise<WaterQualityDto> {
  return api(`/v1/fish/${id}/water-quality`, {
    method: 'POST',
    body: JSON.stringify(body),
  });
}

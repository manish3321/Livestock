import type { PageResult, ProductionCreate, ProductionListQuery } from '@farm/contracts';
import { api } from './client';
import { toQuery } from './query';

export interface ProductionDto {
  id: string;
  farmId: string;
  type: 'MILK' | 'EGGS' | 'FISH';
  entryDate: string;
  quantity: number;
  unit: string;
  quality: string | null;
  animalId: string | null;
  groupId: string | null;
  batchId: string | null;
  herdBatchId?: string | null;
  animalTag?: string | null;
  animalName?: string | null;
  herdBatchName?: string | null;
  notes: string | null;
  createdAt: string;
  updatedAt: string;
}

export function listProduction(
  query: Partial<ProductionListQuery> = {},
): Promise<PageResult<ProductionDto>> {
  return api(`/v1/production${toQuery(query)}`);
}

export function createProduction(body: ProductionCreate): Promise<ProductionDto> {
  return api('/v1/production', { method: 'POST', body: JSON.stringify(body) });
}

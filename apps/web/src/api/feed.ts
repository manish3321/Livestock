import type { FeedCreate, FeedListQuery, PageResult } from '@farm/contracts';
import { api } from './client';
import { toQuery } from './query';

export interface FeedLogDto {
  id: string;
  farmId: string;
  animalId: string | null;
  herdBatchId: string | null;
  animalTag: string | null;
  herdBatchName: string | null;
  feedType: string;
  quantityKg: number;
  costPerKg: number | null;
  totalCost: number | null;
  condition: string | null;
  accepted: boolean;
  inventoryItemId: string | null;
  occurredAt: string;
  notes: string | null;
  createdAt: string;
}

export interface FeedFcrDto {
  feedCost: number;
  milkLiters: number;
  eggCount: number;
  fishKg: number;
  feedCostPerLiter: number | null;
  feedCostPerDozen: number | null;
  feedCostPerKgFish: number | null;
  season: {
    key: string;
    label: string;
    warning: string | null;
  };
}

export function listFeed(query: Partial<FeedListQuery> = {}): Promise<PageResult<FeedLogDto>> {
  return api(`/v1/feed${toQuery(query)}`);
}

export function createFeed(body: FeedCreate): Promise<FeedLogDto> {
  return api('/v1/feed', { method: 'POST', body: JSON.stringify(body) });
}

export function getFeedFcr(): Promise<FeedFcrDto> {
  return api('/v1/feed/fcr');
}

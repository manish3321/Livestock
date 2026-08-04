import type { BreedingCreate, BreedingUpdate, PageResult } from '@farm/contracts';
import { api } from './client';
import { toQuery } from './query';

export interface BreedingDto {
  id: string;
  farmId: string;
  motherId: string;
  motherTag?: string | null;
  matingType: string;
  fatherTagOrAi: string | null;
  matingDate: string;
  dueDate: string;
  pregnancyStatus: string;
  birthDate: string | null;
  offspringTag: string | null;
  notes: string | null;
  daysRemaining: number | null;
  createdAt: string;
  updatedAt: string;
}

export function listBreeding(
  query: { page?: number; pageSize?: number } = {},
): Promise<PageResult<BreedingDto>> {
  return api(`/v1/breeding${toQuery(query)}`);
}

export function createBreeding(body: BreedingCreate): Promise<BreedingDto> {
  return api('/v1/breeding', { method: 'POST', body: JSON.stringify(body) });
}

export function updateBreeding(id: string, body: BreedingUpdate): Promise<BreedingDto> {
  return api(`/v1/breeding/${id}`, { method: 'PATCH', body: JSON.stringify(body) });
}

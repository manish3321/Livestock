import type {
  BreedingCreate,
  BreedingListQuery,
  BreedingUpdate,
  PageResult,
} from '@farm/contracts';
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
  offspringAnimalId?: string | null;
  calvingDifficulty?: string | null;
  colostrumFed?: boolean | null;
  colostrumWithin4h?: boolean | null;
  colostrumLiters?: number | null;
  notes: string | null;
  daysRemaining: number | null;
  daysOpen?: number | null;
  calvingIntervalDays?: number | null;
  repeatBreeder?: boolean;
  createdAt: string;
  updatedAt: string;
}

export function listBreeding(
  query: Partial<BreedingListQuery> = {},
): Promise<PageResult<BreedingDto>> {
  return api(`/v1/breeding${toQuery(query)}`);
}

export function createBreeding(body: BreedingCreate): Promise<BreedingDto> {
  return api('/v1/breeding', { method: 'POST', body: JSON.stringify(body) });
}

export function updateBreeding(id: string, body: BreedingUpdate): Promise<BreedingDto> {
  return api(`/v1/breeding/${id}`, { method: 'PATCH', body: JSON.stringify(body) });
}

export interface HeatLogDto {
  id: string;
  animalId: string;
  animalTag: string | null;
  observedAt: string;
  intensity: string;
  observerName: string | null;
  signs: string | null;
  notes: string | null;
  createdAt: string;
}

export function listHeat(animalId?: string): Promise<PageResult<HeatLogDto>> {
  return api(`/v1/breeding/heat${toQuery({ pageSize: 50, animalId })}`);
}

export function createHeat(body: import('@farm/contracts').HeatCreate): Promise<HeatLogDto> {
  return api('/v1/breeding/heat', { method: 'POST', body: JSON.stringify(body) });
}

import type { SpeciesConfigDto } from '@farm/contracts';
import { api } from './client';

export function listSpeciesConfig(): Promise<SpeciesConfigDto[]> {
  return api('/v1/species-config');
}

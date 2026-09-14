import type { FarmWithholdDto } from '@farm/contracts';
import { api } from './client';

export function listActiveWithholds(): Promise<FarmWithholdDto[]> {
  return api('/v1/withholds/active');
}

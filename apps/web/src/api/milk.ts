import type {
  AnimalProfitDto,
  EffectivePriceDto,
  MilkDestination,
  MilkRecord,
  MilkRoundDto,
  MilkRoundStart,
  MilkSession,
  MilkSkip,
  TankUpdate,
} from '@farm/contracts';
import { api } from './client';

export function startMilkRound(body: MilkRoundStart): Promise<MilkRoundDto> {
  return api('/v1/milk/rounds', { method: 'POST', body: JSON.stringify(body) });
}

export function getMilkRound(id: string): Promise<MilkRoundDto> {
  return api(`/v1/milk/rounds/${id}`);
}

export function recordMilk(roundId: string, body: MilkRecord): Promise<MilkRoundDto> {
  return api(`/v1/milk/rounds/${roundId}/record`, {
    method: 'POST',
    body: JSON.stringify(body),
  });
}

export function skipMilk(roundId: string, body: MilkSkip): Promise<MilkRoundDto> {
  return api(`/v1/milk/rounds/${roundId}/skip`, {
    method: 'POST',
    body: JSON.stringify(body),
  });
}

export function finishMilkRound(roundId: string): Promise<MilkRoundDto> {
  return api(`/v1/milk/rounds/${roundId}/finish`, { method: 'POST' });
}

export function updateTank(roundId: string, body: TankUpdate): Promise<MilkRoundDto> {
  return api(`/v1/milk/rounds/${roundId}/tank`, {
    method: 'PATCH',
    body: JSON.stringify(body),
  });
}

export function lookupHerd(q: string): Promise<
  Array<{
    id: string;
    herdNumber: string | null;
    tag: string;
    name: string | null;
    species: string;
    shed: string | null;
    photoUrl: string | null;
    status: string;
  }>
> {
  return api(`/v1/milk/lookup?q=${encodeURIComponent(q)}`);
}

export function dailySheet() {
  return api<import('@farm/contracts').DailySheetRow[]>('/v1/milk/daily-sheet');
}

export function profitRanking(): Promise<AnimalProfitDto[]> {
  return api('/v1/milk/profit');
}

export function effectivePrice(): Promise<EffectivePriceDto> {
  return api('/v1/milk/effective-price');
}

export function recordDelivery(
  roundId: string,
  body: import('@farm/contracts').DeliveryCreate,
) {
  return api(`/v1/milk/rounds/${roundId}/delivery`, {
    method: 'POST',
    body: JSON.stringify(body),
  });
}

export function recordPayment(body: import('@farm/contracts').PaymentStatementCreate) {
  return api('/v1/milk/payments', { method: 'POST', body: JSON.stringify(body) });
}

export type { MilkDestination, MilkSession };

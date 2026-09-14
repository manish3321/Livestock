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
import { api, getAccessToken } from './client';

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

export async function uploadDeliveryReceipt(roundId: string, file: File) {
  const token = getAccessToken();
  const form = new FormData();
  form.append('file', file);
  const res = await fetch(`/v1/milk/rounds/${roundId}/delivery/receipt`, {
    method: 'POST',
    headers: token ? { authorization: `Bearer ${token}` } : {},
    body: form,
  });
  if (!res.ok) {
    let message = res.statusText;
    try {
      const err = (await res.json()) as { message?: string };
      if (err.message) message = err.message;
    } catch {
      /* ignore */
    }
    throw new Error(message || 'Upload failed');
  }
  return res.json();
}

export function recordPayment(body: import('@farm/contracts').PaymentStatementCreate) {
  return api('/v1/milk/payments', { method: 'POST', body: JSON.stringify(body) });
}

export type { MilkDestination, MilkSession };

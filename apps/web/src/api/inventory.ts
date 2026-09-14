import type {
  InventoryAlertLevel,
  InventoryCreate,
  InventoryUpdate,
  PageResult,
  RestockCreate,
  StockMovementCreate,
} from '@farm/contracts';
import { api } from './client';
import { toQuery } from './query';

export interface InventoryDto {
  id: string;
  farmId: string;
  name: string;
  category: string;
  unit: string;
  currentStock: number;
  minimumStock: number;
  unitCost?: number | null;
  valuation?: number;
  alertLevel: InventoryAlertLevel;
  expiryDate: string | null;
  supplier: string | null;
  batchLotNumber: string | null;
  notes: string | null;
  withdrawalDaysMilk?: number;
  withdrawalDaysMeat?: number;
  createdAt: string;
  updatedAt: string;
}

export interface RestockRequestDto {
  id: string;
  itemId: string;
  quantity: number;
  status: string;
  notes: string | null;
  createdAt: string;
}

export interface StockMovementDto {
  id: string;
  farmId: string;
  itemId: string;
  type: string;
  quantity: number;
  reason: string | null;
  userId: string;
  createdAt: string;
}

export function listInventory(
  query: { page?: number; pageSize?: number; alert?: InventoryAlertLevel } = {},
): Promise<PageResult<InventoryDto>> {
  return api(`/v1/inventory${toQuery(query)}`);
}

export function createInventory(body: InventoryCreate): Promise<InventoryDto> {
  return api('/v1/inventory', { method: 'POST', body: JSON.stringify(body) });
}

export function updateInventory(id: string, body: InventoryUpdate): Promise<InventoryDto> {
  return api(`/v1/inventory/${id}`, { method: 'PATCH', body: JSON.stringify(body) });
}

export function requestRestock(id: string, body: RestockCreate): Promise<RestockRequestDto> {
  return api(`/v1/inventory/${id}/restock`, {
    method: 'POST',
    body: JSON.stringify(body),
  });
}

export function listMovements(id: string): Promise<StockMovementDto[]> {
  return api(`/v1/inventory/${id}/movements`);
}

export function addMovement(
  id: string,
  body: StockMovementCreate,
): Promise<StockMovementDto> {
  return api(`/v1/inventory/${id}/movements`, {
    method: 'POST',
    body: JSON.stringify(body),
  });
}

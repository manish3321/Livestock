/**
 * Edits and deletes of farm records that need admin/manager approval when made by
 * anyone without `changes:approve`. Anything not listed (task workflow, own profile,
 * shed tank readings, farm settings) is applied as before.
 */
export interface ApprovalTarget {
  entityType: string;
  entityId: string;
  /** Prisma delegate used to snapshot the record before the change. */
  model: string;
}

const UUID = '([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})';

const RULES: Array<{ pattern: RegExp; entityType: string; model: string; idGroup?: number }> = [
  { pattern: new RegExp(`^/v1/animals/${UUID}/weights/${UUID}$`, 'i'), entityType: 'weight', model: 'weightRecord', idGroup: 2 },
  { pattern: new RegExp(`^/v1/animals/${UUID}$`, 'i'), entityType: 'animal', model: 'animal' },
  { pattern: new RegExp(`^/v1/health-records/${UUID}$`, 'i'), entityType: 'health-record', model: 'healthRecord' },
  { pattern: new RegExp(`^/v1/breeding/heat/${UUID}$`, 'i'), entityType: 'heat', model: 'heatLog' },
  { pattern: new RegExp(`^/v1/breeding/${UUID}$`, 'i'), entityType: 'breeding', model: 'breedingRecord' },
  { pattern: new RegExp(`^/v1/inventory/${UUID}$`, 'i'), entityType: 'inventory', model: 'inventoryItem' },
  { pattern: new RegExp(`^/v1/groups/${UUID}$`, 'i'), entityType: 'group', model: 'animalGroup' },
  { pattern: new RegExp(`^/v1/fish/${UUID}$`, 'i'), entityType: 'fish-batch', model: 'fishBatch' },
  { pattern: new RegExp(`^/v1/batches/${UUID}$`, 'i'), entityType: 'batch', model: 'herdBatch' },
  { pattern: new RegExp(`^/v1/revenue/${UUID}$`, 'i'), entityType: 'revenue', model: 'revenue' },
  { pattern: new RegExp(`^/v1/milk/${UUID}$`, 'i'), entityType: 'milk-entry', model: 'productionEntry' },
];

const EDIT_METHODS = new Set(['PATCH', 'PUT', 'DELETE']);

export function approvalTarget(method: string, url: string): ApprovalTarget | null {
  if (!EDIT_METHODS.has(method.toUpperCase())) return null;
  const path = url.split('?')[0]!.replace(/\/+$/, '');
  for (const rule of RULES) {
    const match = rule.pattern.exec(path);
    if (match) {
      return { entityType: rule.entityType, model: rule.model, entityId: match[rule.idGroup ?? 1]! };
    }
  }
  return null;
}

/** Fields worth showing as the record's name in the approval list. */
export function entityLabel(before: Record<string, unknown> | null): string | null {
  if (!before) return null;
  for (const key of ['herdNumber', 'tag', 'name', 'title', 'invoiceNumber', 'description']) {
    const v = before[key];
    if (typeof v === 'string' && v.trim()) return v;
  }
  return null;
}

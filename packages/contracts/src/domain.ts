import { z } from 'zod';

/**
 * Domain enums and schemas shared by all modules.
 * Animals Management is the first fully implemented vertical slice;
 * the remaining enums are module-ready so later slices reuse one vocabulary.
 */

export const SPECIES = ['BUFFALO', 'COW', 'PIG', 'GOAT'] as const;
export type Species = (typeof SPECIES)[number];

/** Tag prefixes used to build unique tags like BUF001. */
export const SPECIES_TAG_PREFIX: Record<Species, string> = {
  BUFFALO: 'BUF',
  COW: 'COW',
  PIG: 'PIG',
  GOAT: 'GOT',
};

export const SPECIES_LABEL: Record<Species, string> = {
  BUFFALO: 'Buffalo',
  COW: 'Cow',
  PIG: 'Pig',
  GOAT: 'Goat',
};

export const ANIMAL_STATUSES = ['ACTIVE', 'PREGNANT', 'SICK', 'QUARANTINE'] as const;
export type AnimalStatus = (typeof ANIMAL_STATUSES)[number];

export const ANIMAL_STATUS_LABEL: Record<AnimalStatus, string> = {
  ACTIVE: 'Active',
  PREGNANT: 'Pregnant',
  SICK: 'Sick',
  QUARANTINE: 'Quarantine',
};

export const GENDERS = ['FEMALE', 'MALE'] as const;
export type Gender = (typeof GENDERS)[number];

export const ANIMAL_SOURCES = ['PURCHASED', 'BORN', 'TRANSFERRED'] as const;
export type AnimalSource = (typeof ANIMAL_SOURCES)[number];

export const animalCreateSchema = z.object({
  tag: z.string().regex(/^[A-Z]{3}\d{3,5}$/, 'Tag must look like BUF001'),
  name: z.string().max(80).optional(),
  species: z.enum(SPECIES),
  breed: z.string().min(1).max(80),
  dateOfBirth: z.coerce.date().optional(),
  gender: z.enum(GENDERS),
  color: z.string().max(60).optional(),
  source: z.enum(ANIMAL_SOURCES).optional(),
  motherTag: z.string().max(20).optional(),
  purchaseDate: z.coerce.date().optional(),
  purchaseCost: z.number().nonnegative().optional(),
  /** Initial weight in kg when creating; stored as first weight history entry. */
  initialWeightKg: z.number().positive().max(5000).optional(),
  status: z.enum(ANIMAL_STATUSES).default('ACTIVE'),
  /** When true, animal can be used as a breeding parent. */
  breedingStock: z.boolean().optional(),
  notes: z.string().max(2000).optional(),
});
export type AnimalCreate = z.infer<typeof animalCreateSchema>;

export const animalUpdateSchema = animalCreateSchema
  .omit({ initialWeightKg: true })
  .partial();
export type AnimalUpdate = z.infer<typeof animalUpdateSchema>;

export const animalListQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(200).default(25),
  sort: z
    .enum(['tag', 'species', 'status', 'breed', 'createdAt', 'updatedAt'])
    .default('tag'),
  order: z.enum(['asc', 'desc']).default('asc'),
  q: z.string().max(80).optional(),
  species: z.enum(SPECIES).optional(),
  status: z.enum(ANIMAL_STATUSES).optional(),
  gender: z.enum(GENDERS).optional(),
});
export type AnimalListQuery = z.infer<typeof animalListQuerySchema>;

export interface WeightRecordDto {
  id: string;
  animalId: string;
  weightKg: number;
  recordedAt: string;
  notes: string | null;
  createdAt: string;
}

export interface AnimalDto {
  id: string;
  farmId: string;
  tag: string;
  name: string | null;
  species: Species;
  breed: string;
  dateOfBirth: string | null;
  gender: Gender;
  color: string | null;
  source: AnimalSource | null;
  motherTag: string | null;
  purchaseDate: string | null;
  purchaseCost: number | null;
  status: AnimalStatus;
  breedingStock: boolean;
  notes: string | null;
  /** Latest weight from history, if any. */
  currentWeightKg: number | null;
  version: number;
  createdAt: string;
  updatedAt: string;
  deletedAt: string | null;
}

export interface AnimalDetailDto extends AnimalDto {
  weights: WeightRecordDto[];
}

/** Invested vs earned summary for an animal (QR / detail economics). */
export interface AnimalEconomicsDto {
  animalId: string;
  tag: string;
  name: string | null;
  species: Species;
  breedingStock: boolean;
  purchaseCost: number;
  expenseTotal: number;
  healthCostTotal: number;
  investedTotal: number;
  revenueTotal: number;
  earnedTotal: number;
  net: number;
  expenseCount: number;
  revenueCount: number;
  healthCount: number;
}

export interface BatchEconomicsDto {
  batchId: string;
  name: string;
  kind: string;
  category: string;
  currentCount: number;
  expenseTotal: number;
  healthCostTotal: number;
  investedTotal: number;
  revenueTotal: number;
  earnedTotal: number;
  net: number;
  expenseCount: number;
  revenueCount: number;
  healthCount: number;
}

export const weightCreateSchema = z.object({
  weightKg: z.number().positive().max(5000),
  recordedAt: z.coerce.date().default(() => new Date()),
  notes: z.string().max(500).optional(),
});
export type WeightCreate = z.infer<typeof weightCreateSchema>;

// ---------------------------------------------------------------------------
// Module-ready vocabulary (used by later vertical slices)
// ---------------------------------------------------------------------------

export const EXPENSE_CATEGORIES = [
  'FEED',
  'MEDICINE',
  'LABOR',
  'INFRASTRUCTURE',
  'EQUIPMENT',
  'TRANSPORT',
  'MARKETING',
  'ADMIN',
  'MISC',
  'EMERGENCY',
] as const;
export type ExpenseCategory = (typeof EXPENSE_CATEGORIES)[number];

export const APPROVAL_STATUSES = [
  'PENDING',
  'APPROVED',
  'REJECTED',
  'ESCALATED',
] as const;
export type ApprovalStatus = (typeof APPROVAL_STATUSES)[number];

export const PAYMENT_STATUSES = ['PAID', 'PENDING', 'PARTIAL'] as const;
export type PaymentStatus = (typeof PAYMENT_STATUSES)[number];

export const REVENUE_SOURCES = ['MILK', 'EGGS', 'FISH', 'MEAT'] as const;
export type RevenueSource = (typeof REVENUE_SOURCES)[number];

export const INVENTORY_ALERT_LEVELS = ['CRITICAL', 'LOW', 'GOOD'] as const;
export type InventoryAlertLevel = (typeof INVENTORY_ALERT_LEVELS)[number];

export const HEALTH_RECORD_TYPES = [
  'VACCINATION',
  'TREATMENT',
  'DEWORMING',
  'CHECKUP',
  'SURGERY',
] as const;
export type HealthRecordType = (typeof HEALTH_RECORD_TYPES)[number];

export const QUALITY_GRADES_MILK_EGGS = ['A', 'B', 'C'] as const;
export const QUALITY_GRADES_FISH = ['PREMIUM', 'STANDARD'] as const;

/** Gestation length in days, used to auto-calculate breeding due dates. */
export const GESTATION_DAYS: Record<Species, number> = {
  BUFFALO: 310,
  COW: 283,
  PIG: 114,
  GOAT: 150,
};

export const SYNC_ENTITY_TYPES = ['animal'] as const;
export type SyncEntityType = (typeof SYNC_ENTITY_TYPES)[number];

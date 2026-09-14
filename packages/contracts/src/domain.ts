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

/**
 * A single point-in-time state. PREGNANT is deliberately absent: a buffalo is
 * routinely lactating AND pregnant at once, so pregnancy is the separate
 * `isPregnant` flag. Putting it here would force a choice between two facts
 * that are both true and lose one of them.
 */
export const ANIMAL_STATUSES = [
  'GROWING',
  'HEIFER',
  'ACTIVE',
  'SICK',
  'QUARANTINE',
  'DRY',
  'LACTATING',
  'CULLED',
  'SOLD',
  'DEAD',
] as const;
export type AnimalStatus = (typeof ANIMAL_STATUSES)[number];

export const ANIMAL_STATUS_LABEL: Record<AnimalStatus, string> = {
  GROWING: 'Growing',
  HEIFER: 'Heifer',
  ACTIVE: 'Active',
  SICK: 'Sick',
  QUARANTINE: 'Quarantine',
  DRY: 'Dry',
  LACTATING: 'Lactating',
  CULLED: 'Culled',
  SOLD: 'Sold',
  DEAD: 'Dead',
};

/**
 * Statuses a user may never set directly — leaving the herd is always an
 * explicit, deliberate act, never a side effect of an automated rule.
 */
export const ANIMAL_EXIT_STATUSES = ['CULLED', 'SOLD', 'DEAD'] as const;

export const GENDERS = ['FEMALE', 'MALE'] as const;
export type Gender = (typeof GENDERS)[number];

export const SPECIES_HERD_LETTER: Record<Species, string> = {
  BUFFALO: 'B',
  COW: 'C',
  PIG: 'P',
  GOAT: 'G',
};

/** Offline ID allocation. One block per device per species so two phones never print the same shortNo. */
export const TAG_SEQUENCE_BLOCK_SIZE = 100;

export const ANIMAL_SOURCES = ['PURCHASED', 'BORN', 'GIFTED', 'TRANSFERRED'] as const;
export type AnimalSource = (typeof ANIMAL_SOURCES)[number];

/**
 * Fractional breed makeup, e.g. `{ murrah: 0.75, local: 0.25 }`.
 * Crossbreds are the norm, and "Murrah cross" on its own tells you nothing
 * about how much Murrah is actually in the animal.
 */
export const breedCompositionSchema = z
  .record(z.string().min(1).max(40), z.number().min(0).max(1))
  .refine((v) => Object.keys(v).length > 0, 'Breed composition cannot be empty')
  .refine(
    (v) => Math.abs(Object.values(v).reduce((s, n) => s + n, 0) - 1) < 0.001,
    'Breed fractions must add up to 1.0',
  );
export type BreedComposition = z.infer<typeof breedCompositionSchema>;

const animalBaseSchema = z.object({
  tag: z.string().regex(/^[A-Z]{3}\d{3,5}$/, 'Tag must look like BUF001'),
  name: z.string().max(80).optional(),
  species: z.enum(SPECIES),
  breed: z.string().min(1).max(80),
  dateOfBirth: z.coerce.date().optional(),
  /**
   * Registration is never blocked on an unknown DOB. Farmers buying an adult
   * animal usually do not know its birth date, and refusing the record would
   * just push them back to a paper notebook.
   */
  dobIsEstimated: z.boolean().optional(),
  /** Age in months at acquisition; used to derive a DOB when none is known. */
  ageAtAcquisitionMonths: z.number().int().min(0).max(360).optional(),
  gender: z.enum(GENDERS),
  color: z.string().max(60).optional(),
  source: z.enum(ANIMAL_SOURCES).optional(),
  motherTag: z.string().max(20).optional(),
  purchaseDate: z.coerce.date().optional(),
  purchaseCost: z.number().nonnegative().optional(),
  sellerName: z.string().max(120).optional(),
  distinguishingMarks: z.string().max(500).optional(),
  /** Initial weight in kg when creating; stored as first weight history entry. */
  initialWeightKg: z.number().positive().max(5000).optional(),
  status: z.enum(ANIMAL_STATUSES).default('ACTIVE'),
  /** Pregnancy is a flag, not a status: she can be lactating and pregnant. */
  isPregnant: z.boolean().optional(),
  pregnancyConfirmedDate: z.coerce.date().optional(),
  expectedCalvingDate: z.coerce.date().optional(),
  lactationNumber: z.number().int().min(0).max(30).optional(),
  lactationStartDate: z.coerce.date().optional(),
  breedComposition: breedCompositionSchema.optional(),
  /** When true, animal can be used as a breeding parent. */
  breedingStock: z.boolean().optional(),
  shed: z.string().max(80).optional(),
  damId: z.string().uuid().optional(),
  sireId: z.string().uuid().optional(),
  notes: z.string().max(2000).optional(),
});

/**
 * Rules that span more than one field. Applied to both create and update so a
 * record cannot be edited into a state it could not have been created in.
 */
function checkAnimalConsistency(
  value: Partial<z.infer<typeof animalBaseSchema>>,
  ctx: z.RefinementCtx,
): void {
  if (value.dateOfBirth && value.purchaseDate && value.dateOfBirth > value.purchaseDate) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['dateOfBirth'],
      message: 'Date of birth cannot be after the acquisition date',
    });
  }
  if (value.source === 'PURCHASED' && value.purchaseCost === undefined) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['purchaseCost'],
      message: 'Purchase price is required for a purchased animal',
    });
  }
}

export const animalCreateSchema = animalBaseSchema.superRefine(checkAnimalConsistency);
export type AnimalCreate = z.infer<typeof animalCreateSchema>;

export const animalUpdateSchema = animalBaseSchema
  .omit({ initialWeightKg: true })
  .partial()
  .superRefine(checkAnimalConsistency);
export type AnimalUpdate = z.infer<typeof animalUpdateSchema>;

/**
 * A dam must be female and old enough to actually be the mother. 20 months is
 * below the earliest realistic age at first calving for any species here, so
 * anything under it is a data-entry error rather than an unusual animal.
 */
export const MIN_DAM_AGE_GAP_MONTHS = 20;

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
  shed: z.string().max(80).optional(),
});
export type AnimalListQuery = z.infer<typeof animalListQuerySchema>;

export interface WeightRecordDto {
  id: string;
  animalId: string;
  weightKg: number;
  bcs: number | null;
  recordedAt: string;
  notes: string | null;
  createdAt: string;
}

export interface AnimalDto {
  id: string;
  farmId: string;
  tag: string;
  /** Printed large on the tag: B42. The number a worker holds in his head. */
  herdNumber: string | null;
  name: string | null;
  species: Species;
  breed: string;
  dateOfBirth: string | null;
  /** True when dateOfBirth is a derived estimate rather than a known date. */
  dobIsEstimated: boolean;
  ageAtAcquisitionMonths: number | null;
  gender: Gender;
  color: string | null;
  source: AnimalSource | null;
  motherTag: string | null;
  purchaseDate: string | null;
  purchaseCost: number | null;
  sellerName: string | null;
  distinguishingMarks: string | null;
  status: AnimalStatus;
  /** Independent of status — she may be lactating and pregnant at once. */
  isPregnant: boolean;
  pregnancyConfirmedDate: string | null;
  expectedCalvingDate: string | null;
  lactationNumber: number;
  lactationStartDate: string | null;
  expectedLactationDays: number | null;
  expectedDryOff: string | null;
  highRiskFPT: boolean;
  birthWeightKg: number | null;
  isFreemartinSuspect: boolean;
  breedComposition: BreedComposition | null;
  breedingStock: boolean;
  shed: string | null;
  photoUrl: string | null;
  damId: string | null;
  sireId: string | null;
  damTag: string | null;
  sireTag: string | null;
  notes: string | null;
  /** Latest weight from history, if any. */
  currentWeightKg: number | null;
  version: number;
  createdAt: string;
  updatedAt: string;
  deletedAt: string | null;
}

/** One entry in an animal's append-only status trail. */
export interface AnimalStatusHistoryDto {
  id: string;
  animalId: string;
  fromStatus: AnimalStatus | null;
  toStatus: AnimalStatus;
  reason: string | null;
  changedAt: string;
  changedBy: string | null;
}

export interface ActiveWithholdDto {
  id: string;
  kind: 'MILK' | 'MEAT';
  drugName: string;
  startDate: string;
  endDate: string;
  messageNp: string;
}

export interface AnimalDetailDto extends AnimalDto {
  weights: WeightRecordDto[];
  statusHistory: AnimalStatusHistoryDto[];
  activeWithhold: ActiveWithholdDto | null;
}

/** Status changes carry a reason so the trail is worth reading later. */
export const animalStatusChangeSchema = z.object({
  status: z.enum(ANIMAL_STATUSES),
  reason: z.string().max(500).optional(),
});
export type AnimalStatusChange = z.infer<typeof animalStatusChangeSchema>;

export interface AnimalProductionStatsDto {
  animalId: string;
  milkEntryCount: number;
  milkTotalLiters: number;
  milkAverage: number;
  herdAverage: number;
  last30Days: Array<{ date: string; quantity: number; fatPercent: number | null; scc: number | null }>;
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
  bcs: z.number().int().min(1).max(5).optional(),
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

// ---------------------------------------------------------------------------
// Species reproductive constants
// ---------------------------------------------------------------------------

/**
 * Reproductive constants per species, served from the SpeciesConfig table.
 *
 * These are NOT hardcoded anywhere in application code. Buffalo and cattle
 * differ on every one of them, and the familiar 305-day lactation is a
 * Holstein figure that is simply wrong for Nepal. Read them through the API's
 * SpeciesConfigService instead.
 */
export interface SpeciesConfigDto {
  species: Species;
  gestationDays: number;
  lactationDays: number;
  voluntaryWaitingDays: number;
  estrusCycleDays: number;
  ageFirstServiceMonths: number;
  pregnancyCheckEarliestDays: number;
  targetCalvingIntervalDays: number;
  dryOffDaysBeforeCalving: number;
  minWeightFirstServiceKg: number;
  serviceWindowStartHours: number;
  serviceWindowEndHours: number;
  silentHeatCheckHour: number | null;
  fatMinPercent: number;
  fatMaxPercent: number;
  tempMinC: number;
  tempMaxC: number;
}

export const speciesConfigUpdateSchema = z.object({
  gestationDays: z.number().int().min(1).max(400).optional(),
  lactationDays: z.number().int().min(1).max(600).optional(),
  voluntaryWaitingDays: z.number().int().min(0).max(365).optional(),
  estrusCycleDays: z.number().int().min(1).max(90).optional(),
  ageFirstServiceMonths: z.number().int().min(1).max(120).optional(),
  pregnancyCheckEarliestDays: z.number().int().min(1).max(200).optional(),
  targetCalvingIntervalDays: z.number().int().min(1).max(900).optional(),
  dryOffDaysBeforeCalving: z.number().int().min(0).max(200).optional(),
  minWeightFirstServiceKg: z.number().int().min(1).max(1500).optional(),
  serviceWindowStartHours: z.number().int().min(0).max(48).optional(),
  serviceWindowEndHours: z.number().int().min(0).max(72).optional(),
  silentHeatCheckHour: z.number().int().min(0).max(23).nullable().optional(),
  fatMinPercent: z.number().min(0).max(15).optional(),
  fatMaxPercent: z.number().min(0).max(15).optional(),
  tempMinC: z.number().min(30).max(45).optional(),
  tempMaxC: z.number().min(30).max(45).optional(),
});
export type SpeciesConfigUpdate = z.infer<typeof speciesConfigUpdateSchema>;

export const SYNC_ENTITY_TYPES = ['animal'] as const;
export type SyncEntityType = (typeof SYNC_ENTITY_TYPES)[number];

import { z } from 'zod';
import { pageQuerySchema } from './common';
import { optionalNepalMobileSchema } from './auth';
import { ROLES, type Role } from './roles';
import {
  APPROVAL_STATUSES,
  EXPENSE_CATEGORIES,
  HEALTH_RECORD_TYPES,
  INVENTORY_ALERT_LEVELS,
  PAYMENT_STATUSES,
  QUALITY_GRADES_FISH,
  QUALITY_GRADES_MILK_EGGS,
  REVENUE_SOURCES,
} from './domain';
import {
  ADMIN_ROUTES,
  DIAGNOSED_BY,
  SEVERITIES,
  SYMPTOMS,
} from './dairy';

/** Approval thresholds (NPR) — above this, expense escalates to Admin. */
export const EXPENSE_ESCALATION_THRESHOLDS: Record<
  (typeof EXPENSE_CATEGORIES)[number],
  number
> = {
  FEED: 50000,
  MEDICINE: 25000,
  LABOR: 40000,
  INFRASTRUCTURE: 100000,
  EQUIPMENT: 75000,
  TRANSPORT: 20000,
  MARKETING: 30000,
  ADMIN: 20000,
  MISC: 15000,
  EMERGENCY: 10000,
};

// ---- Groups ----
export const POULTRY_TYPES = ['LAYER', 'BROILER', 'DUCK'] as const;
export const GROUP_HEALTH = ['HEALTHY', 'WATCH', 'SICK'] as const;

export const groupCreateSchema = z.object({
  name: z.string().min(1).max(120),
  poultryType: z.enum(POULTRY_TYPES),
  breed: z.string().min(1).max(80),
  initialCount: z.number().int().positive(),
  startedAt: z.coerce.date(),
  healthStatus: z.enum(GROUP_HEALTH).default('HEALTHY'),
  notes: z.string().max(2000).optional(),
});
export type GroupCreate = z.infer<typeof groupCreateSchema>;
export const groupUpdateSchema = groupCreateSchema.partial();
export type GroupUpdate = z.infer<typeof groupUpdateSchema>;

export const mortalityCreateSchema = z.object({
  count: z.number().int().positive(),
  reason: z.string().max(500).optional(),
  occurredAt: z.coerce.date().default(() => new Date()),
});
export type MortalityCreate = z.infer<typeof mortalityCreateSchema>;

// ---- Fish ----
export const fishBatchCreateSchema = z.object({
  name: z.string().min(1).max(120),
  species: z.string().min(1).max(80),
  stockingDate: z.coerce.date(),
  estimatedCount: z.number().int().positive(),
  avgWeightGrams: z.number().positive(),
  notes: z.string().max(2000).optional(),
});
export type FishBatchCreate = z.infer<typeof fishBatchCreateSchema>;
export const fishBatchUpdateSchema = fishBatchCreateSchema.partial().extend({
  harvestedAt: z.coerce.date().nullable().optional(),
});
export type FishBatchUpdate = z.infer<typeof fishBatchUpdateSchema>;

export const waterQualityCreateSchema = z.object({
  recordedAt: z.coerce.date().default(() => new Date()),
  temperatureC: z.number().optional(),
  ph: z.number().optional(),
  dissolvedO2: z.number().optional(),
  notes: z.string().max(500).optional(),
});
export type WaterQualityCreate = z.infer<typeof waterQualityCreateSchema>;

export const fishSamplingCreateSchema = z.object({
  sampledAt: z.coerce.date().default(() => new Date()),
  sampleCount: z.number().int().positive(),
  totalWeightGrams: z.number().positive(),
  /** If omitted, estimatedCount is left unchanged on the batch. */
  estimatedCount: z.number().int().positive().optional(),
  notes: z.string().max(500).optional(),
});
export type FishSamplingCreate = z.infer<typeof fishSamplingCreateSchema>;

// ---- Expenses ----
export const expenseCreateSchema = z.object({
  category: z.enum(EXPENSE_CATEGORIES),
  amount: z.number().positive(),
  expenseDate: z.coerce.date(),
  description: z.string().min(1).max(500),
  receiptNumber: z.string().max(80).optional(),
  gstAmount: z.number().nonnegative().optional(),
  supplier: z.string().max(120).optional(),
  paymentStatus: z.enum(['UNPAID', 'PAID', 'PARTIAL']).optional(),
  animalId: z.string().uuid().optional(),
  herdBatchId: z.string().uuid().optional(),
  subcategory: z.string().max(80).optional(),
  allocations: z
    .array(
      z.object({
        animalId: z.string().uuid(),
        amount: z.number().positive(),
      }),
    )
    .optional(),
});
export type ExpenseCreate = z.infer<typeof expenseCreateSchema>;

export const expenseReviewSchema = z.object({
  decision: z.enum(['APPROVE', 'REJECT']),
  reviewNote: z.string().max(500).optional(),
});
export type ExpenseReview = z.infer<typeof expenseReviewSchema>;

export const expenseListQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(200).default(25),
  status: z.enum(APPROVAL_STATUSES).optional(),
  category: z.enum(EXPENSE_CATEGORIES).optional(),
});
export type ExpenseListQuery = z.infer<typeof expenseListQuerySchema>;

export const expenseBudgetUpsertSchema = z.object({
  category: z.enum(EXPENSE_CATEGORIES),
  year: z.number().int().min(2000).max(2100),
  month: z.number().int().min(1).max(12),
  amount: z.number().nonnegative(),
});
export type ExpenseBudgetUpsert = z.infer<typeof expenseBudgetUpsertSchema>;

export const expenseBudgetQuerySchema = z.object({
  year: z.coerce.number().int().min(2000).max(2100),
  month: z.coerce.number().int().min(1).max(12),
});
export type ExpenseBudgetQuery = z.infer<typeof expenseBudgetQuerySchema>;

export const recurringExpenseCreateSchema = z.object({
  category: z.enum(EXPENSE_CATEGORIES),
  amount: z.number().positive(),
  description: z.string().min(1).max(500),
  supplier: z.string().max(120).optional(),
  gstAmount: z.number().nonnegative().optional(),
  dayOfMonth: z.number().int().min(1).max(28).default(1),
});
export type RecurringExpenseCreate = z.infer<typeof recurringExpenseCreateSchema>;

// ---- Revenue ----
export const revenueCreateSchema = z.object({
  source: z.enum(REVENUE_SOURCES),
  quantity: z.number().positive(),
  unit: z.string().min(1).max(20),
  rate: z.number().nonnegative(),
  revenueDate: z.coerce.date(),
  buyerName: z.string().max(120).optional(),
  buyerContact: z.string().max(120).optional(),
  paymentTerms: z.string().max(200).optional(),
  paymentStatus: z.enum(PAYMENT_STATUSES).default('PENDING'),
  notes: z.string().max(2000).optional(),
  animalId: z.string().uuid().optional(),
  herdBatchId: z.string().uuid().optional(),
  qualityBonus: z.number().nonnegative().optional(),
  qualityPenalty: z.number().nonnegative().optional(),
  deductions: z.number().nonnegative().optional(),
  deductionNote: z.string().max(500).optional(),
});
export type RevenueCreate = z.infer<typeof revenueCreateSchema>;
export const revenueUpdateSchema = revenueCreateSchema.partial();
export type RevenueUpdate = z.infer<typeof revenueUpdateSchema>;

export const revenueListQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(200).default(25),
  source: z.enum(REVENUE_SOURCES).optional(),
  paymentStatus: z.enum(PAYMENT_STATUSES).optional(),
});
export type RevenueListQuery = z.infer<typeof revenueListQuerySchema>;

// ---- Inventory ----
export const INVENTORY_CATEGORIES = [
  'FEED',
  'MEDICINE',
  'VACCINE',
  'EQUIPMENT',
  'SUPPLIES',
] as const;

export const inventoryCreateSchema = z.object({
  name: z.string().min(1).max(120),
  category: z.enum(INVENTORY_CATEGORIES),
  unit: z.string().min(1).max(20),
  currentStock: z.number().nonnegative(),
  minimumStock: z.number().nonnegative(),
  unitCost: z.number().nonnegative().optional(),
  expiryDate: z.coerce.date().optional(),
  supplier: z.string().max(120).optional(),
  batchLotNumber: z.string().max(80).optional(),
  notes: z.string().max(2000).optional(),
  withdrawalDaysMilk: z.number().int().min(0).max(90).optional(),
  withdrawalDaysMeat: z.number().int().min(0).max(90).optional(),
});
export type InventoryCreate = z.infer<typeof inventoryCreateSchema>;
export const inventoryUpdateSchema = inventoryCreateSchema.partial();
export type InventoryUpdate = z.infer<typeof inventoryUpdateSchema>;

export function inventoryAlertLevel(
  current: number,
  minimum: number,
): (typeof INVENTORY_ALERT_LEVELS)[number] {
  if (minimum <= 0) return 'GOOD';
  if (current < minimum * 0.5) return 'CRITICAL';
  if (current <= minimum) return 'LOW';
  return 'GOOD';
}

export const restockCreateSchema = z.object({
  quantity: z.number().positive(),
  notes: z.string().max(500).optional(),
});
export type RestockCreate = z.infer<typeof restockCreateSchema>;

export const stockMovementCreateSchema = z.object({
  type: z.enum(['IN', 'OUT', 'ADJUST']),
  quantity: z.number().positive(),
  reason: z.string().max(500).optional(),
});
export type StockMovementCreate = z.infer<typeof stockMovementCreateSchema>;

// ---- Health ----
export const healthCreateSchema = z.object({
  type: z.enum(HEALTH_RECORD_TYPES),
  title: z.string().min(1).max(120),
  animalId: z.string().uuid().optional(),
  groupId: z.string().uuid().optional(),
  herdBatchId: z.string().uuid().optional(),
  cost: z.number().nonnegative().optional(),
  medicine: z.string().max(120).optional(),
  dosage: z.string().max(80).optional(),
  method: z.string().max(80).optional(),
  vetName: z.string().max(120).optional(),
  outcome: z.enum(['RECOVERED', 'ONGOING', 'FAILED', 'CULLED']).optional(),
  followUpAt: z.coerce.date().optional(),
  cmtResult: z.enum(['NEGATIVE', 'TRACE', 'ONE', 'TWO', 'THREE']).optional(),
  milkWithholdUntil: z.coerce.date().optional(),
  meatWithholdUntil: z.coerce.date().optional(),
  batchNumber: z.string().max(80).optional(),
  doseCount: z.number().int().min(1).max(60).optional(),
  doseIntervalHours: z.number().int().min(1).max(72).optional(),
  inventoryItemId: z.string().uuid().optional(),
  durationDays: z.number().int().min(0).max(60).optional(),
  frequencyPerDay: z.number().int().min(1).max(6).optional(),
  doseAmount: z.number().positive().max(500).optional(),
  route: z.enum(ADMIN_ROUTES).optional(),
  symptoms: z.array(z.enum(SYMPTOMS)).optional(),
  temperatureC: z.number().min(30).max(45).optional(),
  severity: z.enum(SEVERITIES).optional(),
  provisionalDiagnosis: z.string().max(200).optional(),
  diagnosedBy: z.enum(DIAGNOSED_BY).optional(),
  performedAt: z.coerce.date(),
  nextDueAt: z.coerce.date().optional(),
  notes: z.string().max(2000).optional(),
});
export type HealthCreate = z.infer<typeof healthCreateSchema>;

/** Default next-due offsets (days) for common schedules. */
export const HEALTH_DEFAULT_INTERVAL_DAYS: Partial<
  Record<(typeof HEALTH_RECORD_TYPES)[number], number>
> = {
  VACCINATION: 365, // FMD annual default; Newcastle monthly is set explicitly
  DEWORMING: 90,
  CHECKUP: 180,
};

export const healthListQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(200).default(25),
  type: z.enum(HEALTH_RECORD_TYPES).optional(),
  animalId: z.string().uuid().optional(),
  due: z.enum(['overdue', 'due_soon', 'all']).default('all'),
});
export type HealthListQuery = z.infer<typeof healthListQuerySchema>;

export const healthCalendarQuerySchema = z.object({
  from: z.coerce.date().optional(),
  to: z.coerce.date().optional(),
});
export type HealthCalendarQuery = z.infer<typeof healthCalendarQuerySchema>;

// ---- Breeding ----
export const MATING_TYPES = ['NATURAL', 'AI'] as const;
export const PREGNANCY_STATUSES = [
  'OPEN',
  'PREGNANT',
  'CONFIRMED',
  'DELIVERED',
  'FAILED',
] as const;

export const SERVICE_METHODS = ['NATURAL', 'AI', 'EMBRYO_TRANSFER'] as const;

export const breedingCreateSchema = z.object({
  motherId: z.string().uuid().optional(),
  animalId: z.string().uuid().optional(),
  matingType: z.enum(MATING_TYPES).optional(),
  method: z.enum(SERVICE_METHODS).optional(),
  fatherTagOrAi: z.string().max(80).optional(),
  matingDate: z.coerce.date().optional(),
  serviceDate: z.coerce.date().optional(),
  heatEventId: z.string().uuid().optional(),
  sireId: z.string().uuid().optional(),
  strawId: z.string().uuid().optional(),
  technicianName: z.string().max(120).optional(),
  technicianPhone: z.string().max(40).optional(),
  costNpr: z.number().nonnegative().optional(),
  pregnancyStatus: z.enum(PREGNANCY_STATUSES).default('OPEN'),
  notes: z.string().max(2000).optional(),
}).refine((v) => Boolean(v.motherId || v.animalId), { message: 'motherId is required' })
  .refine((v) => Boolean(v.matingDate || v.serviceDate), { message: 'serviceDate is required' });
export type BreedingCreate = z.infer<typeof breedingCreateSchema>;

export const breedingUpdateSchema = z.object({
  pregnancyStatus: z.enum(PREGNANCY_STATUSES).optional(),
  matingType: z.enum(MATING_TYPES).optional(),
  matingDate: z.coerce.date().optional(),
  birthDate: z.coerce.date().optional(),
  offspringTag: z.string().max(20).optional(),
  offspringAnimalId: z.string().uuid().optional(),
  calvingDifficulty: z.enum(['EASY', 'ASSISTED', 'EMERGENCY', 'STILLBIRTH']).optional(),
  colostrumFed: z.boolean().optional(),
  colostrumWithin4h: z.boolean().optional(),
  colostrumLiters: z.number().nonnegative().optional(),
  notes: z.string().max(2000).optional(),
  fatherTagOrAi: z.string().max(80).optional(),
});
export type BreedingUpdate = z.infer<typeof breedingUpdateSchema>;

export const breedingListQuerySchema = pageQuerySchema.extend({
  motherId: z.string().uuid().optional(),
});
export type BreedingListQuery = z.infer<typeof breedingListQuerySchema>;

/** Phase 9c herd display targets — not species biology. */
export const BREEDING_HERD_TARGETS = {
  conceptionRateMinPct: 45,
  daysOpenMax: 120,
} as const;

/** Section 11.6 — healthy dairy ranges. Percent of income unless noted. */
export const PNL_RATIO_TARGETS = {
  marginHealthyMinPct: 20,
  marginHealthyMaxPct: 30,
  feedShareMinPct: 45,
  feedShareMaxPct: 60,
  labourShareMinPct: 12,
  labourShareMaxPct: 18,
  healthShareMaxPct: 10,
} as const;

export interface PedigreeNodeDto {
  id: string;
  tag: string;
  herdNumber: string | null;
  name: string | null;
  damId: string | null;
  sireId: string | null;
  dam: PedigreeNodeDto | null;
  sire: PedigreeNodeDto | null;
}

export interface BreedingObserverDto {
  observerId: string;
  observerName: string | null;
  heatsObserved: number;
  standingHeatCount: number;
  heatDetectionRatePct: number | null;
}

export interface BreedingMetricsDto {
  daysOpen: number | null;
  calvingIntervalDays: number | null;
  servicesPerConception: number | null;
  conceptionRatePct: number | null;
  firstServiceRatePct: number | null;
  heatDetectionRatePct: number | null;
  ageAtFirstCalvingMonths: number | null;
  costOfOpenDaysNpr: number | null;
  avgDailyYield: number | null;
  effectivePriceNpr: number;
  targets: {
    conceptionRateMinPct: number;
    daysOpenMax: number;
    calvingIntervalMaxDays: number | null;
  };
  observers: BreedingObserverDto[];
}

// ---- Production ----
export const PRODUCTION_TYPES = ['MILK', 'EGGS', 'FISH'] as const;
export const QUALITY_GRADES = [
  ...QUALITY_GRADES_MILK_EGGS,
  ...QUALITY_GRADES_FISH,
] as const;

export const productionCreateSchema = z.object({
  type: z.enum(PRODUCTION_TYPES),
  entryDate: z.coerce.date(),
  quantity: z.number().positive(),
  unit: z.string().min(1).max(20),
  quality: z.enum(QUALITY_GRADES).optional(),
  animalId: z.string().uuid().optional(),
  groupId: z.string().uuid().optional(),
  batchId: z.string().uuid().optional(),
  herdBatchId: z.string().uuid().optional(),
  milkerName: z.string().max(80).optional(),
  appearance: z.enum(['NORMAL', 'CLOTS', 'BLOOD', 'DISCOLORED']).optional(),
  fatPercent: z.number().min(0).max(20).optional(),
  snfPercent: z.number().min(0).max(20).optional(),
  proteinPercent: z.number().min(0).max(20).optional(),
  lactosePercent: z.number().min(0).max(20).optional(),
  scc: z.number().int().min(0).optional(),
  collectionMethod: z.enum(['HAND', 'MACHINE']).optional(),
  session: z.enum(['MORNING', 'EVENING', 'MIDDAY']).optional(),
  destination: z.enum(['SOLD', 'CALF', 'HOUSEHOLD', 'DISCARDED']).optional(),
  udderFlag: z.boolean().optional(),
  notes: z.string().max(2000).optional(),
});
export type ProductionCreate = z.infer<typeof productionCreateSchema>;

export const productionListQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(200).default(25),
  type: z.enum(PRODUCTION_TYPES).optional(),
  from: z.coerce.date().optional(),
  to: z.coerce.date().optional(),
});
export type ProductionListQuery = z.infer<typeof productionListQuerySchema>;

// ---- Dashboard / Reports ----
export const reportQuerySchema = z.object({
  from: z.coerce.date().optional(),
  to: z.coerce.date().optional(),
  species: z.string().optional(),
  category: z.string().optional(),
});
export type ReportQuery = z.infer<typeof reportQuerySchema>;

export const pnlQuerySchema = z.object({
  period: z.enum(['monthly', 'quarterly', 'yearly']).default('monthly'),
  year: z.coerce.number().int().min(2000).max(2100).optional(),
  month: z.coerce.number().int().min(1).max(12).optional(),
});
export type PnlQuery = z.infer<typeof pnlQuerySchema>;

// ---- Herd batches (category + age-range counts) ----
export const HERD_BATCH_KINDS = ['LIVESTOCK', 'POULTRY', 'FISH'] as const;
export type HerdBatchKind = (typeof HERD_BATCH_KINDS)[number];

export const ILLNESS_CONDITIONS = [
  'FMD',
  'MASTITIS',
  'NEWCASTLE',
  'PARASITES',
  'INJURY',
  'RESPIRATORY',
  'DIGESTIVE',
  'SKIN',
  'OTHER',
] as const;
export type IllnessCondition = (typeof ILLNESS_CONDITIONS)[number];

export const ILLNESS_CONDITION_LABEL: Record<IllnessCondition, string> = {
  FMD: 'Foot-and-mouth (FMD)',
  MASTITIS: 'Mastitis',
  NEWCASTLE: 'Newcastle / Ranikhet',
  PARASITES: 'Parasites',
  INJURY: 'Injury',
  RESPIRATORY: 'Respiratory',
  DIGESTIVE: 'Digestive',
  SKIN: 'Skin / external',
  OTHER: 'Other',
};

export const herdBatchCreateSchema = z
  .object({
    kind: z.enum(HERD_BATCH_KINDS),
    category: z.string().min(1).max(80),
    name: z.string().min(1).max(120),
    ageFromMonths: z.number().int().min(0).max(600).nullable().optional(),
    ageToMonths: z.number().int().min(0).max(600).nullable().optional(),
    initialCount: z.number().int().positive(),
    notes: z.string().max(2000).optional(),
  })
  .superRefine((val, ctx) => {
    if (
      val.ageFromMonths != null &&
      val.ageToMonths != null &&
      val.ageToMonths < val.ageFromMonths
    ) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'ageToMonths must be >= ageFromMonths',
        path: ['ageToMonths'],
      });
    }
  });
export type HerdBatchCreate = z.infer<typeof herdBatchCreateSchema>;

export const herdBatchUpdateSchema = z
  .object({
    category: z.string().min(1).max(80).optional(),
    name: z.string().min(1).max(120).optional(),
    ageFromMonths: z.number().int().min(0).max(600).nullable().optional(),
    ageToMonths: z.number().int().min(0).max(600).nullable().optional(),
    currentCount: z.number().int().min(0).optional(),
    notes: z.string().max(2000).nullable().optional(),
  })
  .superRefine((val, ctx) => {
    if (
      val.ageFromMonths != null &&
      val.ageToMonths != null &&
      val.ageToMonths < val.ageFromMonths
    ) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'ageToMonths must be >= ageFromMonths',
        path: ['ageToMonths'],
      });
    }
  });
export type HerdBatchUpdate = z.infer<typeof herdBatchUpdateSchema>;

export const herdBatchListQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(200).default(50),
  kind: z.enum(HERD_BATCH_KINDS).optional(),
  category: z.string().max(80).optional(),
  q: z.string().max(80).optional(),
});
export type HerdBatchListQuery = z.infer<typeof herdBatchListQuerySchema>;

export const batchIllnessCreateSchema = z.object({
  condition: z.enum(ILLNESS_CONDITIONS),
  count: z.number().int().positive(),
  occurredAt: z.coerce.date().default(() => new Date()),
  notes: z.string().max(500).optional(),
});
export type BatchIllnessCreate = z.infer<typeof batchIllnessCreateSchema>;

export const batchMortalityCreateSchema = z.object({
  count: z.number().int().positive(),
  reason: z.string().max(500).optional(),
  occurredAt: z.coerce.date().default(() => new Date()),
});
export type BatchMortalityCreate = z.infer<typeof batchMortalityCreateSchema>;

export const herdMonthlyReportQuerySchema = z.object({
  year: z.coerce.number().int().min(2000).max(2100),
  month: z.coerce.number().int().min(1).max(12),
  kind: z.enum(HERD_BATCH_KINDS).optional(),
});
export type HerdMonthlyReportQuery = z.infer<typeof herdMonthlyReportQuerySchema>;

export const batchWaterQualityCreateSchema = z.object({
  recordedAt: z.coerce.date().default(() => new Date()),
  temperatureC: z.number().optional(),
  ph: z.number().optional(),
  dissolvedO2: z.number().optional(),
  notes: z.string().max(500).optional(),
});
export type BatchWaterQualityCreate = z.infer<typeof batchWaterQualityCreateSchema>;

export const batchSamplingCreateSchema = z.object({
  sampledAt: z.coerce.date().default(() => new Date()),
  sampleCount: z.number().int().positive(),
  totalWeightGrams: z.number().positive(),
  estimatedCount: z.number().int().positive().optional(),
  notes: z.string().max(500).optional(),
});
export type BatchSamplingCreate = z.infer<typeof batchSamplingCreateSchema>;

export const batchHarvestCreateSchema = z.object({
  quantityKg: z.number().positive(),
  fishCount: z.number().int().positive().optional(),
  quality: z.enum(QUALITY_GRADES).optional(),
  occurredAt: z.coerce.date().default(() => new Date()),
  notes: z.string().max(500).optional(),
  reduceHeadcount: z.boolean().optional(),
});
export type BatchHarvestCreate = z.infer<typeof batchHarvestCreateSchema>;

export const batchFeedCreateSchema = z.object({
  quantityKg: z.number().positive(),
  feedType: z.string().max(80).optional(),
  inventoryItemId: z.string().uuid().optional(),
  occurredAt: z.coerce.date().default(() => new Date()),
  notes: z.string().max(500).optional(),
});
export type BatchFeedCreate = z.infer<typeof batchFeedCreateSchema>;

export const farmMemberCreateSchema = z.object({
  email: z.string().trim().toLowerCase().email(),
  name: z.string().trim().min(1).max(120),
  role: z.enum(ROLES),
  password: z.string().min(8).max(128),
  phone: optionalNepalMobileSchema,
  literacySupport: z.boolean().optional(),
});
export type FarmMemberCreate = z.infer<typeof farmMemberCreateSchema>;

/** Admin edit of one member. A `password` here is a reset and signs them out everywhere. */
export const farmMemberUpdateSchema = z.object({
  name: z.string().trim().min(1).max(120).optional(),
  email: z.string().trim().toLowerCase().email().optional(),
  role: z.enum(ROLES).optional(),
  isActive: z.boolean().optional(),
  phone: optionalNepalMobileSchema,
  literacySupport: z.boolean().optional(),
  password: z.string().min(8).max(128).optional(),
});
export type FarmMemberUpdate = z.infer<typeof farmMemberUpdateSchema>;

export interface FarmMemberDto {
  userId: string;
  email: string;
  name: string;
  phone: string | null;
  role: Role;
  isActive: boolean;
  /** Voice-call alerts for people who prefer not to read. */
  literacySupport: boolean;
  /** Also a member of another farm: email and password are locked here. */
  sharedAccount: boolean;
  isSelf: boolean;
  lastSignInAt: string | null;
  createdAt: string;
}

export const FARM_MODES = ['HOUSEHOLD', 'COMMERCIAL'] as const;
export type FarmMode = (typeof FARM_MODES)[number];

/**
 * Livestock tracking mode. INDIVIDUAL makes the tagged `Animal` primary —
 * required for lactation curves, breeding cycles, milk withdrawal and profit
 * per animal. BATCH makes counted `HerdBatch` primary, which suits a
 * household flock or a pen of grower pigs. Both surfaces stay available; this
 * only decides which one the farm lands on first.
 */
export const LIVESTOCK_TRACKING_MODES = ['INDIVIDUAL', 'BATCH'] as const;
export type LivestockTrackingMode = (typeof LIVESTOCK_TRACKING_MODES)[number];

/** Default tracking mode for a farm mode. Commercial dairy needs individuals. */
export function defaultLivestockTrackingMode(mode: FarmMode): LivestockTrackingMode {
  return mode === 'COMMERCIAL' ? 'INDIVIDUAL' : 'BATCH';
}

export const farmUpdateSchema = z.object({
  name: z.string().min(1).max(120).optional(),
  location: z.string().max(200).optional(),
  currency: z.string().min(1).max(8).optional(),
  timezone: z.string().max(80).optional(),
  mode: z.enum(FARM_MODES).optional(),
  livestockTrackingMode: z.enum(LIVESTOCK_TRACKING_MODES).optional(),
});
export type FarmUpdate = z.infer<typeof farmUpdateSchema>;

export const periodReportQuerySchema = z.object({
  kind: z.enum(['daily', 'weekly', 'quarterly', 'annual']),
  date: z.coerce.date().optional(),
});
export type PeriodReportQuery = z.infer<typeof periodReportQuerySchema>;

export const dailyReportQuerySchema = z.object({
  date: z.coerce.date().optional(),
});
export type DailyReportQuery = z.infer<typeof dailyReportQuerySchema>;

export const monthlyReportQuerySchema = z.object({
  year: z.coerce.number().int().min(2000).max(2100),
  month: z.coerce.number().int().min(1).max(12),
});
export type MonthlyReportQuery = z.infer<typeof monthlyReportQuerySchema>;

export const cooperativeReportQuerySchema = z.object({
  from: z.coerce.date().optional(),
  to: z.coerce.date().optional(),
});
export type CooperativeReportQuery = z.infer<typeof cooperativeReportQuerySchema>;

export const vaccinationProofQuerySchema = z.object({
  from: z.coerce.date().optional(),
  to: z.coerce.date().optional(),
  disease: z.string().max(80).optional(),
});
export type VaccinationProofQuery = z.infer<typeof vaccinationProofQuerySchema>;

export const insuranceClaimQuerySchema = z.object({
  animalId: z.string().uuid(),
});
export type InsuranceClaimQuery = z.infer<typeof insuranceClaimQuerySchema>;

export const feedCreateSchema = z.object({
  animalId: z.string().uuid().optional(),
  herdBatchId: z.string().uuid().optional(),
  feedType: z.string().min(1).max(80),
  quantityKg: z.number().positive(),
  costPerKg: z.number().nonnegative().optional(),
  condition: z.enum(['FRESH', 'FERMENTED', 'DRY']).optional(),
  accepted: z.boolean().optional(),
  inventoryItemId: z.string().uuid().optional(),
  occurredAt: z.coerce.date().default(() => new Date()),
  notes: z.string().max(500).optional(),
});
export type FeedCreate = z.infer<typeof feedCreateSchema>;

export const feedListQuerySchema = pageQuerySchema.extend({
  animalId: z.string().uuid().optional(),
  herdBatchId: z.string().uuid().optional(),
  from: z.coerce.date().optional(),
  to: z.coerce.date().optional(),
});
export type FeedListQuery = z.infer<typeof feedListQuerySchema>;

export const HEAT_SIGNS = [
  'STANDING_HEAT',
  'MOUNTING_OTHERS',
  'MUCUS_DISCHARGE',
  'VULVA_SWELLING',
  'BELLOWING',
  'RESTLESSNESS',
  'REDUCED_MILK',
  'TAIL_RAISED',
  'OFF_FEED',
] as const;

export const heatCreateSchema = z.object({
  animalId: z.string().uuid(),
  observedAt: z.coerce.date().default(() => new Date()),
  intensity: z.enum(['WEAK', 'MEDIUM', 'STRONG', 'SILENT_SUSPECTED']),
  observerName: z.string().max(80).optional(),
  signs: z.string().max(500).optional(),
  signList: z.array(z.enum(HEAT_SIGNS)).optional(),
  notes: z.string().max(1000).optional(),
  deviceId: z.string().max(80).optional(),
  taskId: z.string().uuid().optional(),
});
export type HeatCreate = z.infer<typeof heatCreateSchema>;

export const heatUpdateSchema = z.object({
  observedAt: z.coerce.date().optional(),
  intensity: z.enum(['WEAK', 'MEDIUM', 'STRONG', 'SILENT_SUSPECTED']).optional(),
  observerName: z.string().max(80).optional(),
  signs: z.string().max(500).optional(),
  signList: z.array(z.enum(HEAT_SIGNS)).optional(),
  notes: z.string().max(1000).optional(),
});
export type HeatUpdate = z.infer<typeof heatUpdateSchema>;

export const heatListQuerySchema = pageQuerySchema.extend({
  animalId: z.string().uuid().optional(),
});
export type HeatListQuery = z.infer<typeof heatListQuerySchema>;


import { z } from 'zod';

export const MILK_SESSIONS = ['MORNING', 'EVENING', 'MIDDAY'] as const;
export type MilkSession = (typeof MILK_SESSIONS)[number];

export const MILK_DESTINATIONS = ['SOLD', 'CALF', 'HOUSEHOLD', 'DISCARDED'] as const;
export type MilkDestination = (typeof MILK_DESTINATIONS)[number];

export const MILK_ROUND_STATUSES = ['OPEN', 'FINISHED'] as const;
export type MilkRoundStatus = (typeof MILK_ROUND_STATUSES)[number];

export const UNRECORDED_REASONS = ['NOT_MILKED', 'FORGOT', 'RECORDED'] as const;
export type UnrecordedReason = (typeof UNRECORDED_REASONS)[number];

export const COB_RESULTS = ['NOT_TESTED', 'PASS', 'FAIL'] as const;
export type CobResult = (typeof COB_RESULTS)[number];

export const RECORDING_MODES = [
  'MILKING',
  'VACCINATION',
  'TREATMENT',
  'WEIGHING',
  'HEALTH_CHECK',
  'MARKER_PLACEMENT',
  'BROWSE',
] as const;
export type RecordingMode = (typeof RECORDING_MODES)[number];
export const SCAN_MODES = RECORDING_MODES;
export type ScanMode = RecordingMode;

export const ROUND_STATUSES = ['ACTIVE', 'FINISHED', 'ABANDONED'] as const;
export type RoundStatus = (typeof ROUND_STATUSES)[number];

export const MILK_DISPOSALS = ['SOLD', 'FED_TO_CALVES', 'HOUSEHOLD', 'DISCARDED'] as const;
export type MilkDisposal = (typeof MILK_DISPOSALS)[number];

export const SCAN_METHODS = ['CAMERA', 'MANUAL_NUMBER', 'LIST_TAP', 'PHOTO_PICK', 'NFC'] as const;
export type ScanMethod = (typeof SCAN_METHODS)[number];

export const ROUND_SKIP_REASONS = ['NOT_MILKED', 'FORGOT', 'SICK', 'DRIED_OFF', 'OTHER'] as const;
export type RoundSkipReason = (typeof ROUND_SKIP_REASONS)[number];

export const MARKER_COLORS = ['RED', 'YELLOW', 'BLUE', 'GREEN', 'WHITE'] as const;
export type MarkerColor = (typeof MARKER_COLORS)[number];

export const MARKER_MEANINGS = [
  'MILK_WITHHOLD',
  'DRY',
  'CALVING_SOON',
  'IN_HEAT',
  'TREATMENT',
] as const;
export type MarkerMeaning = (typeof MARKER_MEANINGS)[number];

export const DEFAULT_MARKER_SCHEME: Record<MarkerMeaning, MarkerColor> = {
  MILK_WITHHOLD: 'RED',
  DRY: 'YELLOW',
  CALVING_SOON: 'BLUE',
  IN_HEAT: 'GREEN',
  TREATMENT: 'WHITE',
};

export const TASK_TYPES = [
  'VACCINATION_DUE',
  'MEDICATION_DOSE',
  'COLOSTRUM_FEED',
  'CALVING_WATCH',
  'HEAT_WATCH',
  'SILENT_HEAT_CHECK',
  'SERVICE_WINDOW',
  'PREGNANCY_CHECK',
  'DRY_OFF',
  'POSTPARTUM_CHECK',
  'REPEAT_BREEDER',
  'VET_URGENT',
  'MILK_WITHHOLD_END',
  'STOCK_REORDER',
  'LOT_EXPIRING',
  'MISSING_PRODUCTION',
  'YIELD_DROP',
  'STOCK_RECONCILE',
  'TANK_VARIANCE',
  'APPLY_MARKER',
  'REMOVE_MARKER',
  'RETAG_REQUIRED',
  'TREATMENT_FOLLOWUP',
] as const;
export type TaskType = (typeof TASK_TYPES)[number];

export const TASK_PRIORITIES = ['CRITICAL', 'HIGH', 'NORMAL', 'LOW'] as const;
export type TaskPriority = (typeof TASK_PRIORITIES)[number];

export const TASK_STATUSES = ['PENDING', 'DONE', 'SNOOZED', 'DISMISSED', 'EXPIRED'] as const;
export type TaskStatus = (typeof TASK_STATUSES)[number];

export const TASK_DISMISS_REASONS = [
  'NOT_NEEDED',
  'ALREADY_DONE_OFFLINE',
  'ANIMAL_SOLD',
  'WRONG_ANIMAL',
  'OTHER',
] as const;
export type TaskDismissReason = (typeof TASK_DISMISS_REASONS)[number];

export const SNOOZE_PRESETS = ['1h', '1d', '1w'] as const;
export type SnoozePreset = (typeof SNOOZE_PRESETS)[number];

export const taskListQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(200).default(50),
  status: z.enum(TASK_STATUSES).optional(),
  priority: z.enum(TASK_PRIORITIES).optional(),
  animalId: z.string().uuid().optional(),
  dueBefore: z.coerce.date().optional(),
  type: z.enum(TASK_TYPES).optional(),
});
export type TaskListQuery = z.infer<typeof taskListQuerySchema>;

export const taskSnoozeSchema = z.object({
  preset: z.enum(SNOOZE_PRESETS),
});
export type TaskSnooze = z.infer<typeof taskSnoozeSchema>;

export const taskDismissSchema = z.object({
  reason: z.enum(TASK_DISMISS_REASONS),
  note: z.string().max(500).optional(),
});
export type TaskDismiss = z.infer<typeof taskDismissSchema>;

export const taskReassignSchema = z.object({
  assignedToId: z.string().uuid(),
});
export type TaskReassign = z.infer<typeof taskReassignSchema>;

export const deviceRegisterSchema = z.object({
  id: z.string().min(1).max(120),
  platform: z.enum(['android', 'ios', 'web']).default('android'),
  fcmToken: z.string().min(1).max(4096).optional(),
});
export type DeviceRegister = z.infer<typeof deviceRegisterSchema>;

export const notificationPreferenceSchema = z.object({
  taskType: z.enum(TASK_TYPES),
  muted: z.boolean().optional(),
  push: z.boolean().optional(),
  sms: z.boolean().optional(),
  voice: z.boolean().optional(),
});
export type NotificationPreferenceUpdate = z.infer<typeof notificationPreferenceSchema>;

export const milkRoundStartSchema = z.object({
  session: z.enum(MILK_SESSIONS),
  roundDate: z.coerce.date().optional(),
});
export type MilkRoundStart = z.infer<typeof milkRoundStartSchema>;

export const milkRecordSchema = z.object({
  animalId: z.string().uuid(),
  quantity: z.number().positive().max(80),
  destination: z.enum(MILK_DESTINATIONS).default('SOLD'),
  collectionMethod: z.enum(['HAND', 'MACHINE']).optional(),
  udderFlag: z.boolean().optional(),
  confirmOutOfRange: z.boolean().optional(),
});
export type MilkRecord = z.infer<typeof milkRecordSchema>;

export const milkSkipSchema = z.object({
  animalId: z.string().uuid(),
  reason: z.enum(['NOT_MILKED', 'FORGOT']),
});
export type MilkSkip = z.infer<typeof milkSkipSchema>;

export const tankUpdateSchema = z.object({
  actualLitres: z.number().positive().max(50000),
  temperatureC: z.number().min(-5).max(50).optional(),
  compositeFat: z.number().min(0).max(15).optional(),
  compositeSnf: z.number().min(0).max(20).optional(),
  cobResult: z.enum(COB_RESULTS).optional(),
});
export type TankUpdate = z.infer<typeof tankUpdateSchema>;

export const deliveryCreateSchema = z.object({
  litresSent: z.number().positive(),
  litresAccepted: z.number().nonnegative().optional(),
  litresRejected: z.number().nonnegative().optional(),
  rejectReason: z.string().max(500).optional(),
  centreFat: z.number().min(0).max(15).optional(),
  centreSnf: z.number().min(0).max(20).optional(),
  lactometer: z.number().min(0).max(50).optional(),
  centreScc: z.number().int().min(0).optional(),
  receiptNumber: z.string().max(80).optional(),
  expectedValue: z.number().nonnegative().optional(),
});
export type DeliveryCreate = z.infer<typeof deliveryCreateSchema>;

export const recordingRoundCreateSchema = z.object({
  mode: z.enum(RECORDING_MODES),
  session: z.enum(MILK_SESSIONS).optional(),
  contextItemId: z.string().uuid().optional(),
  contextLotId: z.string().uuid().optional(),
  contextDose: z.string().max(40).optional(),
  deviceId: z.string().max(80).optional(),
});
export type RecordingRoundCreate = z.infer<typeof recordingRoundCreateSchema>;

export const recordingRoundFinishSchema = z.object({
  skips: z
    .array(
      z.object({
        animalId: z.string().uuid(),
        reason: z.enum(ROUND_SKIP_REASONS),
        note: z.string().max(300).optional(),
      }),
    )
    .default([]),
});
export type RecordingRoundFinish = z.infer<typeof recordingRoundFinishSchema>;

export const scanCreateSchema = z.object({
  rawPayload: z.string().max(500).optional(),
  method: z.enum(SCAN_METHODS),
  roundId: z.string().uuid().optional(),
  deviceId: z.string().max(80).optional(),
});
export type ScanCreate = z.infer<typeof scanCreateSchema>;

export const milkEntryCreateSchema = z.object({
  animalId: z.string().uuid(),
  date: z.coerce.date().optional(),
  session: z.enum(MILK_SESSIONS),
  litres: z.number().positive().max(80),
  disposal: z.enum(MILK_DISPOSALS).default('SOLD'),
  roundId: z.string().uuid().optional(),
  confirmOutOfRange: z.boolean().optional(),
});
export type MilkEntryCreate = z.infer<typeof milkEntryCreateSchema>;

export const milkEntryPatchSchema = z.object({
  litres: z.number().positive().max(80),
  reason: z.string().max(300).optional(),
});
export type MilkEntryPatch = z.infer<typeof milkEntryPatchSchema>;

export const paymentStatementCreateSchema = z.object({
  periodStart: z.coerce.date(),
  periodEnd: z.coerce.date(),
  litres: z.number().positive(),
  baseRate: z.number().nonnegative(),
  fatBonus: z.number().default(0),
  snfBonus: z.number().default(0),
  sccPenalty: z.number().default(0),
  coolingCharge: z.number().default(0),
  transport: z.number().default(0),
  membership: z.number().default(0),
  feedCredit: z.number().default(0),
  netPaid: z.number(),
});
export type PaymentStatementCreate = z.infer<typeof paymentStatementCreateSchema>;

export const markerPlaceSchema = z.object({
  animalId: z.string().uuid(),
  meaning: z.enum(MARKER_MEANINGS),
  byScan: z.boolean().default(true),
  validUntil: z.coerce.date().optional(),
});
export type MarkerPlace = z.infer<typeof markerPlaceSchema>;

export const taskCompleteSchema = z.preprocess(
  (value) => value ?? {},
  z.object({
    byScan: z.boolean().optional(),
  }),
);
export type TaskComplete = z.infer<typeof taskCompleteSchema>;

export const SYMPTOMS = [
  'FEVER',
  'OFF_FEED',
  'DIARRHOEA',
  'LAMENESS',
  'NASAL_DISCHARGE',
  'COUGHING',
  'SWOLLEN_UDDER',
  'ABNORMAL_MILK',
  'WEIGHT_LOSS',
  'LETHARGY',
  'BLOAT',
  'DIFFICULTY_BREATHING',
  'VULVAR_DISCHARGE',
  'SKIN_LESIONS',
] as const;
export type Symptom = (typeof SYMPTOMS)[number];

export const SEVERITIES = ['MILD', 'MODERATE', 'SEVERE'] as const;
export type Severity = (typeof SEVERITIES)[number];

export const DIAGNOSED_BY = ['FARMER', 'PARAVET', 'VET', 'VETERINARIAN', 'LAB'] as const;
export type DiagnosedBy = (typeof DIAGNOSED_BY)[number];

export const UDDER_METHODS = ['VISUAL', 'STRIP_CUP', 'CMT', 'LAB_SCC'] as const;
export const MILK_APPEARANCES = ['NORMAL', 'WATERY', 'CLOTS', 'BLOOD', 'PUS', 'DISCOLORED'] as const;
export const UDDER_SIGNS = ['HEAT', 'SWELLING', 'PAIN', 'HARDNESS', 'ASYMMETRY', 'NONE'] as const;
export const QUARTERS = ['LF', 'RF', 'LR', 'RR'] as const;
export const CAUSE_CATEGORIES = [
  'DISEASE',
  'INJURY',
  'CALVING_COMPLICATION',
  'PREDATION',
  'POISONING',
  'UNKNOWN',
] as const;
export const DISPOSAL_METHODS = ['BURIED', 'BURNED', 'RENDERED', 'SOLD_FOR_MEAT'] as const;

export const quarterScoresSchema = z.object({
  LF: z.number().int().min(0).max(3),
  RF: z.number().int().min(0).max(3),
  LR: z.number().int().min(0).max(3),
  RR: z.number().int().min(0).max(3),
});
export type QuarterScores = z.infer<typeof quarterScoresSchema>;

export const udderCheckCreateSchema = z.object({
  animalId: z.string().uuid(),
  checkDate: z.coerce.date().optional(),
  method: z.enum(UDDER_METHODS).default('CMT'),
  quarterScores: quarterScoresSchema,
  sccThousand: z.number().int().min(0).max(10000).optional(),
  appearance: z.enum(MILK_APPEARANCES).default('NORMAL'),
  signs: z.array(z.enum(UDDER_SIGNS)).default([]),
});
export type UdderCheckCreate = z.infer<typeof udderCheckCreateSchema>;

export interface UdderCheckDto {
  id: string;
  animalId: string;
  checkDate: string;
  method: string;
  quarterScores: QuarterScores;
  sccThousand: number | null;
  appearance: string;
  signs: string[];
  classification: 'HEALTHY' | 'SUBCLINICAL' | 'CLINICAL';
  affectedQuarters: string[];
  discardMilk: boolean;
  chronicFlag: boolean;
}

export const mortalityRecordCreateSchema = z.object({
  animalId: z.string().uuid(),
  deathAt: z.coerce.date(),
  causeCategory: z.enum(CAUSE_CATEGORIES),
  suspectedDisease: z.string().max(120).optional(),
  postMortemDone: z.boolean().optional(),
  postMortemFindings: z.string().max(2000).optional(),
  disposalMethod: z.enum(DISPOSAL_METHODS).optional(),
  insuranceClaimFiled: z.boolean().optional(),
  insuranceClaimStatus: z.string().max(80).optional(),
  reportedToVetOffice: z.boolean().optional(),
});
export type MortalityRecordCreate = z.infer<typeof mortalityRecordCreateSchema>;

export interface MortalityRecordDto {
  id: string;
  animalId: string;
  deathAt: string;
  causeCategory: string;
  suspectedDisease: string | null;
  estimatedLossNpr: number | null;
  remainingLactationValue: number;
  baseValue: number;
  postMortemDone: boolean;
  disposalMethod: string | null;
}

export interface MarkerCohortAnimalDto {
  markerId: string;
  animalId: string;
  shortNo: string | null;
  herdNumber: string | null;
  name: string | null;
  shed: string | null;
  photoUrl: string | null;
  color: MarkerColor;
  meaning: MarkerMeaning;
  validUntil: string | null;
}

export interface MarkerCohortGroupDto {
  meaning: MarkerMeaning;
  color: MarkerColor;
  animals: MarkerCohortAnimalDto[];
}

export interface MarkerCohortDto {
  groups: MarkerCohortGroupDto[];
}

export interface TaskDto {
  id: string;
  farmId: string;
  animalId: string | null;
  animalHerdNumber: string | null;
  animalName: string | null;
  batchId: string | null;
  type: TaskType;
  titleEn: string;
  titleNp: string;
  dueAt: string;
  priority: TaskPriority;
  status: TaskStatus;
  assignedToId: string | null;
  source: 'AUTO' | 'MANUAL';
  sourceRefType: string | null;
  sourceRefId: string | null;
  snoozeCount: number;
  snoozedUntil: string | null;
  completedAt: string | null;
  dismissReason: TaskDismissReason | null;
  /** Completing opens this path with the form prefilled — never a bare tick. */
  actionPath: string;
  /** Set on dismiss when this type has been dismissed three times. */
  offerMute?: boolean;
}

export interface MilkRoundAnimalDto {
  id: string;
  herdNumber: string | null;
  tag: string;
  name: string | null;
  species: string;
  shed: string | null;
  photoUrl: string | null;
  status: string;
  isPregnant: boolean;
  usualLitres: number | null;
  milkWithholdUntil: string | null;
  withholdActive: boolean;
  recordedLitres: number | null;
  destination: MilkDestination | null;
  entryId: string | null;
  skippedReason: UnrecordedReason | null;
  markers: Array<{ color: MarkerColor; meaning: MarkerMeaning }>;
}

export interface MilkRoundDto {
  id: string;
  session: MilkSession;
  roundDate: string;
  status: MilkRoundStatus;
  expected: number;
  recorded: number;
  remaining: MilkRoundAnimalDto[];
  recordedAnimals: MilkRoundAnimalDto[];
  tank: {
    id: string;
    expectedLitres: number;
    actualLitres: number | null;
    variancePercent: number | null;
    temperatureC: number | null;
    compositeFat: number | null;
    compositeSnf: number | null;
    cobResult: CobResult;
    delivery: {
      id: string;
      litresSent: number;
      receiptUrl: string | null;
    } | null;
  } | null;
}

export interface AnimalProfitDto {
  animalId: string;
  shortNo?: string | null;
  herdNumber: string | null;
  tag: string;
  name: string | null;
  photo?: string | null;
  species: string;
  litres?: number;
  litres30d: number;
  revenue: number;
  feedCost: number;
  healthCost: number;
  labourCost: number;
  otherCost?: number;
  profit: number;
  feedCostPerLitre: number | null;
  costPerLitre?: number | null;
  rank?: number;
  trend?: 'up' | 'down' | 'flat';
  bottomDecile: boolean;
}

export interface EffectivePriceDto {
  litres: number;
  netPaid: number;
  effectivePrice: number;
  effectivePriceNpr?: number;
  headlineRate: number | null;
  periodEnd: string | null;
  source?: 'payments' | 'fallback';
}

export const stockLotCreateSchema = z.object({
  itemId: z.string().uuid(),
  lotNumber: z.string().min(1).max(60),
  qtyReceived: z.number().positive(),
  unitCostNpr: z.number().nonnegative().optional(),
  receivedOn: z.coerce.date().optional(),
  expiryDate: z.coerce.date().optional(),
});
export type StockLotCreate = z.infer<typeof stockLotCreateSchema>;

export const TAG_REPLACE_REASONS = ['LOST', 'DAMAGED', 'ILLEGIBLE', 'REPLACED'] as const;
export type TagReplaceReason = (typeof TAG_REPLACE_REASONS)[number];

export const tagReplaceSchema = z.object({
  reason: z.enum(TAG_REPLACE_REASONS),
  fullTag: z.string().min(1).max(40).optional(),
});
export type TagReplace = z.infer<typeof tagReplaceSchema>;

export const animalImportRowSchema = z.object({
  tag: z.string().min(1).max(40),
  name: z.string().max(80).optional(),
  species: z.enum(['BUFFALO', 'COW', 'PIG', 'GOAT']),
  breed: z.string().min(1).max(80),
  gender: z.enum(['FEMALE', 'MALE']),
  status: z.enum(['GROWING', 'HEIFER', 'ACTIVE', 'LACTATING', 'DRY']).optional(),
  source: z.enum(['BORN', 'PURCHASED', 'GIFTED', 'TRANSFERRED']).optional(),
  shed: z.string().max(80).optional(),
  sellerName: z.string().max(120).optional(),
  dateOfBirth: z.coerce.date().optional(),
  ageAtAcquisitionMonths: z.number().int().min(0).max(360).optional(),
  purchaseCost: z.number().nonnegative().optional(),
});
export type AnimalImportRow = z.infer<typeof animalImportRowSchema>;

export const animalImportCommitSchema = z.object({
  rows: z.array(animalImportRowSchema).min(1).max(500),
});
export type AnimalImportCommit = z.infer<typeof animalImportCommitSchema>;

export interface AnimalImportPreviewRow {
  row: number;
  data: AnimalImportRow | null;
  errors: string[];
}

export const ADMIN_ROUTES = [
  'INTRAMUSCULAR',
  'SUBCUTANEOUS',
  'INTRAVENOUS',
  'ORAL',
  'TOPICAL',
  'INTRAMAMMARY',
  'INTRANASAL',
] as const;
export type AdminRoute = (typeof ADMIN_ROUTES)[number];

export const batchVaccinateSchema = z.object({
  animalIds: z.array(z.string().uuid()).min(1).max(200),
  itemId: z.string().uuid().optional(),
  lotId: z.string().uuid().optional(),
  doseAmount: z.number().positive().max(100).default(2),
  route: z.enum(ADMIN_ROUTES).default('SUBCUTANEOUS'),
  administeredBy: z.string().max(120).optional(),
  administeredAt: z.coerce.date().default(() => new Date()),
  roundId: z.string().uuid().optional(),
  expiredLotReason: z.string().max(300).nullable().optional(),
  disease: z.string().max(40).optional(),
});
export type BatchVaccinate = z.infer<typeof batchVaccinateSchema>;

export const groupVaccinateSchema = z.object({
  title: z.string().min(1).max(120),
  protocolKey: z.string().max(40).optional(),
  animalIds: z.array(z.string().uuid()).min(1).max(200),
  performedAt: z.coerce.date(),
  batchNumber: z.string().max(80).optional(),
  inventoryItemId: z.string().uuid().optional(),
  milkWithholdUntil: z.coerce.date().optional(),
  meatWithholdUntil: z.coerce.date().optional(),
  pregnantOverride: z.boolean().optional(),
  pregnantOverrideReason: z.string().max(200).optional(),
});
export type GroupVaccinate = z.infer<typeof groupVaccinateSchema>;

export const PREG_CHECK_RESULTS = [
  'PREGNANT',
  'NOT_PREGNANT',
  'INCONCLUSIVE',
  'CONFIRMED',
  'OPEN',
] as const;
export type PregCheckResultInput = (typeof PREG_CHECK_RESULTS)[number];

export const PREG_CHECK_METHODS = [
  'RECTAL_PALPATION',
  'ULTRASOUND',
  'BLOOD_TEST',
  'MILK_TEST',
  'OBSERVATION',
] as const;

export const CALVING_OUTCOMES = [
  'LIVE_SINGLE',
  'LIVE_TWINS',
  'LIVE_TRIPLETS',
  'STILLBORN',
  'ABORTED',
] as const;
export type CalvingOutcome = (typeof CALVING_OUTCOMES)[number];

export const CALVING_COMPLICATIONS = [
  'RETAINED_PLACENTA',
  'MILK_FEVER',
  'PROLAPSE',
  'METRITIS',
  'DYSTOCIA',
  'KETOSIS',
  'NONE',
] as const;

export const DAM_CONDITIONS = ['NORMAL', 'WEAK', 'CRITICAL'] as const;
export type DamCondition = (typeof DAM_CONDITIONS)[number];

export const COLOSTRUM_SOURCES = [
  'OWN_DAM',
  'OTHER_COW',
  'STORED_FROZEN',
  'COMMERCIAL_REPLACER',
  'OWN_MOTHER',
  'OTHER_DAM',
  'FROZEN',
  'REPLACER',
] as const;

export const pregnancyCheckSchema = z.object({
  result: z.enum(PREG_CHECK_RESULTS),
  estimatedDaysPregnant: z.number().int().min(1).max(400).optional(),
  daysPregnant: z.number().int().min(1).max(400).optional(),
  method: z.enum(PREG_CHECK_METHODS).optional(),
  examiner: z.string().max(120).optional(),
  examinerName: z.string().max(120).optional(),
  cost: z.number().nonnegative().optional(),
  costNpr: z.number().nonnegative().optional(),
  checkedAt: z.coerce.date().optional(),
  checkDate: z.coerce.date().optional(),
});
export type PregnancyCheck = z.infer<typeof pregnancyCheckSchema>;

const calfInputSchema = z.object({
  sex: z.enum(['FEMALE', 'MALE']),
  birthWeightKg: z.number().positive().max(80).optional(),
  weightKg: z.number().positive().max(80).optional(),
  name: z.string().max(80).optional(),
  vigour: z.enum(['NORMAL', 'WEAK', 'NON_VIABLE']).optional(),
});

export const calvingSchema = z.object({
  damId: z.string().uuid().optional(),
  serviceId: z.string().uuid().optional(),
  calvingAt: z.coerce.date().optional(),
  birthDate: z.coerce.date().optional(),
  difficulty: z.enum(['EASY', 'ASSISTED', 'EMERGENCY', 'STILLBIRTH']).optional(),
  placentaExpelled: z.boolean().optional(),
  placentaExpelledWithin12h: z.boolean().optional(),
  complications: z
    .union([z.enum(CALVING_COMPLICATIONS), z.array(z.enum(CALVING_COMPLICATIONS)), z.string().max(500)])
    .optional(),
  outcome: z.enum(CALVING_OUTCOMES).optional(),
  damConditionPost: z.enum(DAM_CONDITIONS).optional(),
  assistedBy: z.string().max(120).optional(),
  notes: z.string().max(2000).optional(),
  calves: z.array(calfInputSchema).max(4).default([]),
});
export type CalvingInput = z.infer<typeof calvingSchema>;

export const colostrumSchema = z.object({
  calfId: z.string().uuid().optional(),
  calfRecordId: z.string().uuid().optional(),
  taskId: z.string().uuid().optional(),
  fedAt: z.coerce.date(),
  volumeLitres: z.number().positive().max(20).optional(),
  liters: z.number().positive().max(20).optional(),
  source: z.enum(COLOSTRUM_SOURCES).optional(),
  method: z.enum(['SUCKLED', 'BOTTLE', 'TUBE']).optional(),
  quality: z.enum(['THICK_YELLOW', 'THIN_WATERY', 'BLOODY', 'NOT_ASSESSED']).optional(),
  heatTreated: z.boolean().optional(),
});
export type ColostrumInput = z.infer<typeof colostrumSchema>;

export const NEPAL_VACCINE_PROTOCOLS = [
  { key: 'FMD', titleEn: 'FMD', titleNp: 'खोरेत', firstDoseMonths: 6, boosterDays: 28, intervalDays: 180, sex: 'ANY' as const, blockPregnant: false },
  { key: 'HS', titleEn: 'Haemorrhagic septicaemia', titleNp: 'एच.एस.', firstDoseMonths: 6, boosterDays: null, intervalDays: 365, sex: 'ANY' as const, blockPregnant: false, seasonMonths: [4, 5] },
  { key: 'BQ', titleEn: 'Black quarter', titleNp: 'बि.क्यू.', firstDoseMonths: 6, boosterDays: null, intervalDays: 365, sex: 'ANY' as const, blockPregnant: false, seasonMonths: [4, 5] },
  { key: 'BRUCELLOSIS', titleEn: 'Brucellosis', titleNp: 'ब्रुसेलोसिस', firstDoseMonths: 4, boosterDays: null, intervalDays: null, sex: 'FEMALE' as const, blockPregnant: true },
  { key: 'ANTHRAX', titleEn: 'Anthrax', titleNp: 'एन्थ्राक्स', firstDoseMonths: 6, boosterDays: null, intervalDays: 365, sex: 'ANY' as const, blockPregnant: false, farmEnabled: true },
  { key: 'DEWORMING', titleEn: 'Deworming', titleNp: 'जुकाको औषधी', firstDoseMonths: 1, boosterDays: null, intervalDays: 90, sex: 'ANY' as const, blockPregnant: false },
  { key: 'ECTOPARASITE', titleEn: 'Ectoparasite', titleNp: 'बाह्य परजीवी', firstDoseMonths: 1, boosterDays: null, intervalDays: 30, sex: 'ANY' as const, blockPregnant: false, seasonMonths: [6, 7, 8, 9] },
] as const;

export interface DailySheetRow {
  herdNumber: string | null;
  name: string | null;
  shed: string | null;
  milk: boolean;
  withhold: boolean;
  dry: boolean;
  treatment: string | null;
  band: string | null;
}

export interface RecordingRoundDto {
  id: string;
  mode: RecordingMode;
  session: MilkSession | null;
  date: string;
  status: RoundStatus;
  startedAt: string;
  finishedAt: string | null;
  expectedCount: number | null;
  recordedCount: number;
  skippedCount: number;
  totalLitres: number | null;
  durationSeconds: number | null;
  secondsPerAnimal: number | null;
  milkRoundId: string | null;
}

export interface RoundRemainingAnimalDto {
  id: string;
  shortNo: string | null;
  tag: string;
  name: string | null;
  species: string;
  penName: string | null;
  photoUrl: string | null;
  status: string;
  isPregnant: boolean;
  withholdActive: boolean;
  usualLitres: number | null;
}

export interface RoundRemainingDto {
  round: RecordingRoundDto;
  expected: number;
  recorded: number;
  remaining: RoundRemainingAnimalDto[];
}

export interface RoundMetricsDto {
  from: string;
  to: string;
  rounds: number;
  finished: number;
  abandoned: number;
  abandonRate: number;
  recordedCount: number;
  skippedCount: number;
  completeness: number;
  avgSecondsPerAnimal: number | null;
  totalLitres: number;
}

export interface AnimalSearchHitDto {
  id: string;
  shortNo: string | null;
  tag: string;
  name: string | null;
  species: string;
  penName: string | null;
  photoUrl: string | null;
  status: string;
}

export interface ScanBlockDto {
  kind: 'MILK_WITHHOLD';
  until: string;
  drug: string | null;
  messageNp: string;
  blocksDisposal: MilkDisposal[];
}

export interface ScanResolveDto {
  animal: {
    id: string;
    shortNo: string | null;
    name: string | null;
    nameNp: string | null;
    species: string;
    penName: string | null;
    photoUrl: string | null;
  };
  status: {
    status: string;
    isPregnant: boolean;
    daysInMilk: number | null;
    daysToCalving: number | null;
  };
  blocks: ScanBlockDto[];
  markers: Array<{ reason: string; colour: string; until: string | null }>;
  context: {
    rolling7Mean: number | null;
    alreadyRecordedThisRound: boolean;
    existingValue: number | null;
    existingEntryId: string | null;
    expectedRangeLow: number | null;
    expectedRangeHigh: number | null;
  };
  nextAction:
    | 'MILK_ENTRY'
    | 'DOSE_CONFIRM'
    | 'WEIGHT_ENTRY'
    | 'SYMPTOM_PICKER'
    | 'MARKER_CONFIRM'
    | 'PROFILE';
}

export interface FarmWithholdDto {
  id: string;
  animalId: string;
  shortNo: string | null;
  name: string | null;
  drugName: string;
  startDate: string;
  endDate: string;
  kind: 'MILK' | 'MEAT';
  messageNp: string;
}

export interface MilkEntryDto {
  id: string;
  animalId: string;
  date: string;
  session: MilkSession;
  litres: number;
  disposal: MilkDisposal;
  roundId: string | null;
}

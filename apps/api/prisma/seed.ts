/**
 * Seed: one farm, one user per role, individual animals, herd batches
 * (livestock/poultry/fish) and finance samples.
 * Idempotent — safe to run repeatedly.
 */
import {
  PrismaClient,
  Role,
  Species,
  Gender,
  AnimalStatus,
  AnimalSource,
  ExpenseCategory,
  ApprovalStatus,
  RevenueSource,
  PaymentStatus,
  InventoryCategory,
  HealthRecordType,
  ProductionType,
  QualityGrade,
  HerdBatchKind,
  ProtocolTrigger,
  SexRestriction,
} from '@prisma/client';
import * as bcrypt from 'bcryptjs';
import { SYSTEM_REMINDER_RULES } from '../src/breeding/reminder-catalog';

const prisma = new PrismaClient();

const SEED_PASSWORD = process.env.SEED_PASSWORD ?? 'ChangeMe123!';
const FARM_ID = '00000000-0000-4000-8000-000000000001';

const USERS: Array<{ email: string; name: string; role: Role }> = [
  { email: 'admin@farm.local', name: 'Farm Owner', role: Role.ADMIN },
  { email: 'manager@farm.local', name: 'Farm Manager', role: Role.MANAGER },
  { email: 'worker@farm.local', name: 'Farm Worker', role: Role.WORKER },
];

function daysAgo(n: number): Date {
  const d = new Date();
  d.setHours(6, 0, 0, 0);
  d.setDate(d.getDate() - n);
  return d;
}

function daysFromNow(n: number): Date {
  const d = new Date();
  d.setHours(6, 0, 0, 0);
  d.setDate(d.getDate() + n);
  return d;
}

type SeedAnimal = {
  tag: string;
  herdNumber: string;
  name: string;
  species: Species;
  breed: string;
  gender: Gender;
  color: string;
  status: AnimalStatus;
  source: AnimalSource;
  weightKg: number;
  seqNo: number;
  dateOfBirth: Date;
  dobIsEstimated: boolean;
  ageAtAcquisitionMonths: number;
  sellerName?: string;
  purchaseDate?: Date;
  purchaseCost?: number;
  distinguishingMarks: string;
  notes: string;
  breedingStock: boolean;
  lactationNumber: number;
  lactationStartDate?: Date;
  expectedLactationDays: number;
  isPregnant: boolean;
  expectedCalvingDate?: Date;
  pregnancyConfirmedDate?: Date;
  breedComposition: Record<string, number>;
};

const BUFFALO_NAMES = [
  'Kalimati',
  'Kali',
  'Ganga',
  'Sita',
  'Maya',
  'Laxmi',
  'Parbati',
  'Jamuna',
  'Radha',
  'Gauri',
  'Bhawani',
  'Nanda',
  'Kamala',
  'Durga',
  'Tara',
  'Sunita',
  'Rupa',
  'Hira',
  'Bahadur',
  'Sher',
  'Kopila',
  'Sukumaya',
] as const;

const COW_NAMES = [
  'Kamdhenu',
  'Shanti',
  'Lakshmi',
  'Rani',
  'Purnima',
  'Asha',
  'Nirmala',
  'Champa',
  'Malati',
  'Kalpana',
  'Sushila',
  'Indira',
  'Sarita',
  'Bina',
  'Mina',
  'Puja',
  'Rekha',
  'Gita',
  'Raja',
  'Bijay',
  'Tulsi',
  'Ambika',
] as const;

const BULL_NAMES = new Set(['Bahadur', 'Sher', 'Raja', 'Bijay']);

const MARKS = [
  'White star on forehead',
  'Notch in left ear',
  'White socks on hind legs',
  'Scar on right shoulder',
  'Broken horn tip',
  'Pink muzzle',
];

function femaleCycle(n: number, lactationDays: number): Pick<
  SeedAnimal,
  | 'status'
  | 'lactationNumber'
  | 'lactationStartDate'
  | 'expectedLactationDays'
  | 'isPregnant'
  | 'expectedCalvingDate'
  | 'pregnancyConfirmedDate'
> {
  const slot = (n - 1) % 6;
  if (slot === 1) {
    return {
      status: AnimalStatus.LACTATING,
      lactationNumber: 2,
      lactationStartDate: daysAgo(18),
      expectedLactationDays: lactationDays,
      isPregnant: false,
    };
  }
  if (slot === 2) {
    return {
      status: AnimalStatus.LACTATING,
      lactationNumber: 3,
      lactationStartDate: daysAgo(140),
      expectedLactationDays: lactationDays,
      isPregnant: true,
      expectedCalvingDate: daysFromNow(50),
      pregnancyConfirmedDate: daysAgo(90),
    };
  }
  if (slot === 3) {
    return {
      status: AnimalStatus.DRY,
      lactationNumber: 4,
      lactationStartDate: daysAgo(220),
      expectedLactationDays: lactationDays,
      isPregnant: true,
      expectedCalvingDate: daysFromNow(25),
      pregnancyConfirmedDate: daysAgo(120),
    };
  }
  if (slot === 4) {
    return {
      status: AnimalStatus.HEIFER,
      lactationNumber: 0,
      expectedLactationDays: lactationDays,
      isPregnant: false,
    };
  }
  if (slot === 5) {
    return {
      status: AnimalStatus.LACTATING,
      lactationNumber: 3,
      lactationStartDate: daysAgo(180),
      expectedLactationDays: lactationDays,
      isPregnant: false,
    };
  }
  return {
    status: AnimalStatus.LACTATING,
    lactationNumber: 2,
    lactationStartDate: daysAgo(90),
    expectedLactationDays: lactationDays,
    isPregnant: false,
  };
}

function herdOf(
  species: Species,
  names: readonly string[],
  numbers: number[],
  prefix: string,
  letter: string,
  breed: string,
  color: (n: number, male: boolean) => string,
  composition: Record<string, number>,
  lactationDays: number,
  baseWeight: number,
): SeedAnimal[] {
  return names.map((name, idx) => {
    const n = numbers[idx]!;
    const male = BULL_NAMES.has(name);
    const purchased = n % 3 !== 0;
    const cycle = male
      ? {
          status: AnimalStatus.ACTIVE,
          lactationNumber: 0,
          expectedLactationDays: lactationDays,
          isPregnant: false,
        }
      : femaleCycle(n, lactationDays);
    return {
      tag: `${prefix}${String(n).padStart(3, '0')}`,
      herdNumber: `${letter}${String(n).padStart(2, '0')}`,
      name,
      species,
      breed,
      gender: male ? Gender.MALE : Gender.FEMALE,
      color: color(n, male),
      source: purchased ? AnimalSource.PURCHASED : AnimalSource.BORN,
      weightKg: male ? baseWeight + 80 : baseWeight + (n % 5) * 8,
      seqNo: n,
      dateOfBirth: daysAgo((male ? 5 : cycle.lactationNumber === 0 ? 2 : 6) * 365 + n * 7),
      dobIsEstimated: purchased,
      ageAtAcquisitionMonths: purchased ? 24 + (n % 12) : 0,
      sellerName: purchased ? 'Chitwan livestock trader' : undefined,
      purchaseDate: purchased ? daysAgo(200 + n * 3) : undefined,
      purchaseCost: purchased ? (male ? 180000 : 120000 + n * 1500) : undefined,
      distinguishingMarks: MARKS[idx % MARKS.length]!,
      notes: 'Seed herd — every registration field filled.',
      breedingStock: true,
      breedComposition: composition,
      ...cycle,
    };
  });
}

function pickNames(all: readonly string[], used: Set<string>, count: number): string[] {
  return all.filter((name) => !used.has(name)).slice(0, count);
}

function takeFreeNumbers(used: Set<number>, count: number): number[] {
  const out: number[] = [];
  for (let n = 1; out.length < count; n += 1) {
    if (!used.has(n)) out.push(n);
  }
  return out;
}

async function main(): Promise<void> {
  const farm = await prisma.farm.upsert({
    where: { id: FARM_ID },
    update: {
      mode: 'COMMERCIAL',
      livestockTrackingMode: 'INDIVIDUAL',
      milkPriceNpr: 62,
      labourMonthlyNpr: 45000,
    },
    create: {
      id: FARM_ID,
      name: 'Evoqed Mixed Farm',
      location: 'Nepal',
      currency: 'NPR',
      timezone: 'Asia/Kathmandu',
      // Explicit: the demo data seeds tagged individual animals, so the farm
      // should land on the individual-first surface rather than batch counts.
      mode: 'COMMERCIAL',
      livestockTrackingMode: 'INDIVIDUAL',
      milkPriceNpr: 62,
      labourMonthlyNpr: 45000,
    },
  });

  const passwordHash = await bcrypt.hash(SEED_PASSWORD, 10);
  let workerId = '';

  for (const u of USERS) {
    const user = await prisma.user.upsert({
      where: { email: u.email },
      update: { name: u.name },
      create: { email: u.email, name: u.name, passwordHash },
    });
    await prisma.farmMembership.upsert({
      where: { userId_farmId: { userId: user.id, farmId: farm.id } },
      update: { role: u.role },
      create: { userId: user.id, farmId: farm.id, role: u.role },
    });
    if (u.role === Role.WORKER) workerId = user.id;
  }

  const periodStart = new Date(Date.UTC(2026, 7, 1));
  const periodEnd = new Date(Date.UTC(2026, 7, 15));
  await prisma.cooperativePayment.upsert({
    where: {
      farmId_cooperativeId_periodStart: {
        farmId: farm.id,
        cooperativeId: farm.id,
        periodStart,
      },
    },
    update: {},
    create: {
      farmId: farm.id,
      cooperativeId: farm.id,
      periodStart,
      periodEnd,
      litresSupplied: 1000,
      basePriceNpr: 62000,
      coolingDeductionNpr: 4000,
      transportDeductionNpr: 3000,
      membershipDeductionNpr: 1640,
      loanRepaymentNpr: 5000,
      netPayableNpr: 48360,
      effectivePriceNpr: 48.36,
    },
  });
  await prisma.farm.update({
    where: { id: farm.id },
    data: { effectivePriceNpr: 48.36 },
  });

  const pens = [
    { name: 'Shed 1', sortOrder: 1 },
    { name: 'Shed 2', sortOrder: 2 },
    { name: 'Shed 3', sortOrder: 3 },
  ];
  const penIds: string[] = [];
  for (const pen of pens) {
    const row = await prisma.pen.upsert({
      where: { farmId_name: { farmId: farm.id, name: pen.name } },
      update: { sortOrder: pen.sortOrder },
      create: { farmId: farm.id, name: pen.name, sortOrder: pen.sortOrder },
    });
    penIds.push(row.id);
  }

  const existingAnimals = await prisma.animal.findMany({
    where: { farmId: farm.id, deletedAt: null },
    select: { tag: true, herdNumber: true, species: true, name: true },
  });
  const usedBuffalo = new Set<number>();
  const usedCow = new Set<number>();
  const usedTags = new Set(existingAnimals.map((row) => row.tag));
  const usedNames = new Set(
    existingAnimals.map((row) => row.name).filter((name): name is string => Boolean(name)),
  );
  for (const row of existingAnimals) {
    const parsed = row.herdNumber?.match(/^([BC])(\d+)$/);
    const n = parsed?.[2] ? Number(parsed[2]) : NaN;
    if (!Number.isInteger(n)) continue;
    if (parsed?.[1] === 'B' || row.species === Species.BUFFALO) usedBuffalo.add(n);
    if (parsed?.[1] === 'C' || row.species === Species.COW) usedCow.add(n);
  }

  const buffaloNames = pickNames(BUFFALO_NAMES, usedNames, 20);
  const cowNames = pickNames(COW_NAMES, usedNames, 20);
  const ANIMALS: SeedAnimal[] = [
    ...herdOf(
      Species.BUFFALO,
      buffaloNames,
      takeFreeNumbers(usedBuffalo, buffaloNames.length),
      'BUF',
      'B',
      'Murrah',
      () => 'Black',
      { murrah: 0.75, local: 0.25 },
      242,
      470,
    ),
    ...herdOf(
      Species.COW,
      cowNames,
      takeFreeNumbers(usedCow, cowNames.length),
      'COW',
      'C',
      'Jersey cross',
      (n, male) => (male ? 'Brown' : n % 2 === 0 ? 'Black & White' : 'Brown'),
      { jersey: 0.5, local: 0.5 },
      286,
      390,
    ),
  ].filter((row) => !usedTags.has(row.tag));

  let animalIndex = existingAnimals.length;
  for (const a of ANIMALS) {
    const penId = penIds[animalIndex % penIds.length];
    const shed = pens[animalIndex % pens.length]?.name;
    const animal = await prisma.animal.upsert({
      where: { farmId_tag: { farmId: farm.id, tag: a.tag } },
      update: {
        name: a.name,
        herdNumber: a.herdNumber,
        breed: a.breed,
        gender: a.gender,
        color: a.color,
        source: a.source,
        status: a.status,
        breedingStock: a.breedingStock,
        dateOfBirth: a.dateOfBirth,
        dobIsEstimated: a.dobIsEstimated,
        ageAtAcquisitionMonths: a.ageAtAcquisitionMonths,
        sellerName: a.sellerName,
        purchaseDate: a.purchaseDate,
        purchaseCost: a.purchaseCost,
        distinguishingMarks: a.distinguishingMarks,
        notes: a.notes,
        lactationNumber: a.lactationNumber,
        lactationStartDate: a.lactationStartDate,
        expectedLactationDays: a.expectedLactationDays,
        isPregnant: a.isPregnant,
        expectedCalvingDate: a.expectedCalvingDate,
        pregnancyConfirmedDate: a.pregnancyConfirmedDate,
        breedComposition: a.breedComposition,
        penId,
        seqNo: a.seqNo,
        shed,
      },
      create: {
        farmId: farm.id,
        tag: a.tag,
        herdNumber: a.herdNumber,
        name: a.name,
        species: a.species,
        breed: a.breed,
        gender: a.gender,
        color: a.color,
        source: a.source,
        status: a.status,
        breedingStock: a.breedingStock,
        dateOfBirth: a.dateOfBirth,
        dobIsEstimated: a.dobIsEstimated,
        ageAtAcquisitionMonths: a.ageAtAcquisitionMonths,
        sellerName: a.sellerName,
        purchaseDate: a.purchaseDate,
        purchaseCost: a.purchaseCost,
        distinguishingMarks: a.distinguishingMarks,
        notes: a.notes,
        lactationNumber: a.lactationNumber,
        lactationStartDate: a.lactationStartDate,
        expectedLactationDays: a.expectedLactationDays,
        isPregnant: a.isPregnant,
        expectedCalvingDate: a.expectedCalvingDate,
        pregnancyConfirmedDate: a.pregnancyConfirmedDate,
        breedComposition: a.breedComposition,
        penId,
        seqNo: a.seqNo,
        shed,
      },
    });

    const issued = await prisma.animalTag.findFirst({
      where: { animalId: animal.id, reason: 'ISSUED' },
    });
    if (!issued) {
      await prisma.animalTag.create({
        data: {
          farmId: farm.id,
          animalId: animal.id,
          herdNumber: a.herdNumber,
          fullTag: a.tag,
          reason: 'ISSUED',
        },
      });
    }

    const history = await prisma.animalStatusHistory.findFirst({
      where: { animalId: animal.id },
    });
    if (!history) {
      await prisma.animalStatusHistory.create({
        data: {
          farmId: farm.id,
          animalId: animal.id,
          fromStatus: null,
          toStatus: a.status,
          reason: 'Registered',
        },
      });
    }

    if (a.weightKg !== undefined) {
      const existing = await prisma.weightRecord.findFirst({
        where: { animalId: animal.id },
      });
      if (!existing) {
        await prisma.weightRecord.create({
          data: {
            farmId: farm.id,
            animalId: animal.id,
            weightKg: a.weightKg,
            recordedAt: new Date(),
          },
        });
      }
    }
    animalIndex += 1;
  }

  for (const species of [Species.BUFFALO, Species.COW] as const) {
    const letter = species === Species.BUFFALO ? 'B' : 'C';
    const numbered = await prisma.animal.findMany({
      where: { farmId: farm.id, species, deletedAt: null, herdNumber: { not: null } },
      select: { herdNumber: true },
    });
    let max = 0;
    for (const row of numbered) {
      const n = Number(row.herdNumber?.slice(letter.length));
      if (Number.isInteger(n) && n > max) max = n;
    }
    const nextNumber = max + 1;
    await prisma.herdNumberSequence.upsert({
      where: { farmId_species: { farmId: farm.id, species } },
      update: { nextNumber, reservedThrough: Math.max(max, 0) },
      create: { farmId: farm.id, species, nextNumber, reservedThrough: Math.max(max, 0) },
    });
  }

  // ---- Herd batches (primary count tracking) ----
  const herdDefs: Array<{
    kind: 'LIVESTOCK' | 'POULTRY' | 'FISH';
    category: string;
    name: string;
    ageFromMonths: number | null;
    ageToMonths: number | null;
    count: number;
    dead?: number;
    illness?: { condition: string; count: number };
  }> = [
    {
      kind: 'LIVESTOCK',
      category: 'BUFFALO',
      name: 'Buffalo calves 2025',
      ageFromMonths: 0,
      ageToMonths: 12,
      count: 18,
      illness: { condition: 'PARASITES', count: 2 },
    },
    {
      kind: 'LIVESTOCK',
      category: 'BUFFALO',
      name: 'Buffalo adults',
      ageFromMonths: 36,
      ageToMonths: 120,
      count: 42,
      dead: 1,
      illness: { condition: 'MASTITIS', count: 3 },
    },
    {
      kind: 'LIVESTOCK',
      category: 'COW',
      name: 'Cow yearlings',
      ageFromMonths: 12,
      ageToMonths: 36,
      count: 25,
    },
    {
      kind: 'LIVESTOCK',
      category: 'GOAT',
      name: 'Goat flock adults',
      ageFromMonths: 12,
      ageToMonths: 60,
      count: 60,
      illness: { condition: 'RESPIRATORY', count: 4 },
    },
    {
      kind: 'POULTRY',
      category: 'LAYER',
      name: 'Layer House A — pullets',
      ageFromMonths: 4,
      ageToMonths: 8,
      count: 480,
      dead: 20,
      illness: { condition: 'NEWCASTLE', count: 12 },
    },
    {
      kind: 'POULTRY',
      category: 'BROILER',
      name: 'Broiler B — grow-out',
      ageFromMonths: 0,
      ageToMonths: 2,
      count: 290,
      dead: 10,
    },
    {
      kind: 'FISH',
      category: 'ROHU',
      name: 'Rohu Pond 1 — fingerlings',
      ageFromMonths: 0,
      ageToMonths: 6,
      count: 4800,
      dead: 200,
    },
    {
      kind: 'FISH',
      category: 'CATLA',
      name: 'Catla Pond 2 — growers',
      ageFromMonths: 6,
      ageToMonths: 18,
      count: 2900,
    },
    {
      kind: 'POULTRY',
      category: 'DUCK',
      name: 'Ducks',
      ageFromMonths: 0,
      ageToMonths: 12,
      count: 200,
    },
  ];

  /** Batch ids by name, so later seed rows can reference a real batch. */
  const herdBatchIds = new Map<string, string>();

  for (const h of herdDefs) {
    const existing = await prisma.herdBatch.findFirst({
      where: { farmId: farm.id, name: h.name, deletedAt: null },
    });
    if (existing) {
      herdBatchIds.set(h.name, existing.id);
      continue;
    }
    const created = await prisma.herdBatch.create({
      data: {
        farmId: farm.id,
        kind: h.kind,
        category: h.category,
        name: h.name,
        ageFromMonths: h.ageFromMonths,
        ageToMonths: h.ageToMonths,
        initialCount: h.count + (h.dead ?? 0),
        currentCount: h.count,
        deadCount: h.dead ?? 0,
      },
    });
    herdBatchIds.set(h.name, created.id);
    if (h.illness) {
      await prisma.batchIllnessEvent.create({
        data: {
          farmId: farm.id,
          batchId: created.id,
          condition: h.illness.condition,
          count: h.illness.count,
          occurredAt: new Date(),
        },
      });
    }
    if (h.dead && h.dead > 0) {
      await prisma.batchMortalityEvent.create({
        data: {
          farmId: farm.id,
          batchId: created.id,
          count: h.dead,
          reason: 'Seed mortality sample',
          occurredAt: new Date(),
        },
      });
    }
    if (h.kind === HerdBatchKind.FISH) {
      await prisma.batchWaterQualityLog.create({
        data: {
          farmId: farm.id,
          batchId: created.id,
          recordedAt: new Date(),
          temperatureC: 28.5,
          ph: 7.2,
          dissolvedO2: 5.5,
          notes: 'Seed water sample',
        },
      });
      await prisma.batchSamplingEvent.create({
        data: {
          farmId: farm.id,
          batchId: created.id,
          sampledAt: new Date(),
          sampleCount: 20,
          totalWeightGrams: 5000,
          estimatedCount: h.count,
          avgWeightGrams: 250,
        },
      });
    }
    await prisma.batchFeedEvent.create({
      data: {
        farmId: farm.id,
        batchId: created.id,
        quantityKg: 25,
        feedType: 'Mixed feed',
        occurredAt: new Date(),
        notes: 'Seed feed log',
      },
    });
  }

  // ---- Species reproductive constants ----
  // Buffalo and cattle differ on every one of these. Nothing in application
  // code may hardcode them, so an empty table breaks breeding by design.
  // Buffalo and cow figures are the authoritative Nepal numbers; pig and goat
  // are reasonable starting values and should be reviewed by a vet.
  const speciesConfigs = [
    {
      species: Species.BUFFALO,
      gestationDays: 310,
      lactationDays: 242,
      voluntaryWaitingDays: 60,
      estrusCycleDays: 21,
      ageFirstServiceMonths: 30,
      pregnancyCheckEarliestDays: 45,
      targetCalvingIntervalDays: 425,
      dryOffDaysBeforeCalving: 60,
      gestationVarianceDays: 10,
      minWeightFirstServiceKg: 300,
      serviceWindowStartHours: 12,
      serviceWindowEndHours: 18,
      silentHeatCheckHour: 4,
      fatMinPercent: 6.5,
      fatMaxPercent: 8.0,
      tempMinC: 37.5,
      tempMaxC: 39.5,
    },
    {
      species: Species.COW,
      gestationDays: 283,
      lactationDays: 286,
      voluntaryWaitingDays: 50,
      estrusCycleDays: 21,
      ageFirstServiceMonths: 15,
      pregnancyCheckEarliestDays: 35,
      targetCalvingIntervalDays: 380,
      dryOffDaysBeforeCalving: 60,
      gestationVarianceDays: 7,
      minWeightFirstServiceKg: 250,
      serviceWindowStartHours: 12,
      serviceWindowEndHours: 18,
      silentHeatCheckHour: null,
      fatMinPercent: 3.5,
      fatMaxPercent: 4.5,
      tempMinC: 38.0,
      tempMaxC: 39.3,
    },
    {
      species: Species.PIG,
      gestationDays: 114,
      lactationDays: 60,
      voluntaryWaitingDays: 30,
      estrusCycleDays: 21,
      ageFirstServiceMonths: 8,
      pregnancyCheckEarliestDays: 30,
      targetCalvingIntervalDays: 180,
      dryOffDaysBeforeCalving: 0,
      gestationVarianceDays: 3,
      minWeightFirstServiceKg: 120,
      serviceWindowStartHours: 12,
      serviceWindowEndHours: 18,
      silentHeatCheckHour: null,
      fatMinPercent: 5.0,
      fatMaxPercent: 8.0,
      tempMinC: 38.7,
      tempMaxC: 40.0,
    },
    {
      species: Species.GOAT,
      gestationDays: 150,
      lactationDays: 180,
      voluntaryWaitingDays: 45,
      estrusCycleDays: 21,
      ageFirstServiceMonths: 10,
      pregnancyCheckEarliestDays: 35,
      targetCalvingIntervalDays: 240,
      dryOffDaysBeforeCalving: 30,
      gestationVarianceDays: 3,
      minWeightFirstServiceKg: 25,
      serviceWindowStartHours: 12,
      serviceWindowEndHours: 18,
      silentHeatCheckHour: null,
      fatMinPercent: 5.0,
      fatMaxPercent: 8.0,
      tempMinC: 38.5,
      tempMaxC: 40.5,
    },
  ];
  for (const config of speciesConfigs) {
    await prisma.speciesConfig.upsert({
      where: { species: config.species },
      update: config,
      create: config,
    });
  }

  for (const rule of SYSTEM_REMINDER_RULES) {
    const data = {
      taskType: rule.taskType,
      triggerStage: rule.triggerStage ?? null,
      triggerEvent: rule.triggerEvent ?? null,
      species: rule.species ?? [],
      offsetDays: rule.offsetDays ?? 0,
      offsetHours: rule.offsetHours ?? 0,
      fireAtHour: rule.fireAtHour ?? null,
      repeatEveryDays: rule.repeatEveryDays ?? null,
      repeatUntilStage: rule.repeatUntilStage ?? null,
      maxRepeats: rule.maxRepeats ?? null,
      priority: rule.priority,
      channels: [...rule.channels],
      escalateAfterMinutes: rule.escalateAfterMinutes ?? null,
      escalateToRole: rule.escalateToRole ?? null,
      titleEn: rule.titleEn,
      titleNp: rule.titleNp,
      bodyEn: rule.bodyEn ?? null,
      bodyNp: rule.bodyNp ?? null,
      actionKeys: rule.actionKeys ?? [],
      active: true,
      isSystemDefault: true,
    };
    const existing = await prisma.reminderRule.findFirst({
      where: { code: rule.code, farmId: null },
    });
    if (existing) {
      await prisma.reminderRule.update({ where: { id: existing.id }, data });
    } else {
      await prisma.reminderRule.create({ data: { ...data, code: rule.code, farmId: null } });
    }
  }

  const dairy = [Species.BUFFALO, Species.COW];
  const allSpecies = [Species.BUFFALO, Species.COW, Species.PIG, Species.GOAT];
  const systemProtocols = [
    {
      id: '00000000-0000-4000-8000-0000000000f1',
      disease: 'FMD',
      diseaseNp: 'खोरेत',
      species: dairy,
      trigger: ProtocolTrigger.AGE_BASED,
      triggerAgeDays: 180,
      boosterAfterDays: 28,
      repeatIntervalDays: 180,
      sexRestriction: SexRestriction.ANY,
      pregnancyContraindicated: false,
      active: true,
      notes: 'First at 180d, booster +28d, then every 180d',
    },
    {
      id: '00000000-0000-4000-8000-0000000000f2',
      disease: 'HS',
      diseaseNp: 'एच.एस.',
      species: dairy,
      trigger: ProtocolTrigger.SEASONAL,
      triggerMonth: 4,
      repeatIntervalDays: 365,
      sexRestriction: SexRestriction.ANY,
      pregnancyContraindicated: false,
      active: true,
      notes: 'Annually, month 4 (April–May, pre-monsoon)',
    },
    {
      id: '00000000-0000-4000-8000-0000000000f3',
      disease: 'BQ',
      diseaseNp: 'बि.क्यू.',
      species: [Species.COW],
      trigger: ProtocolTrigger.SEASONAL,
      triggerMonth: 4,
      triggerAgeDays: 180,
      repeatIntervalDays: 365,
      sexRestriction: SexRestriction.ANY,
      pregnancyContraindicated: false,
      active: true,
      notes: 'Annually month 4. Young cattle 6mo–2yr especially',
    },
    {
      id: '00000000-0000-4000-8000-0000000000f4',
      disease: 'BRUCELLOSIS',
      diseaseNp: 'ब्रुसेलोसिस',
      species: dairy,
      trigger: ProtocolTrigger.AGE_BASED,
      triggerAgeDays: 120,
      sexRestriction: SexRestriction.FEMALE,
      pregnancyContraindicated: true,
      active: true,
      notes: 'Once at 120d, females only, contraindicated in pregnancy',
    },
    {
      id: '00000000-0000-4000-8000-0000000000f6',
      disease: 'ANTHRAX',
      diseaseNp: 'एन्थ्राक्स',
      species: dairy,
      trigger: ProtocolTrigger.SEASONAL,
      triggerMonth: 4,
      repeatIntervalDays: 365,
      sexRestriction: SexRestriction.ANY,
      pregnancyContraindicated: false,
      active: false,
      notes: 'Annually, endemic districts only — enable per farm',
    },
    {
      id: '00000000-0000-4000-8000-0000000000f5',
      disease: 'DEWORMING',
      diseaseNp: 'जुकाको औषधी',
      species: allSpecies,
      trigger: ProtocolTrigger.INTERVAL,
      triggerAgeDays: 30,
      repeatIntervalDays: 90,
      sexRestriction: SexRestriction.ANY,
      pregnancyContraindicated: false,
      active: true,
      notes: 'Every 90d; calves under 180d every 30d',
    },
    {
      id: '00000000-0000-4000-8000-0000000000f7',
      disease: 'ECTOPARASITE',
      diseaseNp: 'बाह्य परजीवी',
      species: dairy,
      trigger: ProtocolTrigger.INTERVAL,
      triggerAgeDays: 30,
      repeatIntervalDays: 30,
      sexRestriction: SexRestriction.ANY,
      pregnancyContraindicated: false,
      active: true,
      notes: 'Every 30d, months 6–9 only (monsoon)',
    },
  ];
  for (const protocol of systemProtocols) {
    await prisma.vaccineProtocol.upsert({
      where: { id: protocol.id },
      update: { ...protocol, farmId: null, isSystemDefault: true },
      create: { ...protocol, farmId: null, isSystemDefault: true },
    });
  }

  // AnimalGroup and FishBatch are deprecated — poultry and fish are seeded as
  // HerdBatch above. Seeding both produced two rows for one physical flock and
  // double-counted headcount, which is the denominator for mortality rate and
  // feed per bird.

  // ---- Expenses ----
  const expenseCount = await prisma.expense.count({ where: { farmId: farm.id } });
  if (expenseCount === 0 && workerId) {
    await prisma.expense.createMany({
      data: [
        {
          farmId: farm.id,
          category: ExpenseCategory.FEED,
          amount: 12000,
          expenseDate: new Date(),
          description: 'Layer mash 50kg bags',
          status: ApprovalStatus.PENDING,
          submittedById: workerId,
        },
        {
          farmId: farm.id,
          category: ExpenseCategory.MEDICINE,
          amount: 3500,
          expenseDate: new Date(),
          description: 'Dewormer stock',
          status: ApprovalStatus.APPROVED,
          submittedById: workerId,
        },
        {
          farmId: farm.id,
          category: ExpenseCategory.FEED,
          amount: 65000,
          expenseDate: new Date(),
          description: 'Bulk fish feed (escalated)',
          status: ApprovalStatus.ESCALATED,
          submittedById: workerId,
        },
      ],
    });
  }

  // ---- Revenue ----
  const revenueCount = await prisma.revenue.count({ where: { farmId: farm.id } });
  if (revenueCount === 0) {
    const today = new Date();
    const ymd = today.toISOString().slice(0, 10).replace(/-/g, '');
    await prisma.revenue.createMany({
      data: [
        {
          farmId: farm.id,
          source: RevenueSource.MILK,
          quantity: 80,
          unit: 'liter',
          rate: 80,
          amount: 6400,
          revenueDate: today,
          paymentStatus: PaymentStatus.PAID,
          invoiceNumber: `INV-${ymd}-0001`,
          buyerName: 'Local dairy',
        },
        {
          farmId: farm.id,
          source: RevenueSource.EGGS,
          quantity: 400,
          unit: 'pcs',
          rate: 15,
          amount: 6000,
          revenueDate: today,
          paymentStatus: PaymentStatus.PENDING,
          invoiceNumber: `INV-${ymd}-0002`,
        },
      ],
    });
  }

  // ---- Inventory ----
  const invCount = await prisma.inventoryItem.count({
    where: { farmId: farm.id, deletedAt: null },
  });
  if (invCount === 0) {
    await prisma.inventoryItem.createMany({
      data: [
        {
          farmId: farm.id,
          name: 'Layer mash',
          category: InventoryCategory.FEED,
          unit: 'kg',
          currentStock: 40,
          minimumStock: 100,
          unitCost: 55,
        },
        {
          farmId: farm.id,
          name: 'Ivermectin',
          category: InventoryCategory.MEDICINE,
          unit: 'ml',
          currentStock: 200,
          minimumStock: 50,
          unitCost: 12,
          expiryDate: new Date(Date.now() + 20 * 86_400_000),
        },
        {
          farmId: farm.id,
          name: 'Newcastle vaccine',
          category: InventoryCategory.VACCINE,
          unit: 'dose',
          currentStock: 20,
          minimumStock: 50,
          unitCost: 8,
          expiryDate: new Date(Date.now() + 15 * 86_400_000),
        },
      ],
    });
  }

  const withdrawalSeed = [
    { name: 'Oxytetracycline', category: InventoryCategory.MEDICINE, unit: 'ml', withdrawalDaysMilk: 4, withdrawalDaysMeat: 0 },
    { name: 'Penicillin-Strep', category: InventoryCategory.MEDICINE, unit: 'ml', withdrawalDaysMilk: 3, withdrawalDaysMeat: 0 },
    { name: 'Albendazole', category: InventoryCategory.MEDICINE, unit: 'ml', withdrawalDaysMilk: 0, withdrawalDaysMeat: 0 },
    { name: 'FMD vaccine', category: InventoryCategory.VACCINE, unit: 'dose', withdrawalDaysMilk: 0, withdrawalDaysMeat: 0 },
  ];
  for (const item of withdrawalSeed) {
    const existing = await prisma.inventoryItem.findFirst({
      where: { farmId: farm.id, name: item.name, deletedAt: null },
    });
    if (existing) {
      await prisma.inventoryItem.update({
        where: { id: existing.id },
        data: { withdrawalDaysMilk: item.withdrawalDaysMilk, withdrawalDaysMeat: item.withdrawalDaysMeat },
      });
    } else {
      await prisma.inventoryItem.create({
        data: {
          farmId: farm.id,
          ...item,
          currentStock: 50,
          minimumStock: 10,
        },
      });
    }
  }

  const now = new Date();
  const budgetCount = await prisma.expenseBudget.count({ where: { farmId: farm.id } });
  if (budgetCount === 0) {
    await prisma.expenseBudget.create({
      data: {
        farmId: farm.id,
        category: ExpenseCategory.FEED,
        year: now.getUTCFullYear(),
        month: now.getUTCMonth() + 1,
        amount: 80000,
      },
    });
  }

  const recurringCount = await prisma.recurringExpense.count({ where: { farmId: farm.id } });
  if (recurringCount === 0) {
    await prisma.recurringExpense.create({
      data: {
        farmId: farm.id,
        category: ExpenseCategory.LABOR,
        amount: 45000,
        description: 'Monthly farm wages',
        dayOfMonth: 1,
        active: true,
      },
    });
  }

  // ---- Health ----
  const healthCount = await prisma.healthRecord.count({ where: { farmId: farm.id } });
  if (healthCount === 0) {
    const buffalo = await prisma.animal.findFirst({
      where: { farmId: farm.id, tag: 'BUF001' },
    });
    if (buffalo) {
      await prisma.healthRecord.create({
        data: {
          farmId: farm.id,
          type: HealthRecordType.VACCINATION,
          title: 'FMD annual',
          animalId: buffalo.id,
          performedAt: new Date(Date.now() - 400 * 86_400_000),
          nextDueAt: new Date(Date.now() - 35 * 86_400_000),
        },
      });
      await prisma.healthRecord.create({
        data: {
          farmId: farm.id,
          type: HealthRecordType.DEWORMING,
          title: 'Routine deworming',
          animalId: buffalo.id,
          performedAt: new Date(),
          nextDueAt: new Date(Date.now() + 5 * 86_400_000),
        },
      });
    }
  }

  // ---- Production ----
  const prodCount = await prisma.productionEntry.count({ where: { farmId: farm.id } });
  if (prodCount === 0) {
    const cow = await prisma.animal.findFirst({
      where: { farmId: farm.id, tag: 'COW002' },
    });
    await prisma.productionEntry.createMany({
      data: [
        {
          farmId: farm.id,
          type: ProductionType.MILK,
          entryDate: new Date(),
          quantity: 12.5,
          unit: 'liter',
          quality: QualityGrade.A,
          animalId: cow?.id,
        },
        {
          farmId: farm.id,
          type: ProductionType.EGGS,
          entryDate: new Date(),
          quantity: 420,
          unit: 'pcs',
          quality: QualityGrade.A,
          herdBatchId: herdBatchIds.get('Layer House A — pullets'),
        },
      ],
    });
  }

  console.log(
    `Seeded farm "${farm.name}" with users, ${ANIMALS.length} new tagged animals, herd batches, expenses, revenue, inventory, health, production.`,
  );
  console.log(`Login password for all seeded users: ${SEED_PASSWORD}`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());

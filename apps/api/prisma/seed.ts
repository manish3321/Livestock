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
} from '@prisma/client';
import * as bcrypt from 'bcryptjs';

const prisma = new PrismaClient();

const SEED_PASSWORD = process.env.SEED_PASSWORD ?? 'ChangeMe123!';
const FARM_ID = '00000000-0000-4000-8000-000000000001';

const USERS: Array<{ email: string; name: string; role: Role }> = [
  { email: 'admin@farm.local', name: 'Farm Owner', role: Role.ADMIN },
  { email: 'manager@farm.local', name: 'Farm Manager', role: Role.MANAGER },
  { email: 'worker@farm.local', name: 'Farm Worker', role: Role.WORKER },
];

const ANIMALS: Array<{
  tag: string;
  name: string;
  species: Species;
  breed: string;
  gender: Gender;
  color?: string;
  status?: AnimalStatus;
  source?: AnimalSource;
  weightKg?: number;
}> = [
  {
    tag: 'BUF001',
    name: 'Kalimati',
    species: Species.BUFFALO,
    breed: 'Murrah',
    gender: Gender.FEMALE,
    color: 'Black',
    source: AnimalSource.PURCHASED,
    weightKg: 480,
  },
  {
    tag: 'COW002',
    name: 'Shanti',
    species: Species.COW,
    breed: 'Holstein',
    gender: Gender.FEMALE,
    color: 'Black & White',
    source: AnimalSource.PURCHASED,
    weightKg: 420,
  },
];

async function main(): Promise<void> {
  const farm = await prisma.farm.upsert({
    where: { id: FARM_ID },
    update: {
      mode: 'COMMERCIAL',
      livestockTrackingMode: 'INDIVIDUAL',
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

  for (const a of ANIMALS) {
    const animal = await prisma.animal.upsert({
      where: { farmId_tag: { farmId: farm.id, tag: a.tag } },
      update: {
        name: a.name,
        source: a.source,
        status: a.status ?? AnimalStatus.LACTATING,
      },
      create: {
        farmId: farm.id,
        tag: a.tag,
        name: a.name,
        species: a.species,
        breed: a.breed,
        gender: a.gender,
        color: a.color,
        source: a.source,
        status: a.status ?? AnimalStatus.LACTATING,
      },
    });

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
      minWeightFirstServiceKg: 300,
      serviceWindowStartHours: 12,
      serviceWindowEndHours: 18,
      silentHeatCheckHour: 4,
      fatMinPercent: 6.5,
      fatMaxPercent: 8.0,
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
      minWeightFirstServiceKg: 250,
      serviceWindowStartHours: 12,
      serviceWindowEndHours: 18,
      silentHeatCheckHour: null,
      fatMinPercent: 3.5,
      fatMaxPercent: 4.5,
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
      minWeightFirstServiceKg: 120,
      serviceWindowStartHours: 12,
      serviceWindowEndHours: 18,
      silentHeatCheckHour: null,
      fatMinPercent: 5.0,
      fatMaxPercent: 8.0,
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
      minWeightFirstServiceKg: 25,
      serviceWindowStartHours: 12,
      serviceWindowEndHours: 18,
      silentHeatCheckHour: null,
      fatMinPercent: 5.0,
      fatMaxPercent: 8.0,
    },
  ];
  for (const config of speciesConfigs) {
    await prisma.speciesConfig.upsert({
      where: { species: config.species },
      update: config,
      create: config,
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
    `Seeded farm "${farm.name}" with users, individual animals, herd batches, expenses, revenue, inventory, health, production.`,
  );
  console.log(`Login password for all seeded users: ${SEED_PASSWORD}`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());

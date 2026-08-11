/**
 * Seed: one farm, one user per role, animals, groups, fish, finance samples.
 * Idempotent — safe to run repeatedly.
 */
import {
  PrismaClient,
  Role,
  Species,
  Gender,
  AnimalStatus,
  AnimalSource,
  PoultryType,
  GroupHealthStatus,
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
    update: {},
    create: {
      id: FARM_ID,
      name: 'Evoqed Mixed Farm',
      location: 'Nepal',
      currency: 'NPR',
      timezone: 'Asia/Kathmandu',
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
        status: a.status ?? AnimalStatus.ACTIVE,
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
        status: a.status ?? AnimalStatus.ACTIVE,
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
  ];

  for (const h of herdDefs) {
    const existing = await prisma.herdBatch.findFirst({
      where: { farmId: farm.id, name: h.name, deletedAt: null },
    });
    if (existing) continue;
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

  // ---- Groups ----
  const groups = [
    {
      name: 'Layer House A',
      poultryType: PoultryType.LAYER,
      breed: 'Hy-Line Brown',
      count: 500,
    },
    {
      name: 'Broiler B',
      poultryType: PoultryType.BROILER,
      breed: 'Cobb 500',
      count: 300,
    },
    {
      name: 'Ducks',
      poultryType: PoultryType.DUCK,
      breed: 'Pekin',
      count: 200,
    },
  ];

  const groupIds: string[] = [];
  for (const g of groups) {
    const existing = await prisma.animalGroup.findFirst({
      where: { farmId: farm.id, name: g.name, deletedAt: null },
    });
    if (existing) {
      groupIds.push(existing.id);
      continue;
    }
    const created = await prisma.animalGroup.create({
      data: {
        farmId: farm.id,
        name: g.name,
        poultryType: g.poultryType,
        breed: g.breed,
        initialCount: g.count,
        currentCount: g.count,
        startedAt: new Date(Date.now() - 60 * 86_400_000),
        healthStatus: GroupHealthStatus.HEALTHY,
      },
    });
    groupIds.push(created.id);
  }

  // ---- Fish ----
  const fishDefs = [
    { name: 'Rohu Pond 1', species: 'Rohu', count: 2000, avg: 120 },
    { name: 'Catla Pond 2', species: 'Catla', count: 1500, avg: 150 },
  ];
  for (const f of fishDefs) {
    const existing = await prisma.fishBatch.findFirst({
      where: { farmId: farm.id, name: f.name, deletedAt: null },
    });
    if (!existing) {
      await prisma.fishBatch.create({
        data: {
          farmId: farm.id,
          name: f.name,
          species: f.species,
          stockingDate: new Date(Date.now() - 90 * 86_400_000),
          estimatedCount: f.count,
          avgWeightGrams: f.avg,
        },
      });
    }
  }

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
          groupId: groupIds[0],
        },
      ],
    });
  }

  console.log(
    `Seeded farm "${farm.name}" with users, herd batches, breeding stock, groups, fish, expenses, revenue, inventory, health, production.`,
  );
  console.log(`Login password for all seeded users: ${SEED_PASSWORD}`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());

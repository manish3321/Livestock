-- CreateEnum
CREATE TYPE "PoultryType" AS ENUM ('LAYER', 'BROILER', 'DUCK');
CREATE TYPE "GroupHealthStatus" AS ENUM ('HEALTHY', 'WATCH', 'SICK');
CREATE TYPE "ExpenseCategory" AS ENUM ('FEED', 'MEDICINE', 'LABOR', 'INFRASTRUCTURE', 'EQUIPMENT', 'TRANSPORT', 'MARKETING', 'ADMIN', 'MISC', 'EMERGENCY');
CREATE TYPE "ApprovalStatus" AS ENUM ('PENDING', 'APPROVED', 'REJECTED', 'ESCALATED');
CREATE TYPE "RevenueSource" AS ENUM ('MILK', 'EGGS', 'FISH', 'MEAT');
CREATE TYPE "PaymentStatus" AS ENUM ('PAID', 'PENDING', 'PARTIAL');
CREATE TYPE "InventoryCategory" AS ENUM ('FEED', 'MEDICINE', 'VACCINE', 'EQUIPMENT', 'SUPPLIES');
CREATE TYPE "RestockStatus" AS ENUM ('REQUESTED', 'APPROVED', 'ORDERED', 'RECEIVED', 'REJECTED');
CREATE TYPE "HealthRecordType" AS ENUM ('VACCINATION', 'TREATMENT', 'DEWORMING', 'CHECKUP', 'SURGERY');
CREATE TYPE "MatingType" AS ENUM ('NATURAL', 'AI');
CREATE TYPE "PregnancyStatus" AS ENUM ('OPEN', 'PREGNANT', 'CONFIRMED', 'DELIVERED', 'FAILED');
CREATE TYPE "ProductionType" AS ENUM ('MILK', 'EGGS', 'FISH');
CREATE TYPE "QualityGrade" AS ENUM ('A', 'B', 'C', 'PREMIUM', 'STANDARD');

-- CreateTable
CREATE TABLE "AnimalGroup" (
    "id" UUID NOT NULL,
    "farmId" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "poultryType" "PoultryType" NOT NULL,
    "breed" TEXT NOT NULL,
    "initialCount" INTEGER NOT NULL,
    "currentCount" INTEGER NOT NULL,
    "startedAt" TIMESTAMP(3) NOT NULL,
    "healthStatus" "GroupHealthStatus" NOT NULL DEFAULT 'HEALTHY',
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),
    CONSTRAINT "AnimalGroup_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "GroupMortalityEvent" (
    "id" UUID NOT NULL,
    "farmId" UUID NOT NULL,
    "groupId" UUID NOT NULL,
    "count" INTEGER NOT NULL,
    "reason" TEXT,
    "occurredAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "GroupMortalityEvent_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "FishBatch" (
    "id" UUID NOT NULL,
    "farmId" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "species" TEXT NOT NULL,
    "stockingDate" TIMESTAMP(3) NOT NULL,
    "estimatedCount" INTEGER NOT NULL,
    "avgWeightGrams" DECIMAL(8,2) NOT NULL,
    "notes" TEXT,
    "harvestedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),
    CONSTRAINT "FishBatch_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "WaterQualityLog" (
    "id" UUID NOT NULL,
    "farmId" UUID NOT NULL,
    "batchId" UUID NOT NULL,
    "recordedAt" TIMESTAMP(3) NOT NULL,
    "temperatureC" DECIMAL(5,2),
    "ph" DECIMAL(4,2),
    "dissolvedO2" DECIMAL(5,2),
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "WaterQualityLog_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "FishSampling" (
    "id" UUID NOT NULL,
    "farmId" UUID NOT NULL,
    "batchId" UUID NOT NULL,
    "sampledAt" TIMESTAMP(3) NOT NULL,
    "sampleCount" INTEGER NOT NULL,
    "totalWeightGrams" DECIMAL(10,2) NOT NULL,
    "estimatedCount" INTEGER NOT NULL,
    "avgWeightGrams" DECIMAL(8,2) NOT NULL,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "FishSampling_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "Expense" (
    "id" UUID NOT NULL,
    "farmId" UUID NOT NULL,
    "category" "ExpenseCategory" NOT NULL,
    "amount" DECIMAL(12,2) NOT NULL,
    "expenseDate" TIMESTAMP(3) NOT NULL,
    "description" TEXT NOT NULL,
    "receiptNumber" TEXT,
    "status" "ApprovalStatus" NOT NULL DEFAULT 'PENDING',
    "submittedById" UUID NOT NULL,
    "reviewedById" UUID,
    "reviewedAt" TIMESTAMP(3),
    "reviewNote" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "Expense_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "Revenue" (
    "id" UUID NOT NULL,
    "farmId" UUID NOT NULL,
    "source" "RevenueSource" NOT NULL,
    "quantity" DECIMAL(12,2) NOT NULL,
    "unit" TEXT NOT NULL,
    "rate" DECIMAL(12,2) NOT NULL,
    "amount" DECIMAL(12,2) NOT NULL,
    "revenueDate" TIMESTAMP(3) NOT NULL,
    "buyerName" TEXT,
    "buyerContact" TEXT,
    "paymentTerms" TEXT,
    "paymentStatus" "PaymentStatus" NOT NULL DEFAULT 'PENDING',
    "invoiceNumber" TEXT NOT NULL,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "Revenue_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "InventoryItem" (
    "id" UUID NOT NULL,
    "farmId" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "category" "InventoryCategory" NOT NULL,
    "unit" TEXT NOT NULL,
    "currentStock" DECIMAL(12,2) NOT NULL,
    "minimumStock" DECIMAL(12,2) NOT NULL,
    "expiryDate" TIMESTAMP(3),
    "supplier" TEXT,
    "batchLotNumber" TEXT,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),
    CONSTRAINT "InventoryItem_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "RestockRequest" (
    "id" UUID NOT NULL,
    "farmId" UUID NOT NULL,
    "itemId" UUID NOT NULL,
    "quantity" DECIMAL(12,2) NOT NULL,
    "status" "RestockStatus" NOT NULL DEFAULT 'REQUESTED',
    "notes" TEXT,
    "requestedBy" UUID NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "RestockRequest_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "HealthRecord" (
    "id" UUID NOT NULL,
    "farmId" UUID NOT NULL,
    "type" "HealthRecordType" NOT NULL,
    "title" TEXT NOT NULL,
    "animalId" UUID,
    "groupId" UUID,
    "performedAt" TIMESTAMP(3) NOT NULL,
    "nextDueAt" TIMESTAMP(3),
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "HealthRecord_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "BreedingRecord" (
    "id" UUID NOT NULL,
    "farmId" UUID NOT NULL,
    "motherId" UUID NOT NULL,
    "matingType" "MatingType" NOT NULL,
    "fatherTagOrAi" TEXT,
    "matingDate" TIMESTAMP(3) NOT NULL,
    "dueDate" TIMESTAMP(3) NOT NULL,
    "pregnancyStatus" "PregnancyStatus" NOT NULL DEFAULT 'PREGNANT',
    "birthDate" TIMESTAMP(3),
    "offspringTag" TEXT,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "BreedingRecord_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "ProductionEntry" (
    "id" UUID NOT NULL,
    "farmId" UUID NOT NULL,
    "type" "ProductionType" NOT NULL,
    "entryDate" TIMESTAMP(3) NOT NULL,
    "quantity" DECIMAL(12,2) NOT NULL,
    "unit" TEXT NOT NULL,
    "quality" "QualityGrade",
    "animalId" UUID,
    "groupId" UUID,
    "batchId" UUID,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "ProductionEntry_pkey" PRIMARY KEY ("id")
);

-- Indexes
CREATE INDEX "AnimalGroup_farmId_idx" ON "AnimalGroup"("farmId");
CREATE INDEX "GroupMortalityEvent_groupId_occurredAt_idx" ON "GroupMortalityEvent"("groupId", "occurredAt");
CREATE INDEX "FishBatch_farmId_idx" ON "FishBatch"("farmId");
CREATE INDEX "WaterQualityLog_batchId_recordedAt_idx" ON "WaterQualityLog"("batchId", "recordedAt");
CREATE INDEX "FishSampling_batchId_sampledAt_idx" ON "FishSampling"("batchId", "sampledAt");
CREATE INDEX "Expense_farmId_status_idx" ON "Expense"("farmId", "status");
CREATE INDEX "Expense_farmId_expenseDate_idx" ON "Expense"("farmId", "expenseDate");
CREATE UNIQUE INDEX "Revenue_farmId_invoiceNumber_key" ON "Revenue"("farmId", "invoiceNumber");
CREATE INDEX "Revenue_farmId_revenueDate_idx" ON "Revenue"("farmId", "revenueDate");
CREATE INDEX "InventoryItem_farmId_category_idx" ON "InventoryItem"("farmId", "category");
CREATE INDEX "RestockRequest_farmId_status_idx" ON "RestockRequest"("farmId", "status");
CREATE INDEX "HealthRecord_farmId_nextDueAt_idx" ON "HealthRecord"("farmId", "nextDueAt");
CREATE INDEX "HealthRecord_animalId_idx" ON "HealthRecord"("animalId");
CREATE INDEX "HealthRecord_groupId_idx" ON "HealthRecord"("groupId");
CREATE INDEX "BreedingRecord_farmId_dueDate_idx" ON "BreedingRecord"("farmId", "dueDate");
CREATE INDEX "BreedingRecord_motherId_idx" ON "BreedingRecord"("motherId");
CREATE INDEX "ProductionEntry_farmId_entryDate_idx" ON "ProductionEntry"("farmId", "entryDate");
CREATE INDEX "ProductionEntry_farmId_type_idx" ON "ProductionEntry"("farmId", "type");

-- FKs
ALTER TABLE "AnimalGroup" ADD CONSTRAINT "AnimalGroup_farmId_fkey" FOREIGN KEY ("farmId") REFERENCES "Farm"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "GroupMortalityEvent" ADD CONSTRAINT "GroupMortalityEvent_farmId_fkey" FOREIGN KEY ("farmId") REFERENCES "Farm"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "GroupMortalityEvent" ADD CONSTRAINT "GroupMortalityEvent_groupId_fkey" FOREIGN KEY ("groupId") REFERENCES "AnimalGroup"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "FishBatch" ADD CONSTRAINT "FishBatch_farmId_fkey" FOREIGN KEY ("farmId") REFERENCES "Farm"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "WaterQualityLog" ADD CONSTRAINT "WaterQualityLog_farmId_fkey" FOREIGN KEY ("farmId") REFERENCES "Farm"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "WaterQualityLog" ADD CONSTRAINT "WaterQualityLog_batchId_fkey" FOREIGN KEY ("batchId") REFERENCES "FishBatch"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "FishSampling" ADD CONSTRAINT "FishSampling_farmId_fkey" FOREIGN KEY ("farmId") REFERENCES "Farm"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "FishSampling" ADD CONSTRAINT "FishSampling_batchId_fkey" FOREIGN KEY ("batchId") REFERENCES "FishBatch"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "Expense" ADD CONSTRAINT "Expense_farmId_fkey" FOREIGN KEY ("farmId") REFERENCES "Farm"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "Revenue" ADD CONSTRAINT "Revenue_farmId_fkey" FOREIGN KEY ("farmId") REFERENCES "Farm"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "InventoryItem" ADD CONSTRAINT "InventoryItem_farmId_fkey" FOREIGN KEY ("farmId") REFERENCES "Farm"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "RestockRequest" ADD CONSTRAINT "RestockRequest_farmId_fkey" FOREIGN KEY ("farmId") REFERENCES "Farm"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "RestockRequest" ADD CONSTRAINT "RestockRequest_itemId_fkey" FOREIGN KEY ("itemId") REFERENCES "InventoryItem"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "HealthRecord" ADD CONSTRAINT "HealthRecord_farmId_fkey" FOREIGN KEY ("farmId") REFERENCES "Farm"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "HealthRecord" ADD CONSTRAINT "HealthRecord_animalId_fkey" FOREIGN KEY ("animalId") REFERENCES "Animal"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "HealthRecord" ADD CONSTRAINT "HealthRecord_groupId_fkey" FOREIGN KEY ("groupId") REFERENCES "AnimalGroup"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "BreedingRecord" ADD CONSTRAINT "BreedingRecord_farmId_fkey" FOREIGN KEY ("farmId") REFERENCES "Farm"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "BreedingRecord" ADD CONSTRAINT "BreedingRecord_motherId_fkey" FOREIGN KEY ("motherId") REFERENCES "Animal"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ProductionEntry" ADD CONSTRAINT "ProductionEntry_farmId_fkey" FOREIGN KEY ("farmId") REFERENCES "Farm"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ProductionEntry" ADD CONSTRAINT "ProductionEntry_animalId_fkey" FOREIGN KEY ("animalId") REFERENCES "Animal"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "ProductionEntry" ADD CONSTRAINT "ProductionEntry_groupId_fkey" FOREIGN KEY ("groupId") REFERENCES "AnimalGroup"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "ProductionEntry" ADD CONSTRAINT "ProductionEntry_batchId_fkey" FOREIGN KEY ("batchId") REFERENCES "FishBatch"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Proposal v2 phases 1–5: individual animals, dairy quality, feed, health/breeding, finance

ALTER TYPE "AnimalStatus" ADD VALUE IF NOT EXISTS 'DRY';
ALTER TYPE "AnimalStatus" ADD VALUE IF NOT EXISTS 'LACTATING';
ALTER TYPE "AnimalStatus" ADD VALUE IF NOT EXISTS 'CULLED';
ALTER TYPE "AnimalStatus" ADD VALUE IF NOT EXISTS 'SOLD';
ALTER TYPE "AnimalStatus" ADD VALUE IF NOT EXISTS 'DEAD';

CREATE TYPE "MilkAppearance" AS ENUM ('NORMAL', 'CLOTS', 'BLOOD', 'DISCOLORED');
CREATE TYPE "CollectionMethod" AS ENUM ('HAND', 'MACHINE');
CREATE TYPE "FeedCondition" AS ENUM ('FRESH', 'FERMENTED', 'DRY');
CREATE TYPE "HealthOutcome" AS ENUM ('RECOVERED', 'ONGOING', 'FAILED', 'CULLED');
CREATE TYPE "CmtResult" AS ENUM ('NEGATIVE', 'TRACE', 'ONE', 'TWO', 'THREE');
CREATE TYPE "HeatIntensity" AS ENUM ('WEAK', 'MEDIUM', 'STRONG');
CREATE TYPE "CalvingDifficulty" AS ENUM ('EASY', 'ASSISTED', 'EMERGENCY', 'STILLBIRTH');

ALTER TABLE "Animal" ADD COLUMN "shed" TEXT;
ALTER TABLE "Animal" ADD COLUMN "photoStorageKey" TEXT;
ALTER TABLE "Animal" ADD COLUMN "photoUrl" TEXT;
ALTER TABLE "Animal" ADD COLUMN "damId" UUID;
ALTER TABLE "Animal" ADD COLUMN "sireId" UUID;

ALTER TABLE "Animal" ADD CONSTRAINT "Animal_damId_fkey" FOREIGN KEY ("damId") REFERENCES "Animal"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "Animal" ADD CONSTRAINT "Animal_sireId_fkey" FOREIGN KEY ("sireId") REFERENCES "Animal"("id") ON DELETE SET NULL ON UPDATE CASCADE;

CREATE INDEX "Animal_damId_idx" ON "Animal"("damId");
CREATE INDEX "Animal_sireId_idx" ON "Animal"("sireId");

ALTER TABLE "WeightRecord" ADD COLUMN "bcs" INTEGER;

ALTER TABLE "ProductionEntry" ADD COLUMN "milkerName" TEXT;
ALTER TABLE "ProductionEntry" ADD COLUMN "appearance" "MilkAppearance";
ALTER TABLE "ProductionEntry" ADD COLUMN "fatPercent" DECIMAL(5,2);
ALTER TABLE "ProductionEntry" ADD COLUMN "snfPercent" DECIMAL(5,2);
ALTER TABLE "ProductionEntry" ADD COLUMN "scc" INTEGER;
ALTER TABLE "ProductionEntry" ADD COLUMN "collectionMethod" "CollectionMethod";

ALTER TABLE "HealthRecord" ADD COLUMN "medicine" TEXT;
ALTER TABLE "HealthRecord" ADD COLUMN "dosage" TEXT;
ALTER TABLE "HealthRecord" ADD COLUMN "method" TEXT;
ALTER TABLE "HealthRecord" ADD COLUMN "vetName" TEXT;
ALTER TABLE "HealthRecord" ADD COLUMN "outcome" "HealthOutcome";
ALTER TABLE "HealthRecord" ADD COLUMN "followUpAt" TIMESTAMP(3);
ALTER TABLE "HealthRecord" ADD COLUMN "cmtResult" "CmtResult";
ALTER TABLE "HealthRecord" ADD COLUMN "milkWithholdUntil" TIMESTAMP(3);

ALTER TABLE "BreedingRecord" ADD COLUMN "offspringAnimalId" UUID;
ALTER TABLE "BreedingRecord" ADD COLUMN "calvingDifficulty" "CalvingDifficulty";
ALTER TABLE "BreedingRecord" ADD COLUMN "colostrumFed" BOOLEAN;
ALTER TABLE "BreedingRecord" ADD COLUMN "colostrumWithin4h" BOOLEAN;
ALTER TABLE "BreedingRecord" ADD COLUMN "colostrumLiters" DECIMAL(6,2);

ALTER TABLE "BreedingRecord" ADD CONSTRAINT "BreedingRecord_offspringAnimalId_fkey" FOREIGN KEY ("offspringAnimalId") REFERENCES "Animal"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "Expense" ADD COLUMN "subcategory" TEXT;

ALTER TABLE "Revenue" ADD COLUMN "qualityBonus" DECIMAL(12,2);
ALTER TABLE "Revenue" ADD COLUMN "qualityPenalty" DECIMAL(12,2);
ALTER TABLE "Revenue" ADD COLUMN "deductions" DECIMAL(12,2);
ALTER TABLE "Revenue" ADD COLUMN "deductionNote" TEXT;

CREATE TABLE "FeedLog" (
    "id" UUID NOT NULL,
    "farmId" UUID NOT NULL,
    "animalId" UUID,
    "herdBatchId" UUID,
    "feedType" TEXT NOT NULL,
    "quantityKg" DECIMAL(12,2) NOT NULL,
    "costPerKg" DECIMAL(12,2),
    "totalCost" DECIMAL(12,2),
    "condition" "FeedCondition",
    "accepted" BOOLEAN NOT NULL DEFAULT true,
    "inventoryItemId" UUID,
    "occurredAt" TIMESTAMP(3) NOT NULL,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "FeedLog_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "FeedLog_farmId_occurredAt_idx" ON "FeedLog"("farmId", "occurredAt");
CREATE INDEX "FeedLog_animalId_occurredAt_idx" ON "FeedLog"("animalId", "occurredAt");
CREATE INDEX "FeedLog_herdBatchId_occurredAt_idx" ON "FeedLog"("herdBatchId", "occurredAt");

ALTER TABLE "FeedLog" ADD CONSTRAINT "FeedLog_farmId_fkey" FOREIGN KEY ("farmId") REFERENCES "Farm"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "FeedLog" ADD CONSTRAINT "FeedLog_animalId_fkey" FOREIGN KEY ("animalId") REFERENCES "Animal"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "FeedLog" ADD CONSTRAINT "FeedLog_herdBatchId_fkey" FOREIGN KEY ("herdBatchId") REFERENCES "HerdBatch"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "FeedLog" ADD CONSTRAINT "FeedLog_inventoryItemId_fkey" FOREIGN KEY ("inventoryItemId") REFERENCES "InventoryItem"("id") ON DELETE SET NULL ON UPDATE CASCADE;

CREATE TABLE "HeatLog" (
    "id" UUID NOT NULL,
    "farmId" UUID NOT NULL,
    "animalId" UUID NOT NULL,
    "observedAt" TIMESTAMP(3) NOT NULL,
    "intensity" "HeatIntensity" NOT NULL,
    "observerName" TEXT,
    "signs" TEXT,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "HeatLog_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "HeatLog_animalId_observedAt_idx" ON "HeatLog"("animalId", "observedAt");
CREATE INDEX "HeatLog_farmId_observedAt_idx" ON "HeatLog"("farmId", "observedAt");

ALTER TABLE "HeatLog" ADD CONSTRAINT "HeatLog_farmId_fkey" FOREIGN KEY ("farmId") REFERENCES "Farm"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "HeatLog" ADD CONSTRAINT "HeatLog_animalId_fkey" FOREIGN KEY ("animalId") REFERENCES "Animal"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE "ExpenseAllocation" (
    "id" UUID NOT NULL,
    "farmId" UUID NOT NULL,
    "expenseId" UUID NOT NULL,
    "animalId" UUID NOT NULL,
    "amount" DECIMAL(12,2) NOT NULL,

    CONSTRAINT "ExpenseAllocation_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "ExpenseAllocation_expenseId_idx" ON "ExpenseAllocation"("expenseId");
CREATE INDEX "ExpenseAllocation_animalId_idx" ON "ExpenseAllocation"("animalId");

ALTER TABLE "ExpenseAllocation" ADD CONSTRAINT "ExpenseAllocation_farmId_fkey" FOREIGN KEY ("farmId") REFERENCES "Farm"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ExpenseAllocation" ADD CONSTRAINT "ExpenseAllocation_expenseId_fkey" FOREIGN KEY ("expenseId") REFERENCES "Expense"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ExpenseAllocation" ADD CONSTRAINT "ExpenseAllocation_animalId_fkey" FOREIGN KEY ("animalId") REFERENCES "Animal"("id") ON DELETE CASCADE ON UPDATE CASCADE;

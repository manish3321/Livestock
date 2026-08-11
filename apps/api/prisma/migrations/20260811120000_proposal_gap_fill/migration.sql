-- CreateEnum
CREATE TYPE "ExpensePaymentStatus" AS ENUM ('UNPAID', 'PAID', 'PARTIAL');

-- CreateEnum
CREATE TYPE "StockMovementType" AS ENUM ('IN', 'OUT', 'ADJUST');

-- AlterTable Expense
ALTER TABLE "Expense" ADD COLUMN IF NOT EXISTS "receiptUrl" TEXT;
ALTER TABLE "Expense" ADD COLUMN IF NOT EXISTS "receiptStorageKey" TEXT;
ALTER TABLE "Expense" ADD COLUMN IF NOT EXISTS "gstAmount" DECIMAL(12,2);
ALTER TABLE "Expense" ADD COLUMN IF NOT EXISTS "supplier" TEXT;
ALTER TABLE "Expense" ADD COLUMN IF NOT EXISTS "paymentStatus" "ExpensePaymentStatus" NOT NULL DEFAULT 'UNPAID';

-- AlterTable InventoryItem
ALTER TABLE "InventoryItem" ADD COLUMN IF NOT EXISTS "unitCost" DECIMAL(12,2);

-- AlterTable HealthRecord
ALTER TABLE "HealthRecord" ADD COLUMN IF NOT EXISTS "herdBatchId" UUID;

-- AlterTable ProductionEntry
ALTER TABLE "ProductionEntry" ADD COLUMN IF NOT EXISTS "herdBatchId" UUID;

-- CreateTable
CREATE TABLE IF NOT EXISTS "BatchWaterQualityLog" (
    "id" UUID NOT NULL,
    "farmId" UUID NOT NULL,
    "batchId" UUID NOT NULL,
    "recordedAt" TIMESTAMP(3) NOT NULL,
    "temperatureC" DECIMAL(5,2),
    "ph" DECIMAL(4,2),
    "dissolvedO2" DECIMAL(5,2),
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "BatchWaterQualityLog_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "BatchSamplingEvent" (
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
    CONSTRAINT "BatchSamplingEvent_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "BatchHarvestEvent" (
    "id" UUID NOT NULL,
    "farmId" UUID NOT NULL,
    "batchId" UUID NOT NULL,
    "quantityKg" DECIMAL(12,2) NOT NULL,
    "fishCount" INTEGER,
    "quality" "QualityGrade",
    "occurredAt" TIMESTAMP(3) NOT NULL,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "BatchHarvestEvent_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "BatchFeedEvent" (
    "id" UUID NOT NULL,
    "farmId" UUID NOT NULL,
    "batchId" UUID NOT NULL,
    "quantityKg" DECIMAL(12,2) NOT NULL,
    "feedType" TEXT,
    "inventoryItemId" UUID,
    "occurredAt" TIMESTAMP(3) NOT NULL,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "BatchFeedEvent_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "ExpenseBudget" (
    "id" UUID NOT NULL,
    "farmId" UUID NOT NULL,
    "category" "ExpenseCategory" NOT NULL,
    "year" INTEGER NOT NULL,
    "month" INTEGER NOT NULL,
    "amount" DECIMAL(12,2) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "ExpenseBudget_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "RecurringExpense" (
    "id" UUID NOT NULL,
    "farmId" UUID NOT NULL,
    "category" "ExpenseCategory" NOT NULL,
    "amount" DECIMAL(12,2) NOT NULL,
    "description" TEXT NOT NULL,
    "supplier" TEXT,
    "gstAmount" DECIMAL(12,2),
    "dayOfMonth" INTEGER NOT NULL DEFAULT 1,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "lastGeneratedYear" INTEGER,
    "lastGeneratedMonth" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "RecurringExpense_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "StockMovement" (
    "id" UUID NOT NULL,
    "farmId" UUID NOT NULL,
    "itemId" UUID NOT NULL,
    "type" "StockMovementType" NOT NULL,
    "quantity" DECIMAL(12,2) NOT NULL,
    "reason" TEXT,
    "userId" UUID NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "StockMovement_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "NotificationLog" (
    "id" UUID NOT NULL,
    "farmId" UUID NOT NULL,
    "channel" TEXT NOT NULL DEFAULT 'email',
    "subject" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "sent" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "NotificationLog_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "BatchWaterQualityLog_batchId_recordedAt_idx" ON "BatchWaterQualityLog"("batchId", "recordedAt");
CREATE INDEX IF NOT EXISTS "BatchSamplingEvent_batchId_sampledAt_idx" ON "BatchSamplingEvent"("batchId", "sampledAt");
CREATE INDEX IF NOT EXISTS "BatchHarvestEvent_batchId_occurredAt_idx" ON "BatchHarvestEvent"("batchId", "occurredAt");
CREATE INDEX IF NOT EXISTS "BatchFeedEvent_batchId_occurredAt_idx" ON "BatchFeedEvent"("batchId", "occurredAt");
CREATE UNIQUE INDEX IF NOT EXISTS "ExpenseBudget_farmId_category_year_month_key" ON "ExpenseBudget"("farmId", "category", "year", "month");
CREATE INDEX IF NOT EXISTS "ExpenseBudget_farmId_year_month_idx" ON "ExpenseBudget"("farmId", "year", "month");
CREATE INDEX IF NOT EXISTS "RecurringExpense_farmId_active_idx" ON "RecurringExpense"("farmId", "active");
CREATE INDEX IF NOT EXISTS "StockMovement_itemId_createdAt_idx" ON "StockMovement"("itemId", "createdAt");
CREATE INDEX IF NOT EXISTS "StockMovement_farmId_createdAt_idx" ON "StockMovement"("farmId", "createdAt");
CREATE INDEX IF NOT EXISTS "NotificationLog_farmId_createdAt_idx" ON "NotificationLog"("farmId", "createdAt");
CREATE INDEX IF NOT EXISTS "HealthRecord_herdBatchId_idx" ON "HealthRecord"("herdBatchId");
CREATE INDEX IF NOT EXISTS "ProductionEntry_herdBatchId_idx" ON "ProductionEntry"("herdBatchId");

ALTER TABLE "BatchWaterQualityLog" DROP CONSTRAINT IF EXISTS "BatchWaterQualityLog_farmId_fkey";
ALTER TABLE "BatchWaterQualityLog" ADD CONSTRAINT "BatchWaterQualityLog_farmId_fkey" FOREIGN KEY ("farmId") REFERENCES "Farm"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "BatchWaterQualityLog" DROP CONSTRAINT IF EXISTS "BatchWaterQualityLog_batchId_fkey";
ALTER TABLE "BatchWaterQualityLog" ADD CONSTRAINT "BatchWaterQualityLog_batchId_fkey" FOREIGN KEY ("batchId") REFERENCES "HerdBatch"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "BatchSamplingEvent" DROP CONSTRAINT IF EXISTS "BatchSamplingEvent_farmId_fkey";
ALTER TABLE "BatchSamplingEvent" ADD CONSTRAINT "BatchSamplingEvent_farmId_fkey" FOREIGN KEY ("farmId") REFERENCES "Farm"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "BatchSamplingEvent" DROP CONSTRAINT IF EXISTS "BatchSamplingEvent_batchId_fkey";
ALTER TABLE "BatchSamplingEvent" ADD CONSTRAINT "BatchSamplingEvent_batchId_fkey" FOREIGN KEY ("batchId") REFERENCES "HerdBatch"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "BatchHarvestEvent" DROP CONSTRAINT IF EXISTS "BatchHarvestEvent_farmId_fkey";
ALTER TABLE "BatchHarvestEvent" ADD CONSTRAINT "BatchHarvestEvent_farmId_fkey" FOREIGN KEY ("farmId") REFERENCES "Farm"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "BatchHarvestEvent" DROP CONSTRAINT IF EXISTS "BatchHarvestEvent_batchId_fkey";
ALTER TABLE "BatchHarvestEvent" ADD CONSTRAINT "BatchHarvestEvent_batchId_fkey" FOREIGN KEY ("batchId") REFERENCES "HerdBatch"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "BatchFeedEvent" DROP CONSTRAINT IF EXISTS "BatchFeedEvent_farmId_fkey";
ALTER TABLE "BatchFeedEvent" ADD CONSTRAINT "BatchFeedEvent_farmId_fkey" FOREIGN KEY ("farmId") REFERENCES "Farm"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "BatchFeedEvent" DROP CONSTRAINT IF EXISTS "BatchFeedEvent_batchId_fkey";
ALTER TABLE "BatchFeedEvent" ADD CONSTRAINT "BatchFeedEvent_batchId_fkey" FOREIGN KEY ("batchId") REFERENCES "HerdBatch"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "BatchFeedEvent" DROP CONSTRAINT IF EXISTS "BatchFeedEvent_inventoryItemId_fkey";
ALTER TABLE "BatchFeedEvent" ADD CONSTRAINT "BatchFeedEvent_inventoryItemId_fkey" FOREIGN KEY ("inventoryItemId") REFERENCES "InventoryItem"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "ExpenseBudget" DROP CONSTRAINT IF EXISTS "ExpenseBudget_farmId_fkey";
ALTER TABLE "ExpenseBudget" ADD CONSTRAINT "ExpenseBudget_farmId_fkey" FOREIGN KEY ("farmId") REFERENCES "Farm"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "RecurringExpense" DROP CONSTRAINT IF EXISTS "RecurringExpense_farmId_fkey";
ALTER TABLE "RecurringExpense" ADD CONSTRAINT "RecurringExpense_farmId_fkey" FOREIGN KEY ("farmId") REFERENCES "Farm"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "StockMovement" DROP CONSTRAINT IF EXISTS "StockMovement_farmId_fkey";
ALTER TABLE "StockMovement" ADD CONSTRAINT "StockMovement_farmId_fkey" FOREIGN KEY ("farmId") REFERENCES "Farm"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "StockMovement" DROP CONSTRAINT IF EXISTS "StockMovement_itemId_fkey";
ALTER TABLE "StockMovement" ADD CONSTRAINT "StockMovement_itemId_fkey" FOREIGN KEY ("itemId") REFERENCES "InventoryItem"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "NotificationLog" DROP CONSTRAINT IF EXISTS "NotificationLog_farmId_fkey";
ALTER TABLE "NotificationLog" ADD CONSTRAINT "NotificationLog_farmId_fkey" FOREIGN KEY ("farmId") REFERENCES "Farm"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "HealthRecord" DROP CONSTRAINT IF EXISTS "HealthRecord_herdBatchId_fkey";
ALTER TABLE "HealthRecord" ADD CONSTRAINT "HealthRecord_herdBatchId_fkey" FOREIGN KEY ("herdBatchId") REFERENCES "HerdBatch"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "ProductionEntry" DROP CONSTRAINT IF EXISTS "ProductionEntry_herdBatchId_fkey";
ALTER TABLE "ProductionEntry" ADD CONSTRAINT "ProductionEntry_herdBatchId_fkey" FOREIGN KEY ("herdBatchId") REFERENCES "HerdBatch"("id") ON DELETE SET NULL ON UPDATE CASCADE;

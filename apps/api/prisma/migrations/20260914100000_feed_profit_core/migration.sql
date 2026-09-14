-- Phase 6: feed records, daily metrics, cooperative payments, farm prices.

ALTER TABLE "Farm" ADD COLUMN IF NOT EXISTS "milkPriceNpr" DECIMAL(8, 2) NOT NULL DEFAULT 62;
ALTER TABLE "Farm" ADD COLUMN IF NOT EXISTS "effectivePriceNpr" DECIMAL(8, 2);
ALTER TABLE "Farm" ADD COLUMN IF NOT EXISTS "labourMonthlyNpr" DECIMAL(12, 2) NOT NULL DEFAULT 0;

DO $$ BEGIN ALTER TYPE "TaskType" ADD VALUE 'STOCK_RECONCILE';
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE TABLE IF NOT EXISTS "FeedRecord" (
    "id" UUID NOT NULL,
    "farmId" UUID NOT NULL,
    "date" DATE NOT NULL,
    "animalId" UUID,
    "penId" TEXT,
    "itemId" UUID,
    "lotId" UUID,
    "qty" DECIMAL(9, 3) NOT NULL,
    "unit" TEXT NOT NULL DEFAULT 'KG',
    "costPerUnit" DECIMAL(8, 2) NOT NULL,
    "refusedQty" DECIMAL(9, 3),
    "recordedById" UUID,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "deviceId" TEXT,
    CONSTRAINT "FeedRecord_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "FeedRecord_farmId_date_idx" ON "FeedRecord"("farmId", "date");
CREATE INDEX IF NOT EXISTS "FeedRecord_animalId_date_idx" ON "FeedRecord"("animalId", "date");

CREATE TABLE IF NOT EXISTS "DailyMetric" (
    "id" UUID NOT NULL,
    "animalId" UUID NOT NULL,
    "farmId" UUID NOT NULL,
    "date" DATE NOT NULL,
    "litres" DECIMAL(8, 2) NOT NULL DEFAULT 0,
    "avgFatPct" DECIMAL(4, 2),
    "daysInMilk" INTEGER,
    "feedCostNpr" DECIMAL(10, 2) NOT NULL DEFAULT 0,
    "healthCostNpr" DECIMAL(10, 2) NOT NULL DEFAULT 0,
    "allocatedLabourNpr" DECIMAL(10, 2) NOT NULL DEFAULT 0,
    "otherCostNpr" DECIMAL(10, 2) NOT NULL DEFAULT 0,
    "revenueNpr" DECIMAL(10, 2) NOT NULL DEFAULT 0,
    "profitNpr" DECIMAL(10, 2) NOT NULL DEFAULT 0,
    "costPerLitreNpr" DECIMAL(8, 2),
    "feedCostPerLitreNpr" DECIMAL(8, 2),
    "rolling7Mean" DECIMAL(8, 2),
    "rolling7Stdev" DECIMAL(8, 2),
    CONSTRAINT "DailyMetric_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "DailyMetric_animalId_date_key" ON "DailyMetric"("animalId", "date");
CREATE INDEX IF NOT EXISTS "DailyMetric_farmId_date_idx" ON "DailyMetric"("farmId", "date");

CREATE TABLE IF NOT EXISTS "CooperativePayment" (
    "id" UUID NOT NULL,
    "farmId" UUID NOT NULL,
    "cooperativeId" TEXT NOT NULL,
    "periodStart" DATE NOT NULL,
    "periodEnd" DATE NOT NULL,
    "litresSupplied" DECIMAL(12, 2) NOT NULL,
    "avgFatPct" DECIMAL(4, 2),
    "avgSnfPct" DECIMAL(4, 2),
    "basePriceNpr" DECIMAL(12, 2) NOT NULL,
    "fatBonusNpr" DECIMAL(10, 2) NOT NULL DEFAULT 0,
    "snfBonusNpr" DECIMAL(10, 2) NOT NULL DEFAULT 0,
    "qualityPenaltyNpr" DECIMAL(10, 2) NOT NULL DEFAULT 0,
    "coolingDeductionNpr" DECIMAL(10, 2) NOT NULL DEFAULT 0,
    "transportDeductionNpr" DECIMAL(10, 2) NOT NULL DEFAULT 0,
    "membershipDeductionNpr" DECIMAL(10, 2) NOT NULL DEFAULT 0,
    "loanRepaymentNpr" DECIMAL(10, 2) NOT NULL DEFAULT 0,
    "otherDeductionsNpr" DECIMAL(10, 2) NOT NULL DEFAULT 0,
    "otherDeductionsNote" TEXT,
    "netPayableNpr" DECIMAL(12, 2) NOT NULL,
    "effectivePriceNpr" DECIMAL(8, 2),
    "paidOn" DATE,
    "paymentMethod" TEXT,
    "reconciliationGapNpr" DECIMAL(12, 2),
    "statementFileId" TEXT,
    "disputed" BOOLEAN NOT NULL DEFAULT false,
    "disputeNote" TEXT,
    CONSTRAINT "CooperativePayment_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "CooperativePayment_farmId_cooperativeId_periodStart_key"
  ON "CooperativePayment"("farmId", "cooperativeId", "periodStart");

ALTER TABLE "FeedRecord" DROP CONSTRAINT IF EXISTS "FeedRecord_farmId_fkey";
ALTER TABLE "FeedRecord" ADD CONSTRAINT "FeedRecord_farmId_fkey" FOREIGN KEY ("farmId") REFERENCES "Farm"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "FeedRecord" DROP CONSTRAINT IF EXISTS "FeedRecord_animalId_fkey";
ALTER TABLE "FeedRecord" ADD CONSTRAINT "FeedRecord_animalId_fkey" FOREIGN KEY ("animalId") REFERENCES "Animal"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "DailyMetric" DROP CONSTRAINT IF EXISTS "DailyMetric_farmId_fkey";
ALTER TABLE "DailyMetric" ADD CONSTRAINT "DailyMetric_farmId_fkey" FOREIGN KEY ("farmId") REFERENCES "Farm"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "DailyMetric" DROP CONSTRAINT IF EXISTS "DailyMetric_animalId_fkey";
ALTER TABLE "DailyMetric" ADD CONSTRAINT "DailyMetric_animalId_fkey" FOREIGN KEY ("animalId") REFERENCES "Animal"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "CooperativePayment" DROP CONSTRAINT IF EXISTS "CooperativePayment_farmId_fkey";
ALTER TABLE "CooperativePayment" ADD CONSTRAINT "CooperativePayment_farmId_fkey" FOREIGN KEY ("farmId") REFERENCES "Farm"("id") ON DELETE CASCADE ON UPDATE CASCADE;

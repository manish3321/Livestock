-- CreateEnum
CREATE TYPE "HerdBatchKind" AS ENUM ('LIVESTOCK', 'POULTRY', 'FISH');

-- CreateTable
CREATE TABLE "HerdBatch" (
    "id" UUID NOT NULL,
    "farmId" UUID NOT NULL,
    "kind" "HerdBatchKind" NOT NULL,
    "category" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "ageFromMonths" INTEGER,
    "ageToMonths" INTEGER,
    "initialCount" INTEGER NOT NULL,
    "currentCount" INTEGER NOT NULL,
    "deadCount" INTEGER NOT NULL DEFAULT 0,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "HerdBatch_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BatchIllnessEvent" (
    "id" UUID NOT NULL,
    "farmId" UUID NOT NULL,
    "batchId" UUID NOT NULL,
    "condition" TEXT NOT NULL,
    "count" INTEGER NOT NULL,
    "occurredAt" TIMESTAMP(3) NOT NULL,
    "resolvedAt" TIMESTAMP(3),
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "BatchIllnessEvent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BatchMortalityEvent" (
    "id" UUID NOT NULL,
    "farmId" UUID NOT NULL,
    "batchId" UUID NOT NULL,
    "count" INTEGER NOT NULL,
    "reason" TEXT,
    "occurredAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "BatchMortalityEvent_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "HerdBatch_farmId_kind_idx" ON "HerdBatch"("farmId", "kind");

-- CreateIndex
CREATE INDEX "HerdBatch_farmId_category_idx" ON "HerdBatch"("farmId", "category");

-- CreateIndex
CREATE INDEX "BatchIllnessEvent_batchId_occurredAt_idx" ON "BatchIllnessEvent"("batchId", "occurredAt");

-- CreateIndex
CREATE INDEX "BatchIllnessEvent_farmId_occurredAt_idx" ON "BatchIllnessEvent"("farmId", "occurredAt");

-- CreateIndex
CREATE INDEX "BatchMortalityEvent_batchId_occurredAt_idx" ON "BatchMortalityEvent"("batchId", "occurredAt");

-- CreateIndex
CREATE INDEX "BatchMortalityEvent_farmId_occurredAt_idx" ON "BatchMortalityEvent"("farmId", "occurredAt");

-- AddForeignKey
ALTER TABLE "HerdBatch" ADD CONSTRAINT "HerdBatch_farmId_fkey" FOREIGN KEY ("farmId") REFERENCES "Farm"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BatchIllnessEvent" ADD CONSTRAINT "BatchIllnessEvent_farmId_fkey" FOREIGN KEY ("farmId") REFERENCES "Farm"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BatchIllnessEvent" ADD CONSTRAINT "BatchIllnessEvent_batchId_fkey" FOREIGN KEY ("batchId") REFERENCES "HerdBatch"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BatchMortalityEvent" ADD CONSTRAINT "BatchMortalityEvent_farmId_fkey" FOREIGN KEY ("farmId") REFERENCES "Farm"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BatchMortalityEvent" ADD CONSTRAINT "BatchMortalityEvent_batchId_fkey" FOREIGN KEY ("batchId") REFERENCES "HerdBatch"("id") ON DELETE CASCADE ON UPDATE CASCADE;

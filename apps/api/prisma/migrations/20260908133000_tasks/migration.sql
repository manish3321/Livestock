-- Phase 1d: the farmer's work queue.

CREATE TYPE "TaskType" AS ENUM (
  'VACCINATION_DUE', 'MEDICATION_DOSE', 'COLOSTRUM_FEED', 'CALVING_WATCH',
  'HEAT_WATCH', 'SILENT_HEAT_CHECK', 'SERVICE_WINDOW', 'PREGNANCY_CHECK',
  'DRY_OFF', 'POSTPARTUM_CHECK', 'MILK_WITHHOLD_END', 'STOCK_REORDER',
  'LOT_EXPIRING', 'MISSING_PRODUCTION', 'YIELD_DROP', 'APPLY_MARKER',
  'REMOVE_MARKER', 'RETAG_REQUIRED'
);

CREATE TYPE "TaskPriority" AS ENUM ('CRITICAL', 'HIGH', 'NORMAL', 'LOW');

CREATE TYPE "TaskStatus" AS ENUM ('PENDING', 'DONE', 'SNOOZED', 'DISMISSED', 'EXPIRED');

CREATE TYPE "TaskSource" AS ENUM ('AUTO', 'MANUAL');

CREATE TYPE "TaskDismissReason" AS ENUM (
  'NOT_NEEDED', 'ALREADY_DONE_OFFLINE', 'ANIMAL_SOLD', 'WRONG_ANIMAL', 'OTHER'
);

CREATE TABLE "Task" (
    "id" UUID NOT NULL,
    "farmId" UUID NOT NULL,
    "animalId" UUID,
    "batchId" UUID,
    "type" "TaskType" NOT NULL,
    "titleEn" TEXT NOT NULL,
    "titleNp" TEXT NOT NULL,
    "dueAt" TIMESTAMP(3) NOT NULL,
    "priority" "TaskPriority" NOT NULL DEFAULT 'NORMAL',
    "status" "TaskStatus" NOT NULL DEFAULT 'PENDING',
    "assignedToId" UUID,
    "source" "TaskSource" NOT NULL DEFAULT 'AUTO',
    "sourceRefType" TEXT,
    "sourceRefId" UUID,
    "snoozedUntil" TIMESTAMP(3),
    "snoozeCount" INTEGER NOT NULL DEFAULT 0,
    "completedAt" TIMESTAMP(3),
    "completedById" UUID,
    "dismissReason" "TaskDismissReason",
    "dismissNote" TEXT,
    "deviceId" TEXT,
    "createdBy" UUID,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "Task_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "Task_farmId_status_dueAt_idx" ON "Task"("farmId", "status", "dueAt");
CREATE INDEX "Task_farmId_animalId_status_idx" ON "Task"("farmId", "animalId", "status");
CREATE INDEX "Task_farmId_assignedToId_status_idx" ON "Task"("farmId", "assignedToId", "status");
CREATE INDEX "Task_farmId_priority_dueAt_idx" ON "Task"("farmId", "priority", "dueAt");

-- The nightly generators re-run over the same herd every night, so inserting a
-- task the farmer already has open must be a no-op rather than a duplicate.
--
-- NULLS NOT DISTINCT is essential: animalId is null for farm-wide tasks like
-- STOCK_REORDER and sourceRefId is null for tasks with no originating record.
-- Under default NULLS DISTINCT semantics every such row would be considered
-- unique and the index would silently stop deduplicating exactly the tasks
-- that repeat most often. Requires PostgreSQL 15+ (Supabase runs 17).
--
-- Partial and NULLS NOT DISTINCT indexes cannot be expressed in the Prisma
-- schema, so this index lives only here. Do not expect `prisma db pull` to
-- round-trip it.
CREATE UNIQUE INDEX "Task_pending_dedupe_idx"
  ON "Task" ("farmId", "animalId", "type", "sourceRefId")
  NULLS NOT DISTINCT
  WHERE "status" = 'PENDING';

ALTER TABLE "Task" ADD CONSTRAINT "Task_farmId_fkey"
  FOREIGN KEY ("farmId") REFERENCES "Farm"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "Task" ADD CONSTRAINT "Task_animalId_fkey"
  FOREIGN KEY ("animalId") REFERENCES "Animal"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "Task" ADD CONSTRAINT "Task_batchId_fkey"
  FOREIGN KEY ("batchId") REFERENCES "HerdBatch"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "Task" ADD CONSTRAINT "Task_assignedToId_fkey"
  FOREIGN KEY ("assignedToId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

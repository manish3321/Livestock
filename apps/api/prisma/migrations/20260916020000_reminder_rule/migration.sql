-- AlterTable
ALTER TABLE "SpeciesConfig" ADD COLUMN IF NOT EXISTS "gestationVarianceDays" INTEGER NOT NULL DEFAULT 7;
UPDATE "SpeciesConfig" SET "gestationVarianceDays" = 10 WHERE "species" = 'BUFFALO';
UPDATE "SpeciesConfig" SET "gestationVarianceDays" = 7 WHERE "species" = 'COW';

-- CreateTable
CREATE TABLE IF NOT EXISTS "ReminderRule" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "farmId" UUID,
  "code" TEXT NOT NULL,
  "taskType" "TaskType" NOT NULL,
  "triggerStage" "ReproStage",
  "triggerEvent" TEXT,
  "species" "Species"[] DEFAULT ARRAY[]::"Species"[],
  "offsetDays" INTEGER NOT NULL DEFAULT 0,
  "offsetHours" INTEGER NOT NULL DEFAULT 0,
  "fireAtHour" INTEGER,
  "repeatEveryDays" INTEGER,
  "repeatUntilStage" "ReproStage",
  "maxRepeats" INTEGER,
  "priority" "TaskPriority" NOT NULL,
  "channels" TEXT[],
  "escalateAfterMinutes" INTEGER,
  "escalateToRole" "Role",
  "titleEn" TEXT NOT NULL,
  "titleNp" TEXT NOT NULL,
  "bodyEn" TEXT,
  "bodyNp" TEXT,
  "actionKeys" TEXT[],
  "active" BOOLEAN NOT NULL DEFAULT true,
  "isSystemDefault" BOOLEAN NOT NULL DEFAULT false,

  CONSTRAINT "ReminderRule_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "ReminderRule_farmId_active_idx" ON "ReminderRule"("farmId", "active");
CREATE INDEX IF NOT EXISTS "ReminderRule_code_idx" ON "ReminderRule"("code");
CREATE UNIQUE INDEX IF NOT EXISTS "ReminderRule_code_system_key" ON "ReminderRule"("code") WHERE "farmId" IS NULL;
CREATE UNIQUE INDEX IF NOT EXISTS "ReminderRule_farmId_code_key" ON "ReminderRule"("farmId", "code") WHERE "farmId" IS NOT NULL;

ALTER TABLE "ReminderRule" DROP CONSTRAINT IF EXISTS "ReminderRule_farmId_fkey";
ALTER TABLE "ReminderRule" ADD CONSTRAINT "ReminderRule_farmId_fkey" FOREIGN KEY ("farmId") REFERENCES "Farm"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- CreateEnum
DO $$ BEGIN CREATE TYPE "ReproStage" AS ENUM (
  'CALF',
  'HEIFER_READY',
  'VOLUNTARY_WAIT',
  'AWAITING_HEAT',
  'IN_HEAT',
  'SERVED_UNCONFIRMED',
  'PREGNANCY_CHECK_DUE',
  'PREGNANT_EARLY',
  'PREGNANT_DRYOFF_DUE',
  'DRY_PREGNANT',
  'CALVING_IMMINENT',
  'FRESH',
  'ANESTRUS_SUSPECTED',
  'REPEAT_BREEDER',
  'UNDER_PROTOCOL',
  'DO_NOT_BREED',
  'NOT_BREEDING'
); EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- AlterTable
ALTER TABLE "Animal"
  ADD COLUMN IF NOT EXISTS "reproStage" "ReproStage" NOT NULL DEFAULT 'NOT_BREEDING',
  ADD COLUMN IF NOT EXISTS "reproStageSince" TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "reproStageComputedAt" TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "doNotBreed" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS "doNotBreedReason" TEXT;

CREATE INDEX IF NOT EXISTS "Animal_farmId_reproStage_idx" ON "Animal"("farmId", "reproStage");

-- CreateTable
CREATE TABLE IF NOT EXISTS "ReproStageHistory" (
  "id" UUID NOT NULL,
  "animalId" UUID NOT NULL,
  "farmId" UUID NOT NULL,
  "fromStage" "ReproStage",
  "toStage" "ReproStage" NOT NULL,
  "enteredAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "daysInPrevious" INTEGER,
  "trigger" TEXT,

  CONSTRAINT "ReproStageHistory_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "ReproStageHistory_animalId_enteredAt_idx" ON "ReproStageHistory"("animalId", "enteredAt" DESC);
CREATE INDEX IF NOT EXISTS "ReproStageHistory_farmId_toStage_enteredAt_idx" ON "ReproStageHistory"("farmId", "toStage", "enteredAt");

ALTER TABLE "ReproStageHistory" DROP CONSTRAINT IF EXISTS "ReproStageHistory_farmId_fkey";
ALTER TABLE "ReproStageHistory" ADD CONSTRAINT "ReproStageHistory_farmId_fkey" FOREIGN KEY ("farmId") REFERENCES "Farm"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "ReproStageHistory" DROP CONSTRAINT IF EXISTS "ReproStageHistory_animalId_fkey";
ALTER TABLE "ReproStageHistory" ADD CONSTRAINT "ReproStageHistory_animalId_fkey" FOREIGN KEY ("animalId") REFERENCES "Animal"("id") ON DELETE CASCADE ON UPDATE CASCADE;

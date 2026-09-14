-- Phase 8: health depth — remaining doses, udder checks, mortality, species temp band.

ALTER TABLE "SpeciesConfig" ADD COLUMN IF NOT EXISTS "tempMinC" DECIMAL(4, 1) NOT NULL DEFAULT 37.5;
ALTER TABLE "SpeciesConfig" ADD COLUMN IF NOT EXISTS "tempMaxC" DECIMAL(4, 1) NOT NULL DEFAULT 39.5;

UPDATE "SpeciesConfig" SET "tempMinC" = 37.5, "tempMaxC" = 39.5 WHERE "species" = 'BUFFALO';
UPDATE "SpeciesConfig" SET "tempMinC" = 38.0, "tempMaxC" = 39.3 WHERE "species" = 'COW';
UPDATE "SpeciesConfig" SET "tempMinC" = 38.5, "tempMaxC" = 40.5 WHERE "species" = 'GOAT';
UPDATE "SpeciesConfig" SET "tempMinC" = 38.7, "tempMaxC" = 40.0 WHERE "species" = 'PIG';

ALTER TABLE "Animal" ADD COLUMN IF NOT EXISTS "chronicMastitis" BOOLEAN NOT NULL DEFAULT false;

ALTER TABLE "HealthEvent" ADD COLUMN IF NOT EXISTS "healthRecordId" UUID;

DO $$ BEGIN ALTER TYPE "Symptom" ADD VALUE 'NASAL_DISCHARGE'; EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN ALTER TYPE "Symptom" ADD VALUE 'COUGHING'; EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN ALTER TYPE "Symptom" ADD VALUE 'WEIGHT_LOSS'; EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN ALTER TYPE "Symptom" ADD VALUE 'BLOAT'; EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN ALTER TYPE "Symptom" ADD VALUE 'DIFFICULTY_BREATHING'; EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN ALTER TYPE "Symptom" ADD VALUE 'VULVAR_DISCHARGE'; EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN ALTER TYPE "Symptom" ADD VALUE 'SKIN_LESIONS'; EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN ALTER TYPE "DiagnosedBy" ADD VALUE 'PARAVET'; EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN ALTER TYPE "DiagnosedBy" ADD VALUE 'VETERINARIAN'; EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN ALTER TYPE "DiagnosedBy" ADD VALUE 'LAB'; EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN ALTER TYPE "TreatmentOutcome" ADD VALUE 'RECOVERING'; EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN ALTER TYPE "TreatmentOutcome" ADD VALUE 'CHRONIC'; EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN ALTER TYPE "TreatmentOutcome" ADD VALUE 'DIED'; EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN ALTER TYPE "TaskType" ADD VALUE 'TREATMENT_FOLLOWUP'; EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN ALTER TYPE "MilkAppearance" ADD VALUE 'WATERY'; EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN ALTER TYPE "MilkAppearance" ADD VALUE 'PUS'; EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN CREATE TYPE "UdderMethod" AS ENUM ('VISUAL', 'STRIP_CUP', 'CMT', 'LAB_SCC');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE TYPE "UdderSign" AS ENUM ('HEAT', 'SWELLING', 'PAIN', 'HARDNESS', 'ASYMMETRY', 'NONE');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE TYPE "MastitisClass" AS ENUM ('HEALTHY', 'SUBCLINICAL', 'CLINICAL');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE TYPE "Quarter" AS ENUM ('LF', 'RF', 'LR', 'RR');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE TYPE "CauseCategory" AS ENUM ('DISEASE', 'INJURY', 'CALVING_COMPLICATION', 'PREDATION', 'POISONING', 'UNKNOWN');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE TYPE "DisposalMethod" AS ENUM ('BURIED', 'BURNED', 'RENDERED', 'SOLD_FOR_MEAT');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE TABLE IF NOT EXISTS "MedicationAdministration" (
    "id" UUID NOT NULL,
    "healthEventId" UUID NOT NULL,
    "animalId" UUID NOT NULL,
    "itemId" UUID,
    "lotId" UUID,
    "lotNumber" TEXT,
    "doseAmount" DECIMAL(8, 2) NOT NULL,
    "doseUnit" TEXT NOT NULL DEFAULT 'DOSE',
    "route" "AdminRoute" NOT NULL,
    "frequencyPerDay" INTEGER NOT NULL DEFAULT 1,
    "durationDays" INTEGER NOT NULL DEFAULT 1,
    "firstDoseAt" TIMESTAMP(3) NOT NULL,
    "dosesGiven" INTEGER NOT NULL DEFAULT 1,
    "costNpr" DECIMAL(10, 2),
    CONSTRAINT "MedicationAdministration_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "MedicationAdministration_animalId_firstDoseAt_idx"
  ON "MedicationAdministration"("animalId", "firstDoseAt");

CREATE TABLE IF NOT EXISTS "UdderCheck" (
    "id" UUID NOT NULL,
    "animalId" UUID NOT NULL,
    "farmId" UUID NOT NULL,
    "checkDate" DATE NOT NULL,
    "method" "UdderMethod" NOT NULL,
    "quarterScores" JSONB NOT NULL,
    "sccThousand" INTEGER,
    "appearance" "MilkAppearance" NOT NULL DEFAULT 'NORMAL',
    "signs" "UdderSign"[] DEFAULT ARRAY[]::"UdderSign"[],
    "classification" "MastitisClass" NOT NULL,
    "affectedQuarters" "Quarter"[] DEFAULT ARRAY[]::"Quarter"[],
    "discardMilk" BOOLEAN NOT NULL DEFAULT false,
    "chronicFlag" BOOLEAN NOT NULL DEFAULT false,
    "checkedById" UUID,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "UdderCheck_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "UdderCheck_animalId_checkDate_idx" ON "UdderCheck"("animalId", "checkDate");

CREATE TABLE IF NOT EXISTS "MortalityRecord" (
    "id" UUID NOT NULL,
    "animalId" UUID NOT NULL,
    "farmId" UUID NOT NULL,
    "deathAt" TIMESTAMP(3) NOT NULL,
    "causeCategory" "CauseCategory" NOT NULL,
    "suspectedDisease" TEXT,
    "postMortemDone" BOOLEAN NOT NULL DEFAULT false,
    "postMortemFindings" TEXT,
    "disposalMethod" "DisposalMethod",
    "estimatedLossNpr" DECIMAL(12, 2),
    "insuranceClaimFiled" BOOLEAN NOT NULL DEFAULT false,
    "insuranceClaimStatus" TEXT,
    "reportedToVetOffice" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "MortalityRecord_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "MortalityRecord_animalId_key" ON "MortalityRecord"("animalId");
CREATE INDEX IF NOT EXISTS "MortalityRecord_farmId_deathAt_idx" ON "MortalityRecord"("farmId", "deathAt");

DO $$ BEGIN
  ALTER TABLE "MedicationAdministration" ADD CONSTRAINT "MedicationAdministration_healthEventId_fkey"
    FOREIGN KEY ("healthEventId") REFERENCES "HealthEvent"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE "UdderCheck" ADD CONSTRAINT "UdderCheck_farmId_fkey"
    FOREIGN KEY ("farmId") REFERENCES "Farm"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  ALTER TABLE "UdderCheck" ADD CONSTRAINT "UdderCheck_animalId_fkey"
    FOREIGN KEY ("animalId") REFERENCES "Animal"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE "MortalityRecord" ADD CONSTRAINT "MortalityRecord_farmId_fkey"
    FOREIGN KEY ("farmId") REFERENCES "Farm"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  ALTER TABLE "MortalityRecord" ADD CONSTRAINT "MortalityRecord_animalId_fkey"
    FOREIGN KEY ("animalId") REFERENCES "Animal"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

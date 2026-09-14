-- Phase 4: calving, colostrum, breeding core.
-- Spec models sit alongside live HeatLog / BreedingRecord.

ALTER TABLE "SpeciesConfig" ADD COLUMN IF NOT EXISTS "serviceWindowStartHours" INTEGER NOT NULL DEFAULT 12;
ALTER TABLE "SpeciesConfig" ADD COLUMN IF NOT EXISTS "serviceWindowEndHours" INTEGER NOT NULL DEFAULT 18;
ALTER TABLE "SpeciesConfig" ADD COLUMN IF NOT EXISTS "silentHeatCheckHour" INTEGER;

UPDATE "SpeciesConfig" SET "silentHeatCheckHour" = 4 WHERE "species" = 'BUFFALO' AND "silentHeatCheckHour" IS NULL;

ALTER TABLE "Animal" ADD COLUMN IF NOT EXISTS "expectedDryOff" TIMESTAMP(3);
ALTER TABLE "Animal" ADD COLUMN IF NOT EXISTS "highRiskFPT" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "Animal" ADD COLUMN IF NOT EXISTS "birthWeightKg" DECIMAL(5, 2);
ALTER TABLE "Animal" ADD COLUMN IF NOT EXISTS "isFreemartinSuspect" BOOLEAN NOT NULL DEFAULT false;

DO $$ BEGIN
  ALTER TYPE "HeatIntensity" ADD VALUE IF NOT EXISTS 'SILENT_SUSPECTED';
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TYPE "TaskType" ADD VALUE IF NOT EXISTS 'REPEAT_BREEDER';
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TYPE "TaskType" ADD VALUE IF NOT EXISTS 'VET_URGENT';
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE "HeatSign" AS ENUM (
    'STANDING_HEAT', 'MOUNTING_OTHERS', 'MUCUS_DISCHARGE', 'VULVA_SWELLING',
    'BELLOWING', 'RESTLESSNESS', 'REDUCED_MILK', 'TAIL_RAISED', 'OFF_FEED'
  );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE "ServiceMethod" AS ENUM ('AI', 'NATURAL', 'EMBRYO_TRANSFER');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE "ServiceResult" AS ENUM ('PENDING', 'PREGNANT', 'FAILED', 'ABORTED', 'UNKNOWN');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE "PregCheckMethod" AS ENUM (
    'RECTAL_PALPATION', 'ULTRASOUND', 'BLOOD_TEST', 'MILK_TEST', 'OBSERVATION'
  );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE "PregCheckResult" AS ENUM ('PREGNANT', 'NOT_PREGNANT', 'INCONCLUSIVE');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE "CalvingOutcome" AS ENUM (
    'LIVE_SINGLE', 'LIVE_TWINS', 'LIVE_TRIPLETS', 'STILLBORN', 'ABORTED'
  );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE "CalvingComplication" AS ENUM (
    'RETAINED_PLACENTA', 'MILK_FEVER', 'PROLAPSE', 'METRITIS', 'DYSTOCIA', 'KETOSIS', 'NONE'
  );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE "DamCondition" AS ENUM ('NORMAL', 'WEAK', 'CRITICAL');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE "CalfVigour" AS ENUM ('NORMAL', 'WEAK', 'NON_VIABLE');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE "ColostrumSource" AS ENUM (
    'OWN_DAM', 'OTHER_COW', 'STORED_FROZEN', 'COMMERCIAL_REPLACER'
  );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE "ColostrumMethod" AS ENUM ('SUCKLED', 'BOTTLE', 'TUBE');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE "ColostrumQuality" AS ENUM (
    'THICK_YELLOW', 'THIN_WATERY', 'BLOODY', 'NOT_ASSESSED'
  );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE TABLE IF NOT EXISTS "HeatEvent" (
    "id" UUID NOT NULL,
    "animalId" UUID NOT NULL,
    "farmId" UUID NOT NULL,
    "observedAt" TIMESTAMP(3) NOT NULL,
    "intensity" "HeatIntensity" NOT NULL,
    "signs" "HeatSign"[] NOT NULL DEFAULT ARRAY[]::"HeatSign"[],
    "observerId" UUID,
    "wasBred" BOOLEAN NOT NULL DEFAULT false,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "deviceId" TEXT,

    CONSTRAINT "HeatEvent_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "SemenStraw" (
    "id" UUID NOT NULL,
    "farmId" UUID NOT NULL,
    "strawCode" TEXT NOT NULL,
    "bullName" TEXT NOT NULL,
    "bullBreed" TEXT NOT NULL,
    "bullIdOfficial" TEXT,
    "supplier" TEXT,
    "purchasedOn" TIMESTAMP(3),
    "qtyRemaining" INTEGER NOT NULL DEFAULT 0,
    "costPerStrawNpr" DECIMAL(10, 2) NOT NULL,
    "sireMilkIndex" DECIMAL(8, 2),

    CONSTRAINT "SemenStraw_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "BreedingService" (
    "id" UUID NOT NULL,
    "animalId" UUID NOT NULL,
    "farmId" UUID NOT NULL,
    "serviceDate" TIMESTAMP(3) NOT NULL,
    "heatEventId" UUID,
    "method" "ServiceMethod" NOT NULL,
    "sireId" UUID,
    "strawId" UUID,
    "technicianName" TEXT,
    "technicianPhone" TEXT,
    "costNpr" DECIMAL(10, 2),
    "serviceNo" INTEGER NOT NULL DEFAULT 1,
    "result" "ServiceResult" NOT NULL DEFAULT 'PENDING',
    "provisionalEdd" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "deviceId" TEXT,

    CONSTRAINT "BreedingService_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "PregnancyCheck" (
    "id" UUID NOT NULL,
    "serviceId" UUID NOT NULL,
    "animalId" UUID NOT NULL,
    "farmId" UUID NOT NULL,
    "checkDate" TIMESTAMP(3) NOT NULL,
    "method" "PregCheckMethod" NOT NULL,
    "result" "PregCheckResult" NOT NULL,
    "estimatedDaysPregnant" INTEGER,
    "examinerName" TEXT,
    "costNpr" DECIMAL(10, 2),

    CONSTRAINT "PregnancyCheck_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "CalvingEvent" (
    "id" UUID NOT NULL,
    "damId" UUID NOT NULL,
    "farmId" UUID NOT NULL,
    "serviceId" UUID,
    "calvingAt" TIMESTAMP(3) NOT NULL,
    "gestationDaysActual" INTEGER,
    "difficulty" "CalvingDifficulty" NOT NULL DEFAULT 'EASY',
    "complications" "CalvingComplication"[] NOT NULL DEFAULT ARRAY[]::"CalvingComplication"[],
    "placentaExpelledWithin12h" BOOLEAN,
    "outcome" "CalvingOutcome" NOT NULL,
    "damConditionPost" "DamCondition" NOT NULL DEFAULT 'NORMAL',
    "assistedBy" TEXT,
    "interventionCostNpr" DECIMAL(10, 2),
    "calvingIntervalDays" INTEGER,
    "daysOpenDays" INTEGER,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "deviceId" TEXT,

    CONSTRAINT "CalvingEvent_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "CalfRecord" (
    "id" UUID NOT NULL,
    "calvingId" UUID NOT NULL,
    "animalId" UUID,
    "sex" "Gender" NOT NULL,
    "birthWeightKg" DECIMAL(5, 2),
    "vigour" "CalfVigour" NOT NULL DEFAULT 'NORMAL',
    "defects" TEXT,
    "photoId" TEXT,
    "isFreemartinSuspect" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "CalfRecord_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "ColostrumFeeding" (
    "id" UUID NOT NULL,
    "calfRecordId" UUID NOT NULL,
    "animalId" UUID,
    "farmId" UUID NOT NULL,
    "taskId" UUID,
    "fedAt" TIMESTAMP(3) NOT NULL,
    "hoursAfterBirth" DECIMAL(5, 2) NOT NULL,
    "volumeLitres" DECIMAL(5, 2) NOT NULL,
    "source" "ColostrumSource" NOT NULL,
    "method" "ColostrumMethod" NOT NULL,
    "quality" "ColostrumQuality" NOT NULL DEFAULT 'NOT_ASSESSED',
    "heatTreated" BOOLEAN NOT NULL DEFAULT false,
    "fedById" UUID,

    CONSTRAINT "ColostrumFeeding_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "SemenStraw_farmId_strawCode_key" ON "SemenStraw"("farmId", "strawCode");
CREATE UNIQUE INDEX IF NOT EXISTS "CalfRecord_animalId_key" ON "CalfRecord"("animalId");

CREATE INDEX IF NOT EXISTS "HeatEvent_animalId_observedAt_idx" ON "HeatEvent"("animalId", "observedAt");
CREATE INDEX IF NOT EXISTS "HeatEvent_farmId_observedAt_idx" ON "HeatEvent"("farmId", "observedAt");
CREATE INDEX IF NOT EXISTS "BreedingService_animalId_serviceDate_idx" ON "BreedingService"("animalId", "serviceDate");
CREATE INDEX IF NOT EXISTS "BreedingService_farmId_result_idx" ON "BreedingService"("farmId", "result");
CREATE INDEX IF NOT EXISTS "PregnancyCheck_animalId_checkDate_idx" ON "PregnancyCheck"("animalId", "checkDate");
CREATE INDEX IF NOT EXISTS "CalvingEvent_damId_calvingAt_idx" ON "CalvingEvent"("damId", "calvingAt");
CREATE INDEX IF NOT EXISTS "CalvingEvent_farmId_calvingAt_idx" ON "CalvingEvent"("farmId", "calvingAt");
CREATE INDEX IF NOT EXISTS "ColostrumFeeding_calfRecordId_fedAt_idx" ON "ColostrumFeeding"("calfRecordId", "fedAt");

ALTER TABLE "HeatEvent" DROP CONSTRAINT IF EXISTS "HeatEvent_farmId_fkey";
ALTER TABLE "HeatEvent" ADD CONSTRAINT "HeatEvent_farmId_fkey" FOREIGN KEY ("farmId") REFERENCES "Farm"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "HeatEvent" DROP CONSTRAINT IF EXISTS "HeatEvent_animalId_fkey";
ALTER TABLE "HeatEvent" ADD CONSTRAINT "HeatEvent_animalId_fkey" FOREIGN KEY ("animalId") REFERENCES "Animal"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "SemenStraw" DROP CONSTRAINT IF EXISTS "SemenStraw_farmId_fkey";
ALTER TABLE "SemenStraw" ADD CONSTRAINT "SemenStraw_farmId_fkey" FOREIGN KEY ("farmId") REFERENCES "Farm"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "BreedingService" DROP CONSTRAINT IF EXISTS "BreedingService_farmId_fkey";
ALTER TABLE "BreedingService" ADD CONSTRAINT "BreedingService_farmId_fkey" FOREIGN KEY ("farmId") REFERENCES "Farm"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "BreedingService" DROP CONSTRAINT IF EXISTS "BreedingService_animalId_fkey";
ALTER TABLE "BreedingService" ADD CONSTRAINT "BreedingService_animalId_fkey" FOREIGN KEY ("animalId") REFERENCES "Animal"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "BreedingService" DROP CONSTRAINT IF EXISTS "BreedingService_heatEventId_fkey";
ALTER TABLE "BreedingService" ADD CONSTRAINT "BreedingService_heatEventId_fkey" FOREIGN KEY ("heatEventId") REFERENCES "HeatEvent"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "BreedingService" DROP CONSTRAINT IF EXISTS "BreedingService_strawId_fkey";
ALTER TABLE "BreedingService" ADD CONSTRAINT "BreedingService_strawId_fkey" FOREIGN KEY ("strawId") REFERENCES "SemenStraw"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "PregnancyCheck" DROP CONSTRAINT IF EXISTS "PregnancyCheck_farmId_fkey";
ALTER TABLE "PregnancyCheck" ADD CONSTRAINT "PregnancyCheck_farmId_fkey" FOREIGN KEY ("farmId") REFERENCES "Farm"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "PregnancyCheck" DROP CONSTRAINT IF EXISTS "PregnancyCheck_animalId_fkey";
ALTER TABLE "PregnancyCheck" ADD CONSTRAINT "PregnancyCheck_animalId_fkey" FOREIGN KEY ("animalId") REFERENCES "Animal"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "PregnancyCheck" DROP CONSTRAINT IF EXISTS "PregnancyCheck_serviceId_fkey";
ALTER TABLE "PregnancyCheck" ADD CONSTRAINT "PregnancyCheck_serviceId_fkey" FOREIGN KEY ("serviceId") REFERENCES "BreedingService"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "CalvingEvent" DROP CONSTRAINT IF EXISTS "CalvingEvent_farmId_fkey";
ALTER TABLE "CalvingEvent" ADD CONSTRAINT "CalvingEvent_farmId_fkey" FOREIGN KEY ("farmId") REFERENCES "Farm"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "CalvingEvent" DROP CONSTRAINT IF EXISTS "CalvingEvent_damId_fkey";
ALTER TABLE "CalvingEvent" ADD CONSTRAINT "CalvingEvent_damId_fkey" FOREIGN KEY ("damId") REFERENCES "Animal"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "CalvingEvent" DROP CONSTRAINT IF EXISTS "CalvingEvent_serviceId_fkey";
ALTER TABLE "CalvingEvent" ADD CONSTRAINT "CalvingEvent_serviceId_fkey" FOREIGN KEY ("serviceId") REFERENCES "BreedingService"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "CalfRecord" DROP CONSTRAINT IF EXISTS "CalfRecord_calvingId_fkey";
ALTER TABLE "CalfRecord" ADD CONSTRAINT "CalfRecord_calvingId_fkey" FOREIGN KEY ("calvingId") REFERENCES "CalvingEvent"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "CalfRecord" DROP CONSTRAINT IF EXISTS "CalfRecord_animalId_fkey";
ALTER TABLE "CalfRecord" ADD CONSTRAINT "CalfRecord_animalId_fkey" FOREIGN KEY ("animalId") REFERENCES "Animal"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "ColostrumFeeding" DROP CONSTRAINT IF EXISTS "ColostrumFeeding_farmId_fkey";
ALTER TABLE "ColostrumFeeding" ADD CONSTRAINT "ColostrumFeeding_farmId_fkey" FOREIGN KEY ("farmId") REFERENCES "Farm"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ColostrumFeeding" DROP CONSTRAINT IF EXISTS "ColostrumFeeding_calfRecordId_fkey";
ALTER TABLE "ColostrumFeeding" ADD CONSTRAINT "ColostrumFeeding_calfRecordId_fkey" FOREIGN KEY ("calfRecordId") REFERENCES "CalfRecord"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ColostrumFeeding" DROP CONSTRAINT IF EXISTS "ColostrumFeeding_animalId_fkey";
ALTER TABLE "ColostrumFeeding" ADD CONSTRAINT "ColostrumFeeding_animalId_fkey" FOREIGN KEY ("animalId") REFERENCES "Animal"("id") ON DELETE SET NULL ON UPDATE CASCADE;

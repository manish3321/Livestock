-- Dairy operating core. Idempotent: the live database already has pieces of
-- an earlier dairy pass (MilkSession, sellerName, MilkTankBatch). This only
-- adds what this Prisma schema still needs.

-- Enum extensions (IF NOT EXISTS is PG 9.1+)
ALTER TYPE "AnimalStatus" ADD VALUE IF NOT EXISTS 'GROWING';
ALTER TYPE "AnimalStatus" ADD VALUE IF NOT EXISTS 'HEIFER';
ALTER TYPE "AnimalSource" ADD VALUE IF NOT EXISTS 'GIFTED';

DO $$ BEGIN CREATE TYPE "AnimalTagReason" AS ENUM ('ISSUED', 'LOST', 'DAMAGED', 'ILLEGIBLE', 'REPLACED'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE TYPE "MarkerColor" AS ENUM ('RED', 'YELLOW', 'BLUE', 'GREEN', 'WHITE'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE TYPE "MarkerMeaning" AS ENUM ('MILK_WITHHOLD', 'DRY', 'CALVING_SOON', 'IN_HEAT', 'TREATMENT'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE TYPE "MilkSession" AS ENUM ('MORNING', 'EVENING', 'MIDDAY'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE TYPE "MilkDestination" AS ENUM ('SOLD', 'CALF', 'HOUSEHOLD', 'DISCARDED'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE TYPE "MilkRoundStatus" AS ENUM ('OPEN', 'FINISHED'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE TYPE "CobResult" AS ENUM ('NOT_TESTED', 'PASS', 'FAIL'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE TYPE "UnrecordedReason" AS ENUM ('NOT_MILKED', 'FORGOT', 'RECORDED'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;

ALTER TABLE "Farm"
  ADD COLUMN IF NOT EXISTS "morningMilkingHour" INTEGER NOT NULL DEFAULT 5,
  ADD COLUMN IF NOT EXISTS "eveningMilkingHour" INTEGER NOT NULL DEFAULT 17;

ALTER TABLE "SpeciesConfig"
  ADD COLUMN IF NOT EXISTS "fatMinPercent" DECIMAL(4,2) NOT NULL DEFAULT 3.50,
  ADD COLUMN IF NOT EXISTS "fatMaxPercent" DECIMAL(4,2) NOT NULL DEFAULT 4.50;

UPDATE "SpeciesConfig" SET "fatMinPercent" = 6.50, "fatMaxPercent" = 8.00 WHERE "species" = 'BUFFALO';
UPDATE "SpeciesConfig" SET "fatMinPercent" = 3.50, "fatMaxPercent" = 4.50 WHERE "species" = 'COW';
UPDATE "SpeciesConfig" SET "fatMinPercent" = 5.00, "fatMaxPercent" = 8.00 WHERE "species" IN ('GOAT', 'PIG');

ALTER TABLE "Animal"
  ADD COLUMN IF NOT EXISTS "herdNumber" TEXT,
  ADD COLUMN IF NOT EXISTS "sellerName" TEXT,
  ADD COLUMN IF NOT EXISTS "distinguishingMarks" TEXT;

-- Prefer an already-issued shortNumber when present.
DO $$ BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'Animal' AND column_name = 'shortNumber'
  ) THEN
    UPDATE "Animal"
    SET "herdNumber" = "shortNumber"
    WHERE "herdNumber" IS NULL AND "shortNumber" IS NOT NULL AND "shortNumber" <> '';
  END IF;
END $$;

UPDATE "Animal"
SET "herdNumber" = (
  CASE "species"
    WHEN 'BUFFALO' THEN 'B'
    WHEN 'COW' THEN 'C'
    WHEN 'PIG' THEN 'P'
    WHEN 'GOAT' THEN 'G'
  END
) || lpad((regexp_replace("tag", '\D', '', 'g'))::int::text, 2, '0')
WHERE "herdNumber" IS NULL
  AND regexp_replace("tag", '\D', '', 'g') ~ '^[0-9]+$'
  AND (regexp_replace("tag", '\D', '', 'g'))::int > 0;

CREATE UNIQUE INDEX IF NOT EXISTS "Animal_farmId_herdNumber_key" ON "Animal"("farmId", "herdNumber");
CREATE INDEX IF NOT EXISTS "Animal_farmId_shed_idx" ON "Animal"("farmId", "shed");

CREATE TABLE IF NOT EXISTS "HerdNumberSequence" (
  "id" UUID NOT NULL,
  "farmId" UUID NOT NULL,
  "species" "Species" NOT NULL,
  "nextNumber" INTEGER NOT NULL DEFAULT 1,
  "reservedThrough" INTEGER NOT NULL DEFAULT 0,
  CONSTRAINT "HerdNumberSequence_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX IF NOT EXISTS "HerdNumberSequence_farmId_species_key" ON "HerdNumberSequence"("farmId", "species");
DO $$ BEGIN
  ALTER TABLE "HerdNumberSequence" ADD CONSTRAINT "HerdNumberSequence_farmId_fkey"
    FOREIGN KEY ("farmId") REFERENCES "Farm"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

INSERT INTO "HerdNumberSequence" ("id", "farmId", "species", "nextNumber", "reservedThrough")
SELECT gen_random_uuid(), a."farmId", a."species",
       COALESCE(MAX(NULLIF(regexp_replace(a."herdNumber", '\D', '', 'g'), '')::int), 0) + 1,
       COALESCE(MAX(NULLIF(regexp_replace(a."herdNumber", '\D', '', 'g'), '')::int), 0)
FROM "Animal" a
WHERE a."herdNumber" IS NOT NULL
GROUP BY a."farmId", a."species"
ON CONFLICT ("farmId", "species") DO NOTHING;

CREATE TABLE IF NOT EXISTS "AnimalPhoto" (
  "id" UUID NOT NULL,
  "farmId" UUID NOT NULL,
  "animalId" UUID NOT NULL,
  "storageKey" TEXT NOT NULL,
  "url" TEXT NOT NULL,
  "sortOrder" INTEGER NOT NULL DEFAULT 0,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "AnimalPhoto_pkey" PRIMARY KEY ("id")
);
CREATE INDEX IF NOT EXISTS "AnimalPhoto_animalId_sortOrder_idx" ON "AnimalPhoto"("animalId", "sortOrder");
DO $$ BEGIN
  ALTER TABLE "AnimalPhoto" ADD CONSTRAINT "AnimalPhoto_farmId_fkey"
    FOREIGN KEY ("farmId") REFERENCES "Farm"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  ALTER TABLE "AnimalPhoto" ADD CONSTRAINT "AnimalPhoto_animalId_fkey"
    FOREIGN KEY ("animalId") REFERENCES "Animal"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE TABLE IF NOT EXISTS "AnimalTag" (
  "id" UUID NOT NULL,
  "farmId" UUID NOT NULL,
  "animalId" UUID NOT NULL,
  "herdNumber" TEXT NOT NULL,
  "fullTag" TEXT NOT NULL,
  "reason" "AnimalTagReason" NOT NULL DEFAULT 'ISSUED',
  "replacedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "AnimalTag_pkey" PRIMARY KEY ("id")
);
CREATE INDEX IF NOT EXISTS "AnimalTag_farmId_herdNumber_idx" ON "AnimalTag"("farmId", "herdNumber");
CREATE INDEX IF NOT EXISTS "AnimalTag_animalId_createdAt_idx" ON "AnimalTag"("animalId", "createdAt");
DO $$ BEGIN
  ALTER TABLE "AnimalTag" ADD CONSTRAINT "AnimalTag_farmId_fkey"
    FOREIGN KEY ("farmId") REFERENCES "Farm"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  ALTER TABLE "AnimalTag" ADD CONSTRAINT "AnimalTag_animalId_fkey"
    FOREIGN KEY ("animalId") REFERENCES "Animal"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

INSERT INTO "AnimalTag" ("id", "farmId", "animalId", "herdNumber", "fullTag", "reason")
SELECT gen_random_uuid(), a."farmId", a."id", a."herdNumber", a."tag", 'ISSUED'
FROM "Animal" a
WHERE a."herdNumber" IS NOT NULL
  AND NOT EXISTS (SELECT 1 FROM "AnimalTag" t WHERE t."animalId" = a."id" AND t."reason" = 'ISSUED');

CREATE TABLE IF NOT EXISTS "AnimalMarker" (
  "id" UUID NOT NULL,
  "farmId" UUID NOT NULL,
  "animalId" UUID NOT NULL,
  "color" "MarkerColor" NOT NULL,
  "meaning" "MarkerMeaning" NOT NULL,
  "placedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "placedById" UUID,
  "placedByScan" BOOLEAN NOT NULL DEFAULT false,
  "removedAt" TIMESTAMP(3),
  "removedById" UUID,
  "removedByScan" BOOLEAN NOT NULL DEFAULT false,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "AnimalMarker_pkey" PRIMARY KEY ("id")
);
CREATE INDEX IF NOT EXISTS "AnimalMarker_farmId_animalId_removedAt_idx" ON "AnimalMarker"("farmId", "animalId", "removedAt");
CREATE INDEX IF NOT EXISTS "AnimalMarker_farmId_color_removedAt_idx" ON "AnimalMarker"("farmId", "color", "removedAt");
DO $$ BEGIN
  ALTER TABLE "AnimalMarker" ADD CONSTRAINT "AnimalMarker_farmId_fkey"
    FOREIGN KEY ("farmId") REFERENCES "Farm"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  ALTER TABLE "AnimalMarker" ADD CONSTRAINT "AnimalMarker_animalId_fkey"
    FOREIGN KEY ("animalId") REFERENCES "Animal"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE TABLE IF NOT EXISTS "MilkRound" (
  "id" UUID NOT NULL,
  "farmId" UUID NOT NULL,
  "session" "MilkSession" NOT NULL,
  "roundDate" TIMESTAMP(3) NOT NULL,
  "status" "MilkRoundStatus" NOT NULL DEFAULT 'OPEN',
  "startedById" UUID,
  "finishedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "MilkRound_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX IF NOT EXISTS "MilkRound_farmId_roundDate_session_key" ON "MilkRound"("farmId", "roundDate", "session");
CREATE INDEX IF NOT EXISTS "MilkRound_farmId_status_roundDate_idx" ON "MilkRound"("farmId", "status", "roundDate");
DO $$ BEGIN
  ALTER TABLE "MilkRound" ADD CONSTRAINT "MilkRound_farmId_fkey"
    FOREIGN KEY ("farmId") REFERENCES "Farm"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE TABLE IF NOT EXISTS "MilkRoundSkip" (
  "id" UUID NOT NULL,
  "roundId" UUID NOT NULL,
  "animalId" UUID NOT NULL,
  "reason" "UnrecordedReason" NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "MilkRoundSkip_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX IF NOT EXISTS "MilkRoundSkip_roundId_animalId_key" ON "MilkRoundSkip"("roundId", "animalId");
DO $$ BEGIN
  ALTER TABLE "MilkRoundSkip" ADD CONSTRAINT "MilkRoundSkip_roundId_fkey"
    FOREIGN KEY ("roundId") REFERENCES "MilkRound"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE TABLE IF NOT EXISTS "MilkTank" (
  "id" UUID NOT NULL,
  "farmId" UUID NOT NULL,
  "roundId" UUID NOT NULL,
  "expectedLitres" DECIMAL(12,2) NOT NULL,
  "actualLitres" DECIMAL(12,2),
  "temperatureC" DECIMAL(5,2),
  "compositeFat" DECIMAL(5,2),
  "compositeSnf" DECIMAL(5,2),
  "cobResult" "CobResult" NOT NULL DEFAULT 'NOT_TESTED',
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "MilkTank_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX IF NOT EXISTS "MilkTank_roundId_key" ON "MilkTank"("roundId");
DO $$ BEGIN
  ALTER TABLE "MilkTank" ADD CONSTRAINT "MilkTank_farmId_fkey"
    FOREIGN KEY ("farmId") REFERENCES "Farm"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  ALTER TABLE "MilkTank" ADD CONSTRAINT "MilkTank_roundId_fkey"
    FOREIGN KEY ("roundId") REFERENCES "MilkRound"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE TABLE IF NOT EXISTS "PaymentStatement" (
  "id" UUID NOT NULL,
  "farmId" UUID NOT NULL,
  "periodStart" TIMESTAMP(3) NOT NULL,
  "periodEnd" TIMESTAMP(3) NOT NULL,
  "litres" DECIMAL(12,2) NOT NULL,
  "baseRate" DECIMAL(12,2) NOT NULL,
  "fatBonus" DECIMAL(12,2) NOT NULL DEFAULT 0,
  "snfBonus" DECIMAL(12,2) NOT NULL DEFAULT 0,
  "sccPenalty" DECIMAL(12,2) NOT NULL DEFAULT 0,
  "coolingCharge" DECIMAL(12,2) NOT NULL DEFAULT 0,
  "transport" DECIMAL(12,2) NOT NULL DEFAULT 0,
  "membership" DECIMAL(12,2) NOT NULL DEFAULT 0,
  "feedCredit" DECIMAL(12,2) NOT NULL DEFAULT 0,
  "netPaid" DECIMAL(12,2) NOT NULL,
  "effectivePrice" DECIMAL(12,4) NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "PaymentStatement_pkey" PRIMARY KEY ("id")
);
CREATE INDEX IF NOT EXISTS "PaymentStatement_farmId_periodEnd_idx" ON "PaymentStatement"("farmId", "periodEnd");
DO $$ BEGIN
  ALTER TABLE "PaymentStatement" ADD CONSTRAINT "PaymentStatement_farmId_fkey"
    FOREIGN KEY ("farmId") REFERENCES "Farm"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- Live DB already has a MilkDelivery table keyed by tankBatchId. This app's
-- delivery row is keyed by our MilkTank, so it lives in its own table.
CREATE TABLE IF NOT EXISTS "MilkRoundDelivery" (
  "id" UUID NOT NULL,
  "farmId" UUID NOT NULL,
  "tankId" UUID NOT NULL,
  "litresSent" DECIMAL(12,2) NOT NULL,
  "litresAccepted" DECIMAL(12,2),
  "litresRejected" DECIMAL(12,2),
  "rejectReason" TEXT,
  "centreFat" DECIMAL(5,2),
  "centreSnf" DECIMAL(5,2),
  "lactometer" DECIMAL(6,3),
  "centreScc" INTEGER,
  "receiptNumber" TEXT,
  "receiptUrl" TEXT,
  "expectedValue" DECIMAL(12,2),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "MilkRoundDelivery_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX IF NOT EXISTS "MilkRoundDelivery_tankId_key" ON "MilkRoundDelivery"("tankId");
DO $$ BEGIN
  ALTER TABLE "MilkRoundDelivery" ADD CONSTRAINT "MilkRoundDelivery_farmId_fkey"
    FOREIGN KEY ("farmId") REFERENCES "Farm"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  ALTER TABLE "MilkRoundDelivery" ADD CONSTRAINT "MilkRoundDelivery_tankId_fkey"
    FOREIGN KEY ("tankId") REFERENCES "MilkTank"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

ALTER TABLE "ProductionEntry"
  ADD COLUMN IF NOT EXISTS "milkRoundId" UUID,
  ADD COLUMN IF NOT EXISTS "session" "MilkSession",
  ADD COLUMN IF NOT EXISTS "destination" "MilkDestination",
  ADD COLUMN IF NOT EXISTS "proteinPercent" DECIMAL(5,2),
  ADD COLUMN IF NOT EXISTS "lactosePercent" DECIMAL(5,2),
  ADD COLUMN IF NOT EXISTS "udderFlag" BOOLEAN NOT NULL DEFAULT false;

CREATE INDEX IF NOT EXISTS "ProductionEntry_milkRoundId_idx" ON "ProductionEntry"("milkRoundId");
CREATE INDEX IF NOT EXISTS "ProductionEntry_farmId_animalId_entryDate_session_idx"
  ON "ProductionEntry"("farmId", "animalId", "entryDate", "session");

DO $$ BEGIN
  CREATE UNIQUE INDEX IF NOT EXISTS "ProductionEntry_milk_session_uniq"
    ON "ProductionEntry" ("farmId", "animalId", DATE("entryDate"), "session")
    WHERE "type" = 'MILK' AND "animalId" IS NOT NULL AND "session" IS NOT NULL;
EXCEPTION WHEN OTHERS THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE "ProductionEntry" ADD CONSTRAINT "ProductionEntry_milkRoundId_fkey"
    FOREIGN KEY ("milkRoundId") REFERENCES "MilkRound"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE TABLE IF NOT EXISTS "ProductionRevision" (
  "id" UUID NOT NULL,
  "farmId" UUID NOT NULL,
  "entryId" UUID NOT NULL,
  "previousQuantity" DECIMAL(12,2) NOT NULL,
  "newQuantity" DECIMAL(12,2) NOT NULL,
  "changedById" UUID,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "ProductionRevision_pkey" PRIMARY KEY ("id")
);
CREATE INDEX IF NOT EXISTS "ProductionRevision_entryId_createdAt_idx" ON "ProductionRevision"("entryId", "createdAt");
DO $$ BEGIN
  ALTER TABLE "ProductionRevision" ADD CONSTRAINT "ProductionRevision_farmId_fkey"
    FOREIGN KEY ("farmId") REFERENCES "Farm"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  ALTER TABLE "ProductionRevision" ADD CONSTRAINT "ProductionRevision_entryId_fkey"
    FOREIGN KEY ("entryId") REFERENCES "ProductionEntry"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

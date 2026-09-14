-- Phase 5: vaccination protocols, records, and lots.

DO $$ BEGIN CREATE TYPE "ProtocolTrigger" AS ENUM ('AGE_BASED', 'SEASONAL', 'INTERVAL', 'EVENT_BASED');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE TYPE "SexRestriction" AS ENUM ('ANY', 'FEMALE', 'MALE');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE TYPE "HealthEventType" AS ENUM ('VACCINATION', 'TREATMENT', 'OBSERVATION', 'DEWORMING', 'HOOF_TRIM');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE TYPE "AdminRoute" AS ENUM ('INTRAMUSCULAR', 'SUBCUTANEOUS', 'INTRAVENOUS', 'ORAL', 'TOPICAL', 'INTRAMAMMARY', 'INTRANASAL');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE TYPE "Symptom" AS ENUM ('FEVER', 'OFF_FEED', 'DIARRHOEA', 'LAMENESS', 'SWOLLEN_UDDER', 'ABNORMAL_MILK', 'LETHARGY');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE TYPE "Severity" AS ENUM ('MILD', 'MODERATE', 'SEVERE');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE TYPE "DiagnosedBy" AS ENUM ('FARMER', 'VET');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE TYPE "TreatmentOutcome" AS ENUM ('ONGOING', 'RECOVERED', 'FAILED', 'CULLED');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE TABLE IF NOT EXISTS "StockLot" (
    "id" UUID NOT NULL,
    "itemId" UUID NOT NULL,
    "farmId" UUID NOT NULL,
    "lotNumber" TEXT NOT NULL,
    "qtyReceived" DECIMAL(12, 3) NOT NULL,
    "qtyRemaining" DECIMAL(12, 3) NOT NULL,
    "unitCostNpr" DECIMAL(10, 2) NOT NULL DEFAULT 0,
    "receivedOn" TIMESTAMP(3) NOT NULL,
    "expiryDate" TIMESTAMP(3),
    "supplierId" TEXT,
    "storageLocation" TEXT,
    CONSTRAINT "StockLot_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "StockMovement" ADD COLUMN IF NOT EXISTS "lotId" UUID;

CREATE TABLE IF NOT EXISTS "VaccineProtocol" (
    "id" UUID NOT NULL,
    "farmId" UUID,
    "disease" TEXT NOT NULL,
    "diseaseNp" TEXT,
    "species" "Species"[] NOT NULL,
    "trigger" "ProtocolTrigger" NOT NULL,
    "triggerAgeDays" INTEGER,
    "triggerMonth" INTEGER,
    "boosterAfterDays" INTEGER,
    "repeatIntervalDays" INTEGER,
    "sexRestriction" "SexRestriction" NOT NULL DEFAULT 'ANY',
    "pregnancyContraindicated" BOOLEAN NOT NULL DEFAULT false,
    "isSystemDefault" BOOLEAN NOT NULL DEFAULT false,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "notes" TEXT,
    CONSTRAINT "VaccineProtocol_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "HealthEvent" (
    "id" UUID NOT NULL,
    "animalId" UUID NOT NULL,
    "farmId" UUID NOT NULL,
    "type" "HealthEventType" NOT NULL,
    "eventAt" TIMESTAMP(3) NOT NULL,
    "roundId" UUID,
    "symptoms" "Symptom"[] NOT NULL DEFAULT ARRAY[]::"Symptom"[],
    "temperatureC" DECIMAL(4, 1),
    "severity" "Severity",
    "provisionalDiagnosis" TEXT,
    "finalDiagnosis" TEXT,
    "diagnosedBy" "DiagnosedBy" NOT NULL DEFAULT 'FARMER',
    "vetName" TEXT,
    "vetPhone" TEXT,
    "outcome" "TreatmentOutcome" NOT NULL DEFAULT 'ONGOING',
    "recoveredOn" TIMESTAMP(3),
    "totalCostNpr" DECIMAL(10, 2),
    "taskId" UUID,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "deletedAt" TIMESTAMP(3),
    "deviceId" TEXT,
    CONSTRAINT "HealthEvent_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "VaccinationRecord" (
    "id" UUID NOT NULL,
    "healthEventId" UUID NOT NULL,
    "animalId" UUID NOT NULL,
    "farmId" UUID NOT NULL,
    "disease" TEXT NOT NULL,
    "protocolId" UUID,
    "itemId" UUID,
    "lotId" UUID,
    "lotNumber" TEXT,
    "roundId" UUID,
    "administeredAt" TIMESTAMP(3) NOT NULL,
    "doseAmount" DECIMAL(6, 2),
    "route" "AdminRoute",
    "administeredBy" TEXT,
    "costNpr" DECIMAL(10, 2),
    "adverseReaction" "Severity",
    "disputedEfficacy" BOOLEAN NOT NULL DEFAULT false,
    "scheduleWasEstimatedAge" BOOLEAN NOT NULL DEFAULT false,
    "nextDueOn" TIMESTAMP(3),
    CONSTRAINT "VaccinationRecord_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "VaccinationRecord_healthEventId_key" ON "VaccinationRecord"("healthEventId");
CREATE INDEX IF NOT EXISTS "StockLot_itemId_expiryDate_idx" ON "StockLot"("itemId", "expiryDate");
CREATE INDEX IF NOT EXISTS "StockLot_farmId_expiryDate_idx" ON "StockLot"("farmId", "expiryDate");
CREATE INDEX IF NOT EXISTS "StockMovement_lotId_createdAt_idx" ON "StockMovement"("lotId", "createdAt");
CREATE INDEX IF NOT EXISTS "VaccineProtocol_farmId_active_idx" ON "VaccineProtocol"("farmId", "active");
CREATE INDEX IF NOT EXISTS "HealthEvent_animalId_eventAt_idx" ON "HealthEvent"("animalId", "eventAt");
CREATE INDEX IF NOT EXISTS "HealthEvent_farmId_outcome_idx" ON "HealthEvent"("farmId", "outcome");
CREATE INDEX IF NOT EXISTS "VaccinationRecord_animalId_disease_administeredAt_idx" ON "VaccinationRecord"("animalId", "disease", "administeredAt");

ALTER TABLE "StockLot" DROP CONSTRAINT IF EXISTS "StockLot_farmId_fkey";
ALTER TABLE "StockLot" ADD CONSTRAINT "StockLot_farmId_fkey" FOREIGN KEY ("farmId") REFERENCES "Farm"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "StockLot" DROP CONSTRAINT IF EXISTS "StockLot_itemId_fkey";
ALTER TABLE "StockLot" ADD CONSTRAINT "StockLot_itemId_fkey" FOREIGN KEY ("itemId") REFERENCES "InventoryItem"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "StockMovement" DROP CONSTRAINT IF EXISTS "StockMovement_lotId_fkey";
ALTER TABLE "StockMovement" ADD CONSTRAINT "StockMovement_lotId_fkey" FOREIGN KEY ("lotId") REFERENCES "StockLot"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "VaccineProtocol" DROP CONSTRAINT IF EXISTS "VaccineProtocol_farmId_fkey";
ALTER TABLE "VaccineProtocol" ADD CONSTRAINT "VaccineProtocol_farmId_fkey" FOREIGN KEY ("farmId") REFERENCES "Farm"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "HealthEvent" DROP CONSTRAINT IF EXISTS "HealthEvent_farmId_fkey";
ALTER TABLE "HealthEvent" ADD CONSTRAINT "HealthEvent_farmId_fkey" FOREIGN KEY ("farmId") REFERENCES "Farm"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "HealthEvent" DROP CONSTRAINT IF EXISTS "HealthEvent_animalId_fkey";
ALTER TABLE "HealthEvent" ADD CONSTRAINT "HealthEvent_animalId_fkey" FOREIGN KEY ("animalId") REFERENCES "Animal"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "VaccinationRecord" DROP CONSTRAINT IF EXISTS "VaccinationRecord_farmId_fkey";
ALTER TABLE "VaccinationRecord" ADD CONSTRAINT "VaccinationRecord_farmId_fkey" FOREIGN KEY ("farmId") REFERENCES "Farm"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "VaccinationRecord" DROP CONSTRAINT IF EXISTS "VaccinationRecord_animalId_fkey";
ALTER TABLE "VaccinationRecord" ADD CONSTRAINT "VaccinationRecord_animalId_fkey" FOREIGN KEY ("animalId") REFERENCES "Animal"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "VaccinationRecord" DROP CONSTRAINT IF EXISTS "VaccinationRecord_healthEventId_fkey";
ALTER TABLE "VaccinationRecord" ADD CONSTRAINT "VaccinationRecord_healthEventId_fkey" FOREIGN KEY ("healthEventId") REFERENCES "HealthEvent"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "VaccinationRecord" DROP CONSTRAINT IF EXISTS "VaccinationRecord_protocolId_fkey";
ALTER TABLE "VaccinationRecord" ADD CONSTRAINT "VaccinationRecord_protocolId_fkey" FOREIGN KEY ("protocolId") REFERENCES "VaccineProtocol"("id") ON DELETE SET NULL ON UPDATE CASCADE;

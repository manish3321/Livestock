-- Phase 7: tank variance task, delivery receipt storage, marker validUntil.

DO $$ BEGIN ALTER TYPE "TaskType" ADD VALUE 'TANK_VARIANCE';
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

ALTER TABLE "AnimalMarker" ADD COLUMN IF NOT EXISTS "validUntil" TIMESTAMP(3);

ALTER TABLE "MilkRoundDelivery" ADD COLUMN IF NOT EXISTS "receiptStorageKey" TEXT;

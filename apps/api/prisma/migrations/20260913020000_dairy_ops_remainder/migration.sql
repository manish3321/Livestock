-- Remainder of the ship-first dairy spec. Idempotent against the live DB.

ALTER TYPE "Role" ADD VALUE IF NOT EXISTS 'VET';
ALTER TYPE "Role" ADD VALUE IF NOT EXISTS 'COOP';

ALTER TABLE "HealthRecord"
  ADD COLUMN IF NOT EXISTS "meatWithholdUntil" TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "batchNumber" TEXT;

ALTER TABLE "AnimalTag"
  ADD COLUMN IF NOT EXISTS "nfcUid" TEXT,
  ADD COLUMN IF NOT EXISTS "uhfEpc" TEXT;

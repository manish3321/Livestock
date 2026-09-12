-- Phase 0a: which livestock surface is primary for a farm.
-- Individual-first is required for lactation curves, breeding cycles, milk
-- withdrawal and profit per animal, so commercial farms default to INDIVIDUAL.

CREATE TYPE "LivestockTrackingMode" AS ENUM ('INDIVIDUAL', 'BATCH');

ALTER TABLE "Farm"
  ADD COLUMN "livestockTrackingMode" "LivestockTrackingMode" NOT NULL DEFAULT 'INDIVIDUAL';

-- Existing household farms were built around counted batches; keep them there
-- so the flip in 0b does not move the ground under a farm already using it.
UPDATE "Farm" SET "livestockTrackingMode" = 'BATCH' WHERE "mode" = 'HOUSEHOLD';

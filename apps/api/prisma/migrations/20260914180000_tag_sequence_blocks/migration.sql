-- Phase 12: per-device short-number blocks so two offline phones never print B42.

CREATE TABLE IF NOT EXISTS "TagSequenceBlock" (
    "id" UUID NOT NULL,
    "farmId" UUID NOT NULL,
    "species" "Species" NOT NULL,
    "deviceId" TEXT NOT NULL,
    "rangeStart" INTEGER NOT NULL,
    "rangeEnd" INTEGER NOT NULL,
    "nextValue" INTEGER NOT NULL,
    "issuedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "exhaustedAt" TIMESTAMP(3),
    CONSTRAINT "TagSequenceBlock_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "TagSequenceBlock_farmId_species_deviceId_idx"
  ON "TagSequenceBlock"("farmId", "species", "deviceId");

DO $$ BEGIN
  ALTER TABLE "TagSequenceBlock" ADD CONSTRAINT "TagSequenceBlock_farmId_fkey"
    FOREIGN KEY ("farmId") REFERENCES "Farm"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

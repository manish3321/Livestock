-- Phase 1c: close the gaps in animal registration.
--
-- Nepali farmers rarely know the exact date of birth of a purchased animal.
-- Registration must never be blocked on DOB, so an estimated date is a
-- first-class value that gets flagged wherever it drives a calculation.
--
-- lactationNumber and breedComposition already exist in the live database via a
-- parallel workstream, hence IF NOT EXISTS throughout.

ALTER TABLE "Animal"
  ADD COLUMN IF NOT EXISTS "dobIsEstimated" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS "ageAtAcquisitionMonths" INTEGER,
  ADD COLUMN IF NOT EXISTS "lactationNumber" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS "lactationStartDate" TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "expectedLactationDays" INTEGER,
  ADD COLUMN IF NOT EXISTS "breedComposition" JSONB;

-- Existing rows that were registered without a DOB had one guessed or left
-- blank; either way the date on file is not a farmer-confirmed birth date.
UPDATE "Animal" SET "dobIsEstimated" = true WHERE "dateOfBirth" IS NULL;

-- Give existing animals the expected lactation length for their species so
-- lactation progress is computable straight away.
UPDATE "Animal" a
SET "expectedLactationDays" = s."lactationDays"
FROM "SpeciesConfig" s
WHERE s."species" = a."species" AND a."expectedLactationDays" IS NULL;

-- Anything already LACTATING is on at least her first lactation.
UPDATE "Animal" SET "lactationNumber" = 1
WHERE "status"::text = 'LACTATING' AND "lactationNumber" = 0;

CREATE INDEX IF NOT EXISTS "Animal_farmId_isPregnant_idx" ON "Animal"("farmId", "isPregnant");

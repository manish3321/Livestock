-- Phase 1c: close the gaps in animal registration.
--
-- Nepali farmers rarely know the exact date of birth of a purchased animal.
-- Registration must never be blocked on DOB, so an estimated date is a
-- first-class value that gets flagged wherever it drives a calculation.

ALTER TABLE "Animal"
  ADD COLUMN "dobIsEstimated" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN "ageAtAcquisitionMonths" INTEGER,
  ADD COLUMN "lactationNumber" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN "lactationStartDate" TIMESTAMP(3),
  ADD COLUMN "expectedLactationDays" INTEGER,
  ADD COLUMN "breedComposition" JSONB;

-- Existing rows that were registered without a DOB had one guessed or left
-- blank; either way the date on file is not a farmer-confirmed birth date.
UPDATE "Animal" SET "dobIsEstimated" = true WHERE "dateOfBirth" IS NULL;

-- Give existing animals the expected lactation length for their species so
-- lactation progress is computable straight away.
UPDATE "Animal" a
SET "expectedLactationDays" = s."lactationDays"
FROM "SpeciesConfig" s
WHERE s."species" = a."species";

-- Anything already LACTATING is on at least her first lactation.
UPDATE "Animal" SET "lactationNumber" = 1
WHERE "status" = 'LACTATING' AND "lactationNumber" = 0;

CREATE INDEX "Animal_farmId_isPregnant_idx" ON "Animal"("farmId", "isPregnant");

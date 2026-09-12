-- Phase 1a: reproductive constants move out of code and into data.
--
-- Buffalo and cattle differ on every one of these. A 305-day lactation is a
-- Holstein number and is wrong for Nepal, so no application code may hardcode
-- any of them. Rows are seeded by prisma/seed.ts.
--
-- Deliberately NOT farm-scoped: gestation length is biology, not farm policy,
-- and a missing per-farm row would silently break breeding for a new farm.

CREATE TABLE "SpeciesConfig" (
    "id" UUID NOT NULL,
    "species" "Species" NOT NULL,
    "gestationDays" INTEGER NOT NULL,
    "lactationDays" INTEGER NOT NULL,
    "voluntaryWaitingDays" INTEGER NOT NULL,
    "estrusCycleDays" INTEGER NOT NULL,
    "ageFirstServiceMonths" INTEGER NOT NULL,
    "pregnancyCheckEarliestDays" INTEGER NOT NULL,
    "targetCalvingIntervalDays" INTEGER NOT NULL,
    "dryOffDaysBeforeCalving" INTEGER NOT NULL,
    "minWeightFirstServiceKg" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SpeciesConfig_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "SpeciesConfig_species_key" ON "SpeciesConfig"("species");

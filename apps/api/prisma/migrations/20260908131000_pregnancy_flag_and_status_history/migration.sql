-- Phase 1b: pregnancy stops being a status and becomes a flag.
--
-- A buffalo is routinely lactating AND pregnant at the same time. Modelling
-- those as mutually exclusive values of one status column loses one of the two
-- facts every time, so PREGNANT is removed from AnimalStatus entirely and
-- replaced by Animal.isPregnant.
--
-- Order matters: backfill the flag, move the rows off PREGNANT, and only then
-- rebuild the enum type — Postgres will not drop a value still in use.

-- 1. The flag and its supporting dates.
ALTER TABLE "Animal"
  ADD COLUMN "isPregnant" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN "pregnancyConfirmedDate" TIMESTAMP(3),
  ADD COLUMN "expectedCalvingDate" TIMESTAMP(3);

-- 2. Every animal currently marked PREGNANT is pregnant. This is the only
--    signal we have, and it is a reliable one.
UPDATE "Animal" SET "isPregnant" = true WHERE "status" = 'PREGNANT';

-- 3. Recover her expected calving date from the open breeding record. dueDate
--    was already computed from gestation length at mating, so it is real data.
--    pregnancyConfirmedDate is deliberately left NULL: we know she is pregnant
--    but not when that was confirmed, and inventing a date would be worse than
--    admitting the gap.
UPDATE "Animal" a
SET "expectedCalvingDate" = b."dueDate"
FROM (
  SELECT DISTINCT ON ("motherId") "motherId", "dueDate"
  FROM "BreedingRecord"
  WHERE "pregnancyStatus" IN ('PREGNANT', 'CONFIRMED')
  ORDER BY "motherId", "matingDate" DESC
) b
WHERE a."id" = b."motherId" AND a."isPregnant" = true;

-- 4. Choose a real status for animals vacating PREGNANT. A pregnant female is
--    either still milking or she is not, and her own production record is the
--    only honest way to tell — so she becomes LACTATING when she has milked in
--    the last 30 days, and ACTIVE otherwise. ACTIVE is the neutral default and
--    never asserts something the data does not support.
UPDATE "Animal" a
SET "status" = CASE
  WHEN EXISTS (
    SELECT 1 FROM "ProductionEntry" p
    WHERE p."animalId" = a."id"
      AND p."type" = 'MILK'
      AND p."entryDate" >= now() - INTERVAL '30 days'
  ) THEN 'LACTATING'::"AnimalStatus"
  ELSE 'ACTIVE'::"AnimalStatus"
END
WHERE a."status" = 'PREGNANT';

-- 5. Rebuild the enum without PREGNANT so the bug cannot be reintroduced.
ALTER TYPE "AnimalStatus" RENAME TO "AnimalStatus_old";

CREATE TYPE "AnimalStatus" AS ENUM (
  'ACTIVE', 'SICK', 'QUARANTINE', 'DRY', 'LACTATING', 'CULLED', 'SOLD', 'DEAD'
);

ALTER TABLE "Animal" ALTER COLUMN "status" DROP DEFAULT;
ALTER TABLE "Animal"
  ALTER COLUMN "status" TYPE "AnimalStatus" USING ("status"::text::"AnimalStatus");
ALTER TABLE "Animal" ALTER COLUMN "status" SET DEFAULT 'ACTIVE';

DROP TYPE "AnimalStatus_old";

-- 6. Append-only status trail. A status is never overwritten silently: "why is
--    she marked DRY" has to be answerable months later.
CREATE TABLE "AnimalStatusHistory" (
    "id" UUID NOT NULL,
    "farmId" UUID NOT NULL,
    "animalId" UUID NOT NULL,
    "fromStatus" "AnimalStatus",
    "toStatus" "AnimalStatus" NOT NULL,
    "reason" TEXT,
    "changedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "changedBy" UUID,
    "deviceId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AnimalStatusHistory_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "AnimalStatusHistory_farmId_animalId_changedAt_idx"
  ON "AnimalStatusHistory"("farmId", "animalId", "changedAt");
CREATE INDEX "AnimalStatusHistory_farmId_changedAt_idx"
  ON "AnimalStatusHistory"("farmId", "changedAt");

ALTER TABLE "AnimalStatusHistory" ADD CONSTRAINT "AnimalStatusHistory_farmId_fkey"
  FOREIGN KEY ("farmId") REFERENCES "Farm"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "AnimalStatusHistory" ADD CONSTRAINT "AnimalStatusHistory_animalId_fkey"
  FOREIGN KEY ("animalId") REFERENCES "Animal"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- 7. Record what this migration just did to each animal it touched. fromStatus
--    is NULL because the value it held ('PREGNANT') no longer exists in the
--    type — the reason text carries that fact instead. At this point in the
--    migration isPregnant = true identifies exactly the rows changed in step 4.
INSERT INTO "AnimalStatusHistory" (
  "id", "farmId", "animalId", "fromStatus", "toStatus", "reason", "changedAt"
)
SELECT
  gen_random_uuid(),
  a."farmId",
  a."id",
  NULL,
  a."status",
  'Migrated by Phase 1b: status was PREGNANT, which is now the isPregnant flag. '
    || 'New status derived from milk production in the 30 days before migration.',
  now()
FROM "Animal" a
WHERE a."isPregnant" = true;

-- Phase 1b: pregnancy stops being a status and becomes a flag.
--
-- A buffalo is routinely lactating AND pregnant at the same time. Modelling
-- those as mutually exclusive values of one status column loses one of the two
-- facts every time, so PREGNANT is removed from AnimalStatus entirely and
-- replaced by Animal.isPregnant.
--
-- Order matters: backfill the flag, move the rows off PREGNANT, and only then
-- rebuild the enum type — Postgres will not drop a value still in use.
--
-- Written to be idempotent. A parallel workstream already added isPregnant,
-- breedComposition, lactationNumber and AnimalStatusHistory to the live
-- database through migrations that are not in this repo, so each step has to
-- tolerate its object already existing while still working on a fresh
-- database that has none of them.

-- 1. The flag and its supporting dates.
ALTER TABLE "Animal"
  ADD COLUMN IF NOT EXISTS "isPregnant" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS "pregnancyConfirmedDate" TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "expectedCalvingDate" TIMESTAMP(3);

-- 2. Everything that depends on the old PREGNANT status only makes sense while
--    that value still exists, so the whole backfill is guarded on it.
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_enum e JOIN pg_type t ON t.oid = e.enumtypid
    WHERE t.typname = 'AnimalStatus' AND e.enumlabel = 'PREGNANT'
  ) THEN

    -- Every animal currently marked PREGNANT is pregnant. This is the only
    -- signal we have, and it is a reliable one.
    UPDATE "Animal" SET "isPregnant" = true WHERE "status"::text = 'PREGNANT';

    -- Recover her expected calving date from the open breeding record. dueDate
    -- was already computed from gestation length at mating, so it is real data.
    -- pregnancyConfirmedDate is deliberately left NULL: we know she is pregnant
    -- but not when that was confirmed, and inventing a date would be worse than
    -- admitting the gap.
    UPDATE "Animal" a
    SET "expectedCalvingDate" = b."dueDate"
    FROM (
      SELECT DISTINCT ON ("motherId") "motherId", "dueDate"
      FROM "BreedingRecord"
      WHERE "pregnancyStatus"::text IN ('PREGNANT', 'CONFIRMED')
      ORDER BY "motherId", "matingDate" DESC
    ) b
    WHERE a."id" = b."motherId" AND a."isPregnant" = true;

    -- Choose a real status for animals vacating PREGNANT. A pregnant female is
    -- either still milking or she is not, and her own production record is the
    -- only honest way to tell — so she becomes LACTATING when she has milked in
    -- the last 30 days, and ACTIVE otherwise. ACTIVE is the neutral default and
    -- never asserts something the data does not support.
    UPDATE "Animal" a
    SET "status" = CASE
      WHEN EXISTS (
        SELECT 1 FROM "ProductionEntry" p
        WHERE p."animalId" = a."id"
          AND p."type"::text = 'MILK'
          AND p."entryDate" >= now() - INTERVAL '30 days'
      ) THEN 'LACTATING'::"AnimalStatus"
      ELSE 'ACTIVE'::"AnimalStatus"
    END
    WHERE a."status"::text = 'PREGNANT';

  END IF;
END $$;

-- 3. Append-only status trail. A status is never overwritten silently: "why is
--    she marked DRY" has to be answerable months later. Created before the enum
--    is rebuilt so that step can fix up its columns in one place.
CREATE TABLE IF NOT EXISTS "AnimalStatusHistory" (
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

-- The pre-existing copy of this table lacks these two columns.
ALTER TABLE "AnimalStatusHistory"
  ADD COLUMN IF NOT EXISTS "deviceId" TEXT,
  ADD COLUMN IF NOT EXISTS "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;

CREATE INDEX IF NOT EXISTS "AnimalStatusHistory_farmId_animalId_changedAt_idx"
  ON "AnimalStatusHistory"("farmId", "animalId", "changedAt");
CREATE INDEX IF NOT EXISTS "AnimalStatusHistory_farmId_changedAt_idx"
  ON "AnimalStatusHistory"("farmId", "changedAt");

DO $$
BEGIN
  ALTER TABLE "AnimalStatusHistory" ADD CONSTRAINT "AnimalStatusHistory_farmId_fkey"
    FOREIGN KEY ("farmId") REFERENCES "Farm"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$
BEGIN
  ALTER TABLE "AnimalStatusHistory" ADD CONSTRAINT "AnimalStatusHistory_animalId_fkey"
    FOREIGN KEY ("animalId") REFERENCES "Animal"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- 4. Record what this migration did to each animal it touched, before the enum
--    loses the value that explains it. fromStatus is NULL because 'PREGNANT'
--    will no longer exist in the type — the reason text carries that instead.
--    At this point isPregnant = true identifies exactly the rows changed above.
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
WHERE a."isPregnant" = true
  AND NOT EXISTS (
    SELECT 1 FROM "AnimalStatusHistory" h WHERE h."animalId" = a."id"
  );

-- 5. Rebuild the enum without PREGNANT so the bug cannot be reintroduced.
--    Done dynamically because the set of columns using this type differs
--    between the live database and a fresh one.
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_enum e JOIN pg_type t ON t.oid = e.enumtypid
    WHERE t.typname = 'AnimalStatus' AND e.enumlabel = 'PREGNANT'
  ) THEN
    CREATE TYPE "AnimalStatus_new" AS ENUM (
      'ACTIVE', 'SICK', 'QUARANTINE', 'DRY', 'LACTATING', 'CULLED', 'SOLD', 'DEAD'
    );

    ALTER TABLE "Animal" ALTER COLUMN "status" DROP DEFAULT;
    ALTER TABLE "Animal"
      ALTER COLUMN "status" TYPE "AnimalStatus_new" USING ("status"::text::"AnimalStatus_new");

    ALTER TABLE "AnimalStatusHistory"
      ALTER COLUMN "fromStatus" TYPE "AnimalStatus_new" USING ("fromStatus"::text::"AnimalStatus_new");
    ALTER TABLE "AnimalStatusHistory"
      ALTER COLUMN "toStatus" TYPE "AnimalStatus_new" USING ("toStatus"::text::"AnimalStatus_new");

    ALTER TYPE "AnimalStatus" RENAME TO "AnimalStatus_old";
    ALTER TYPE "AnimalStatus_new" RENAME TO "AnimalStatus";
    DROP TYPE "AnimalStatus_old";

    ALTER TABLE "Animal" ALTER COLUMN "status" SET DEFAULT 'ACTIVE';
  END IF;
END $$;

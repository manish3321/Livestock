-- Maintain UTC calendar day on Task so we can unique-index open rows without
-- STABLE timezone expressions in the index itself.
ALTER TABLE "Task" ADD COLUMN IF NOT EXISTS "dueDayUtc" date;

UPDATE "Task"
SET "dueDayUtc" = (timezone('UTC', "dueAt"))::date
WHERE "dueDayUtc" IS NULL;

ALTER TABLE "Task" ALTER COLUMN "dueDayUtc" SET NOT NULL;

CREATE OR REPLACE FUNCTION farm_task_set_due_day_utc()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  NEW."dueDayUtc" := (timezone('UTC', NEW."dueAt"))::date;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS farm_task_due_day_utc_biur ON "Task";
CREATE TRIGGER farm_task_due_day_utc_biur
BEFORE INSERT OR UPDATE OF "dueAt" ON "Task"
FOR EACH ROW
EXECUTE FUNCTION farm_task_set_due_day_utc();

-- Final dedupe before unique indexes (same key as ensureTask).
WITH ranked AS (
  SELECT
    id,
    ROW_NUMBER() OVER (
      PARTITION BY "farmId", "animalId", "type", "dueDayUtc"
      ORDER BY "createdAt" ASC
    ) AS rn
  FROM "Task"
  WHERE status IN ('PENDING', 'SNOOZED')
    AND "deletedAt" IS NULL
    AND "animalId" IS NOT NULL
)
UPDATE "Task" t
SET status = 'SUPERSEDED',
    "updatedAt" = NOW()
FROM ranked r
WHERE t.id = r.id AND r.rn > 1;

WITH ranked_farm AS (
  SELECT
    id,
    ROW_NUMBER() OVER (
      PARTITION BY "farmId", "type", "dueDayUtc"
      ORDER BY "createdAt" ASC
    ) AS rn
  FROM "Task"
  WHERE status IN ('PENDING', 'SNOOZED')
    AND "deletedAt" IS NULL
    AND "animalId" IS NULL
)
UPDATE "Task" t
SET status = 'SUPERSEDED',
    "updatedAt" = NOW()
FROM ranked_farm r
WHERE t.id = r.id AND r.rn > 1;

CREATE UNIQUE INDEX IF NOT EXISTS "Task_open_animal_type_due_day_uidx"
  ON "Task" ("farmId", "animalId", "type", "dueDayUtc")
  WHERE status IN ('PENDING', 'SNOOZED')
    AND "deletedAt" IS NULL
    AND "animalId" IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS "Task_open_farm_type_due_day_uidx"
  ON "Task" ("farmId", "type", "dueDayUtc")
  WHERE status IN ('PENDING', 'SNOOZED')
    AND "deletedAt" IS NULL
    AND "animalId" IS NULL;

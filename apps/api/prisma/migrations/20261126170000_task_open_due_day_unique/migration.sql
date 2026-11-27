-- Deduplicate open tasks that share farm + animal + type + UTC calendar due day.
-- A partial unique expression index on timestamptz→date is not portable on this
-- Postgres (AT TIME ZONE / timezone are STABLE). Application ensureTask now
-- find-then-creates; this migration cleans existing duplicates only.
WITH ranked AS (
  SELECT
    id,
    ROW_NUMBER() OVER (
      PARTITION BY
        "farmId",
        "animalId",
        "type",
        (EXTRACT(YEAR FROM timezone('UTC', "dueAt"))::int),
        (EXTRACT(MONTH FROM timezone('UTC', "dueAt"))::int),
        (EXTRACT(DAY FROM timezone('UTC', "dueAt"))::int)
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
      PARTITION BY
        "farmId",
        "type",
        (EXTRACT(YEAR FROM timezone('UTC', "dueAt"))::int),
        (EXTRACT(MONTH FROM timezone('UTC', "dueAt"))::int),
        (EXTRACT(DAY FROM timezone('UTC', "dueAt"))::int)
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

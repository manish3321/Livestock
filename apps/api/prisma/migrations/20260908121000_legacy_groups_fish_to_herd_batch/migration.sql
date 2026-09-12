-- Phase 0c: fold the legacy AnimalGroup / FishBatch models into HerdBatch.
--
-- The legacy primary key is reused as the HerdBatch id. That keeps every
-- existing foreign key and every printed /batches/:id QR resolvable, and makes
-- the whole migration idempotent via ON CONFLICT DO NOTHING.
--
-- The legacy tables are intentionally NOT dropped: /v1/groups and /v1/fish keep
-- answering for one deprecation release (see DeprecatedEndpointInterceptor).

-- --------------------------------------------------------------------------
-- AnimalGroup -> HerdBatch(kind = POULTRY)
-- --------------------------------------------------------------------------
-- HerdBatch has no column for breed / startedAt / healthStatus, so they are
-- folded into notes. Dropping a farmer's data silently is not acceptable.
INSERT INTO "HerdBatch" (
  "id", "farmId", "kind", "category", "name",
  "ageFromMonths", "ageToMonths",
  "initialCount", "currentCount", "deadCount",
  "notes", "createdAt", "updatedAt", "deletedAt"
)
SELECT
  g."id",
  g."farmId",
  'POULTRY'::"HerdBatchKind",
  g."poultryType"::text,
  g."name",
  NULL,
  NULL,
  g."initialCount",
  g."currentCount",
  GREATEST(
    0,
    COALESCE(
      (SELECT SUM(m."count")::int FROM "GroupMortalityEvent" m WHERE m."groupId" = g."id"),
      g."initialCount" - g."currentCount"
    )
  ),
  concat_ws(
    E'\n',
    NULLIF(g."notes", ''),
    'Breed: ' || g."breed",
    'Started: ' || to_char(g."startedAt", 'YYYY-MM-DD'),
    'Health status at migration: ' || g."healthStatus"::text
  ),
  g."createdAt",
  g."updatedAt",
  g."deletedAt"
FROM "AnimalGroup" g
ON CONFLICT ("id") DO NOTHING;

INSERT INTO "BatchMortalityEvent" (
  "id", "farmId", "batchId", "count", "reason", "occurredAt", "createdAt"
)
SELECT m."id", m."farmId", m."groupId", m."count", m."reason", m."occurredAt", m."createdAt"
FROM "GroupMortalityEvent" m
WHERE EXISTS (SELECT 1 FROM "HerdBatch" b WHERE b."id" = m."groupId")
ON CONFLICT ("id") DO NOTHING;

-- --------------------------------------------------------------------------
-- FishBatch -> HerdBatch(kind = FISH)
-- --------------------------------------------------------------------------
INSERT INTO "HerdBatch" (
  "id", "farmId", "kind", "category", "name",
  "ageFromMonths", "ageToMonths",
  "initialCount", "currentCount", "deadCount",
  "notes", "createdAt", "updatedAt", "deletedAt"
)
SELECT
  f."id",
  f."farmId",
  'FISH'::"HerdBatchKind",
  f."species",
  f."name",
  NULL,
  NULL,
  f."estimatedCount",
  f."estimatedCount",
  0,
  concat_ws(
    E'\n',
    NULLIF(f."notes", ''),
    'Stocked: ' || to_char(f."stockingDate", 'YYYY-MM-DD'),
    'Avg weight at migration: ' || f."avgWeightGrams"::text || ' g',
    CASE WHEN f."harvestedAt" IS NOT NULL
      THEN 'Harvested: ' || to_char(f."harvestedAt", 'YYYY-MM-DD')
    END
  ),
  f."createdAt",
  f."updatedAt",
  f."deletedAt"
FROM "FishBatch" f
ON CONFLICT ("id") DO NOTHING;

INSERT INTO "BatchWaterQualityLog" (
  "id", "farmId", "batchId", "recordedAt",
  "temperatureC", "ph", "dissolvedO2", "notes", "createdAt"
)
SELECT w."id", w."farmId", w."batchId", w."recordedAt",
       w."temperatureC", w."ph", w."dissolvedO2", w."notes", w."createdAt"
FROM "WaterQualityLog" w
WHERE EXISTS (SELECT 1 FROM "HerdBatch" b WHERE b."id" = w."batchId")
ON CONFLICT ("id") DO NOTHING;

INSERT INTO "BatchSamplingEvent" (
  "id", "farmId", "batchId", "sampledAt",
  "sampleCount", "totalWeightGrams", "estimatedCount", "avgWeightGrams",
  "notes", "createdAt"
)
SELECT s."id", s."farmId", s."batchId", s."sampledAt",
       s."sampleCount", s."totalWeightGrams", s."estimatedCount", s."avgWeightGrams",
       s."notes", s."createdAt"
FROM "FishSampling" s
WHERE EXISTS (SELECT 1 FROM "HerdBatch" b WHERE b."id" = s."batchId")
ON CONFLICT ("id") DO NOTHING;

-- --------------------------------------------------------------------------
-- Repoint dependent records at the unified batch
-- --------------------------------------------------------------------------
UPDATE "HealthRecord" h
SET "herdBatchId" = h."groupId"
WHERE h."groupId" IS NOT NULL
  AND h."herdBatchId" IS NULL
  AND EXISTS (SELECT 1 FROM "HerdBatch" b WHERE b."id" = h."groupId");

UPDATE "ProductionEntry" p
SET "herdBatchId" = p."groupId"
WHERE p."groupId" IS NOT NULL
  AND p."herdBatchId" IS NULL
  AND EXISTS (SELECT 1 FROM "HerdBatch" b WHERE b."id" = p."groupId");

UPDATE "ProductionEntry" p
SET "herdBatchId" = p."batchId"
WHERE p."batchId" IS NOT NULL
  AND p."herdBatchId" IS NULL
  AND EXISTS (SELECT 1 FROM "HerdBatch" b WHERE b."id" = p."batchId");

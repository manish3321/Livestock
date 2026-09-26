-- Remap legacy TaskType labels that exist in some DBs but were removed from Prisma schema.
-- Without this, prisma.task.findMany() fails with:
--   Value 'ANESTRUS_VET' not found in enum 'TaskType'

UPDATE "Task" SET type = 'SILENT_HEAT_CHECK' WHERE type::text IN ('ANESTRUS_VET', 'ANESTRUS', 'ANESTRUS_MINERAL');
UPDATE "Task" SET type = 'REPEAT_BREEDER' WHERE type::text = 'ANESTRUS_DECISION';
UPDATE "Task" SET type = 'SERVICE_WINDOW' WHERE type::text IN ('SYNC_INJECTION', 'SYNC_AI');
UPDATE "Task" SET type = 'TREATMENT_FOLLOWUP' WHERE type::text = 'FEED_TRANSITION';
UPDATE "Task" SET type = 'VET_URGENT' WHERE type::text = 'PROTOCOL_BROKEN';
UPDATE "Task" SET type = 'POSTPARTUM_CHECK' WHERE type::text = 'CALF_HEALTH_CHECK';
UPDATE "Task" SET type = 'HEAT_WATCH' WHERE type::text = 'CYCLING_UNBRED';
UPDATE "Task" SET type = 'PREGNANCY_CHECK' WHERE type::text = 'PD_STALLED';

UPDATE "NotificationPreference" SET "taskType" = 'SILENT_HEAT_CHECK'
WHERE "taskType"::text IN ('ANESTRUS_VET', 'ANESTRUS', 'ANESTRUS_MINERAL');
UPDATE "NotificationPreference" SET "taskType" = 'REPEAT_BREEDER'
WHERE "taskType"::text = 'ANESTRUS_DECISION';
UPDATE "NotificationPreference" SET "taskType" = 'SERVICE_WINDOW'
WHERE "taskType"::text IN ('SYNC_INJECTION', 'SYNC_AI');
UPDATE "NotificationPreference" SET "taskType" = 'TREATMENT_FOLLOWUP'
WHERE "taskType"::text = 'FEED_TRANSITION';
UPDATE "NotificationPreference" SET "taskType" = 'VET_URGENT'
WHERE "taskType"::text = 'PROTOCOL_BROKEN';
UPDATE "NotificationPreference" SET "taskType" = 'POSTPARTUM_CHECK'
WHERE "taskType"::text = 'CALF_HEALTH_CHECK';
UPDATE "NotificationPreference" SET "taskType" = 'HEAT_WATCH'
WHERE "taskType"::text = 'CYCLING_UNBRED';
UPDATE "NotificationPreference" SET "taskType" = 'PREGNANCY_CHECK'
WHERE "taskType"::text = 'PD_STALLED';

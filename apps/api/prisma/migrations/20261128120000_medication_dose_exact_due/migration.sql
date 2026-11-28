-- MEDICATION_DOSE schedules multiple open rows on the same UTC calendar day
-- (e.g. twice-daily courses). Exclude them from the due-day unique index and
-- unique on the exact dueAt instead.
DROP INDEX IF EXISTS "Task_open_animal_type_due_day_uidx";

CREATE UNIQUE INDEX IF NOT EXISTS "Task_open_animal_type_due_day_uidx"
  ON "Task" ("farmId", "animalId", "type", "dueDayUtc")
  WHERE status IN ('PENDING', 'SNOOZED')
    AND "deletedAt" IS NULL
    AND "animalId" IS NOT NULL
    AND type <> 'MEDICATION_DOSE';

CREATE UNIQUE INDEX IF NOT EXISTS "Task_open_medication_dose_due_uidx"
  ON "Task" ("farmId", "animalId", "type", "dueAt")
  WHERE status IN ('PENDING', 'SNOOZED')
    AND "deletedAt" IS NULL
    AND type = 'MEDICATION_DOSE';

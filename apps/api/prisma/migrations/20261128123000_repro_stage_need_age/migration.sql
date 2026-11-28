-- Unknown-age females must not be treated as HEIFER_READY.
ALTER TYPE "ReproStage" ADD VALUE IF NOT EXISTS 'NEED_AGE' AFTER 'CALF';

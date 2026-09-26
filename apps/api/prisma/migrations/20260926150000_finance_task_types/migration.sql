-- Finance notification task types (expense approval + unpaid revenue).
DO $$ BEGIN ALTER TYPE "TaskType" ADD VALUE 'EXPENSE_APPROVAL'; EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN ALTER TYPE "TaskType" ADD VALUE 'UNPAID_REVENUE'; EXCEPTION WHEN duplicate_object THEN NULL; END $$;

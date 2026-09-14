-- Phase 10: FCM / SMS / voice logs, mute preferences, literacy support.
-- Add columns alongside the stub NotificationLog. Do not drop subject/body/sent.

ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "literacySupport" BOOLEAN NOT NULL DEFAULT false;

ALTER TABLE "NotificationLog" ADD COLUMN IF NOT EXISTS "userId" UUID;
ALTER TABLE "NotificationLog" ADD COLUMN IF NOT EXISTS "taskId" UUID;
ALTER TABLE "NotificationLog" ALTER COLUMN "channel" SET DEFAULT 'PUSH';
ALTER TABLE "NotificationLog" ALTER COLUMN "subject" SET DEFAULT '';
ALTER TABLE "NotificationLog" ALTER COLUMN "body" SET DEFAULT '';
ALTER TABLE "NotificationLog" ADD COLUMN IF NOT EXISTS "sentAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;
ALTER TABLE "NotificationLog" ADD COLUMN IF NOT EXISTS "deliveredAt" TIMESTAMP(3);
ALTER TABLE "NotificationLog" ADD COLUMN IF NOT EXISTS "acknowledgedAt" TIMESTAMP(3);
ALTER TABLE "NotificationLog" ADD COLUMN IF NOT EXISTS "escalatedTo" TEXT;
ALTER TABLE "NotificationLog" ADD COLUMN IF NOT EXISTS "costNpr" DECIMAL(6, 2);
ALTER TABLE "NotificationLog" ADD COLUMN IF NOT EXISTS "payload" JSONB;

CREATE INDEX IF NOT EXISTS "NotificationLog_userId_sentAt_idx" ON "NotificationLog"("userId", "sentAt");
CREATE INDEX IF NOT EXISTS "NotificationLog_taskId_idx" ON "NotificationLog"("taskId");

DO $$ BEGIN
  ALTER TABLE "NotificationLog" ADD CONSTRAINT "NotificationLog_userId_fkey"
    FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

CREATE TABLE IF NOT EXISTS "NotificationPreference" (
    "id" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "farmId" UUID NOT NULL,
    "taskType" "TaskType" NOT NULL,
    "push" BOOLEAN NOT NULL DEFAULT true,
    "sms" BOOLEAN NOT NULL DEFAULT false,
    "voice" BOOLEAN NOT NULL DEFAULT false,
    "muted" BOOLEAN NOT NULL DEFAULT false,
    CONSTRAINT "NotificationPreference_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "NotificationPreference_userId_taskType_key"
  ON "NotificationPreference"("userId", "taskType");

DO $$ BEGIN
  ALTER TABLE "NotificationPreference" ADD CONSTRAINT "NotificationPreference_userId_fkey"
    FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE "NotificationPreference" ADD CONSTRAINT "NotificationPreference_farmId_fkey"
    FOREIGN KEY ("farmId") REFERENCES "Farm"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

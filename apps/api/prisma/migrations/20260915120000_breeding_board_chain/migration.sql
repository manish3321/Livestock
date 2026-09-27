-- AlterEnum
DO $$ BEGIN ALTER TYPE "TaskType" ADD VALUE 'SYNC_INJECTION'; EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN ALTER TYPE "TaskType" ADD VALUE 'SYNC_AI'; EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN ALTER TYPE "TaskType" ADD VALUE 'ANESTRUS_MINERAL'; EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN ALTER TYPE "TaskType" ADD VALUE 'ANESTRUS_VET'; EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN ALTER TYPE "TaskType" ADD VALUE 'ANESTRUS_DECISION'; EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN ALTER TYPE "TaskType" ADD VALUE 'FEED_TRANSITION'; EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN ALTER TYPE "TaskType" ADD VALUE 'PROTOCOL_BROKEN'; EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN ALTER TYPE "TaskType" ADD VALUE 'CALF_HEALTH_CHECK'; EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN ALTER TYPE "TaskType" ADD VALUE 'CYCLING_UNBRED'; EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN ALTER TYPE "TaskType" ADD VALUE 'PD_STALLED'; EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN ALTER TYPE "TaskStatus" ADD VALUE 'SUPERSEDED'; EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- AlterTable
ALTER TABLE "Animal" ADD COLUMN "penId" UUID,
ADD COLUMN "seqNo" INTEGER NOT NULL DEFAULT 0;

ALTER TABLE "Task" ADD COLUMN "supersededBy" UUID;

-- CreateTable
CREATE TABLE "Pen" (
    "id" UUID NOT NULL,
    "farmId" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "sortOrder" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Pen_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "HeatObservation" (
    "id" UUID NOT NULL,
    "animalId" UUID NOT NULL,
    "farmId" UUID NOT NULL,
    "observedAt" TIMESTAMP(3) NOT NULL,
    "observed" BOOLEAN NOT NULL,
    "heatEventId" UUID,
    "observerId" UUID,
    "taskId" UUID,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "HeatObservation_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "SyncProtocol" (
    "id" UUID NOT NULL,
    "code" TEXT NOT NULL,
    "nameEn" TEXT NOT NULL,
    "nameNp" TEXT NOT NULL,
    "species" "Species"[],
    "requiresCyclicity" BOOLEAN NOT NULL DEFAULT true,
    "totalDays" INTEGER NOT NULL,
    "steps" JSONB NOT NULL,
    "notesEn" TEXT,
    "notesNp" TEXT,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "estimatedCostNpr" DECIMAL(10,2) NOT NULL DEFAULT 0,

    CONSTRAINT "SyncProtocol_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "SyncEnrollment" (
    "id" UUID NOT NULL,
    "animalId" UUID NOT NULL,
    "farmId" UUID NOT NULL,
    "protocolId" UUID NOT NULL,
    "startDate" DATE NOT NULL,
    "vetName" TEXT,
    "vetPhone" TEXT,
    "status" TEXT NOT NULL DEFAULT 'ACTIVE',
    "brokenAtStep" INTEGER,
    "brokenReason" TEXT,
    "aiDate" DATE,
    "serviceId" UUID,
    "estimatedCostNpr" DECIMAL(10,2),
    "startedInLowSeason" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SyncEnrollment_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "Pen_farmId_name_key" ON "Pen"("farmId", "name");
CREATE INDEX "Pen_farmId_sortOrder_idx" ON "Pen"("farmId", "sortOrder");
CREATE INDEX "Animal_penId_idx" ON "Animal"("penId");
CREATE INDEX "Animal_farmId_seqNo_idx" ON "Animal"("farmId", "seqNo");
CREATE INDEX "HeatObservation_animalId_observedAt_idx" ON "HeatObservation"("animalId", "observedAt" DESC);
CREATE INDEX "HeatObservation_farmId_observedAt_idx" ON "HeatObservation"("farmId", "observedAt");
CREATE UNIQUE INDEX "SyncProtocol_code_key" ON "SyncProtocol"("code");
CREATE INDEX "SyncEnrollment_animalId_startDate_idx" ON "SyncEnrollment"("animalId", "startDate" DESC);
CREATE INDEX "SyncEnrollment_farmId_status_idx" ON "SyncEnrollment"("farmId", "status");

ALTER TABLE "Pen" ADD CONSTRAINT "Pen_farmId_fkey" FOREIGN KEY ("farmId") REFERENCES "Farm"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "Animal" ADD CONSTRAINT "Animal_penId_fkey" FOREIGN KEY ("penId") REFERENCES "Pen"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "HeatObservation" ADD CONSTRAINT "HeatObservation_farmId_fkey" FOREIGN KEY ("farmId") REFERENCES "Farm"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "HeatObservation" ADD CONSTRAINT "HeatObservation_animalId_fkey" FOREIGN KEY ("animalId") REFERENCES "Animal"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "SyncEnrollment" ADD CONSTRAINT "SyncEnrollment_farmId_fkey" FOREIGN KEY ("farmId") REFERENCES "Farm"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "SyncEnrollment" ADD CONSTRAINT "SyncEnrollment_animalId_fkey" FOREIGN KEY ("animalId") REFERENCES "Animal"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "SyncEnrollment" ADD CONSTRAINT "SyncEnrollment_protocolId_fkey" FOREIGN KEY ("protocolId") REFERENCES "SyncProtocol"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

INSERT INTO "SyncProtocol" ("id", "code", "nameEn", "nameNp", "species", "requiresCyclicity", "totalDays", "steps", "notesEn", "notesNp", "active", "estimatedCostNpr") VALUES
('00000000-0000-4000-8000-00000000d001', 'DOUBLESYNCH', 'Doublesynch', 'डबलसिंक', ARRAY['BUFFALO','COW']::"Species"[], true, 12,
 '[{"day":0,"drug":"PGF2α","drugNp":"पी.जी.एफ.","dose":"2 ml","route":"INTRAMUSCULAR"},{"day":2,"drug":"GnRH","drugNp":"जि.एन.आर.एच.","dose":"2.5 ml","route":"INTRAMUSCULAR"},{"day":9,"drug":"PGF2α","drugNp":"पी.जी.एफ.","dose":"2 ml","route":"INTRAMUSCULAR"},{"day":11,"drug":"GnRH","drugNp":"जि.एन.आर.एच.","dose":"2.5 ml","route":"INTRAMUSCULAR"},{"day":12,"action":"AI","timing":"morning"}]'::jsonb,
 'Buffalo default. Roughly doubles conception versus Ovsynch.', 'भैंसीको मूल प्रोटोकल। ओभिसिंकभन्दा गर्भ रहने दर करिब दोब्बर।', true, 2400),
('00000000-0000-4000-8000-00000000d002', 'OVSYNCH', 'Ovsynch', 'ओभिसिंक', ARRAY['BUFFALO','COW']::"Species"[], true, 10,
 '[{"day":0,"drug":"GnRH","drugNp":"जि.एन.आर.एच.","dose":"2.5 ml","route":"INTRAMUSCULAR"},{"day":7,"drug":"PGF2α","drugNp":"पी.जी.एफ.","dose":"2 ml","route":"INTRAMUSCULAR"},{"day":9,"drug":"GnRH","drugNp":"जि.एन.आर.एच.","dose":"2.5 ml","route":"INTRAMUSCULAR"},{"day":10,"action":"AI","timing":"morning"}]'::jsonb,
 'Cattle default. Weak in buffalo.', 'गाईको मूल प्रोटोकल। भैंसीमा कमजोर।', true, 1800),
('00000000-0000-4000-8000-00000000d003', 'GPPG', 'GPG + extra PG', 'जी.पी.पी.जी.', ARRAY['COW']::"Species"[], true, 10,
 '[{"day":0,"drug":"GnRH","drugNp":"जि.एन.आर.एच.","dose":"2.5 ml","route":"INTRAMUSCULAR"},{"day":7,"drug":"PGF2α","drugNp":"पी.जी.एफ.","dose":"2 ml","route":"INTRAMUSCULAR"},{"day":8,"drug":"PGF2α","drugNp":"पी.जी.एफ.","dose":"2 ml","route":"INTRAMUSCULAR"},{"day":9,"drug":"GnRH","drugNp":"जि.एन.आर.एच.","dose":"2.5 ml","route":"INTRAMUSCULAR"},{"day":10,"action":"AI","timing":"morning"}]'::jsonb,
 'Second PG improves luteal regression in cattle.', 'दोस्रो पी.जी.ले गाईमा कर्नस ल्युटियम राम्रोसँग झार्छ।', true, 2000),
('00000000-0000-4000-8000-00000000d004', 'CIDR_COSYNCH', 'CIDR + Co-Synch', 'सिडर कोसिंक', ARRAY['BUFFALO','COW']::"Species"[], false, 10,
 '[{"day":0,"drug":"CIDR","drugNp":"सिडर","dose":"in","route":"INTRAVAGINAL","action":"CIDR_IN"},{"day":0,"drug":"GnRH","drugNp":"जि.एन.आर.एच.","dose":"2.5 ml","route":"INTRAMUSCULAR"},{"day":7,"drug":"PGF2α","drugNp":"पी.जी.एफ.","dose":"2 ml","route":"INTRAMUSCULAR"},{"day":7,"drug":"CIDR","drugNp":"सिडर","dose":"out","route":"INTRAVAGINAL","action":"CIDR_OUT"},{"day":9,"drug":"GnRH","drugNp":"जि.एन.आर.एच.","dose":"2.5 ml","route":"INTRAMUSCULAR"},{"day":10,"action":"AI","timing":"morning"}]'::jsonb,
 'For true anestrus. The only option when she is not cycling.', 'साँच्चिकै गर्मी नआएकोमा। चक्र नचलेको बेला यही मात्र काम लाग्छ।', true, 3500);

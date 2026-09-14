-- CreateEnum
CREATE TYPE "RecordingMode" AS ENUM ('MILKING', 'VACCINATION', 'TREATMENT', 'WEIGHING', 'HEALTH_CHECK', 'MARKER_PLACEMENT', 'BROWSE');

-- CreateEnum
CREATE TYPE "RoundStatus" AS ENUM ('ACTIVE', 'FINISHED', 'ABANDONED');

-- CreateTable
CREATE TABLE "RecordingRound" (
    "id" UUID NOT NULL,
    "farmId" UUID NOT NULL,
    "mode" "RecordingMode" NOT NULL,
    "session" "MilkSession",
    "date" TIMESTAMP(3) NOT NULL,
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "finishedAt" TIMESTAMP(3),
    "status" "RoundStatus" NOT NULL DEFAULT 'ACTIVE',
    "operatorId" UUID NOT NULL,
    "contextItemId" TEXT,
    "contextLotId" TEXT,
    "contextDose" TEXT,
    "expectedCount" INTEGER,
    "recordedCount" INTEGER NOT NULL DEFAULT 0,
    "skippedCount" INTEGER NOT NULL DEFAULT 0,
    "totalLitres" DECIMAL(9,2),
    "durationSeconds" INTEGER,
    "secondsPerAnimal" DECIMAL(6,2),
    "milkRoundId" UUID,
    "deviceId" TEXT,

    CONSTRAINT "RecordingRound_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RoundSkip" (
    "id" UUID NOT NULL,
    "roundId" UUID NOT NULL,
    "animalId" UUID NOT NULL,
    "reason" TEXT NOT NULL,
    "note" TEXT,

    CONSTRAINT "RoundSkip_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ScanEvent" (
    "id" UUID NOT NULL,
    "farmId" UUID NOT NULL,
    "roundId" UUID,
    "animalId" UUID,
    "rawPayload" TEXT,
    "success" BOOLEAN NOT NULL,
    "failReason" TEXT,
    "method" TEXT NOT NULL,
    "scannedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "deviceId" TEXT,

    CONSTRAINT "ScanEvent_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "RecordingRound_milkRoundId_key" ON "RecordingRound"("milkRoundId");

-- CreateIndex
CREATE INDEX "RecordingRound_farmId_date_mode_idx" ON "RecordingRound"("farmId", "date", "mode");

-- CreateIndex
CREATE INDEX "RecordingRound_farmId_status_idx" ON "RecordingRound"("farmId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "RoundSkip_roundId_animalId_key" ON "RoundSkip"("roundId", "animalId");

-- CreateIndex
CREATE INDEX "ScanEvent_farmId_scannedAt_idx" ON "ScanEvent"("farmId", "scannedAt");

-- CreateIndex
CREATE INDEX "ScanEvent_animalId_scannedAt_idx" ON "ScanEvent"("animalId", "scannedAt");

-- CreateIndex
CREATE UNIQUE INDEX "ProductionEntry_milk_animal_date_session_uidx"
ON "ProductionEntry" ("animalId", "entryDate", "session")
WHERE "type" = 'MILK' AND "animalId" IS NOT NULL AND "session" IS NOT NULL;

-- AddForeignKey
ALTER TABLE "RecordingRound" ADD CONSTRAINT "RecordingRound_farmId_fkey" FOREIGN KEY ("farmId") REFERENCES "Farm"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RecordingRound" ADD CONSTRAINT "RecordingRound_milkRoundId_fkey" FOREIGN KEY ("milkRoundId") REFERENCES "MilkRound"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RoundSkip" ADD CONSTRAINT "RoundSkip_roundId_fkey" FOREIGN KEY ("roundId") REFERENCES "RecordingRound"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ScanEvent" ADD CONSTRAINT "ScanEvent_farmId_fkey" FOREIGN KEY ("farmId") REFERENCES "Farm"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ScanEvent" ADD CONSTRAINT "ScanEvent_roundId_fkey" FOREIGN KEY ("roundId") REFERENCES "RecordingRound"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AlterTable
ALTER TABLE "ProductionRevision" ADD COLUMN IF NOT EXISTS "reason" TEXT;

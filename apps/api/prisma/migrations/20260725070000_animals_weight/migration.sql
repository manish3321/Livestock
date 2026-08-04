-- CreateEnum
CREATE TYPE "AnimalSource" AS ENUM ('PURCHASED', 'BORN', 'TRANSFERRED');

-- AlterTable
ALTER TABLE "Animal" ADD COLUMN "name" TEXT,
ADD COLUMN "source" "AnimalSource",
ADD COLUMN "motherTag" TEXT;

-- CreateTable
CREATE TABLE "WeightRecord" (
    "id" UUID NOT NULL,
    "farmId" UUID NOT NULL,
    "animalId" UUID NOT NULL,
    "weightKg" DECIMAL(8,2) NOT NULL,
    "recordedAt" TIMESTAMP(3) NOT NULL,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "WeightRecord_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "WeightRecord_animalId_recordedAt_idx" ON "WeightRecord"("animalId", "recordedAt");

-- CreateIndex
CREATE INDEX "WeightRecord_farmId_idx" ON "WeightRecord"("farmId");

-- CreateIndex
CREATE INDEX "Animal_farmId_species_idx" ON "Animal"("farmId", "species");

-- CreateIndex
CREATE INDEX "Animal_farmId_status_idx" ON "Animal"("farmId", "status");

-- AddForeignKey
ALTER TABLE "WeightRecord" ADD CONSTRAINT "WeightRecord_farmId_fkey" FOREIGN KEY ("farmId") REFERENCES "Farm"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WeightRecord" ADD CONSTRAINT "WeightRecord_animalId_fkey" FOREIGN KEY ("animalId") REFERENCES "Animal"("id") ON DELETE CASCADE ON UPDATE CASCADE;

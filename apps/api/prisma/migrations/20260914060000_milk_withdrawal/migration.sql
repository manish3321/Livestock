-- AlterTable
ALTER TABLE "InventoryItem" ADD COLUMN IF NOT EXISTS "withdrawalDaysMilk" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "InventoryItem" ADD COLUMN IF NOT EXISTS "withdrawalDaysMeat" INTEGER NOT NULL DEFAULT 0;

-- AlterTable
ALTER TABLE "HealthRecord" ADD COLUMN IF NOT EXISTS "inventoryItemId" UUID;
ALTER TABLE "HealthRecord" ADD COLUMN IF NOT EXISTS "durationDays" INTEGER;

-- CreateTable
CREATE TABLE "MilkWithhold" (
    "id" UUID NOT NULL,
    "farmId" UUID NOT NULL,
    "animalId" UUID NOT NULL,
    "healthEventId" UUID,
    "medicationId" UUID,
    "drugName" TEXT NOT NULL,
    "startDate" TIMESTAMP(3) NOT NULL,
    "endDate" TIMESTAMP(3) NOT NULL,
    "reason" TEXT,
    "clearedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "MilkWithhold_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MeatWithhold" (
    "id" UUID NOT NULL,
    "farmId" UUID NOT NULL,
    "animalId" UUID NOT NULL,
    "healthEventId" UUID,
    "medicationId" UUID,
    "drugName" TEXT NOT NULL,
    "startDate" TIMESTAMP(3) NOT NULL,
    "endDate" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "MeatWithhold_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "MilkWithhold_animalId_endDate_idx" ON "MilkWithhold"("animalId", "endDate");
CREATE INDEX "MilkWithhold_farmId_endDate_idx" ON "MilkWithhold"("farmId", "endDate");
CREATE INDEX "MeatWithhold_animalId_endDate_idx" ON "MeatWithhold"("animalId", "endDate");

-- AddForeignKey
ALTER TABLE "HealthRecord" ADD CONSTRAINT "HealthRecord_inventoryItemId_fkey" FOREIGN KEY ("inventoryItemId") REFERENCES "InventoryItem"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "MilkWithhold" ADD CONSTRAINT "MilkWithhold_farmId_fkey" FOREIGN KEY ("farmId") REFERENCES "Farm"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "MilkWithhold" ADD CONSTRAINT "MilkWithhold_animalId_fkey" FOREIGN KEY ("animalId") REFERENCES "Animal"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "MilkWithhold" ADD CONSTRAINT "MilkWithhold_healthEventId_fkey" FOREIGN KEY ("healthEventId") REFERENCES "HealthRecord"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "MilkWithhold" ADD CONSTRAINT "MilkWithhold_medicationId_fkey" FOREIGN KEY ("medicationId") REFERENCES "InventoryItem"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "MeatWithhold" ADD CONSTRAINT "MeatWithhold_farmId_fkey" FOREIGN KEY ("farmId") REFERENCES "Farm"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "MeatWithhold" ADD CONSTRAINT "MeatWithhold_animalId_fkey" FOREIGN KEY ("animalId") REFERENCES "Animal"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "MeatWithhold" ADD CONSTRAINT "MeatWithhold_healthEventId_fkey" FOREIGN KEY ("healthEventId") REFERENCES "HealthRecord"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "MeatWithhold" ADD CONSTRAINT "MeatWithhold_medicationId_fkey" FOREIGN KEY ("medicationId") REFERENCES "InventoryItem"("id") ON DELETE SET NULL ON UPDATE CASCADE;

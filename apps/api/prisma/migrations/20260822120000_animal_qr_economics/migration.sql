-- Animal economics + QR attribution
ALTER TABLE "Animal" ADD COLUMN "breedingStock" BOOLEAN NOT NULL DEFAULT true;

CREATE INDEX "Animal_farmId_breedingStock_idx" ON "Animal"("farmId", "breedingStock");

ALTER TABLE "Expense" ADD COLUMN "animalId" UUID;
ALTER TABLE "Expense" ADD COLUMN "herdBatchId" UUID;

ALTER TABLE "Expense" ADD CONSTRAINT "Expense_animalId_fkey" FOREIGN KEY ("animalId") REFERENCES "Animal"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "Expense" ADD CONSTRAINT "Expense_herdBatchId_fkey" FOREIGN KEY ("herdBatchId") REFERENCES "HerdBatch"("id") ON DELETE SET NULL ON UPDATE CASCADE;

CREATE INDEX "Expense_animalId_idx" ON "Expense"("animalId");
CREATE INDEX "Expense_herdBatchId_idx" ON "Expense"("herdBatchId");

ALTER TABLE "Revenue" ADD COLUMN "animalId" UUID;
ALTER TABLE "Revenue" ADD COLUMN "herdBatchId" UUID;

ALTER TABLE "Revenue" ADD CONSTRAINT "Revenue_animalId_fkey" FOREIGN KEY ("animalId") REFERENCES "Animal"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "Revenue" ADD CONSTRAINT "Revenue_herdBatchId_fkey" FOREIGN KEY ("herdBatchId") REFERENCES "HerdBatch"("id") ON DELETE SET NULL ON UPDATE CASCADE;

CREATE INDEX "Revenue_animalId_idx" ON "Revenue"("animalId");
CREATE INDEX "Revenue_herdBatchId_idx" ON "Revenue"("herdBatchId");

ALTER TABLE "HealthRecord" ADD COLUMN "cost" DECIMAL(12,2);

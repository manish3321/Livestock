-- Dual mode: household (simple UX) vs commercial (full feature surface)

CREATE TYPE "FarmMode" AS ENUM ('HOUSEHOLD', 'COMMERCIAL');

ALTER TABLE "Farm" ADD COLUMN "mode" "FarmMode" NOT NULL DEFAULT 'HOUSEHOLD';

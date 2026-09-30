-- AlterTable
ALTER TABLE "Plan" ADD COLUMN     "maxPatientsPerMonth" INTEGER,
ADD COLUMN     "maxStorageMb" INTEGER;

-- AlterTable
ALTER TABLE "Subscription" ADD COLUMN     "remindersSent" TEXT[] DEFAULT ARRAY[]::TEXT[];


ALTER TABLE "Plan" ADD CONSTRAINT "Plan_fair_use_limits_positive" CHECK (("maxPatientsPerMonth" IS NULL OR "maxPatientsPerMonth" > 0) AND ("maxStorageMb" IS NULL OR "maxStorageMb" > 0));

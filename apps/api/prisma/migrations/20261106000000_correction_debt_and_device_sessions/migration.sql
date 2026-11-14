-- AlterEnum
ALTER TYPE "ObligationKind" ADD VALUE 'CORRECTION';

-- AlterTable
ALTER TABLE "Device" ADD COLUMN     "sessionFamilyId" UUID;

-- CreateIndex
CREATE INDEX "Device_sessionFamilyId_idx" ON "Device"("sessionFamilyId");

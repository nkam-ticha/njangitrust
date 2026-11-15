CREATE TABLE "DeploymentJob" (
  "id" UUID NOT NULL,
  "name" VARCHAR(200) NOT NULL,
  "jobKey" VARCHAR(200) NOT NULL,
  "payload" JSONB NOT NULL,
  "runAt" TIMESTAMPTZ(6) NOT NULL,
  "status" VARCHAR(16) NOT NULL DEFAULT 'PENDING',
  "attempts" INTEGER NOT NULL DEFAULT 0,
  "maxAttempts" INTEGER NOT NULL DEFAULT 3,
  "leaseUntil" TIMESTAMPTZ(6),
  "leaseToken" UUID,
  "lastError" VARCHAR(1000),
  "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "DeploymentJob_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "DeploymentJob_status_check" CHECK ("status" IN ('PENDING', 'RUNNING', 'RETRY', 'SUCCEEDED', 'DEAD')),
  CONSTRAINT "DeploymentJob_attempts_check" CHECK ("attempts" >= 0 AND "maxAttempts" > 0)
);

CREATE UNIQUE INDEX "DeploymentJob_name_jobKey_key" ON "DeploymentJob"("name", "jobKey");
CREATE INDEX "DeploymentJob_status_runAt_createdAt_idx" ON "DeploymentJob"("status", "runAt", "createdAt");
CREATE INDEX "DeploymentJob_status_leaseUntil_idx" ON "DeploymentJob"("status", "leaseUntil");

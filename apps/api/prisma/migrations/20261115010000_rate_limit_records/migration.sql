CREATE TABLE "RateLimitRecord" (
  "key" VARCHAR(512) NOT NULL,
  "consumed" INTEGER NOT NULL DEFAULT 0,
  "expiresAt" TIMESTAMPTZ(6) NOT NULL,
  "blockedUntil" TIMESTAMPTZ(6),
  "updatedAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "RateLimitRecord_pkey" PRIMARY KEY ("key"),
  CONSTRAINT "RateLimitRecord_consumed_check" CHECK ("consumed" >= 0)
);
CREATE INDEX "RateLimitRecord_expiresAt_idx" ON "RateLimitRecord"("expiresAt");
CREATE INDEX "RateLimitRecord_blockedUntil_idx" ON "RateLimitRecord"("blockedUntil");

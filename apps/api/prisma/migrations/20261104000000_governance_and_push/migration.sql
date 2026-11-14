-- CreateEnum
CREATE TYPE "PushTicketStatus" AS ENUM ('OK', 'ERROR', 'DELIVERED', 'FAILED');

-- AlterTable
ALTER TABLE "Proposal" ADD COLUMN     "mustApproveMembershipIds" UUID[],
ADD COLUMN     "remindedAt" TIMESTAMPTZ(3),
ADD COLUMN     "subjectMembershipId" UUID;

-- CreateTable
CREATE TABLE "PushTicket" (
    "id" UUID NOT NULL,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "notificationId" UUID NOT NULL,
    "deviceId" UUID NOT NULL,
    "ticketId" TEXT,
    "status" "PushTicketStatus" NOT NULL,
    "error" TEXT,
    "checkedAt" TIMESTAMPTZ(3),

    CONSTRAINT "PushTicket_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "PushTicket_ticketId_key" ON "PushTicket"("ticketId");

-- CreateIndex
CREATE INDEX "PushTicket_status_createdAt_idx" ON "PushTicket"("status", "createdAt");

-- AddForeignKey
ALTER TABLE "Proposal" ADD CONSTRAINT "Proposal_subjectMembershipId_fkey" FOREIGN KEY ("subjectMembershipId") REFERENCES "Membership"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PushTicket" ADD CONSTRAINT "PushTicket_notificationId_fkey" FOREIGN KEY ("notificationId") REFERENCES "Notification"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PushTicket" ADD CONSTRAINT "PushTicket_deviceId_fkey" FOREIGN KEY ("deviceId") REFERENCES "Device"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Hand-written.
-- One open proposal per type and member concerned (no two removal votes on the same person).
CREATE UNIQUE INDEX "Proposal_one_open_per_subject"
  ON "Proposal" ("groupId", "type", "subjectMembershipId")
  WHERE "status" = 'OPEN' AND "subjectMembershipId" IS NOT NULL;

-- The member concerned and the members who must approve are fixed at creation, like the
-- eligible voters (R11.1, 3.1).
CREATE OR REPLACE FUNCTION njangi_freeze_proposal_secrecy() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  IF NEW."secret" IS DISTINCT FROM OLD."secret"
     OR NEW."eligibleMembershipIds" IS DISTINCT FROM OLD."eligibleMembershipIds"
     OR NEW."mustApproveMembershipIds" IS DISTINCT FROM OLD."mustApproveMembershipIds"
     OR NEW."subjectMembershipId" IS DISTINCT FROM OLD."subjectMembershipId"
     OR NEW."type" IS DISTINCT FROM OLD."type"
     OR NEW."payload" IS DISTINCT FROM OLD."payload" THEN
    RAISE EXCEPTION 'A proposal''s type, terms, secrecy and voters are fixed when it is created'
      USING ERRCODE = 'NJV02';
  END IF;
  RETURN NEW;
END;
$$;

-- Push tickets are written by the API and updated with their receipts.
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'njangi_app') THEN
    GRANT SELECT, INSERT, UPDATE, DELETE ON "PushTicket" TO njangi_app;
  END IF;
END
$$;

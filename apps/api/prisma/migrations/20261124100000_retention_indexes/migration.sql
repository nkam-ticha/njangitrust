-- Retention purge (D33): every query filters on a table-wide age (`createdAt < cutoff`, oldest
-- first), but the existing indexes all start with the group or the user, so each batch scanned the
-- whole table. Additive indexes only; nothing is changed or dropped.

-- CreateIndex
CREATE INDEX "Message_createdAt_idx" ON "Message"("createdAt");

-- CreateIndex
CREATE INDEX "Attachment_createdAt_idx" ON "Attachment"("createdAt");

-- CreateIndex
CREATE INDEX "UploadTicket_createdAt_idx" ON "UploadTicket"("createdAt");

-- CreateIndex
CREATE INDEX "AgentMessage_createdAt_idx" ON "AgentMessage"("createdAt");

-- CreateIndex
CREATE INDEX "Notification_createdAt_idx" ON "Notification"("createdAt");

-- CreateIndex
CREATE INDEX "DeploymentJob_status_updatedAt_idx" ON "DeploymentJob"("status", "updatedAt");

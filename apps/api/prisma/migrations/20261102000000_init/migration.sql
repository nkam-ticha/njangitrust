-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "public";

-- CreateEnum
CREATE TYPE "AgentChannel" AS ENUM ('PRIVATE', 'GROUP');

-- CreateEnum
CREATE TYPE "AgentMessageRole" AS ENUM ('user', 'assistant', 'tool');

-- CreateEnum
CREATE TYPE "ToolCallStatus" AS ENUM ('OK', 'REFUSED', 'INVALID', 'ERROR');

-- CreateEnum
CREATE TYPE "ActionLevel" AS ENUM ('L1', 'L2');

-- CreateEnum
CREATE TYPE "ActionOrigin" AS ENUM ('AGENT', 'UI');

-- CreateEnum
CREATE TYPE "PendingActionStatus" AS ENUM ('PENDING', 'CONFIRMED', 'CANCELLED', 'EXPIRED', 'DONE', 'FAILED');

-- CreateEnum
CREATE TYPE "Language" AS ENUM ('fr', 'en');

-- CreateEnum
CREATE TYPE "Operator" AS ENUM ('MTN', 'ORANGE', 'UNKNOWN');

-- CreateEnum
CREATE TYPE "ClientKind" AS ENUM ('MOBILE', 'WEB');

-- CreateEnum
CREATE TYPE "MessageKind" AS ENUM ('TEXT', 'IMAGE', 'VIDEO', 'DOCUMENT', 'VOICE', 'SYSTEM', 'AGENT');

-- CreateEnum
CREATE TYPE "AttachmentKind" AS ENUM ('IMAGE', 'VIDEO', 'DOCUMENT', 'VOICE');

-- CreateEnum
CREATE TYPE "ProposalType" AS ENUM ('RULE_CHANGE', 'MEMBER_ADD', 'MEMBER_REMOVE', 'ROTATION_CHANGE', 'ADMIN_CHANGE', 'EARLY_EXIT', 'ADMIN_LOAN', 'SOLIDARITY_PAYOUT', 'FINE_WAIVER', 'LEDGER_CORRECTION');

-- CreateEnum
CREATE TYPE "ThresholdKind" AS ENUM ('MAJORITY', 'TWO_THIRDS');

-- CreateEnum
CREATE TYPE "ProposalStatus" AS ENUM ('OPEN', 'PASSED', 'REJECTED', 'EXPIRED');

-- CreateEnum
CREATE TYPE "VoteChoice" AS ENUM ('YES', 'NO');

-- CreateEnum
CREATE TYPE "SolidarityEvent" AS ENUM ('DEUIL', 'NAISSANCE', 'MALADIE', 'MARIAGE', 'AUTRE');

-- CreateEnum
CREATE TYPE "SolidarityRequestStatus" AS ENUM ('VOTING', 'APPROVED', 'REJECTED', 'PAID', 'FAILED');

-- CreateEnum
CREATE TYPE "GroupStatus" AS ENUM ('FORMING', 'ACTIVE', 'CLOSED');

-- CreateEnum
CREATE TYPE "MembershipRole" AS ENUM ('ADMIN', 'MEMBER');

-- CreateEnum
CREATE TYPE "MembershipStatus" AS ENUM ('INVITED', 'ACTIVE', 'LEAVING', 'LEFT', 'REMOVED');

-- CreateEnum
CREATE TYPE "DevicePlatform" AS ENUM ('ANDROID', 'IOS', 'WEB');

-- CreateEnum
CREATE TYPE "RefreshRevokedReason" AS ENUM ('LOGOUT', 'LOGOUT_ALL', 'REUSE_DETECTED', 'PIN_CHANGED', 'PIN_RESET', 'ACCOUNT_DELETED');

-- CreateEnum
CREATE TYPE "PinResetStatus" AS ENUM ('REQUESTED', 'APPROVED', 'COMPLETED', 'EXPIRED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "LedgerTransactionType" AS ENUM ('PAYMENT_RECEIVED', 'FINE_ASSESSED', 'BID_ASSESSED', 'AUTO_SETTLEMENT', 'WITHDRAWAL_COMPLETED', 'LOAN_DISBURSED', 'SOLIDARITY_DISBURSED', 'LEAVER_REFUND', 'FUND_DISTRIBUTION', 'POT_ASSIGNED', 'REVERSAL', 'EVENT');

-- CreateEnum
CREATE TYPE "ReconciliationStatus" AS ENUM ('OK', 'WARNING', 'ALERT');

-- CreateEnum
CREATE TYPE "MeetingStatus" AS ENUM ('SCHEDULED', 'HELD', 'CANCELLED');

-- CreateEnum
CREATE TYPE "AgendaItemSource" AS ENUM ('AUTO', 'MEMBER');

-- CreateEnum
CREATE TYPE "RotationMode" AS ENUM ('FIXED', 'BIDDING');

-- CreateEnum
CREATE TYPE "RoundStatus" AS ENUM ('SCHEDULED', 'OPEN', 'PAYOUT', 'CLOSED');

-- CreateEnum
CREATE TYPE "ObligationKind" AS ENUM ('CONTRIBUTION', 'SOLIDARITY', 'FINE', 'LOAN_INSTALLMENT', 'BID', 'SHORTFALL_SHARE');

-- CreateEnum
CREATE TYPE "ObligationStatus" AS ENUM ('DUE', 'PAID', 'SETTLED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "PaymentStatus" AS ENUM ('CREATED', 'PENDING', 'SUCCESSFUL', 'FAILED', 'EXPIRED');

-- CreateEnum
CREATE TYPE "FeeSource" AS ENUM ('PROVIDER', 'SCHEDULE');

-- CreateEnum
CREATE TYPE "DisbursementPurpose" AS ENUM ('WITHDRAWAL', 'LOAN', 'SOLIDARITY');

-- CreateEnum
CREATE TYPE "DisbursementStatus" AS ENUM ('CREATED', 'PENDING', 'SUCCESSFUL', 'FAILED', 'EXPIRED');

-- CreateEnum
CREATE TYPE "LoanStatus" AS ENUM ('REQUESTED', 'APPROVED', 'REJECTED', 'DISBURSED', 'REPAID', 'OVERDUE', 'EXPIRED');

-- CreateEnum
CREATE TYPE "NotificationCategory" AS ENUM ('REMINDERS', 'MONEY', 'VOTES', 'GROUP', 'SECURITY');

-- CreateEnum
CREATE TYPE "PushStatus" AS ENUM ('NOT_SENT', 'QUEUED', 'SENT', 'DELIVERED', 'FAILED');

-- CreateEnum
CREATE TYPE "MediaAutoDownload" AS ENUM ('WIFI_ONLY', 'ALWAYS', 'NEVER');

-- CreateTable
CREATE TABLE "AgentConversation" (
    "id" UUID NOT NULL,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,
    "userId" UUID NOT NULL,
    "groupId" UUID,
    "channel" "AgentChannel" NOT NULL,
    "rollingSummary" TEXT,

    CONSTRAINT "AgentConversation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AgentMessage" (
    "id" UUID NOT NULL,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "conversationId" UUID NOT NULL,
    "role" "AgentMessageRole" NOT NULL,
    "content" TEXT NOT NULL,
    "toolName" TEXT,
    "toolArgsRedacted" JSONB,
    "toolStatus" "ToolCallStatus",

    CONSTRAINT "AgentMessage_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PendingAction" (
    "id" UUID NOT NULL,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "userId" UUID NOT NULL,
    "groupId" UUID,
    "type" TEXT NOT NULL,
    "args" JSONB NOT NULL,
    "preview" JSONB NOT NULL,
    "level" "ActionLevel" NOT NULL,
    "status" "PendingActionStatus" NOT NULL DEFAULT 'PENDING',
    "origin" "ActionOrigin" NOT NULL,
    "expiresAt" TIMESTAMPTZ(3) NOT NULL,
    "confirmedAt" TIMESTAMPTZ(3),
    "completedAt" TIMESTAMPTZ(3),
    "resultRef" TEXT,
    "resultSummary" JSONB,
    "failureCode" TEXT,
    "failureText" JSONB,

    CONSTRAINT "PendingAction_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AuditLog" (
    "id" UUID NOT NULL,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "actorUserId" UUID,
    "groupId" UUID,
    "action" TEXT NOT NULL,
    "target" TEXT,
    "details" JSONB NOT NULL DEFAULT '{}',
    "deviceId" UUID,
    "requestId" TEXT,

    CONSTRAINT "AuditLog_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Message" (
    "id" UUID NOT NULL,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "groupId" UUID NOT NULL,
    "authorMembershipId" UUID,
    "kind" "MessageKind" NOT NULL,
    "text" TEXT,
    "systemText" JSONB,
    "attachmentId" UUID,
    "replyToId" UUID,
    "mentions" UUID[],
    "isAnnouncement" BOOLEAN NOT NULL DEFAULT false,
    "deletedAt" TIMESTAMPTZ(3),
    "hiddenByAdminAt" TIMESTAMPTZ(3),

    CONSTRAINT "Message_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Attachment" (
    "id" UUID NOT NULL,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "groupId" UUID NOT NULL,
    "uploaderMembershipId" UUID NOT NULL,
    "kind" "AttachmentKind" NOT NULL,
    "mime" TEXT NOT NULL,
    "sizeBytes" INTEGER NOT NULL,
    "durationSec" INTEGER,
    "width" INTEGER,
    "height" INTEGER,
    "storageKey" TEXT NOT NULL,
    "thumbnailKey" TEXT,

    CONSTRAINT "Attachment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "UploadTicket" (
    "id" UUID NOT NULL,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "userId" UUID NOT NULL,
    "groupId" UUID NOT NULL,
    "kind" "AttachmentKind" NOT NULL,
    "declaredMime" TEXT NOT NULL,
    "maxBytes" INTEGER NOT NULL,
    "storageKey" TEXT NOT NULL,
    "thumbnailKey" TEXT,
    "expiresAt" TIMESTAMPTZ(3) NOT NULL,
    "completedAt" TIMESTAMPTZ(3),
    "attachmentId" UUID,

    CONSTRAINT "UploadTicket_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Proposal" (
    "id" UUID NOT NULL,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "groupId" UUID NOT NULL,
    "type" "ProposalType" NOT NULL,
    "payload" JSONB NOT NULL,
    "reason" TEXT,
    "proposerMembershipId" UUID NOT NULL,
    "secret" BOOLEAN NOT NULL,
    "thresholdKind" "ThresholdKind" NOT NULL,
    "eligibleMembershipIds" UUID[],
    "yesCount" INTEGER NOT NULL DEFAULT 0,
    "noCount" INTEGER NOT NULL DEFAULT 0,
    "opensAt" TIMESTAMPTZ(3) NOT NULL,
    "closesAt" TIMESTAMPTZ(3) NOT NULL,
    "status" "ProposalStatus" NOT NULL DEFAULT 'OPEN',
    "closedAt" TIMESTAMPTZ(3),
    "appliedAt" TIMESTAMPTZ(3),
    "effect" JSONB,

    CONSTRAINT "Proposal_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "VoteReceipt" (
    "id" UUID NOT NULL,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "proposalId" UUID NOT NULL,
    "membershipId" UUID NOT NULL,
    "votedAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "VoteReceipt_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Ballot" (
    "id" UUID NOT NULL,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "proposalId" UUID NOT NULL,
    "membershipId" UUID NOT NULL,
    "choice" "VoteChoice" NOT NULL,
    "castAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Ballot_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SolidarityRequest" (
    "id" UUID NOT NULL,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "groupId" UUID NOT NULL,
    "requesterMembershipId" UUID NOT NULL,
    "recipientMembershipId" UUID NOT NULL,
    "event" "SolidarityEvent" NOT NULL,
    "amount" INTEGER NOT NULL,
    "note" TEXT,
    "proposalId" UUID,
    "status" "SolidarityRequestStatus" NOT NULL DEFAULT 'VOTING',
    "disbursementId" UUID,

    CONSTRAINT "SolidarityRequest_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Group" (
    "id" UUID NOT NULL,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,
    "name" TEXT NOT NULL,
    "status" "GroupStatus" NOT NULL DEFAULT 'FORMING',
    "createdByUserId" UUID NOT NULL,
    "firstPayoutAt" TIMESTAMPTZ(3) NOT NULL,
    "currentCycleId" UUID,
    "providerAccount" TEXT NOT NULL DEFAULT 'default',

    CONSTRAINT "Group_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Membership" (
    "id" UUID NOT NULL,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "groupId" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "role" "MembershipRole" NOT NULL DEFAULT 'MEMBER',
    "status" "MembershipStatus" NOT NULL,
    "activeFromCycle" INTEGER,
    "leftAt" TIMESTAMPTZ(3),
    "chatLastReadAt" TIMESTAMPTZ(3),

    CONSTRAINT "Membership_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Invite" (
    "id" UUID NOT NULL,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "groupId" UUID NOT NULL,
    "proposalId" UUID,
    "inviteeName" TEXT NOT NULL,
    "phoneHash" TEXT NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "expiresAt" TIMESTAMPTZ(3) NOT NULL,
    "usedAt" TIMESTAMPTZ(3),
    "acceptedByUserId" UUID,
    "revokedAt" TIMESTAMPTZ(3),
    "createdByMembershipId" UUID NOT NULL,

    CONSTRAINT "Invite_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RuleSet" (
    "id" UUID NOT NULL,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "groupId" UUID NOT NULL,
    "version" INTEGER NOT NULL,
    "params" JSONB NOT NULL,
    "effectiveFromRoundId" UUID,
    "createdByProposalId" UUID,

    CONSTRAINT "RuleSet_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "User" (
    "id" UUID NOT NULL,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,
    "name" TEXT NOT NULL,
    "loginPhone" TEXT NOT NULL,
    "pinHash" TEXT NOT NULL,
    "language" "Language" NOT NULL DEFAULT 'fr',
    "consentVersion" TEXT NOT NULL,
    "consentAt" TIMESTAMPTZ(3) NOT NULL,
    "pinChangedAt" TIMESTAMPTZ(3),
    "pinResetAt" TIMESTAMPTZ(3),
    "sessionEpoch" INTEGER NOT NULL DEFAULT 0,
    "deletedAt" TIMESTAMPTZ(3),

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Device" (
    "id" UUID NOT NULL,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "userId" UUID NOT NULL,
    "platform" "DevicePlatform" NOT NULL,
    "expoPushToken" TEXT,
    "lastSeenAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "revokedAt" TIMESTAMPTZ(3),

    CONSTRAINT "Device_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PaymentNumber" (
    "id" UUID NOT NULL,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "userId" UUID NOT NULL,
    "number" TEXT NOT NULL,
    "operator" "Operator" NOT NULL,
    "activeFrom" TIMESTAMPTZ(3) NOT NULL,
    "activeTo" TIMESTAMPTZ(3),

    CONSTRAINT "PaymentNumber_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RefreshToken" (
    "id" UUID NOT NULL,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "userId" UUID NOT NULL,
    "familyId" UUID NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "client" "ClientKind" NOT NULL,
    "deviceId" UUID,
    "expiresAt" TIMESTAMPTZ(3) NOT NULL,
    "usedAt" TIMESTAMPTZ(3),
    "replacedByTokenId" UUID,
    "revokedAt" TIMESTAMPTZ(3),
    "revokedReason" "RefreshRevokedReason",

    CONSTRAINT "RefreshToken_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PinReset" (
    "id" UUID NOT NULL,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "userId" UUID NOT NULL,
    "status" "PinResetStatus" NOT NULL DEFAULT 'REQUESTED',
    "requestExpiresAt" TIMESTAMPTZ(3) NOT NULL,
    "approvedInGroupId" UUID,
    "approvedAt" TIMESTAMPTZ(3),
    "tokenHash" TEXT,
    "linkExpiresAt" TIMESTAMPTZ(3),
    "completedAt" TIMESTAMPTZ(3),

    CONSTRAINT "PinReset_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PinResetApproval" (
    "id" UUID NOT NULL,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "pinResetId" UUID NOT NULL,
    "groupId" UUID NOT NULL,
    "membershipId" UUID NOT NULL,

    CONSTRAINT "PinResetApproval_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "LedgerTransaction" (
    "id" UUID NOT NULL,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "groupId" UUID NOT NULL,
    "seq" INTEGER NOT NULL,
    "type" "LedgerTransactionType" NOT NULL,
    "occurredAt" TIMESTAMPTZ(3) NOT NULL,
    "roundId" UUID,
    "membershipId" UUID,
    "refType" TEXT,
    "refId" TEXT,
    "descriptionFr" TEXT NOT NULL,
    "descriptionEn" TEXT NOT NULL,
    "metadata" JSONB NOT NULL DEFAULT '{}',
    "prevHash" TEXT NOT NULL,
    "hash" TEXT NOT NULL,

    CONSTRAINT "LedgerTransaction_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "LedgerPosting" (
    "id" UUID NOT NULL,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "transactionId" UUID NOT NULL,
    "account" TEXT NOT NULL,
    "amount" INTEGER NOT NULL,

    CONSTRAINT "LedgerPosting_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ReconciliationRun" (
    "id" UUID NOT NULL,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "ranAt" TIMESTAMPTZ(3) NOT NULL,
    "providerAccount" TEXT NOT NULL DEFAULT 'default',
    "providerBalance" INTEGER NOT NULL,
    "ledgerCash" INTEGER NOT NULL,
    "inFlight" INTEGER NOT NULL,
    "difference" INTEGER NOT NULL,
    "status" "ReconciliationStatus" NOT NULL,
    "details" JSONB NOT NULL DEFAULT '{}',

    CONSTRAINT "ReconciliationRun_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Meeting" (
    "id" UUID NOT NULL,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "groupId" UUID NOT NULL,
    "scheduledAt" TIMESTAMPTZ(3) NOT NULL,
    "place" TEXT NOT NULL,
    "status" "MeetingStatus" NOT NULL DEFAULT 'SCHEDULED',
    "agenda" JSONB,
    "minutesDraft" TEXT,
    "minutesPublished" TEXT,
    "minutesVersion" INTEGER NOT NULL DEFAULT 0,
    "publishedAt" TIMESTAMPTZ(3),

    CONSTRAINT "Meeting_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AgendaItem" (
    "id" UUID NOT NULL,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "meetingId" UUID NOT NULL,
    "authorMembershipId" UUID,
    "text" TEXT NOT NULL,
    "source" "AgendaItemSource" NOT NULL,

    CONSTRAINT "AgendaItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Attendance" (
    "id" UUID NOT NULL,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "meetingId" UUID NOT NULL,
    "membershipId" UUID NOT NULL,
    "present" BOOLEAN NOT NULL DEFAULT false,
    "excused" BOOLEAN NOT NULL DEFAULT false,
    "excuseReason" TEXT,
    "checkedInAt" TIMESTAMPTZ(3),
    "markedByMembershipId" UUID,

    CONSTRAINT "Attendance_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Cycle" (
    "id" UUID NOT NULL,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "groupId" UUID NOT NULL,
    "number" INTEGER NOT NULL,
    "mode" "RotationMode" NOT NULL,
    "firstPayoutAt" TIMESTAMPTZ(3) NOT NULL,
    "drawSeed" TEXT,
    "rotation" UUID[],
    "startedAt" TIMESTAMPTZ(3),
    "closedAt" TIMESTAMPTZ(3),

    CONSTRAINT "Cycle_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Round" (
    "id" UUID NOT NULL,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "groupId" UUID NOT NULL,
    "cycleId" UUID NOT NULL,
    "number" INTEGER NOT NULL,
    "beneficiaryMembershipId" UUID,
    "dueAt" TIMESTAMPTZ(3) NOT NULL,
    "payoutAt" TIMESTAMPTZ(3) NOT NULL,
    "status" "RoundStatus" NOT NULL DEFAULT 'SCHEDULED',
    "ruleSetVersion" INTEGER NOT NULL,

    CONSTRAINT "Round_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Obligation" (
    "id" UUID NOT NULL,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "groupId" UUID NOT NULL,
    "membershipId" UUID NOT NULL,
    "kind" "ObligationKind" NOT NULL,
    "roundId" UUID,
    "loanId" UUID,
    "creditorMembershipId" UUID,
    "amount" INTEGER NOT NULL,
    "dueAt" TIMESTAMPTZ(3) NOT NULL,
    "status" "ObligationStatus" NOT NULL DEFAULT 'DUE',
    "paidAt" TIMESTAMPTZ(3),
    "onTime" BOOLEAN,

    CONSTRAINT "Obligation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PaymentIntent" (
    "id" UUID NOT NULL,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,
    "groupId" UUID NOT NULL,
    "membershipId" UUID NOT NULL,
    "obligationIds" UUID[],
    "amount" INTEGER NOT NULL,
    "phoneSnapshot" TEXT NOT NULL,
    "provider" TEXT NOT NULL,
    "providerRef" TEXT,
    "status" "PaymentStatus" NOT NULL DEFAULT 'CREATED',
    "fee" INTEGER,
    "feeSource" "FeeSource",
    "operator" "Operator",
    "operatorRef" TEXT,
    "settledAt" TIMESTAMPTZ(3),

    CONSTRAINT "PaymentIntent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Disbursement" (
    "id" UUID NOT NULL,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,
    "groupId" UUID NOT NULL,
    "membershipId" UUID NOT NULL,
    "purpose" "DisbursementPurpose" NOT NULL,
    "amount" INTEGER NOT NULL,
    "feeEstimated" INTEGER NOT NULL,
    "feeActual" INTEGER,
    "phoneSnapshot" TEXT NOT NULL,
    "provider" TEXT NOT NULL,
    "providerRef" TEXT,
    "status" "DisbursementStatus" NOT NULL DEFAULT 'CREATED',
    "settledAt" TIMESTAMPTZ(3),

    CONSTRAINT "Disbursement_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Loan" (
    "id" UUID NOT NULL,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,
    "groupId" UUID NOT NULL,
    "membershipId" UUID NOT NULL,
    "principal" INTEGER NOT NULL,
    "months" INTEGER NOT NULL,
    "ratePermille" INTEGER NOT NULL,
    "interest" INTEGER NOT NULL,
    "feeEstimated" INTEGER NOT NULL,
    "totalDue" INTEGER NOT NULL,
    "status" "LoanStatus" NOT NULL DEFAULT 'REQUESTED',
    "decidedByMembershipId" UUID,
    "decisionReason" TEXT,
    "decidedAt" TIMESTAMPTZ(3),
    "proposalId" UUID,
    "disbursementId" UUID,

    CONSTRAINT "Loan_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Bid" (
    "id" UUID NOT NULL,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "roundId" UUID NOT NULL,
    "membershipId" UUID NOT NULL,
    "amount" INTEGER NOT NULL,
    "placedAt" TIMESTAMPTZ(3) NOT NULL,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "Bid_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Statement" (
    "id" UUID NOT NULL,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "membershipId" UUID NOT NULL,
    "periodStart" TIMESTAMPTZ(3) NOT NULL,
    "periodEnd" TIMESTAMPTZ(3) NOT NULL,
    "language" "Language" NOT NULL,
    "fileKey" TEXT NOT NULL,
    "verificationCode" TEXT NOT NULL,
    "ledgerHeadHash" TEXT NOT NULL,

    CONSTRAINT "Statement_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Notification" (
    "id" UUID NOT NULL,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "userId" UUID NOT NULL,
    "groupId" UUID,
    "category" "NotificationCategory" NOT NULL,
    "titleFr" TEXT NOT NULL,
    "titleEn" TEXT NOT NULL,
    "bodyFr" TEXT NOT NULL,
    "bodyEn" TEXT NOT NULL,
    "deepLink" TEXT,
    "readAt" TIMESTAMPTZ(3),
    "pushTicketId" TEXT,
    "pushStatus" "PushStatus" NOT NULL DEFAULT 'NOT_SENT',

    CONSTRAINT "Notification_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "NotificationPrefs" (
    "id" UUID NOT NULL,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,
    "userId" UUID NOT NULL,
    "mutedCategories" "NotificationCategory"[],
    "quietStartMinute" INTEGER NOT NULL DEFAULT 1260,
    "quietEndMinute" INTEGER NOT NULL DEFAULT 420,
    "mutedChatGroupIds" UUID[],
    "mediaAutoDownload" "MediaAutoDownload" NOT NULL DEFAULT 'WIFI_ONLY',

    CONSTRAINT "NotificationPrefs_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "AgentConversation_userId_channel_idx" ON "AgentConversation"("userId", "channel");

-- CreateIndex
CREATE INDEX "AgentMessage_conversationId_createdAt_idx" ON "AgentMessage"("conversationId", "createdAt");

-- CreateIndex
CREATE INDEX "PendingAction_userId_status_idx" ON "PendingAction"("userId", "status");

-- CreateIndex
CREATE INDEX "PendingAction_status_expiresAt_idx" ON "PendingAction"("status", "expiresAt");

-- CreateIndex
CREATE INDEX "AuditLog_actorUserId_createdAt_idx" ON "AuditLog"("actorUserId", "createdAt");

-- CreateIndex
CREATE INDEX "AuditLog_groupId_createdAt_idx" ON "AuditLog"("groupId", "createdAt");

-- CreateIndex
CREATE INDEX "AuditLog_action_createdAt_idx" ON "AuditLog"("action", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "Message_attachmentId_key" ON "Message"("attachmentId");

-- CreateIndex
CREATE INDEX "Message_groupId_createdAt_idx" ON "Message"("groupId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "Attachment_storageKey_key" ON "Attachment"("storageKey");

-- CreateIndex
CREATE UNIQUE INDEX "Attachment_thumbnailKey_key" ON "Attachment"("thumbnailKey");

-- CreateIndex
CREATE INDEX "Attachment_groupId_createdAt_idx" ON "Attachment"("groupId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "UploadTicket_storageKey_key" ON "UploadTicket"("storageKey");

-- CreateIndex
CREATE UNIQUE INDEX "UploadTicket_thumbnailKey_key" ON "UploadTicket"("thumbnailKey");

-- CreateIndex
CREATE UNIQUE INDEX "UploadTicket_attachmentId_key" ON "UploadTicket"("attachmentId");

-- CreateIndex
CREATE INDEX "UploadTicket_userId_createdAt_idx" ON "UploadTicket"("userId", "createdAt");

-- CreateIndex
CREATE INDEX "Proposal_groupId_status_idx" ON "Proposal"("groupId", "status");

-- CreateIndex
CREATE INDEX "Proposal_status_closesAt_idx" ON "Proposal"("status", "closesAt");

-- CreateIndex
CREATE UNIQUE INDEX "VoteReceipt_proposalId_membershipId_key" ON "VoteReceipt"("proposalId", "membershipId");

-- CreateIndex
CREATE UNIQUE INDEX "Ballot_proposalId_membershipId_key" ON "Ballot"("proposalId", "membershipId");

-- CreateIndex
CREATE UNIQUE INDEX "SolidarityRequest_proposalId_key" ON "SolidarityRequest"("proposalId");

-- CreateIndex
CREATE UNIQUE INDEX "SolidarityRequest_disbursementId_key" ON "SolidarityRequest"("disbursementId");

-- CreateIndex
CREATE INDEX "SolidarityRequest_groupId_status_idx" ON "SolidarityRequest"("groupId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "Group_currentCycleId_key" ON "Group"("currentCycleId");

-- CreateIndex
CREATE INDEX "Membership_userId_status_idx" ON "Membership"("userId", "status");

-- CreateIndex
CREATE INDEX "Membership_groupId_status_idx" ON "Membership"("groupId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "Membership_groupId_userId_key" ON "Membership"("groupId", "userId");

-- CreateIndex
CREATE UNIQUE INDEX "Invite_tokenHash_key" ON "Invite"("tokenHash");

-- CreateIndex
CREATE INDEX "Invite_groupId_usedAt_idx" ON "Invite"("groupId", "usedAt");

-- CreateIndex
CREATE INDEX "Invite_proposalId_idx" ON "Invite"("proposalId");

-- CreateIndex
CREATE UNIQUE INDEX "RuleSet_groupId_version_key" ON "RuleSet"("groupId", "version");

-- CreateIndex
CREATE UNIQUE INDEX "User_loginPhone_key" ON "User"("loginPhone");

-- CreateIndex
CREATE UNIQUE INDEX "Device_expoPushToken_key" ON "Device"("expoPushToken");

-- CreateIndex
CREATE INDEX "Device_userId_idx" ON "Device"("userId");

-- CreateIndex
CREATE INDEX "PaymentNumber_userId_activeFrom_idx" ON "PaymentNumber"("userId", "activeFrom");

-- CreateIndex
CREATE UNIQUE INDEX "RefreshToken_tokenHash_key" ON "RefreshToken"("tokenHash");

-- CreateIndex
CREATE INDEX "RefreshToken_userId_revokedAt_idx" ON "RefreshToken"("userId", "revokedAt");

-- CreateIndex
CREATE INDEX "RefreshToken_familyId_idx" ON "RefreshToken"("familyId");

-- CreateIndex
CREATE UNIQUE INDEX "PinReset_tokenHash_key" ON "PinReset"("tokenHash");

-- CreateIndex
CREATE INDEX "PinReset_userId_status_idx" ON "PinReset"("userId", "status");

-- CreateIndex
CREATE INDEX "PinResetApproval_pinResetId_groupId_idx" ON "PinResetApproval"("pinResetId", "groupId");

-- CreateIndex
CREATE UNIQUE INDEX "PinResetApproval_pinResetId_membershipId_key" ON "PinResetApproval"("pinResetId", "membershipId");

-- CreateIndex
CREATE UNIQUE INDEX "LedgerTransaction_hash_key" ON "LedgerTransaction"("hash");

-- CreateIndex
CREATE INDEX "LedgerTransaction_groupId_type_idx" ON "LedgerTransaction"("groupId", "type");

-- CreateIndex
CREATE INDEX "LedgerTransaction_membershipId_idx" ON "LedgerTransaction"("membershipId");

-- CreateIndex
CREATE UNIQUE INDEX "LedgerTransaction_groupId_seq_key" ON "LedgerTransaction"("groupId", "seq");

-- CreateIndex
CREATE INDEX "LedgerPosting_transactionId_idx" ON "LedgerPosting"("transactionId");

-- CreateIndex
CREATE INDEX "LedgerPosting_account_idx" ON "LedgerPosting"("account");

-- CreateIndex
CREATE INDEX "ReconciliationRun_providerAccount_ranAt_idx" ON "ReconciliationRun"("providerAccount", "ranAt");

-- CreateIndex
CREATE INDEX "Meeting_groupId_scheduledAt_idx" ON "Meeting"("groupId", "scheduledAt");

-- CreateIndex
CREATE INDEX "AgendaItem_meetingId_idx" ON "AgendaItem"("meetingId");

-- CreateIndex
CREATE UNIQUE INDEX "Attendance_meetingId_membershipId_key" ON "Attendance"("meetingId", "membershipId");

-- CreateIndex
CREATE UNIQUE INDEX "Cycle_groupId_number_key" ON "Cycle"("groupId", "number");

-- CreateIndex
CREATE INDEX "Round_groupId_status_idx" ON "Round"("groupId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "Round_cycleId_number_key" ON "Round"("cycleId", "number");

-- CreateIndex
CREATE INDEX "Obligation_membershipId_status_idx" ON "Obligation"("membershipId", "status");

-- CreateIndex
CREATE INDEX "Obligation_groupId_roundId_kind_idx" ON "Obligation"("groupId", "roundId", "kind");

-- CreateIndex
CREATE INDEX "Obligation_loanId_idx" ON "Obligation"("loanId");

-- CreateIndex
CREATE UNIQUE INDEX "PaymentIntent_providerRef_key" ON "PaymentIntent"("providerRef");

-- CreateIndex
CREATE INDEX "PaymentIntent_membershipId_status_idx" ON "PaymentIntent"("membershipId", "status");

-- CreateIndex
CREATE INDEX "PaymentIntent_status_createdAt_idx" ON "PaymentIntent"("status", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "Disbursement_providerRef_key" ON "Disbursement"("providerRef");

-- CreateIndex
CREATE INDEX "Disbursement_membershipId_status_idx" ON "Disbursement"("membershipId", "status");

-- CreateIndex
CREATE INDEX "Disbursement_status_createdAt_idx" ON "Disbursement"("status", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "Loan_proposalId_key" ON "Loan"("proposalId");

-- CreateIndex
CREATE UNIQUE INDEX "Loan_disbursementId_key" ON "Loan"("disbursementId");

-- CreateIndex
CREATE INDEX "Loan_groupId_status_idx" ON "Loan"("groupId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "Bid_roundId_membershipId_key" ON "Bid"("roundId", "membershipId");

-- CreateIndex
CREATE UNIQUE INDEX "Statement_verificationCode_key" ON "Statement"("verificationCode");

-- CreateIndex
CREATE INDEX "Statement_membershipId_periodStart_idx" ON "Statement"("membershipId", "periodStart");

-- CreateIndex
CREATE INDEX "Notification_userId_createdAt_idx" ON "Notification"("userId", "createdAt");

-- CreateIndex
CREATE INDEX "Notification_userId_readAt_idx" ON "Notification"("userId", "readAt");

-- CreateIndex
CREATE UNIQUE INDEX "NotificationPrefs_userId_key" ON "NotificationPrefs"("userId");

-- AddForeignKey
ALTER TABLE "AgentConversation" ADD CONSTRAINT "AgentConversation_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AgentConversation" ADD CONSTRAINT "AgentConversation_groupId_fkey" FOREIGN KEY ("groupId") REFERENCES "Group"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AgentMessage" ADD CONSTRAINT "AgentMessage_conversationId_fkey" FOREIGN KEY ("conversationId") REFERENCES "AgentConversation"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PendingAction" ADD CONSTRAINT "PendingAction_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PendingAction" ADD CONSTRAINT "PendingAction_groupId_fkey" FOREIGN KEY ("groupId") REFERENCES "Group"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AuditLog" ADD CONSTRAINT "AuditLog_actorUserId_fkey" FOREIGN KEY ("actorUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AuditLog" ADD CONSTRAINT "AuditLog_groupId_fkey" FOREIGN KEY ("groupId") REFERENCES "Group"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Message" ADD CONSTRAINT "Message_groupId_fkey" FOREIGN KEY ("groupId") REFERENCES "Group"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Message" ADD CONSTRAINT "Message_authorMembershipId_fkey" FOREIGN KEY ("authorMembershipId") REFERENCES "Membership"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Message" ADD CONSTRAINT "Message_attachmentId_fkey" FOREIGN KEY ("attachmentId") REFERENCES "Attachment"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Message" ADD CONSTRAINT "Message_replyToId_fkey" FOREIGN KEY ("replyToId") REFERENCES "Message"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Attachment" ADD CONSTRAINT "Attachment_groupId_fkey" FOREIGN KEY ("groupId") REFERENCES "Group"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Attachment" ADD CONSTRAINT "Attachment_uploaderMembershipId_fkey" FOREIGN KEY ("uploaderMembershipId") REFERENCES "Membership"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UploadTicket" ADD CONSTRAINT "UploadTicket_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UploadTicket" ADD CONSTRAINT "UploadTicket_groupId_fkey" FOREIGN KEY ("groupId") REFERENCES "Group"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Proposal" ADD CONSTRAINT "Proposal_groupId_fkey" FOREIGN KEY ("groupId") REFERENCES "Group"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Proposal" ADD CONSTRAINT "Proposal_proposerMembershipId_fkey" FOREIGN KEY ("proposerMembershipId") REFERENCES "Membership"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "VoteReceipt" ADD CONSTRAINT "VoteReceipt_proposalId_fkey" FOREIGN KEY ("proposalId") REFERENCES "Proposal"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "VoteReceipt" ADD CONSTRAINT "VoteReceipt_membershipId_fkey" FOREIGN KEY ("membershipId") REFERENCES "Membership"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Ballot" ADD CONSTRAINT "Ballot_proposalId_fkey" FOREIGN KEY ("proposalId") REFERENCES "Proposal"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Ballot" ADD CONSTRAINT "Ballot_membershipId_fkey" FOREIGN KEY ("membershipId") REFERENCES "Membership"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SolidarityRequest" ADD CONSTRAINT "SolidarityRequest_groupId_fkey" FOREIGN KEY ("groupId") REFERENCES "Group"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SolidarityRequest" ADD CONSTRAINT "SolidarityRequest_requesterMembershipId_fkey" FOREIGN KEY ("requesterMembershipId") REFERENCES "Membership"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SolidarityRequest" ADD CONSTRAINT "SolidarityRequest_recipientMembershipId_fkey" FOREIGN KEY ("recipientMembershipId") REFERENCES "Membership"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SolidarityRequest" ADD CONSTRAINT "SolidarityRequest_proposalId_fkey" FOREIGN KEY ("proposalId") REFERENCES "Proposal"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SolidarityRequest" ADD CONSTRAINT "SolidarityRequest_disbursementId_fkey" FOREIGN KEY ("disbursementId") REFERENCES "Disbursement"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Group" ADD CONSTRAINT "Group_createdByUserId_fkey" FOREIGN KEY ("createdByUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Group" ADD CONSTRAINT "Group_currentCycleId_fkey" FOREIGN KEY ("currentCycleId") REFERENCES "Cycle"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Membership" ADD CONSTRAINT "Membership_groupId_fkey" FOREIGN KEY ("groupId") REFERENCES "Group"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Membership" ADD CONSTRAINT "Membership_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Invite" ADD CONSTRAINT "Invite_groupId_fkey" FOREIGN KEY ("groupId") REFERENCES "Group"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Invite" ADD CONSTRAINT "Invite_proposalId_fkey" FOREIGN KEY ("proposalId") REFERENCES "Proposal"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Invite" ADD CONSTRAINT "Invite_acceptedByUserId_fkey" FOREIGN KEY ("acceptedByUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Invite" ADD CONSTRAINT "Invite_createdByMembershipId_fkey" FOREIGN KEY ("createdByMembershipId") REFERENCES "Membership"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RuleSet" ADD CONSTRAINT "RuleSet_groupId_fkey" FOREIGN KEY ("groupId") REFERENCES "Group"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RuleSet" ADD CONSTRAINT "RuleSet_effectiveFromRoundId_fkey" FOREIGN KEY ("effectiveFromRoundId") REFERENCES "Round"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RuleSet" ADD CONSTRAINT "RuleSet_createdByProposalId_fkey" FOREIGN KEY ("createdByProposalId") REFERENCES "Proposal"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Device" ADD CONSTRAINT "Device_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PaymentNumber" ADD CONSTRAINT "PaymentNumber_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RefreshToken" ADD CONSTRAINT "RefreshToken_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RefreshToken" ADD CONSTRAINT "RefreshToken_deviceId_fkey" FOREIGN KEY ("deviceId") REFERENCES "Device"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PinReset" ADD CONSTRAINT "PinReset_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PinResetApproval" ADD CONSTRAINT "PinResetApproval_pinResetId_fkey" FOREIGN KEY ("pinResetId") REFERENCES "PinReset"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PinResetApproval" ADD CONSTRAINT "PinResetApproval_membershipId_fkey" FOREIGN KEY ("membershipId") REFERENCES "Membership"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LedgerTransaction" ADD CONSTRAINT "LedgerTransaction_groupId_fkey" FOREIGN KEY ("groupId") REFERENCES "Group"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LedgerTransaction" ADD CONSTRAINT "LedgerTransaction_roundId_fkey" FOREIGN KEY ("roundId") REFERENCES "Round"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LedgerTransaction" ADD CONSTRAINT "LedgerTransaction_membershipId_fkey" FOREIGN KEY ("membershipId") REFERENCES "Membership"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LedgerPosting" ADD CONSTRAINT "LedgerPosting_transactionId_fkey" FOREIGN KEY ("transactionId") REFERENCES "LedgerTransaction"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Meeting" ADD CONSTRAINT "Meeting_groupId_fkey" FOREIGN KEY ("groupId") REFERENCES "Group"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AgendaItem" ADD CONSTRAINT "AgendaItem_meetingId_fkey" FOREIGN KEY ("meetingId") REFERENCES "Meeting"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AgendaItem" ADD CONSTRAINT "AgendaItem_authorMembershipId_fkey" FOREIGN KEY ("authorMembershipId") REFERENCES "Membership"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Attendance" ADD CONSTRAINT "Attendance_meetingId_fkey" FOREIGN KEY ("meetingId") REFERENCES "Meeting"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Attendance" ADD CONSTRAINT "Attendance_membershipId_fkey" FOREIGN KEY ("membershipId") REFERENCES "Membership"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Cycle" ADD CONSTRAINT "Cycle_groupId_fkey" FOREIGN KEY ("groupId") REFERENCES "Group"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Round" ADD CONSTRAINT "Round_groupId_fkey" FOREIGN KEY ("groupId") REFERENCES "Group"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Round" ADD CONSTRAINT "Round_cycleId_fkey" FOREIGN KEY ("cycleId") REFERENCES "Cycle"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Round" ADD CONSTRAINT "Round_beneficiaryMembershipId_fkey" FOREIGN KEY ("beneficiaryMembershipId") REFERENCES "Membership"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Obligation" ADD CONSTRAINT "Obligation_groupId_fkey" FOREIGN KEY ("groupId") REFERENCES "Group"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Obligation" ADD CONSTRAINT "Obligation_membershipId_fkey" FOREIGN KEY ("membershipId") REFERENCES "Membership"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Obligation" ADD CONSTRAINT "Obligation_roundId_fkey" FOREIGN KEY ("roundId") REFERENCES "Round"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Obligation" ADD CONSTRAINT "Obligation_loanId_fkey" FOREIGN KEY ("loanId") REFERENCES "Loan"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Obligation" ADD CONSTRAINT "Obligation_creditorMembershipId_fkey" FOREIGN KEY ("creditorMembershipId") REFERENCES "Membership"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PaymentIntent" ADD CONSTRAINT "PaymentIntent_groupId_fkey" FOREIGN KEY ("groupId") REFERENCES "Group"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PaymentIntent" ADD CONSTRAINT "PaymentIntent_membershipId_fkey" FOREIGN KEY ("membershipId") REFERENCES "Membership"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Disbursement" ADD CONSTRAINT "Disbursement_groupId_fkey" FOREIGN KEY ("groupId") REFERENCES "Group"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Disbursement" ADD CONSTRAINT "Disbursement_membershipId_fkey" FOREIGN KEY ("membershipId") REFERENCES "Membership"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Loan" ADD CONSTRAINT "Loan_groupId_fkey" FOREIGN KEY ("groupId") REFERENCES "Group"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Loan" ADD CONSTRAINT "Loan_membershipId_fkey" FOREIGN KEY ("membershipId") REFERENCES "Membership"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Loan" ADD CONSTRAINT "Loan_proposalId_fkey" FOREIGN KEY ("proposalId") REFERENCES "Proposal"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Loan" ADD CONSTRAINT "Loan_disbursementId_fkey" FOREIGN KEY ("disbursementId") REFERENCES "Disbursement"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Bid" ADD CONSTRAINT "Bid_roundId_fkey" FOREIGN KEY ("roundId") REFERENCES "Round"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Bid" ADD CONSTRAINT "Bid_membershipId_fkey" FOREIGN KEY ("membershipId") REFERENCES "Membership"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Statement" ADD CONSTRAINT "Statement_membershipId_fkey" FOREIGN KEY ("membershipId") REFERENCES "Membership"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Notification" ADD CONSTRAINT "Notification_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Notification" ADD CONSTRAINT "Notification_groupId_fkey" FOREIGN KEY ("groupId") REFERENCES "Group"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "NotificationPrefs" ADD CONSTRAINT "NotificationPrefs_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

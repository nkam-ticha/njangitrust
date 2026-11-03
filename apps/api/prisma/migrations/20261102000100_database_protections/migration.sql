-- Database protections that Prisma's schema language cannot express (spec 2.5, R1.1, R5.4,
-- R7.1, R11.4, R11.5, R13, D2). Hand-written; never regenerate.

-- 1. Ledger: append-only for every role, including the schema owner (spec 2.5, D2).
CREATE OR REPLACE FUNCTION njangi_forbid_change() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION '% is append-only: % is not allowed (corrections are new entries)',
    TG_TABLE_NAME, TG_OP
    USING ERRCODE = 'restrict_violation';
END;
$$;

CREATE TRIGGER "LedgerTransaction_append_only"
  BEFORE UPDATE OR DELETE ON "LedgerTransaction"
  FOR EACH ROW EXECUTE FUNCTION njangi_forbid_change();
CREATE TRIGGER "LedgerTransaction_no_truncate"
  BEFORE TRUNCATE ON "LedgerTransaction"
  FOR EACH STATEMENT EXECUTE FUNCTION njangi_forbid_change();
CREATE TRIGGER "LedgerPosting_append_only"
  BEFORE UPDATE OR DELETE ON "LedgerPosting"
  FOR EACH ROW EXECUTE FUNCTION njangi_forbid_change();
CREATE TRIGGER "LedgerPosting_no_truncate"
  BEFORE TRUNCATE ON "LedgerPosting"
  FOR EACH STATEMENT EXECUTE FUNCTION njangi_forbid_change();

-- 2. Ledger chain (2.5 invariant 5): seq is the previous seq + 1, starting at 1, and prevHash is
-- the previous hash, or SHA-256("njangitrust:" + groupId) for the first entry. The hash itself is
-- verified by the reconciliation job and tools/verify-ledger.
CREATE OR REPLACE FUNCTION njangi_check_ledger_chain() RETURNS trigger
LANGUAGE plpgsql AS $$
DECLARE
  previous_seq integer;
  previous_hash text;
BEGIN
  SELECT "seq", "hash" INTO previous_seq, previous_hash
    FROM "LedgerTransaction"
    WHERE "groupId" = NEW."groupId"
    ORDER BY "seq" DESC
    LIMIT 1;
  IF NOT FOUND THEN
    IF NEW."seq" <> 1 THEN
      RAISE EXCEPTION 'Ledger seq of group % must start at 1, got %', NEW."groupId", NEW."seq"
        USING ERRCODE = 'check_violation';
    END IF;
    IF NEW."prevHash" <> encode(sha256(convert_to('njangitrust:' || NEW."groupId"::text, 'UTF8')), 'hex') THEN
      RAISE EXCEPTION 'First ledger entry of group % must chain to the genesis hash', NEW."groupId"
        USING ERRCODE = 'check_violation';
    END IF;
  ELSE
    IF NEW."seq" <> previous_seq + 1 THEN
      RAISE EXCEPTION 'Ledger seq of group % must be %, got %', NEW."groupId", previous_seq + 1, NEW."seq"
        USING ERRCODE = 'check_violation';
    END IF;
    IF NEW."prevHash" <> previous_hash THEN
      RAISE EXCEPTION 'Ledger entry % of group % does not chain to the previous hash', NEW."seq", NEW."groupId"
        USING ERRCODE = 'check_violation';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER "LedgerTransaction_chain"
  BEFORE INSERT ON "LedgerTransaction"
  FOR EACH ROW EXECUTE FUNCTION njangi_check_ledger_chain();

-- 3. Double entry (2.5 invariant 1): checked when the database transaction commits, after all
-- postings of the ledger transaction are written.
CREATE OR REPLACE FUNCTION njangi_check_postings_balance() RETURNS trigger
LANGUAGE plpgsql AS $$
DECLARE
  total bigint;
BEGIN
  SELECT COALESCE(SUM("amount"), 0) INTO total
    FROM "LedgerPosting"
    WHERE "transactionId" = NEW."transactionId";
  IF total <> 0 THEN
    RAISE EXCEPTION 'Postings of ledger transaction % sum to %, not zero', NEW."transactionId", total
      USING ERRCODE = 'check_violation';
  END IF;
  RETURN NULL;
END;
$$;

CREATE CONSTRAINT TRIGGER "LedgerPosting_balanced"
  AFTER INSERT ON "LedgerPosting"
  DEFERRABLE INITIALLY DEFERRED
  FOR EACH ROW EXECUTE FUNCTION njangi_check_postings_balance();

-- Zero postings are omitted (2.5).
ALTER TABLE "LedgerPosting" ADD CONSTRAINT "LedgerPosting_amount_not_zero" CHECK ("amount" <> 0);
ALTER TABLE "LedgerTransaction" ADD CONSTRAINT "LedgerTransaction_seq_positive" CHECK ("seq" >= 1);

-- 4. Votes (R11.4, R11.5): a vote is never changed, and a secret proposal never has a Ballot.
CREATE OR REPLACE FUNCTION njangi_forbid_secret_ballot() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  IF EXISTS (SELECT 1 FROM "Proposal" WHERE "id" = NEW."proposalId" AND "secret") THEN
    RAISE EXCEPTION 'A secret proposal never stores ballots (R11.5)'
      USING ERRCODE = 'restrict_violation';
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER "Ballot_never_secret"
  BEFORE INSERT ON "Ballot"
  FOR EACH ROW EXECUTE FUNCTION njangi_forbid_secret_ballot();
CREATE TRIGGER "Ballot_final"
  BEFORE UPDATE OR DELETE ON "Ballot"
  FOR EACH ROW EXECUTE FUNCTION njangi_forbid_change();
CREATE TRIGGER "VoteReceipt_final"
  BEFORE UPDATE OR DELETE ON "VoteReceipt"
  FOR EACH ROW EXECUTE FUNCTION njangi_forbid_change();

CREATE OR REPLACE FUNCTION njangi_freeze_proposal_secrecy() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  IF NEW."secret" IS DISTINCT FROM OLD."secret"
     OR NEW."eligibleMembershipIds" IS DISTINCT FROM OLD."eligibleMembershipIds"
     OR NEW."type" IS DISTINCT FROM OLD."type" THEN
    RAISE EXCEPTION 'A proposal''s type, secrecy and eligible voters are fixed when it is created'
      USING ERRCODE = 'restrict_violation';
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER "Proposal_fixed_terms"
  BEFORE UPDATE ON "Proposal"
  FOR EACH ROW EXECUTE FUNCTION njangi_freeze_proposal_secrecy();

ALTER TABLE "Proposal" ADD CONSTRAINT "Proposal_counts_non_negative"
  CHECK ("yesCount" >= 0 AND "noCount" >= 0);

-- 5. One-of constraints (partial unique indexes).
-- R13.1: one active payment number per user; history is kept.
CREATE UNIQUE INDEX "PaymentNumber_one_active_per_user"
  ON "PaymentNumber" ("userId") WHERE "activeTo" IS NULL;
-- R1.1: exactly one admin per group (ADMIN_CHANGE demotes first, then promotes).
CREATE UNIQUE INDEX "Membership_one_admin_per_group"
  ON "Membership" ("groupId") WHERE "role" = 'ADMIN' AND "status" IN ('INVITED', 'ACTIVE', 'LEAVING');
-- R5.4: one withdrawal at a time per member.
CREATE UNIQUE INDEX "Disbursement_one_withdrawal_in_progress"
  ON "Disbursement" ("membershipId") WHERE "purpose" = 'WITHDRAWAL' AND "status" IN ('CREATED', 'PENDING');
-- R7.1: no new loan while one is active.
CREATE UNIQUE INDEX "Loan_one_active_per_member"
  ON "Loan" ("membershipId") WHERE "status" IN ('REQUESTED', 'APPROVED', 'DISBURSED', 'OVERDUE');
-- Spec 2.10: one PIN reset in progress per user.
CREATE UNIQUE INDEX "PinReset_one_open_per_user"
  ON "PinReset" ("userId") WHERE "status" IN ('REQUESTED', 'APPROVED');

-- 6. Value checks.
ALTER TABLE "User" ADD CONSTRAINT "User_loginPhone_e164"
  CHECK ("loginPhone" ~ '^\+2376[0-9]{8}$' OR "deletedAt" IS NOT NULL);
ALTER TABLE "PaymentNumber" ADD CONSTRAINT "PaymentNumber_number_e164"
  CHECK ("number" ~ '^\+2376[0-9]{8}$');
ALTER TABLE "PaymentNumber" ADD CONSTRAINT "PaymentNumber_active_range"
  CHECK ("activeTo" IS NULL OR "activeTo" >= "activeFrom");
ALTER TABLE "Membership" ADD CONSTRAINT "Membership_activeFromCycle_positive"
  CHECK ("activeFromCycle" IS NULL OR "activeFromCycle" >= 1);
ALTER TABLE "Obligation" ADD CONSTRAINT "Obligation_amount_non_negative" CHECK ("amount" >= 0);
ALTER TABLE "PaymentIntent" ADD CONSTRAINT "PaymentIntent_amounts_non_negative"
  CHECK ("amount" > 0 AND ("fee" IS NULL OR "fee" >= 0));
ALTER TABLE "Disbursement" ADD CONSTRAINT "Disbursement_amounts_non_negative"
  CHECK ("amount" > 0 AND "feeEstimated" >= 0 AND ("feeActual" IS NULL OR "feeActual" >= 0));
ALTER TABLE "Loan" ADD CONSTRAINT "Loan_amounts_non_negative"
  CHECK ("principal" > 0 AND "months" >= 1 AND "ratePermille" >= 0 AND "interest" >= 0
         AND "feeEstimated" >= 0 AND "totalDue" >= "principal");
ALTER TABLE "Bid" ADD CONSTRAINT "Bid_amount_non_negative" CHECK ("amount" >= 0);
ALTER TABLE "SolidarityRequest" ADD CONSTRAINT "SolidarityRequest_amount_positive" CHECK ("amount" > 0);
-- Spec 1.8: security notifications can never be turned off.
ALTER TABLE "NotificationPrefs" ADD CONSTRAINT "NotificationPrefs_security_always_on"
  CHECK (NOT ('SECURITY' = ANY ("mutedCategories")));
ALTER TABLE "NotificationPrefs" ADD CONSTRAINT "NotificationPrefs_quiet_hours_range"
  CHECK ("quietStartMinute" BETWEEN 0 AND 1439 AND "quietEndMinute" BETWEEN 0 AND 1439);

-- 7. Privileges (D2). The API connects as njangi_app: read and write on ordinary tables, but no
-- UPDATE, DELETE or TRUNCATE on the ledger, on votes or on the audit log, and no access to
-- Prisma's migration table. Guarded so it runs where the role doesn't exist (CI).
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'njangi_app') THEN
    GRANT USAGE ON SCHEMA public TO njangi_app;
    GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO njangi_app;
    GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO njangi_app;
    -- Tables created by later migrations (run as the schema owner) get the same defaults; a
    -- migration that adds an append-only table must revoke on it explicitly, as below.
    ALTER DEFAULT PRIVILEGES IN SCHEMA public
      GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO njangi_app;
    ALTER DEFAULT PRIVILEGES IN SCHEMA public
      GRANT USAGE, SELECT ON SEQUENCES TO njangi_app;
    REVOKE UPDATE, DELETE, TRUNCATE ON "LedgerTransaction", "LedgerPosting" FROM njangi_app;
    REVOKE UPDATE, DELETE, TRUNCATE ON "VoteReceipt", "Ballot", "AuditLog" FROM njangi_app;
    REVOKE TRUNCATE ON ALL TABLES IN SCHEMA public FROM njangi_app;
    IF to_regclass('public._prisma_migrations') IS NOT NULL THEN
      REVOKE ALL ON "_prisma_migrations" FROM njangi_app;
    END IF;
  END IF;
END
$$;

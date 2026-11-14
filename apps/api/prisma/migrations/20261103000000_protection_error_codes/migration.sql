-- Stable SQLSTATEs for the protections of 20261102000100_database_protections, so a refusal is
-- reported as itself rather than as a generic constraint error:
--   NJL01 ledger row changed or deleted     NJL02 ledger chain broken
--   NJL03 postings don't sum to zero        NJV01 ballot for a secret proposal
--   NJV02 proposal terms changed

CREATE OR REPLACE FUNCTION njangi_forbid_change() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION '% is append-only: % is not allowed (corrections are new entries)',
    TG_TABLE_NAME, TG_OP
    USING ERRCODE = 'NJL01';
END;
$$;

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
        USING ERRCODE = 'NJL02';
    END IF;
    IF NEW."prevHash" <> encode(sha256(convert_to('njangitrust:' || NEW."groupId"::text, 'UTF8')), 'hex') THEN
      RAISE EXCEPTION 'First ledger entry of group % must chain to the genesis hash', NEW."groupId"
        USING ERRCODE = 'NJL02';
    END IF;
  ELSE
    IF NEW."seq" <> previous_seq + 1 THEN
      RAISE EXCEPTION 'Ledger seq of group % must be %, got %', NEW."groupId", previous_seq + 1, NEW."seq"
        USING ERRCODE = 'NJL02';
    END IF;
    IF NEW."prevHash" <> previous_hash THEN
      RAISE EXCEPTION 'Ledger entry % of group % does not chain to the previous hash', NEW."seq", NEW."groupId"
        USING ERRCODE = 'NJL02';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

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
      USING ERRCODE = 'NJL03';
  END IF;
  RETURN NULL;
END;
$$;

CREATE OR REPLACE FUNCTION njangi_forbid_secret_ballot() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  IF EXISTS (SELECT 1 FROM "Proposal" WHERE "id" = NEW."proposalId" AND "secret") THEN
    RAISE EXCEPTION 'A secret proposal never stores ballots (R11.5)'
      USING ERRCODE = 'NJV01';
  END IF;
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION njangi_freeze_proposal_secrecy() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  IF NEW."secret" IS DISTINCT FROM OLD."secret"
     OR NEW."eligibleMembershipIds" IS DISTINCT FROM OLD."eligibleMembershipIds"
     OR NEW."type" IS DISTINCT FROM OLD."type" THEN
    RAISE EXCEPTION 'A proposal''s type, secrecy and eligible voters are fixed when it is created'
      USING ERRCODE = 'NJV02';
  END IF;
  RETURN NEW;
END;
$$;

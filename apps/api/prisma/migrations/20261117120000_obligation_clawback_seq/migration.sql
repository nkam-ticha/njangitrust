-- The seq of the CLAWBACK ledger entry a CORRECTION debt came from (D16.1, D17), so a release of that
-- clawback (owner Q1, Q3) cancels exactly this debt. Null for every other obligation.
ALTER TABLE "Obligation" ADD COLUMN "clawbackSeq" INTEGER;

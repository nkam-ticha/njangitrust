-- D28: a developer closes a group and hides it from its members. Null for every group that is visible.
-- Additive: no existing row or constraint changes, and the ledger tables are not touched.
ALTER TABLE "Group" ADD COLUMN "hiddenByDeveloperAt" TIMESTAMPTZ(3);

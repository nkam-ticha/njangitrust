-- D40, #76: a group has at most one open cycle. The end-of-cycle job closes a cycle exactly once
-- (it claims `closedAt`) and the next cycle starts only after the previous one is closed; this
-- partial unique index makes a second open cycle impossible even if two requests race.
-- Additive: no data changes. Checked read-only on production: no group has two open cycles.
CREATE UNIQUE INDEX "Cycle_one_open_per_group" ON "Cycle" ("groupId") WHERE "closedAt" IS NULL;

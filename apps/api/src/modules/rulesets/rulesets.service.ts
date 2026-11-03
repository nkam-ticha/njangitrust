// Rule sets (3.2, R11). Defaults, ranges and validation come from @njangi/rules; this service
// only assembles the creator's choices and stores versions.
import {
  DEFAULT_RULE_SET,
  monthlyAnchorFromFirstPayout,
  toDoualaLocal,
  validateRuleSet,
  type RuleSetParams,
} from '@njangi/rules';
import type { CreateGroupRequest } from '@njangi/shared/contracts/groups';
import { getPrisma, type Db, type Prisma, type RuleSet } from '../../lib/prisma';
import { authorizeGroup } from '../../permissions';
import { parameterRefusalToError, rulesetError } from './rulesets.errors';

/**
 * The first rule set of a new group: the 3.2 defaults, the creator's changes, and the payout time
 * taken from the first payout (Douala time) with its monthly pattern (DECISIONS Q1).
 */
export function buildInitialRuleSet(input: {
  firstPayoutAt: Date;
  monthlyAnchor?: CreateGroupRequest['monthlyAnchor'];
  rules?: CreateGroupRequest['rules'];
}): RuleSetParams {
  const anchor = monthlyAnchorFromFirstPayout(input.firstPayoutAt, input.monthlyAnchor ?? 'DAY_OF_MONTH');
  if (!anchor.ok) throw rulesetError(anchor.code);
  const local = toDoualaLocal(input.firstPayoutAt);
  const params: RuleSetParams = {
    ...DEFAULT_RULE_SET,
    ...(input.rules ?? {}),
    payoutTime: { hour: local.hour, minute: local.minute, monthlyAnchor: anchor.anchor },
  };
  const check = validateRuleSet(params);
  if (!check.ok) throw parameterRefusalToError(check);
  return params;
}

export async function createRuleSetVersion(
  db: Db,
  input: { groupId: string; version: number; params: RuleSetParams; createdByProposalId?: string | null },
): Promise<RuleSet> {
  const check = validateRuleSet(input.params);
  if (!check.ok) throw parameterRefusalToError(check);
  return db.ruleSet.create({
    data: {
      groupId: input.groupId,
      version: input.version,
      params: input.params as unknown as Prisma.InputJsonValue,
      createdByProposalId: input.createdByProposalId ?? null,
    },
  });
}

/** The group's latest rule set version. Phase 5 adds versions that take effect at a later round. */
export async function getCurrentRuleSet(groupId: string, db: Db = getPrisma()): Promise<RuleSet> {
  return db.ruleSet.findFirstOrThrow({ where: { groupId }, orderBy: { version: 'desc' } });
}

/** The current params, re-validated by the rules engine before use. */
export async function getCurrentParams(groupId: string, db: Db = getPrisma()): Promise<RuleSetParams> {
  const params = (await getCurrentRuleSet(groupId, db)).params as unknown as RuleSetParams;
  const check = validateRuleSet(params);
  if (!check.ok) throw new Error(`Stored rule set of group ${groupId} is invalid: ${check.code}`);
  return params;
}

/** GET /groups/:id/rules. */
export async function readRules(userId: string, groupId: string): Promise<RuleSet> {
  await authorizeGroup(userId, groupId, 'group.rules.read');
  return getCurrentRuleSet(groupId);
}

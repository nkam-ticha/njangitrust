// Every proposal type of R11.1, by type.
import type { ProposalType } from '@njangi/rules';
import { adminChange } from './admin-change';
import type { ProposalDefinition } from './definition';
import { memberAdd } from './member-add';
import { earlyExit, memberRemove } from './member-exit';
import { adminLoan, fineWaiver, ledgerCorrection } from './money-proposals';
import { rotationChange } from './rotation-change';
import { ruleChange } from './rule-change';
import { solidarityPayout } from './solidarity-payout';

const DEFINITIONS: Record<ProposalType, ProposalDefinition<unknown, unknown>> = {
  RULE_CHANGE: ruleChange,
  MEMBER_ADD: memberAdd,
  MEMBER_REMOVE: memberRemove,
  ROTATION_CHANGE: rotationChange,
  ADMIN_CHANGE: adminChange,
  EARLY_EXIT: earlyExit,
  ADMIN_LOAN: adminLoan,
  SOLIDARITY_PAYOUT: solidarityPayout,
  FINE_WAIVER: fineWaiver,
  LEDGER_CORRECTION: ledgerCorrection,
};

export function proposalDefinition(type: ProposalType): ProposalDefinition<unknown, unknown> {
  return DEFINITIONS[type];
}

export { memberAddPayloadSchema, readMemberAddPayload, type MemberAddPayload } from './member-add';
export type { ActiveMember, ApplyContext, PlanContext, ProposalDefinition } from './definition';

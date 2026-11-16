// Proposals whose effect moves money, carried out by the money modules through the governance
// ports: ADMIN_LOAN (R7.4), FINE_WAIVER (R6.4), LEDGER_CORRECTION (R11.1, LED-03).
import { formatXAF, type Bilingual } from '@njangi/shared';
import { textSchema } from '@njangi/shared/contracts/common';
import { z } from 'zod';
import { ui } from '../../../lib/texts';
import { moneyOperation, moneyPort } from '../governance-ports';
import { proposalError } from '../proposals.errors';
import { appliedOn, defineProposal, memberRef, nameOf } from './definition';
import { assertNoOpenProposalAbout } from './membership-end';

export function amountText(amount: number): Bilingual {
  return { fr: formatXAF(amount, 'fr'), en: formatXAF(amount, 'en') };
}

function port() {
  const p = moneyPort();
  if (!p) throw proposalError('PROPOSAL_TYPE_UNAVAILABLE');
  return p;
}

/** The loans module's decision for an ADMIN_LOAN vote. */
function loans() {
  const decide = moneyOperation('decideAdminLoan');
  if (!decide) throw proposalError('PROPOSAL_TYPE_UNAVAILABLE');
  return decide;
}

const adminLoanPayload = z.strictObject({
  loanId: z.string().uuid(),
  membershipId: z.string().uuid(),
  amount: z.number().int().positive(),
  months: z.number().int().positive(),
});

/** Opened by the loans module when the admin asks for a loan (never proposed directly). */
export const adminLoan = defineProposal({
  type: 'ADMIN_LOAN',
  input: adminLoanPayload,
  payload: adminLoanPayload,

  plan(ctx, args) {
    loans();
    if (args.membershipId !== ctx.proposer.id || ctx.proposer.role !== 'ADMIN') {
      throw proposalError('ADMIN_LOAN_NOT_PROPOSABLE');
    }
    return Promise.resolve({
      payload: args,
      subjectMembershipId: args.membershipId,
      excludedMembershipId: args.membershipId,
      mustApprove: [],
      notes: [ui((c) => c.confirmation.notes.loanAdminVote)],
    });
  },

  describe(p, names) {
    return {
      title: ui((c) => c.votes.titles.adminLoan, {
        amount: amountText(p.amount),
        name: nameOf(names, p.membershipId),
      }),
      subject: {
        type: 'ADMIN_LOAN',
        member: memberRef(names, p.membershipId),
        amount: p.amount,
        months: p.months,
      },
    };
  },

  async apply(ctx, p) {
    await loans()(
      ctx.tx,
      {
        groupId: ctx.group.id,
        loanId: p.loanId,
        approved: true,
        proposalId: ctx.proposal.id,
        now: ctx.now,
      },
      ctx.effects,
    );
    return appliedOn(ctx.now);
  },

  async onNotPassed(ctx, p) {
    await moneyOperation('decideAdminLoan')?.(
      ctx.tx,
      {
        groupId: ctx.group.id,
        loanId: p.loanId,
        approved: false,
        proposalId: ctx.proposal.id,
        now: ctx.now,
      },
      ctx.effects,
    );
  },
});

const fineInput = z.strictObject({ obligationId: z.string().uuid() });
const finePayload = fineInput.extend({
  membershipId: z.string().uuid(),
  amount: z.number().int(),
  roundNumber: z.number().int().nullable(),
});

export const fineWaiver = defineProposal({
  type: 'FINE_WAIVER',
  input: fineInput,
  payload: finePayload,

  async plan(ctx, args) {
    const fine = await port().describeFine(ctx.db, {
      groupId: ctx.group.id,
      obligationId: args.obligationId,
    });
    if (!fine) throw proposalError('FINE_NOT_FOUND');
    if (!fine.waivable) throw proposalError('FINE_NOT_WAIVABLE');
    await assertNoOpenProposalAbout(ctx, 'FINE_WAIVER', fine.membershipId);
    return {
      payload: {
        obligationId: args.obligationId,
        membershipId: fine.membershipId,
        amount: fine.amount,
        roundNumber: fine.roundNumber,
      },
      subjectMembershipId: fine.membershipId,
      excludedMembershipId: fine.membershipId,
      mustApprove: [],
      notes: [],
    };
  },

  describe(p, names) {
    return {
      title: ui((c) => c.votes.titles.fineWaiver, {
        round: p.roundNumber ?? '—',
        name: nameOf(names, p.membershipId),
      }),
      subject: {
        type: 'FINE_WAIVER',
        member: memberRef(names, p.membershipId),
        amount: p.amount,
        roundNumber: p.roundNumber,
      },
    };
  },

  async apply(ctx, p) {
    await port().waiveFine(ctx.tx, {
      groupId: ctx.group.id,
      obligationId: p.obligationId,
      proposalId: ctx.proposal.id,
    });
    return appliedOn(ctx.now);
  },
});

const correctionPayload = z.strictObject({
  seq: z.number().int().min(1),
  correction: textSchema(1_000),
});

export const ledgerCorrection = defineProposal({
  type: 'LEDGER_CORRECTION',
  input: correctionPayload,
  payload: correctionPayload,

  async plan(ctx, args) {
    const entry = await port().describeLedgerEntry(ctx.db, {
      groupId: ctx.group.id,
      seq: args.seq,
    });
    if (!entry?.correctable) throw proposalError('LEDGER_ENTRY_NOT_CORRECTABLE');
    const open = await ctx.db.proposal.count({
      where: {
        groupId: ctx.group.id,
        type: 'LEDGER_CORRECTION',
        status: 'OPEN',
        payload: { path: ['seq'], equals: args.seq },
      },
    });
    if (open > 0) throw proposalError('PROPOSAL_ALREADY_OPEN');
    return {
      payload: args,
      subjectMembershipId: null,
      excludedMembershipId: null,
      mustApprove: [],
      notes: [],
    };
  },

  describe(p) {
    return {
      title: ui((c) => c.votes.titles.ledgerCorrection, { seq: p.seq }),
      subject: { type: 'LEDGER_CORRECTION', seq: p.seq, correction: p.correction },
    };
  },

  async apply(ctx, p) {
    await port().correctLedger(ctx.tx, {
      groupId: ctx.group.id,
      seq: p.seq,
      correction: p.correction,
      proposalId: ctx.proposal.id,
    });
    return appliedOn(ctx.now);
  },
});

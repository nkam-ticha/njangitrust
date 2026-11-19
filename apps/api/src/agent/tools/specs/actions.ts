// Spec 4.6 "Actions (L1, one tap)" and "Sensitive actions (L2, tap and PIN)". Each of these only
// PREPARES a PendingAction through the services; the member confirms it in the app (spec 4.5).
// None is ever offered in the group chat: the agent never acts there (4.4).
import { ruleChangesSchema } from '@njangi/shared/contracts/proposals';
import { z } from 'zod';
import { defineSpec, type ToolCategory } from '../types';
import { amountArg, idArg, memberArg, PRIVATE, reasonArg, roundArg, s, textArg } from './common';

const l1 = (category: ToolCategory, who: 'member' | 'admin' = 'member') =>
  ({ level: 'L1', who, category, channels: PRIVATE }) as const;
const phoneArg = z
  .string()
  .min(8)
  .max(32)
  .describe(
    'The number as written in the member’s message, normally a marker such as [phone-1]: pass it exactly as written. Never repeat it in your reply.',
  );
const meetingArg = idArg('meeting').optional().describe('Omit for the next meeting.');

export const actionSpecs = {
  pay: defineSpec({
    ...l1('payments'),
    name: 'pay',
    needs: 'money',
    description:
      'Prepares payment of the member’s obligations for a round (the oldest unpaid one when round is omitted), optionally with due debts. If the member does not name a round, omit round entirely; never pass a guessed value, null, or the string "None".',
    args: s({
      round: roundArg.optional(),
      includeDueDebts: z.boolean().optional(),
      amount: amountArg
        .optional()
        .describe('Ignored; the server computes the exact dues from the ledger.'),
    }),
    example: {},
  }),
  pay_debts: defineSpec({
    ...l1('payments'),
    name: 'pay_debts',
    needs: 'money',
    description:
      'Prepares paying the member’s due fines and installments (all due ones by default). Use only when the member specifically asks to pay debts or fines; for a general request to pay, use pay so the oldest unpaid round is handled first.',
    args: s({ items: z.array(z.string().uuid()).min(1).max(50).optional() }),
    example: {},
  }),
  withdraw: defineSpec({
    ...l1('payments'),
    name: 'withdraw',
    needs: 'money',
    description:
      'Prepares a withdrawal to the member’s own payment number: an amount, or all: true for everything available.',
    args: s({ amount: amountArg.optional(), all: z.literal(true).optional() }).refine(
      (v) => (v.amount === undefined) !== (v.all === undefined),
      'AMOUNT_OR_ALL',
    ),
    example: { all: true },
  }),
  request_loan: defineSpec({
    ...l1('loans'),
    name: 'request_loan',
    needs: 'money',
    description: 'Prepares a loan request (amount and months as the member asked).',
    args: s({ amount: amountArg, months: z.number().int().min(1).max(6) }),
    example: { amount: 30_000, months: 3 },
  }),
  repay_loan: defineSpec({
    ...l1('loans'),
    name: 'repay_loan',
    needs: 'money',
    description: 'Prepares an early or due loan repayment (the next installment by default).',
    args: s({ amount: amountArg.optional() }),
    example: {},
  }),
  decide_loan: defineSpec({
    ...l1('loans', 'admin'),
    name: 'decide_loan',
    needs: 'money',
    description: 'Admin: prepares approving or rejecting a member’s loan request, with a reason.',
    args: s({ loanId: idArg('loan'), decision: z.enum(['approve', 'reject']), reason: reasonArg }),
    example: { loanId: '00000000-0000-4000-8000-000000000002', decision: 'approve', reason: 'OK' },
  }),
  place_bid: defineSpec({
    ...l1('loans'),
    name: 'place_bid',
    needs: 'money',
    description: 'Bidding mode: prepares a sealed bid, or a raise, for a round.',
    args: s({ round: roundArg.optional(), amount: amountArg }),
    example: { round: 6, amount: 4_000 },
  }),
  propose_rule_change: defineSpec({
    ...l1('governance'),
    name: 'propose_rule_change',
    description:
      'Prepares a RULE_CHANGE proposal: only the rules that change, with their new values (FCFA amounts, rates in permille).',
    args: s({ changes: ruleChangesSchema, reason: reasonArg.optional() }),
    example: { changes: { lateFine: 500 } },
  }),
  propose_member_add: defineSpec({
    ...l1('governance'),
    name: 'propose_member_add',
    description: 'Prepares a MEMBER_ADD proposal for a new person.',
    args: s({
      name: textArg(60, 'Full name of the person.'),
      phone: phoneArg,
      reason: reasonArg.optional(),
    }),
    example: { name: 'Hervé Kamga', phone: '655 44 33 22' },
  }),
  propose_member_removal: defineSpec({
    ...l1('governance'),
    name: 'propose_member_removal',
    description: 'Prepares a MEMBER_REMOVE proposal (secret vote).',
    args: s({ member: memberArg, reason: reasonArg }),
    example: { member: 'Joël', reason: 'Absences répétées' },
  }),
  propose_rotation_change: defineSpec({
    ...l1('governance'),
    name: 'propose_rotation_change',
    description: 'Prepares a ROTATION_CHANGE proposal swapping the turns of two members.',
    args: s({ swap: z.array(memberArg).length(2), reason: reasonArg.optional() }),
    example: { swap: ['Paul', 'Carine'] },
  }),
  propose_admin_change: defineSpec({
    ...l1('governance'),
    name: 'propose_admin_change',
    description: 'Prepares an ADMIN_CHANGE proposal (secret vote) electing another member admin.',
    args: s({ member: memberArg, reason: reasonArg.optional() }),
    example: { member: 'Carine' },
  }),
  propose_fine_waiver: defineSpec({
    ...l1('governance'),
    name: 'propose_fine_waiver',
    description: 'Prepares a FINE_WAIVER proposal for a fine (its id from the ledger or overview).',
    args: s({ fineId: idArg('fine'), reason: reasonArg }),
    example: { fineId: '00000000-0000-4000-8000-000000000003', reason: 'Malade ce jour-là' },
  }),
  propose_ledger_correction: defineSpec({
    ...l1('governance'),
    name: 'propose_ledger_correction',
    description:
      'Prepares a LEDGER_CORRECTION proposal: entries are never deleted, a mistake is corrected by a vote.',
    args: s({
      seq: z.number().int().min(1).describe('The ledger entry number.'),
      correction: textArg(1_000, 'What is wrong and what the correct entry should be.'),
      reason: reasonArg,
    }),
    example: { seq: 12, correction: 'Payé deux fois', reason: 'Erreur de l’opérateur' },
  }),
  request_early_exit: defineSpec({
    ...l1('governance'),
    name: 'request_early_exit',
    description: 'Prepares an EARLY_EXIT proposal: the member leaves before the end of the cycle.',
    args: s({ reason: reasonArg }),
    example: { reason: 'Je déménage' },
  }),
  announce_leave_at_cycle_end: defineSpec({
    ...l1('governance'),
    name: 'announce_leave_at_cycle_end',
    description: 'Prepares announcing that the member leaves when the cycle ends (no vote needed).',
    args: s({}),
    example: {},
  }),
  cast_vote: defineSpec({
    ...l1('governance'),
    name: 'cast_vote',
    description: 'Prepares the member’s vote on an open proposal (its id from list_proposals).',
    args: s({ proposalId: idArg('proposal'), choice: z.enum(['yes', 'no']) }),
    example: { proposalId: '00000000-0000-4000-8000-000000000001', choice: 'yes' },
  }),
  request_solidarity: defineSpec({
    ...l1('governance'),
    name: 'request_solidarity',
    description:
      'Prepares a solidarity fund request (SOLIDARITY_PAYOUT vote) for a member’s life event.',
    args: s({
      recipient: memberArg,
      event: z.enum(['DEUIL', 'NAISSANCE', 'MALADIE', 'MARIAGE', 'AUTRE']),
      amount: amountArg,
      note: textArg(300, 'Optional note visible to the group.').optional(),
    }),
    example: { recipient: 'Mireille', event: 'NAISSANCE', amount: 20_000 },
  }),
  ...meetingAndChatSpecs(),
  change_payment_number: defineSpec({
    level: 'L2',
    who: 'member',
    category: 'account',
    channels: PRIVATE,
    needs: 'account',
    name: 'change_payment_number',
    description:
      'Prepares changing the member’s OWN payment number (card, then their PIN). Withdrawals to a new number are held.',
    args: s({ number: phoneArg, operator: z.enum(['MTN', 'ORANGE']).optional() }),
    example: { number: '677 12 34 56', operator: 'MTN' },
  }),
  delete_my_account: defineSpec({
    level: 'L2',
    who: 'member',
    category: 'account',
    channels: PRIVATE,
    needs: 'account',
    name: 'delete_my_account',
    description:
      'Prepares deleting the member’s account (card, then their PIN); refused while they have obligations or money left in a group.',
    args: s({}),
    example: {},
  }),
};

function meetingAndChatSpecs() {
  return {
    add_agenda_item: defineSpec({
      ...l1('meetings'),
      name: 'add_agenda_item',
      needs: 'meetings',
      description: 'Prepares adding an item to a meeting’s agenda.',
      args: s({ text: textArg(300, 'The agenda item.'), meetingId: meetingArg }),
      example: { text: 'Point sur les retards' },
    }),
    check_in: defineSpec({
      ...l1('meetings'),
      name: 'check_in',
      needs: 'meetings',
      description: 'Prepares signalling the member’s presence at a meeting.',
      args: s({ meetingId: meetingArg }),
      example: {},
    }),
    send_absence_excuse: defineSpec({
      ...l1('meetings'),
      name: 'send_absence_excuse',
      needs: 'meetings',
      description: 'Prepares the member’s excuse before a meeting.',
      args: s({ reason: reasonArg, meetingId: meetingArg }),
      example: { reason: 'Voyage' },
    }),
    schedule_meeting: defineSpec({
      ...l1('meetings', 'admin'),
      name: 'schedule_meeting',
      needs: 'meetings',
      description: 'Admin: prepares a meeting. The card shows the date for the admin to check.',
      args: s({
        date: z.string().date().describe('YYYY-MM-DD.'),
        time: z
          .string()
          .regex(/^([01]\d|2[0-3]):[0-5]\d$/)
          .describe('HH:MM, Douala time.'),
        place: textArg(120, 'A place or a link.'),
      }),
      example: { date: '2026-11-21', time: '16:00', place: 'Chez Nkam' },
    }),
    mark_attendance: defineSpec({
      ...l1('meetings', 'admin'),
      name: 'mark_attendance',
      needs: 'meetings',
      description: 'Admin: prepares marking a member present or absent at a meeting.',
      args: s({ meetingId: idArg('meeting'), member: memberArg, present: z.boolean() }),
      example: { meetingId: '00000000-0000-4000-8000-000000000004', member: 'Paul', present: true },
    }),
    draft_minutes: defineSpec({
      level: 'L0',
      who: 'admin',
      category: 'meetings',
      channels: PRIVATE,
      name: 'draft_minutes',
      needs: 'meetings',
      description:
        'Admin: fills the minutes (procès-verbal) template from the meeting’s agenda, attendance, votes and payments, plus the admin’s notes. Nothing is published.',
      args: s({
        meetingId: idArg('meeting'),
        notes: textArg(2_000, 'The admin’s notes.').optional(),
      }),
      example: { meetingId: '00000000-0000-4000-8000-000000000004' },
    }),
    publish_minutes: defineSpec({
      ...l1('meetings', 'admin'),
      name: 'publish_minutes',
      needs: 'meetings',
      description:
        'Admin: prepares publishing a meeting’s minutes (they cannot be edited afterwards).',
      args: s({ meetingId: idArg('meeting'), text: textArg(10_000, 'The final minutes.') }),
      example: { meetingId: '00000000-0000-4000-8000-000000000004', text: 'Procès-verbal…' },
    }),
    post_to_group: defineSpec({
      ...l1('chat'),
      name: 'post_to_group',
      needs: 'chat',
      description: 'Prepares a message in the group chat on the member’s behalf.',
      args: s({ text: textArg(1_000, 'The message, as the member wants it.') }),
      example: { text: 'Bonjour à tous' },
    }),
    post_announcement: defineSpec({
      ...l1('chat', 'admin'),
      name: 'post_announcement',
      needs: 'chat',
      description: 'Admin: prepares a pinned announcement in the group chat.',
      args: s({ text: textArg(1_000, 'The announcement.') }),
      example: { text: 'Réunion samedi' },
    }),
    hide_message: defineSpec({
      ...l1('chat', 'admin'),
      name: 'hide_message',
      needs: 'chat',
      description: 'Admin: prepares hiding an abusive chat message (logged).',
      args: s({ messageId: idArg('message'), reason: reasonArg }),
      example: { messageId: '00000000-0000-4000-8000-000000000005', reason: 'Insulte' },
    }),
    create_invite: defineSpec({
      ...l1('governance', 'admin'),
      name: 'create_invite',
      description:
        'Admin: prepares an invite link for a founding member (before the first cycle) or for a passed MEMBER_ADD proposal.',
      args: s({
        name: textArg(60, 'Full name of the person.'),
        phone: phoneArg,
        proposalId: idArg('MEMBER_ADD proposal').optional(),
      }),
      example: { name: 'Hervé Kamga', phone: '655 44 33 22' },
    }),
    start_cycle: defineSpec({
      ...l1('governance', 'admin'),
      name: 'start_cycle',
      description: 'Admin: prepares starting the first cycle (at least 3 active members).',
      args: s({}),
      example: {},
    }),
  };
}

// Spec 4.6 "Reading (L0)": tools that only look. Group-visible ones also answer @njangi in the chat.
import { z } from 'zod';
import { defineSpec } from '../types';
import { BOTH, idArg, memberArg, PRIVATE, roundArg, s } from './common';

const L0 = { level: 'L0', who: 'member', category: 'reading' } as const;

export const readingSpecs = {
  get_my_overview: defineSpec({
    ...L0,
    name: 'get_my_overview',
    channels: PRIVATE,
    needs: 'money',
    description:
      'What the member owes and by when, their turn and its date, money available and locked, debts, loan, withdrawal hold, reliability. scope "all": the same for each of their groups, with totals from the server.',
    args: s({ scope: z.enum(['group', 'all']).optional() }),
    example: { scope: 'group' },
  }),
  get_round: defineSpec({
    ...L0,
    name: 'get_round',
    channels: BOTH,
    needs: 'money',
    description:
      'A round: number, beneficiary, payment deadline, payout time, paid and unpaid counts, amount collected.',
    args: s({ round: roundArg.optional() }),
    example: {},
  }),
  list_unpaid: defineSpec({
    ...L0,
    name: 'list_unpaid',
    channels: BOTH,
    needs: 'money',
    description: 'Names of the members who have not paid a round yet.',
    args: s({ round: roundArg.optional() }),
    example: {},
  }),
  get_payout_breakdown: defineSpec({
    ...L0,
    name: 'get_payout_breakdown',
    channels: BOTH,
    needs: 'money',
    description:
      'A round’s payout: gross collected, fees, deductions, net, withdrawn, remaining, and the withdrawal fee.',
    args: s({ round: roundArg.optional() }),
    example: {},
  }),
  get_funds: defineSpec({
    ...L0,
    name: 'get_funds',
    channels: BOTH,
    needs: 'money',
    description:
      'General fund, money available for loans, solidarity fund, money reserved for members, last daily check.',
    args: s({}),
    example: {},
  }),
  get_ledger: defineSpec({
    ...L0,
    name: 'get_ledger',
    channels: BOTH,
    needs: 'money',
    description: 'Ledger (registre) entries, newest first, optionally filtered.',
    args: s({
      member: memberArg.optional(),
      type: z.string().min(1).max(40).optional().describe('Entry type, e.g. FINE_ASSESSED.'),
      from: z.string().date().optional().describe('First day, YYYY-MM-DD.'),
      to: z.string().date().optional().describe('Last day, YYYY-MM-DD.'),
      limit: z.number().int().min(1).max(50).optional(),
    }),
    example: { limit: 10 },
  }),
  get_rules: defineSpec({
    ...L0,
    name: 'get_rules',
    channels: BOTH,
    description:
      'The group’s current rules with their values, the rule set version, and open rule proposals.',
    args: s({}),
    example: {},
  }),
  explain_rule: defineSpec({
    ...L0,
    name: 'explain_rule',
    channels: BOTH,
    description:
      'The official text of the rules about a topic (fine, loan, payout, vote, solidarity fund, payment number…), or a rule id such as R6.1, in the member’s language.',
    args: s({ topic: z.string().min(1).max(120) }),
    example: { topic: 'amende' },
  }),
  list_members: defineSpec({
    ...L0,
    name: 'list_members',
    channels: BOTH,
    description: 'Members of the active group: name, role, status. Never a phone number.',
    args: s({}),
    example: {},
  }),
  get_member: defineSpec({
    ...L0,
    name: 'get_member',
    channels: BOTH,
    description: 'One member’s public profile: name, role, status, turn, reliability.',
    args: s({ member: memberArg }),
    example: { member: 'Carine' },
  }),
  list_proposals: defineSpec({
    ...L0,
    name: 'list_proposals',
    channels: BOTH,
    description:
      'Proposals of the group with their tallies, threshold and time left. Never who voted what in a secret vote.',
    args: s({ status: z.enum(['OPEN', 'CLOSED']).optional() }),
    example: { status: 'OPEN' },
  }),
  get_proposal: defineSpec({
    ...L0,
    name: 'get_proposal',
    channels: BOTH,
    description: 'One proposal: title, tally, threshold, time left, and the votes when not secret.',
    args: s({ id: idArg('proposal') }),
    example: { id: '00000000-0000-4000-8000-000000000001' },
  }),
  list_loans: defineSpec({
    ...L0,
    name: 'list_loans',
    category: 'loans',
    channels: BOTH,
    needs: 'money',
    description: 'Loans of the group with amounts and status.',
    args: s({
      status: z.enum(['REQUESTED', 'ACTIVE', 'REPAID', 'REJECTED', 'OVERDUE']).optional(),
      member: memberArg.optional(),
    }),
    example: {},
  }),
  get_loan_quote: defineSpec({
    ...L0,
    name: 'get_loan_quote',
    category: 'loans',
    channels: PRIVATE,
    needs: 'money',
    description:
      'For a possible loan of the member: their limit, interest, estimated fee, total and installments, computed by the server.',
    args: s({
      amount: z.number().int().min(1).max(100_000_000).describe('Whole FCFA the member asked for.'),
      months: z.number().int().min(1).max(6),
    }),
    example: { amount: 30_000, months: 3 },
  }),
  list_bids: defineSpec({
    ...L0,
    name: 'list_bids',
    category: 'loans',
    channels: BOTH,
    needs: 'money',
    description:
      'Bids of a round in bidding mode: before the close, only how many and the member’s own bid; after it, all bids.',
    args: s({ round: roundArg.optional() }),
    example: {},
  }),
  get_solidarity: defineSpec({
    ...L0,
    name: 'get_solidarity',
    channels: BOTH,
    description: 'Solidarity fund (caisse de secours) balance and the support requests.',
    args: s({}),
    example: {},
  }),
  get_meeting: defineSpec({
    ...L0,
    name: 'get_meeting',
    category: 'meetings',
    channels: BOTH,
    needs: 'meetings',
    description:
      'A meeting (the next one by default): date, place, agenda, attendance, minutes status.',
    args: s({ id: idArg('meeting').optional() }),
    example: {},
  }),
  summarize_unread: defineSpec({
    ...L0,
    name: 'summarize_unread',
    category: 'chat',
    channels: PRIVATE,
    needs: 'chat',
    description:
      'A short summary of the group chat since the member last read it (decisions, money events, questions for them, media by sender). Marks the chat read.',
    args: s({}),
    example: {},
  }),
  search_chat: defineSpec({
    ...L0,
    name: 'search_chat',
    category: 'chat',
    channels: PRIVATE,
    needs: 'chat',
    description: 'Group chat messages matching a search.',
    args: s({
      query: z.string().min(1).max(100),
      from: z.string().date().optional(),
      to: z.string().date().optional(),
    }),
    example: { query: 'réunion' },
  }),
  list_my_groups: defineSpec({
    ...L0,
    name: 'list_my_groups',
    category: 'account',
    channels: PRIVATE,
    description: 'The member’s groups and their status in each.',
    args: s({}),
    example: {},
  }),
  get_statement: defineSpec({
    ...L0,
    name: 'get_statement',
    category: 'account',
    channels: PRIVATE,
    needs: 'statements',
    description:
      'Creates if needed and shows the member’s statement (relevé) as a card in the app. period: a month "YYYY-MM", or "cycle".',
    args: s({
      period: z
        .string()
        .regex(/^(\d{4}-(0[1-9]|1[0-2])|cycle)$/)
        .optional()
        .describe('"YYYY-MM" or "cycle"; omit for last month.'),
    }),
    example: { period: '2026-10' },
  }),
  export_ledger: defineSpec({
    ...L0,
    name: 'export_ledger',
    channels: PRIVATE,
    needs: 'money',
    description: 'Shows a download card for the group ledger export.',
    args: s({ format: z.enum(['json', 'csv']).optional() }),
    example: { format: 'csv' },
  }),
  get_my_payment_number: defineSpec({
    ...L0,
    name: 'get_my_payment_number',
    category: 'account',
    channels: PRIVATE,
    description:
      'Shows the member’s own payment number as a card in the app (you only get its masked form) and its operator.',
    args: s({}),
    example: {},
  }),
  get_notifications: defineSpec({
    ...L0,
    name: 'get_notifications',
    category: 'account',
    channels: PRIVATE,
    description: 'The member’s recent notifications.',
    args: s({ unreadOnly: z.boolean().optional() }),
    example: {},
  }),
  get_agent_history: defineSpec({
    ...L0,
    name: 'get_agent_history',
    category: 'account',
    channels: PRIVATE,
    description: 'What you (the assistant) looked at, prepared or did for the member recently.',
    args: s({}),
    example: {},
  }),
};

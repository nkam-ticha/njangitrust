// `toDataExport` (spec 2.11, Part 7, PRV-03, D34): the export of a member's own data. Built field by
// field from an allowlist, never by deleting fields from a row. Nothing here can carry another
// member's number (free text goes through `maskForeignPhones` with only the member's own numbers
// allowed), a PIN or its hash, a token, a ledger hash, or the choice of a secret ballot: a secret
// vote is exported as "I voted" with its time rounded down to the hour, whatever the source holds.
// The output guard's masking, not the basic pattern: a member's own chat text can carry another
// member's number written with slashes or odd separators, and it must never leave in the export.
// (The guard only depends on @njangi/shared; moving it there is a later cleanup.)
import { maskForeignPhones } from '../agent/guards/phone-guard';
import type { DataExport } from '@njangi/shared/contracts/account';
import type { ReliabilityDto } from '@njangi/shared/contracts/me';
import type { NotificationPrefsDto } from '@njangi/shared/contracts/notifications';
import { toDevice, type DeviceSource } from './devices';
import { iso, isoOrNull } from './time';

type Obligation = DataExport['obligations'][number];
type Payment = DataExport['payments'][number];
type Withdrawal = DataExport['withdrawals'][number];
type Loan = DataExport['loans'][number];

export interface DataExportSource {
  generatedAt: Date;
  user: {
    id: string;
    name: string;
    loginPhone: string;
    language: 'fr' | 'en';
    createdAt: Date;
    consentVersion: string;
    consentAt: Date;
  };
  paymentNumbers: {
    number: string;
    operator: 'MTN' | 'ORANGE' | 'UNKNOWN';
    activeFrom: Date;
    activeTo: Date | null;
  }[];
  memberships: {
    groupId: string;
    groupName: string;
    role: 'ADMIN' | 'MEMBER';
    status: 'INVITED' | 'ACTIVE' | 'LEAVING' | 'LEFT' | 'REMOVED';
    createdAt: Date;
    leftAt: Date | null;
    reliability: ReliabilityDto;
  }[];
  obligations: (Omit<Obligation, 'dueAt' | 'paidAt'> & { dueAt: Date; paidAt: Date | null })[];
  payments: (Omit<Payment, 'createdAt' | 'settledAt'> & {
    createdAt: Date;
    settledAt: Date | null;
  })[];
  withdrawals: (Omit<Withdrawal, 'createdAt' | 'settledAt'> & {
    createdAt: Date;
    settledAt: Date | null;
  })[];
  loans: (Omit<Loan, 'createdAt'> & { createdAt: Date })[];
  bids: { groupId: string; roundNumber: number; amount: number; placedAt: Date }[];
  votes: {
    groupId: string;
    proposalType: string;
    secret: boolean;
    /** Only ever loaded for non-secret proposals; ignored for secret ones. */
    choice: 'YES' | 'NO' | null;
    votedAt: Date;
  }[];
  ledgerEntries: {
    groupId: string;
    seq: number;
    type: string;
    occurredAt: Date;
    postings: { account: 'PAYABLE' | 'RECEIVABLE'; amount: number }[];
  }[];
  chatMessages: { groupId: string; kind: string; text: string | null; createdAt: Date }[];
  assistantConversations: {
    groupId: string | null;
    messages: { role: 'user' | 'assistant'; content: string; createdAt: Date }[];
  }[];
  notificationSettings: NotificationPrefsDto;
  devices: DeviceSource[];
  statements: {
    id: string;
    groupId: string;
    periodStart: Date;
    periodEnd: Date;
    language: 'fr' | 'en';
    createdAt: Date;
    verificationCode: string;
  }[];
}

const HOUR_MS = 3_600_000;

/** Per-voter times of a secret vote are never finer than the hour (D32.5). */
function roundedToHour(date: Date): Date {
  return new Date(Math.floor(date.getTime() / HOUR_MS) * HOUR_MS);
}

/** Call only with the requester's own data. */
export function toDataExport(source: DataExportSource): DataExport {
  const own = [source.user.loginPhone, ...source.paymentNumbers.map((n) => n.number)];
  const clean = (text: string): string => maskForeignPhones(text, own);
  return {
    format: 'njangitrust-personal-data',
    version: 1,
    generatedAt: iso(source.generatedAt),
    profile: {
      id: source.user.id,
      name: source.user.name,
      phone: source.user.loginPhone,
      language: source.user.language,
      createdAt: iso(source.user.createdAt),
      consentVersion: source.user.consentVersion,
      consentAt: iso(source.user.consentAt),
    },
    paymentNumbers: source.paymentNumbers.map((n) => ({
      number: n.number,
      operator: n.operator,
      activeFrom: iso(n.activeFrom),
      activeTo: isoOrNull(n.activeTo),
    })),
    groups: source.memberships.map((m) => ({
      groupId: m.groupId,
      name: m.groupName,
      role: m.role,
      membershipStatus: m.status,
      joinedAt: iso(m.createdAt),
      leftAt: isoOrNull(m.leftAt),
      reliability: {
        onTime: m.reliability.onTime,
        total: m.reliability.total,
        percent: m.reliability.percent,
        window: m.reliability.window,
      },
    })),
    obligations: source.obligations.map((o) => ({
      groupId: o.groupId,
      kind: o.kind,
      roundNumber: o.roundNumber,
      amount: o.amount,
      dueAt: iso(o.dueAt),
      status: o.status,
      paidAt: isoOrNull(o.paidAt),
      onTime: o.onTime,
    })),
    payments: source.payments.map((p) => ({
      groupId: p.groupId,
      amount: p.amount,
      fee: p.fee,
      status: p.status,
      createdAt: iso(p.createdAt),
      settledAt: isoOrNull(p.settledAt),
    })),
    withdrawals: source.withdrawals.map((w) => ({
      groupId: w.groupId,
      purpose: w.purpose,
      amount: w.amount,
      fee: w.fee,
      status: w.status,
      createdAt: iso(w.createdAt),
      settledAt: isoOrNull(w.settledAt),
    })),
    loans: source.loans.map((l) => ({
      groupId: l.groupId,
      principal: l.principal,
      months: l.months,
      ratePermille: l.ratePermille,
      interest: l.interest,
      totalDue: l.totalDue,
      status: l.status,
      createdAt: iso(l.createdAt),
    })),
    bids: source.bids.map((b) => ({
      groupId: b.groupId,
      roundNumber: b.roundNumber,
      amount: b.amount,
      placedAt: iso(b.placedAt),
    })),
    votes: source.votes.map((v) => ({
      groupId: v.groupId,
      proposalType: v.proposalType,
      secret: v.secret,
      choice: v.secret ? null : v.choice,
      votedAt: iso(v.secret ? roundedToHour(v.votedAt) : v.votedAt),
    })),
    ledgerEntries: source.ledgerEntries.map((e) => ({
      groupId: e.groupId,
      seq: e.seq,
      type: e.type,
      occurredAt: iso(e.occurredAt),
      postings: e.postings.map((p) => ({ account: p.account, amount: p.amount })),
    })),
    chatMessages: source.chatMessages.map((m) => ({
      groupId: m.groupId,
      kind: m.kind,
      text: m.text === null ? null : clean(m.text),
      createdAt: iso(m.createdAt),
    })),
    assistantConversations: source.assistantConversations.map((c) => ({
      groupId: c.groupId,
      messages: c.messages.map((m) => ({
        role: m.role,
        content: clean(m.content),
        createdAt: iso(m.createdAt),
      })),
    })),
    notificationSettings: {
      mutedCategories: [...source.notificationSettings.mutedCategories],
      quietHours: {
        from: source.notificationSettings.quietHours.from,
        to: source.notificationSettings.quietHours.to,
      },
      mutedChatGroupIds: [...source.notificationSettings.mutedChatGroupIds],
      mediaAutoDownload: source.notificationSettings.mediaAutoDownload,
    },
    devices: source.devices.map(toDevice),
    statements: source.statements.map((s) => ({
      id: s.id,
      groupId: s.groupId,
      periodStart: iso(s.periodStart),
      periodEnd: iso(s.periodEnd),
      language: s.language,
      issuedAt: iso(s.createdAt),
      verificationCode: s.verificationCode,
    })),
  };
}

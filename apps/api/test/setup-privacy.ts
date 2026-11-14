// Spec 5.3, privacy-guard L11 and L-5: after every test, everything the API wrote outside its
// responses (socket events, pushes sent, stored notifications, audit details, pending actions,
// proposals, ledger EVENT inputs, log lines) is scanned for phone numbers. None of these may ever
// carry one, not even the member's own: notifications and pushes show on lock screens, logs and
// audit entries are read by operators, and proposals and ledger entries are shown to the group.
import { afterEach, beforeEach } from 'vitest';
import { testLogLines } from '../src/lib/logger';
import { getPrisma, hasPrismaClient } from '../src/lib/prisma';
import {
  getPushSender,
  RecordingPushSender,
  type PushSender,
} from '../src/modules/notifications/push-sender';
import {
  recordLedgerEvents,
  stopRecordingLedgerEvents,
  type LedgerEventInput,
} from '../src/modules/proposals/governance-ports';
import { recordRealtimeEvents, stopRecording, type RecordedEvent } from '../src/realtime/emitter';
import { assertNoForeignPhones } from './helpers/phone-scanner';

let events: RecordedEvent[] = [];
let ledgerEvents: LedgerEventInput[] = [];
let pushSender: PushSender | undefined;
let pushedBefore = 0;
let startedAt = new Date();

beforeEach(() => {
  events = recordRealtimeEvents();
  ledgerEvents = recordLedgerEvents();
  testLogLines.length = 0;
  pushSender = getPushSender();
  pushedBefore = pushSender instanceof RecordingPushSender ? pushSender.sent.length : 0;
  // Rows are compared with the database's own clock (createdAt), never the test clock.
  startedAt = new Date(Date.now() - 1_000);
});

function pushesSent(): unknown[] {
  const sender = getPushSender();
  if (!(sender instanceof RecordingPushSender)) return [];
  return sender.sent.slice(sender === pushSender ? pushedBefore : 0);
}

afterEach(async () => {
  stopRecording(events);
  stopRecordingLedgerEvents(ledgerEvents);
  assertNoForeignPhones(events, [], 'socket events');
  assertNoForeignPhones(ledgerEvents, [], 'ledger EVENT inputs');
  assertNoForeignPhones(pushesSent(), [], 'pushes sent');
  assertNoForeignPhones(testLogLines.join('\n'), [], 'log output');
  if (!hasPrismaClient()) return;
  const prisma = getPrisma();
  const since = { createdAt: { gte: startedAt } };
  const [notifications, audits, actions, proposals] = await Promise.all([
    prisma.notification.findMany({
      where: since,
      select: { titleFr: true, titleEn: true, bodyFr: true, bodyEn: true, deepLink: true },
    }),
    prisma.auditLog.findMany({ where: since, select: { details: true, target: true } }),
    // A finished confidential action has its times truncated to the hour, but by then it holds
    // only its fixed redacted card; while pending (scanned here) it is sealed.
    prisma.pendingAction.findMany({
      where: since,
      select: { args: true, preview: true, resultSummary: true, failureText: true },
    }),
    prisma.proposal.findMany({
      where: since,
      select: { payload: true, reason: true, effect: true },
    }),
  ]);
  assertNoForeignPhones(notifications, [], 'stored notifications');
  assertNoForeignPhones(audits, [], 'audit details');
  assertNoForeignPhones(actions, [], 'pending actions');
  assertNoForeignPhones(proposals, [], 'proposals');
});

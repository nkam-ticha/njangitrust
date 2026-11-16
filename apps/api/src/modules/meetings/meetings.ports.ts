// What meetings need from the money modules (spec R15.2, R15.5, R6.3). The money engineer implements
// these and registers them at start-up (`registerMeetingPorts`), like the governance ports; until
// then the agenda simply has no money lines and an absence fine is logged, not assessed. Meetings
// never compute or move money: the fine amount and who gets it come from the rules package, and
// the money module posts it.
import type { Db, Prisma } from '../../lib/prisma';
import { componentLogger } from '../../lib/logger';

const log = componentLogger('meetings');

/** The round in progress, as the agenda shows it. */
export interface AgendaRound {
  number: number;
  /** Null until the bid closes in bidding mode (R8.3). */
  beneficiaryName: string | null;
  paidCount: number;
  memberCount: number;
}

export interface AgendaMoneyData {
  round: AgendaRound | null;
  /** Members who have not paid the round's contribution (names only). */
  unpaidNames: string[];
  /** Loan installments due before the next round's payout (a count: the agenda names no one). */
  installmentsDue: number;
}

export interface MeetingMoneyPort {
  agendaData(db: Db, input: { groupId: string; meetingAt: Date }): Promise<AgendaMoneyData>;
}

export interface AbsenceFinesPort {
  /**
   * R6.3, R15.5: one FINE of `amount` for each of these members, assessed inside the transaction that
   * closes the meeting (FINE_ASSESSED plus its obligation, notified like any fine).
   */
  assessAbsenceFines(
    tx: Prisma.TransactionClient,
    input: {
      groupId: string;
      meetingId: string;
      amount: number;
      membershipIds: string[];
      occurredAt: Date;
    },
  ): Promise<void>;
}

const noMoney: MeetingMoneyPort = {
  agendaData: () => Promise.resolve({ round: null, unpaidNames: [], installmentsDue: 0 }),
};

const loggingFines: AbsenceFinesPort = {
  assessAbsenceFines(_tx, input) {
    log.warn(
      { groupId: input.groupId, meetingId: input.meetingId, count: input.membershipIds.length },
      'absence fines not assessed: no money port registered',
    );
    return Promise.resolve();
  },
};

let money: MeetingMoneyPort = noMoney;
let fines: AbsenceFinesPort = loggingFines;

export function registerMeetingPorts(ports: {
  money?: MeetingMoneyPort;
  absenceFines?: AbsenceFinesPort;
}): void {
  if (ports.money) money = ports.money;
  if (ports.absenceFines) fines = ports.absenceFines;
}

export const meetingMoneyPort = (): MeetingMoneyPort => money;
export const absenceFinesPort = (): AbsenceFinesPort => fines;

/** Tests only: back to the defaults. */
export function resetMeetingPortsForTests(): void {
  money = noMoney;
  fines = loggingFines;
}

// Helpers for the meetings tests: meetings at chosen times (inserted directly when a test needs a
// meeting that has already started), and fake money ports that record what meetings ask of them.
import { getPrisma } from '../../src/lib/prisma';
import {
  registerMeetingPorts,
  type AbsenceFinesPort,
  type AgendaMoneyData,
  type MeetingMoneyPort,
} from '../../src/modules/meetings';

/** A SCHEDULED meeting starting `minutesFromNow` minutes from now (negative: already started). */
export async function insertMeeting(
  groupId: string,
  minutesFromNow: number,
  place = 'Chez Carine, Bonamoussadi',
): Promise<string> {
  const row = await getPrisma().meeting.create({
    data: { groupId, scheduledAt: new Date(Date.now() + minutesFromNow * 60_000), place },
    select: { id: true },
  });
  return row.id;
}

export interface FakeMeetingMoney {
  agenda: AgendaMoneyData;
  agendaCalls: { groupId: string }[];
  fines: { groupId: string; meetingId: string; amount: number; membershipIds: string[] }[];
}

/** Registers fake ports: the agenda data the test sets, and a recorder of absence fines. */
export function installFakeMeetingMoney(): FakeMeetingMoney {
  const fake: FakeMeetingMoney = {
    agenda: { round: null, unpaidNames: [], installmentsDue: 0 },
    agendaCalls: [],
    fines: [],
  };
  const money: MeetingMoneyPort = {
    agendaData: (_db, input) => {
      fake.agendaCalls.push({ groupId: input.groupId });
      return Promise.resolve(fake.agenda);
    },
  };
  const absenceFines: AbsenceFinesPort = {
    assessAbsenceFines: (_tx, input) => {
      fake.fines.push({
        groupId: input.groupId,
        meetingId: input.meetingId,
        amount: input.amount,
        membershipIds: [...input.membershipIds],
      });
      return Promise.resolve();
    },
  };
  registerMeetingPorts({ money, absenceFines });
  return fake;
}

/** A new rule set version of the group with `meetingAbsenceFine` set (R6.3), as a passed vote would. */
export async function setAbsenceFine(groupId: string, amount: number): Promise<void> {
  const prisma = getPrisma();
  const latest = await prisma.ruleSet.findFirstOrThrow({
    where: { groupId },
    orderBy: { version: 'desc' },
  });
  await prisma.ruleSet.create({
    data: {
      groupId,
      version: latest.version + 1,
      params: { ...(latest.params as Record<string, unknown>), meetingAbsenceFine: amount },
    },
  });
}

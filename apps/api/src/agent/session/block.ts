// The session block (spec 4.3): who the member is, the channel, the time in Douala and the active
// group, built from facts the services already formatted. It is the only source of identity the
// model may trust (system prompt, IDENTITY). Pure: facts in, text out.
import { formatClock, formatDateLong, type Lang } from '@njangi/shared';
import type { AgentChannel } from '@njangi/shared/contracts/agent';
import { neutralise } from '../guards/wrap';
import { maskForeignPhones } from '../guards/phone-guard';
import type { SessionMoneyLines } from '../ports';

export interface SessionFacts {
  name: string;
  lang: Lang;
  role: 'ADMIN' | 'MEMBER' | null;
  channel: AgentChannel;
  now: Date;
  activeGroup: {
    name: string;
    status: 'FORMING' | 'ACTIVE' | 'CLOSED';
    memberCount: number;
    membershipStatus: string;
  } | null;
  /** Absent while the money services are not built (the lines are then left out). */
  money: SessionMoneyLines | null;
  /** PRIVATE: open votes the member can still cast; GROUP: open proposals of the group. */
  openVotes: number | null;
  otherGroups: string[];
  /** Recent group chat lines when answering @njangi in the group channel. */
  recentChat?: string[];
  /**
   * Group chat only: the message this mention replied to (spec 4.8 point 6). Carried as data, on
   * its own line, never folded into the member's own message so it can never pass as a member's
   * words or as an instruction.
   */
  quotedMessage?: { author: string; text: string };
}

const T = {
  fr: {
    douala: 'heure de Douala',
    none: 'aucun',
    forming: (n: number) => `cycle pas encore commencé, ${n} membres`,
    closed: 'groupe clôturé',
    invited: 'membre actif à partir du prochain cycle',
    leaving: 'part à la fin du cycle',
  },
  en: {
    douala: 'Douala time',
    none: 'none',
    forming: (n: number) => `no cycle started yet, ${n} members`,
    closed: 'group closed',
    invited: 'active member from the next cycle',
    leaving: 'leaving at the end of the cycle',
  },
} as const;

/** Names come from members; they cannot carry markup or a number into the block. */
const clean = (text: string) => maskForeignPhones(neutralise(text)).replace(/[\r\n]+/g, ' ');

export function buildSessionBlock(facts: SessionFacts): string {
  const t = T[facts.lang];
  const lines = [
    `user: ${clean(facts.name)} (${facts.lang}, ${facts.role ?? 'NO_GROUP'})`,
    `channel: ${facts.channel}`,
    `now: ${formatDateLong(facts.now, facts.lang, { withYear: true })}, ${formatClock(facts.now, facts.lang)} (${t.douala})`,
  ];
  const group = facts.activeGroup;
  if (!group) {
    lines.push(`activeGroup: ${t.none}`);
  } else {
    const state =
      group.status === 'FORMING'
        ? t.forming(group.memberCount)
        : group.status === 'CLOSED'
          ? t.closed
          : facts.money?.cycle
            ? clean(facts.money.cycle)
            : undefined;
    lines.push(`activeGroup: ${clean(group.name)}${state ? `, ${state}` : ''}`);
    if (facts.money?.beneficiary) lines.push(`beneficiary: ${clean(facts.money.beneficiary)}`);
    if (facts.channel === 'PRIVATE') {
      if (group.membershipStatus === 'INVITED') lines.push(`myStatus: ${t.invited}`);
      if (group.membershipStatus === 'LEAVING') lines.push(`myStatus: ${t.leaving}`);
      if (facts.money?.myRound)
        lines.push(`${clean(facts.money.myRound[0])}: ${clean(facts.money.myRound[1])}`);
      if (facts.money?.myMoney) lines.push(`myMoney: ${clean(facts.money.myMoney)}`);
    }
  }
  if (facts.openVotes !== null) lines.push(`openVotes: ${facts.openVotes}`);
  if (facts.channel === 'PRIVATE' && facts.otherGroups.length) {
    lines.push(`otherGroups: ${facts.otherGroups.map(clean).join(', ')}`);
  }
  if (facts.recentChat?.length) {
    lines.push(
      `recentGroupChat:\n${facts.recentChat.map((line) => `  - ${clean(line).slice(0, 200)}`).join('\n')}`,
    );
  }
  if (facts.quotedMessage) {
    lines.push(
      `quotedMessage: ${clean(facts.quotedMessage.author)}: ${clean(facts.quotedMessage.text).slice(0, 300)}`,
    );
  }
  return `<session>\n${lines.join('\n')}\n</session>`;
}

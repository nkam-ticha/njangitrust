// Every permission of the app, in one table (spec 2.11, R1.2, R1.3, R12.1, R12.4).
// Business conditions (amounts, deadlines, holds) are checked by the services; this table only
// says who may attempt an action at all.

/**
 * Audiences inside a group:
 * - `reader`: can see the group (INVITED, ACTIVE or LEAVING). R12.1: a member who joined after the
 *   first cycle reads the chat and the ledger at once.
 * - `participant`: can act in the group (ACTIVE or LEAVING; R12.2 keeps a leaver's rights).
 * - `admin`: the group's admin, while ACTIVE or LEAVING (R1.2).
 * - `anyMember`: anyone who ever was a member, including LEFT and REMOVED, for what R12.4 keeps
 *   (own statements, own data export) and for withdrawing money still owed to them (R12.3).
 */
export type Audience = 'reader' | 'participant' | 'admin' | 'anyMember';

export const GROUP_POLICIES = {
  'group.read': 'reader',
  'group.members.read': 'reader',
  'group.rules.read': 'reader',
  'group.rounds.read': 'reader',
  'group.ledger.read': 'reader',
  'group.ledger.export': 'reader',
  'group.funds.read': 'reader',
  'group.proposals.read': 'reader',
  'group.loans.read': 'reader',
  'group.bids.read': 'reader',
  'group.solidarity.read': 'reader',
  'group.meetings.read': 'reader',
  'group.chat.read': 'reader',
  'group.realtime.join': 'reader',

  'group.chat.post': 'participant',
  'group.media.upload': 'participant',
  'group.proposals.create': 'participant',
  'group.votes.cast': 'participant',
  'group.payments.create': 'participant',
  'group.loans.request': 'participant',
  'group.bids.place': 'participant',
  'group.solidarity.request': 'participant',
  'group.meetings.checkIn': 'participant',
  'group.meetings.excuse': 'participant',
  'group.meetings.agendaAdd': 'participant',
  'group.leave': 'participant',
  /** Confirming a PIN reset: the admin, or for the admin's own reset two members (D8). */
  'group.pinResets.review': 'participant',

  'group.withdrawals.create': 'anyMember',
  'group.statements.own': 'anyMember',

  'group.invites.create': 'admin',
  'group.invites.read': 'admin',
  'group.cycles.start': 'admin',
  'group.loans.decide': 'admin',
  'group.meetings.schedule': 'admin',
  'group.meetings.attendanceMark': 'admin',
  'group.minutes.draft': 'admin',
  'group.minutes.publish': 'admin',
  'group.announcements.post': 'admin',
  'group.chat.hide': 'admin',
} as const satisfies Record<string, Audience>;

export type GroupAction = keyof typeof GROUP_POLICIES;

/** Actions on a record that belongs to one user: only that user. */
export const OWNER_ACTIONS = [
  'pendingAction.read',
  'pendingAction.confirm',
  'pendingAction.cancel',
  'user.self.read',
  'user.self.update',
  'notification.read',
  'agent.history.read',
] as const;

export type OwnerAction = (typeof OWNER_ACTIONS)[number];

export type Action = GroupAction | OwnerAction;

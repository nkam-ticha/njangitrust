// The verb carries through the card (spec 1.5): Payer → Payé, Retirer → Retiré, Voter → Voté.
// Maps a PendingAction `type` (the agent tool name) to its copy key in confirmation.actions.
import type { TFunction } from 'i18next';

const BY_TYPE = {
  pay: 'pay',
  pay_debts: 'payDebts',
  repay_loan: 'repayLoan',
  withdraw: 'withdraw',
  request_loan: 'requestLoan',
  place_bid: 'placeBid',
  cast_vote: 'voteYes',
  propose_rule_change: 'propose',
  propose_member_add: 'propose',
  propose_member_removal: 'propose',
  propose_rotation_change: 'propose',
  propose_admin_change: 'propose',
  propose_fine_waiver: 'propose',
  propose_ledger_correction: 'propose',
  request_solidarity: 'requestSolidarity',
  request_early_exit: 'requestEarlyExit',
  announce_leave_at_cycle_end: 'announceLeave',
  add_agenda_item: 'addAgendaItem',
  check_in: 'checkIn',
  send_absence_excuse: 'sendExcuse',
  post_to_group: 'postToGroup',
  schedule_meeting: 'scheduleMeeting',
  mark_attendance: 'markAttendance',
  publish_minutes: 'publishMinutes',
  post_announcement: 'postAnnouncement',
  create_invite: 'createInvite',
  start_cycle: 'startCycle',
  hide_message: 'hideMessage',
  change_payment_number: 'changePaymentNumber',
  delete_my_account: 'deleteAccount',
} as const;

export function doneVerb(type: string, t: TFunction): string | null {
  const key = (BY_TYPE as Record<string, (typeof BY_TYPE)[keyof typeof BY_TYPE]>)[type];
  return key ? t(`confirmation.actions.${key}.done`) : null;
}

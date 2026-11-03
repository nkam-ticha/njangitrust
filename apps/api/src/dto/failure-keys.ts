// Which designer card (`confirmation.failed.<key>` in ui.*.ts) shows a failed action. API error
// codes stay SCREAMING_SNAKE_CASE (TEAM.md); this maps them to the designer's keys. Modules add
// their own codes at start-up (e.g. the money engineer: INSUFFICIENT_BALANCE -> insufficientBalance).

export type FailureKey =
  | 'insufficientBalance'
  | 'declined'
  | 'operatorTimeout'
  | 'providerUnavailable'
  | 'invalidNumber'
  | 'disbursementFailed'
  | 'situationChanged'
  | 'alreadyPaid'
  | 'holdActive'
  | 'withdrawalsPaused'
  | 'limitExceeded'
  | 'voteClosed'
  | 'alreadyVoted'
  | 'notEligible'
  | 'generic';

const keys = new Map<string, FailureKey>([
  ['ACTION_CHANGED', 'situationChanged'],
  ['PROPOSAL_CLOSED', 'voteClosed'],
  ['ALREADY_VOTED', 'alreadyVoted'],
  ['NOT_ELIGIBLE_VOTER', 'notEligible'],
  ['ADMIN_ONLY', 'notEligible'],
  ['NOT_ACTIVE_MEMBER', 'notEligible'],
  ['MEMBERSHIP_ENDED', 'notEligible'],
  ['GROUP_FULL', 'notEligible'],
  ['PROPOSAL_REQUIRED', 'notEligible'],
  ['PROPOSAL_NOT_PASSED', 'notEligible'],
  ['INVITE_ALREADY_PENDING', 'notEligible'],
  ['PIN_RESET_NOT_FOUND', 'notEligible'],
  ['PIN_RESET_ALREADY_CONFIRMED', 'notEligible'],
]);

export function registerFailureKeys(entries: Record<string, FailureKey>): void {
  for (const [code, key] of Object.entries(entries)) keys.set(code, key);
}

/** `notEligible` cards show the server's message as their reason; unknown codes are `generic`. */
export function failureKeyOf(code: string): FailureKey {
  return keys.get(code) ?? 'generic';
}

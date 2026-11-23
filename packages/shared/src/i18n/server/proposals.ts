// Server texts for proposals and votes (R11). Phase 0: MEMBER_ADD.
import type { Bilingual } from '../../lang';

export const proposalErrorTexts = {
  PROPOSAL_NOT_FOUND: {
    fr: 'Cette proposition est introuvable. Actualise l’onglet Votes.',
    en: 'This proposal was not found. Refresh the Votes tab.',
  },
  PROPOSALS_BEFORE_FIRST_CYCLE: {
    fr: 'Avant le premier cycle, l’admin invite directement les membres fondateurs. Les votes commencent avec le premier cycle.',
    en: 'Before the first cycle, the admin invites founding members directly. Votes start with the first cycle.',
  },
  PROPOSAL_CLOSED: {
    fr: 'Ce vote est terminé. Tu peux voir son résultat dans l’onglet Votes.',
    en: 'This vote is over. You can see its result in the Votes tab.',
  },
  NOT_ELIGIBLE_VOTER: {
    fr: 'Tu ne votes pas sur cette proposition : seuls les membres actifs au moment où elle a été faite votent.',
    en: 'You do not vote on this proposal: only members active when it was made can vote.',
  },
  ALREADY_VOTED: {
    fr: 'Tu as déjà voté sur cette proposition. Un vote ne peut pas être changé.',
    en: 'You already voted on this proposal. A vote cannot be changed.',
  },
  PROPOSAL_TYPE_UNAVAILABLE: {
    fr: 'Ce type de proposition n’est pas encore disponible. Réessaie après la prochaine mise à jour.',
    en: 'This kind of proposal is not available yet. Try again after the next update.',
  },
  EXIT_PAYMENT_IN_PROGRESS: {
    fr: 'Ce membre a un paiement, un retrait ou un prêt en cours. Attends qu’il soit terminé avant d’ouvrir ce vote.',
    en: 'This member has a payment, withdrawal or loan in progress. Wait until it is finished before opening this vote.',
  },
  PROPOSAL_ALREADY_OPEN: {
    fr: 'Un vote du même type est déjà ouvert pour ce membre. Attends sa clôture.',
    en: 'A vote of the same kind is already open for this member. Wait until it closes.',
  },
  MEMBER_NOT_FOUND: {
    fr: 'Ce membre ne fait pas partie du groupe. Vérifie le nom choisi.',
    en: 'This member is not in the group. Check the name you chose.',
  },
  CANNOT_TARGET_SELF: {
    fr: 'Tu ne peux pas faire cette proposition à ton sujet. Pour partir, demande un départ en cours de cycle.',
    en: 'You cannot make this proposal about yourself. To leave, ask to leave mid-cycle.',
  },
  ADMIN_MUST_CHANGE_FIRST: {
    fr: 'Cette personne est l’admin. Propose d’abord un changement d’admin.',
    en: 'This person is the admin. First propose a change of admin.',
  },
  ALREADY_ADMIN: {
    fr: 'Cette personne est déjà l’admin du groupe.',
    en: 'This person is already the group admin.',
  },
  ONLY_ACTIVE_MEMBERS: {
    fr: 'Seul un membre actif du groupe peut être concerné par cette proposition.',
    en: 'Only an active member of the group can be the subject of this proposal.',
  },
  ADMIN_LOAN_NOT_PROPOSABLE: {
    fr: 'Le vote sur un prêt de l’admin s’ouvre tout seul quand l’admin demande un prêt.',
    en: 'The vote on an admin loan opens by itself when the admin asks for a loan.',
  },
  RULE_CHANGE_EMPTY: {
    fr: 'Choisis au moins une règle à changer.',
    en: 'Choose at least one rule to change.',
  },
  RULE_CHANGE_NO_CHANGE: {
    fr: 'La règle « {{rule}} » a déjà cette valeur. Choisis une autre valeur.',
    en: 'The rule “{{rule}}” already has this value. Choose another value.',
  },
  RULE_CHANGE_ALREADY_OPEN: {
    fr: 'Un vote est déjà ouvert sur la règle « {{rule}} ». Attends sa clôture.',
    en: 'A vote on the rule “{{rule}}” is already open. Wait until it closes.',
  },
  ROTATION_NOT_STARTED: {
    fr: 'L’ordre des bénéficiaires existe à partir du premier cycle.',
    en: 'The order of beneficiaries exists from the first cycle on.',
  },
  ROTATION_SAME_MEMBER: {
    fr: 'Choisis deux membres différents à échanger.',
    en: 'Choose two different members to swap.',
  },
  ROTATION_NOT_IN_ROTATION: {
    fr: 'Ce membre n’a pas de tour dans ce cycle.',
    en: 'This member has no turn in this cycle.',
  },
  ROTATION_ALREADY_SERVED: {
    fr: 'Ce membre a déjà reçu son tour ou le reçoit maintenant : son tour ne peut plus changer.',
    en: 'This member has already had their turn or is having it now: it can no longer change.',
  },
  FINE_NOT_FOUND: {
    fr: 'Cette amende est introuvable dans ce groupe.',
    en: 'This fine was not found in this group.',
  },
  FINE_NOT_WAIVABLE: {
    fr: 'Cette amende est déjà annulée.',
    en: 'This fine is already cancelled.',
  },
  LEDGER_ENTRY_NOT_CORRECTABLE: {
    fr: 'Cette opération du registre ne peut pas être corrigée (introuvable, déjà corrigée, ou simple événement).',
    en: 'This ledger entry cannot be corrected (not found, already corrected, or a plain event).',
  },
  RECIPIENT_NOT_MEMBER: {
    fr: 'Le soutien ne peut aller qu’à un membre actif du groupe.',
    en: 'Support can only go to an active member of the group.',
  },
  SOLIDARITY_ABOVE_FUND: {
    fr: 'La caisse de secours n’a que {{balance}} disponibles. Demande un montant plus petit.',
    en: 'The solidarity fund only has {{balance}} available. Ask for a smaller amount.',
  },
  SOLIDARITY_NOT_ABOVE_FEE: {
    fr: 'Le montant doit dépasser les frais d’envoi ({{fee}}).',
    en: 'The amount must be more than the transfer fee ({{fee}}).',
  },
  ALREADY_LEAVING: {
    fr: 'Tu as déjà annoncé ton départ à la fin du cycle.',
    en: 'You have already announced you are leaving at the end of the cycle.',
  },
} as const satisfies Record<string, Bilingual>;

export type ProposalErrorCode = keyof typeof proposalErrorTexts;

/** Texts not covered by the designer’s copy (confirmation.actions.propose / voteYes / voteNo,
 * confirmation.notes.threshold, votes.titles, chat.system.voteOpened / votePassed / voteRejected). */
export const proposalTexts = {
  /** The body of a vote's push: a lock screen shows it, so it carries no name and no amount. */
  pushNeutralBody: {
    fr: 'Ouvre l’application pour voir les détails.',
    en: 'Open the app to see the details.',
  },
  openedTitle: { fr: 'Nouveau vote', en: 'New vote' },
  reminderTitle: { fr: 'Vote bientôt clos', en: 'Vote closing soon' },
  resultTitle: { fr: 'Résultat d’un vote', en: 'Vote result' },
  removedTitle: { fr: 'Tu ne fais plus partie du groupe', en: 'You are no longer in the group' },
  removedBody: {
    fr: 'Le groupe {{group}} a voté ton exclusion. Tes relevés et l’export de tes données restent disponibles.',
    en: 'The group {{group}} voted to remove you. Your statements and data export remain available.',
  },
  adminTitle: { fr: 'Tu es l’admin', en: 'You are the admin' },
  adminBody: {
    fr: 'Le groupe {{group}} t’a choisi comme admin.',
    en: 'The group {{group}} chose you as admin.',
  },
  leaveTitle: { fr: 'Quitter à la fin du cycle', en: 'Leave at the end of the cycle' },
  effectInviteAllowed: {
    fr: 'L’admin peut maintenant inviter {{name}}.',
    en: 'The admin can now invite {{name}}.',
  },
  /** What a finished secret-vote card shows: the choice is erased from the server (R11.5). */
  secretVoteSealed: { fr: 'Vote secret', en: 'Secret vote' },
  voteWindow: {
    fr: 'Le vote dure {{hours}} h, ou se termine dès que le résultat est certain.',
    en: 'The vote lasts {{hours}} hours, or ends as soon as the result is certain.',
  },
  /** D20.1, D26: a secret vote runs its full window unless every eligible member has voted. */
  voteWindowSecret: {
    fr: 'Le vote dure {{hours}} h, ou se termine dès que tous les membres ont voté. Le résultat et les totaux sont publiés à la fin.',
    en: 'The vote lasts {{hours}} hours, or ends as soon as every member has voted. The result and the totals are published at the end.',
  },
  /** D20.2: what a lock screen shows about a solidarity request (no event, no note). */
  solidarityOpenedBody: {
    fr: 'Nouvelle demande de soutien dans {{group}}',
    en: 'New support request in {{group}}',
  },
  solidarityReminderBody: {
    fr: 'Le vote sur une demande de soutien dans {{group}} se termine bientôt.',
    en: 'The vote on a support request in {{group}} ends soon.',
  },
  solidarityResultBody: {
    fr: 'Le vote sur une demande de soutien dans {{group}} est terminé.',
    en: 'The vote on a support request in {{group}} has ended.',
  },
} as const satisfies Record<string, Bilingual>;

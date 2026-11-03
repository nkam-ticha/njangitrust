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
} as const satisfies Record<string, Bilingual>;

export type ProposalErrorCode = keyof typeof proposalErrorTexts;

/** Texts not covered by the designer’s copy (confirmation.actions.propose / voteYes / voteNo,
 * confirmation.notes.threshold, votes.titles, chat.system.voteOpened / votePassed / voteRejected). */
export const proposalTexts = {
  openedTitle: { fr: 'Nouveau vote', en: 'New vote' },
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
} as const satisfies Record<string, Bilingual>;

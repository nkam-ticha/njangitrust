// Server texts for groups, members and invitations (spec 2.10, R1, R12).
import type { Bilingual } from '../../lang';

export const groupErrorTexts = {
  GROUP_NOT_FOUND: {
    fr: 'Ce groupe est introuvable, ou tu n’en fais pas partie.',
    en: 'This group was not found, or you are not a member.',
  },
  MEMBERSHIP_ENDED: {
    fr: 'Tu ne fais plus partie de ce groupe. Tu gardes l’accès à tes relevés et à l’export de tes données.',
    en: 'You are no longer a member of this group. You keep access to your statements and your data export.',
  },
  ADMIN_ONLY: {
    fr: 'Seul l’admin du groupe peut faire cette action.',
    en: 'Only the group admin can do this.',
  },
  NOT_ACTIVE_MEMBER: {
    fr: 'Tu pourras faire cette action quand tu seras membre actif du groupe, au début du prochain cycle.',
    en: 'You can do this once you are an active member of the group, from the start of the next cycle.',
  },
  GROUP_CLOSED: {
    fr: 'Ce groupe est fermé. Tu peux encore consulter son registre.',
    en: 'This group is closed. You can still read its records.',
  },
  FIRST_PAYOUT_IN_PAST: {
    fr: 'La date du premier versement doit être dans le futur. Choisis une date à venir.',
    en: 'The first payout date must be in the future. Choose an upcoming date.',
  },
  NOT_LAST_WEEKDAY_OF_MONTH: {
    fr: 'Cette date n’est pas le dernier jour de ce type dans le mois. Choisis une autre date ou un autre repère mensuel.',
    en: 'This date is not the last such weekday of the month. Choose another date or another monthly pattern.',
  },
  FIFTH_WEEKDAY_NOT_ALLOWED: {
    fr: 'Un 5e jour de la semaine n’existe pas tous les mois. Choisis « dernier jour du mois » ou une date fixe.',
    en: 'A 5th weekday does not exist every month. Choose “last of the month” or a fixed date.',
  },
  RULE_VALUE_OUT_OF_RANGE: {
    fr: 'La règle « {{rule}} » doit être comprise entre {{min}} et {{max}}.',
    en: 'The rule “{{rule}}” must be between {{min}} and {{max}}.',
  },
  RULE_VALUE_INVALID: {
    fr: 'La valeur de la règle « {{rule}} » n’est pas valable. Corrige-la puis réessaie.',
    en: 'The value of the rule “{{rule}}” is not valid. Fix it and try again.',
  },
  RULE_UNKNOWN: {
    fr: 'La règle « {{rule}} » n’existe pas. Mets l’application à jour.',
    en: 'The rule “{{rule}}” does not exist. Update the app.',
  },
  GROUP_FULL: {
    fr: 'Le groupe a atteint {{max}} membres, le maximum possible.',
    en: 'The group has reached {{max}} members, the maximum.',
  },
  PROPOSAL_REQUIRED: {
    fr: 'Le premier cycle a commencé : un nouveau membre doit d’abord être accepté par un vote. Propose son ajout dans l’onglet Votes.',
    en: 'The first cycle has started: a new member must first be accepted by a vote. Propose adding them in the Votes tab.',
  },
  PROPOSAL_NOT_PASSED: {
    fr: 'Cette proposition n’est pas adoptée. L’invitation sera possible quand le vote l’aura acceptée.',
    en: 'This proposal has not passed. The invite will be possible once the vote accepts it.',
  },
  PROPOSAL_PHONE_MISMATCH: {
    fr: 'Ce numéro n’est pas celui de la proposition adoptée. Vérifie le numéro de la personne.',
    en: 'This number is not the one in the passed proposal. Check the person’s number.',
  },
  PROPOSAL_ALREADY_USED: {
    fr: 'Cette proposition a déjà servi : la personne a rejoint le groupe.',
    en: 'This proposal has already been used: the person has joined the group.',
  },
  INVITE_ALREADY_PENDING: {
    fr: 'Une invitation encore valable existe déjà pour cette personne. Attends son expiration avant d’en créer une autre.',
    en: 'A valid invite already exists for this person. Wait until it expires before creating another one.',
  },
  INVITE_NOT_FOUND: {
    fr: 'Cette invitation est introuvable. Demande un nouveau lien à l’admin du groupe.',
    en: 'This invite was not found. Ask the group admin for a new link.',
  },
  INVITE_EXPIRED: {
    fr: 'Cette invitation a expiré. Demande un nouveau lien à l’admin du groupe.',
    en: 'This invite has expired. Ask the group admin for a new link.',
  },
  INVITE_USED: {
    fr: 'Cette invitation a déjà été utilisée. Demande un nouveau lien à l’admin si besoin.',
    en: 'This invite has already been used. Ask the admin for a new link if needed.',
  },
  INVITE_PHONE_MISMATCH: {
    fr: 'Ce lien d’invitation est lié à un autre numéro. Utilise le numéro que l’admin a invité.',
    en: 'This invite link is tied to another number. Use the number the admin invited.',
  },
  ALREADY_MEMBER: {
    fr: 'Tu fais déjà partie de ce groupe.',
    en: 'You are already a member of this group.',
  },
} as const satisfies Record<string, Bilingual>;

export type GroupErrorCode = keyof typeof groupErrorTexts;

/** Group system messages and notifications not covered by the designer’s copy (ui.*.ts chat.system). */
export const groupTexts = {
  groupCreated: { fr: '{{name}} a créé le groupe.', en: '{{name}} created the group.' },
  memberJoinedTitle: { fr: 'Nouveau membre', en: 'New member' },
  memberJoinedBody: { fr: '{{name}} a rejoint {{group}}.', en: '{{name}} joined {{group}}.' },
} as const satisfies Record<string, Bilingual>;

/** Notes of the INVITE_CREATE card; title, button and result come from confirmation.actions.createInvite. */
export const inviteActionTexts = {
  noteFounding: {
    fr: '{{name}} rejoindra le groupe comme membre fondateur.',
    en: '{{name}} will join the group as a founding member.',
  },
  noteNextCycle: {
    fr: '{{name}} pourra lire le groupe dès son arrivée et deviendra membre actif au prochain cycle.',
    en: '{{name}} can read the group right away and becomes an active member next cycle.',
  },
  noteLink: {
    fr: 'Le lien sert une seule fois, pendant 72 h, et seulement avec le numéro que tu as saisi.',
    en: 'The link works once, for 72 hours, and only with the number you entered.',
  },
} as const satisfies Record<string, Bilingual>;

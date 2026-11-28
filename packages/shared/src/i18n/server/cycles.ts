// Server texts for the end of a cycle and the start of the next one (D40, R9, R12.2). French uses "tu".
import type { Bilingual } from '../../lang';

export const cycleErrorTexts = {
  NOT_BETWEEN_CYCLES: {
    fr: 'Le groupe n’est pas entre deux cycles : un cycle est en cours, ou le premier n’a pas encore démarré.',
    en: 'The group is not between two cycles: a cycle is running, or the first one has not started yet.',
  },
  NOT_ENOUGH_MEMBERS: {
    fr: 'Il faut au moins 3 membres pour démarrer le cycle ; il y en a {{count}}. Invite d’autres membres, puis démarre le cycle.',
    en: 'A cycle needs at least 3 members; there are {{count}}. Invite more members, then start the cycle.',
  },
  TOO_MANY_MEMBERS: {
    fr: 'Un cycle accepte 50 membres au plus ; il y en a {{count}}.',
    en: 'A cycle takes 50 members at most; there are {{count}}.',
  },
  NOT_ON_PAYOUT_DAY: {
    fr: 'Pour un groupe mensuel, le premier versement doit tomber le jour de versement du groupe. Choisis la date proposée ou un autre mois.',
    en: 'For a monthly group, the first payout must fall on the group’s payout day. Choose the suggested date or another month.',
  },
  FIRST_PAYOUT_BEFORE_PREVIOUS: {
    fr: 'Le premier versement du nouveau cycle doit venir après le dernier versement du cycle précédent.',
    en: 'The new cycle’s first payout must come after the previous cycle’s last payout.',
  },
  FIRST_DEADLINE_TOO_SOON: {
    fr: 'La date limite de paiement du premier tour serait trop proche : les membres doivent avoir au moins 3 jours pour la voir venir. Choisis une date plus tardive.',
    en: 'The first round’s payment deadline would be too close: members need at least 3 days to see it coming. Choose a later date.',
  },
  INVALID_CUSTOM_PERIOD: {
    fr: 'La période personnalisée du groupe n’est pas valide. Change-la d’abord par un vote sur les règles.',
    en: 'The group’s custom period is not valid. Change it first with a rules vote.',
  },
  CYCLE_NOT_FOUND: {
    fr: 'Ce cycle est introuvable.',
    en: 'This cycle was not found.',
  },
} as const satisfies Record<string, Bilingual>;

export const cycleActionTexts = {
  noteKept: {
    fr: 'L’ordre des tours reste celui du cycle précédent ; les nouveaux membres passent en dernier.',
    en: 'The round order stays the same as the last cycle; new members go last.',
  },
  noteDrawn: {
    fr: 'Le cycle précédent n’avait pas d’ordre fixe : l’ordre sera tiré au sort, et chacun pourra le vérifier.',
    en: 'The last cycle had no fixed order: the order will be drawn by lot, and anyone can verify it.',
  },
  noteBidding: {
    fr: 'Mode enchères : le bénéficiaire de chaque tour est décidé par les enchères.',
    en: 'Bidding mode: each round’s beneficiary is decided by bids.',
  },
  noteFirstPayout: {
    fr: 'Premier versement : {{date}}.',
    en: 'First payout: {{date}}.',
  },
  noteMembers_one: {
    fr: '{{count}} membre participe au cycle {{cycle}}.',
    en: '{{count}} member takes part in cycle {{cycle}}.',
  },
  noteMembers_other: {
    fr: '{{count}} membres participent au cycle {{cycle}}.',
    en: '{{count}} members take part in cycle {{cycle}}.',
  },
  noteNewcomers_one: {
    fr: '{{count}} nouveau membre rejoint le cycle.',
    en: '{{count}} new member joins the cycle.',
  },
  noteNewcomers_other: {
    fr: '{{count}} nouveaux membres rejoignent le cycle.',
    en: '{{count}} new members join the cycle.',
  },
  noteValidAtConfirm: {
    fr: 'La date doit encore être valide au moment où tu confirmes ; sinon la confirmation sera refusée.',
    en: 'The date must still be valid when you confirm; otherwise the confirmation will be refused.',
  },
  noteDebts: {
    fr: 'Les dettes non payées du cycle précédent restent dues.',
    en: 'Unpaid debts from the last cycle stay due.',
  },
} as const satisfies Record<string, Bilingual>;

export const cycleSystemTexts = {
  closed: {
    fr: 'Le cycle {{cycle}} est terminé.',
    en: 'Cycle {{cycle}} has ended.',
  },
  fundShared: {
    fr: 'Caisse générale partagée : {{amount}} par membre éligible ({{count}} membres).',
    en: 'General fund shared: {{amount}} per eligible member ({{count}} members).',
  },
  fundNotShared: {
    fr: 'La caisse générale n’est pas partagée cette fois ; elle reste dans la caisse pour le cycle suivant.',
    en: 'The general fund is not shared this time; it stays in the fund for the next cycle.',
  },
  startedKept: {
    fr: 'Le cycle {{cycle}} démarre. Même ordre que le cycle précédent, nouveaux membres en dernier : {{order}}.',
    en: 'Cycle {{cycle}} starts. Same order as the last cycle, new members last: {{order}}.',
  },
  startedDrawn: {
    fr: 'Le cycle {{cycle}} démarre. Ordre tiré au sort, vérifiable dans le registre : {{order}}.',
    en: 'Cycle {{cycle}} starts. Order drawn by lot, verifiable in the records: {{order}}.',
  },
  startedBidding: {
    fr: 'Le cycle {{cycle}} démarre en mode enchères.',
    en: 'Cycle {{cycle}} starts in bidding mode.',
  },
  memberLeft: {
    fr: '{{name}} quitte le groupe à la fin du cycle.',
    en: '{{name}} leaves the group at the end of the cycle.',
  },
  memberActive: {
    fr: '{{name}} devient membre actif au cycle {{cycle}}.',
    en: '{{name}} becomes an active member in cycle {{cycle}}.',
  },
} as const satisfies Record<string, Bilingual>;

export const cycleNotificationTexts = {
  closedTitle: {
    fr: 'Cycle {{cycle}} terminé',
    en: 'Cycle {{cycle}} ended',
  },
  closedBodyShare: {
    fr: 'Tu reçois {{amount}} de la caisse générale. Tu peux le retirer depuis l’onglet Caisse.',
    en: 'You receive {{amount}} from the general fund. You can withdraw it from the Caisse tab.',
  },
  closedBodyDebt: {
    fr: 'Tu n’as pas de part de la caisse générale : il te reste des sommes à payer. Règle-les pour compter au prochain partage.',
    en: 'You have no share of the general fund: you still owe some payments. Settle them to count at the next sharing.',
  },
  closedBodyNone: {
    fr: 'Le cycle est terminé. Retrouve le résultat dans l’onglet Caisse.',
    en: 'The cycle has ended. Find the result in the Caisse tab.',
  },
  closedBodyLeft: {
    fr: 'Le cycle est terminé et tu quittes le groupe, comme tu l’avais annoncé. Tes relevés restent accessibles.',
    en: 'The cycle has ended and you leave the group, as you announced. Your statements stay available.',
  },
  adminStartTitle: {
    fr: 'Choisis le début du prochain cycle',
    en: 'Choose when the next cycle starts',
  },
  adminStartBody: {
    fr: 'Le cycle {{cycle}} est terminé. Choisis la date du premier versement pour démarrer le cycle suivant.',
    en: 'Cycle {{cycle}} has ended. Choose the first payout date to start the next cycle.',
  },
  adminWaitMembersBody: {
    fr: 'Le cycle {{cycle}} est terminé, mais il faut au moins 3 membres pour continuer. Invite d’autres membres.',
    en: 'Cycle {{cycle}} has ended, but at least 3 members are needed to continue. Invite more members.',
  },
  startedTitle: {
    fr: 'Le cycle {{cycle}} a démarré',
    en: 'Cycle {{cycle}} has started',
  },
  startedBody: {
    fr: 'Premier versement : {{date}}. Ouvre l’onglet Caisse pour voir ton tour.',
    en: 'First payout: {{date}}. Open the Caisse tab to see your round.',
  },
} as const satisfies Record<string, Bilingual>;

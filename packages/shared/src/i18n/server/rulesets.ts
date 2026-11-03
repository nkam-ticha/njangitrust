// Names of the rule-set parameters (3.2), used in error messages and rule displays.
import type { Bilingual } from '../../lang';

export const ruleLabels = {
  contributionAmount: { fr: 'montant de la cotisation', en: 'contribution amount' },
  solidarityContribution: { fr: 'contribution à la caisse de secours', en: 'solidarity contribution' },
  frequency: { fr: 'fréquence des tours', en: 'round frequency' },
  payoutTime: { fr: 'heure du versement', en: 'payout time' },
  lateFine: { fr: 'amende de retard', en: 'late fine' },
  rotationMode: { fr: 'mode de rotation', en: 'rotation mode' },
  minBid: { fr: 'enchère minimale', en: 'minimum bid' },
  loanRatePermille: { fr: 'taux mensuel des prêts (‰)', en: 'monthly loan rate (‰)' },
  loanMaxMonths: { fr: 'durée maximale des prêts (mois)', en: 'maximum loan length (months)' },
  loanLimitFactorPermille: { fr: 'plafond des prêts (‰ des cotisations)', en: 'loan limit (‰ of contributions)' },
  numberChangeHoldHours: { fr: 'délai de sécurité après changement de numéro (heures)', en: 'security delay after a number change (hours)' },
  voteWindowHours: { fr: 'durée des votes (heures)', en: 'vote length (hours)' },
  solidarityVoteWindowHours: { fr: 'durée des votes de secours (heures)', en: 'solidarity vote length (hours)' },
  meetingAbsenceFine: { fr: 'amende d’absence aux réunions', en: 'meeting absence fine' },
  distributeFundAtCycleEnd: { fr: 'partage de la caisse générale en fin de cycle', en: 'general fund shared at cycle end' },
  reliabilityWindow: { fr: 'période du score de fiabilité', en: 'reliability score window' },
} as const satisfies Record<string, Bilingual>;

export type RuleLabelKey = keyof typeof ruleLabels;

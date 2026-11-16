// Server texts for statements, the audit export and verification (spec 2.14, FSD STA-01, LED-04).
// The PDF is written in the member's language, so its words live here in both languages.
// French uses "tu"; the PDF itself is a formal document and speaks of "le membre".
import type { Bilingual, Lang } from '../../lang';

export const statementErrorTexts = {
  STATEMENT_NOT_FOUND: {
    fr: 'Ce relevé est introuvable.',
    en: 'This statement was not found.',
  },
  PERIOD_ENDS_BEFORE_START: {
    fr: 'La date de fin doit suivre la date de début.',
    en: 'The end date must come after the start date.',
  },
  PERIOD_TOO_LONG: {
    fr: 'Un relevé couvre trois ans au plus.',
    en: 'A statement covers three years at most.',
  },
  PERIOD_INVALID: {
    fr: 'Cette période n’est pas valable. Choisis un mois, un cycle ou des dates.',
    en: 'This period is not valid. Choose a month, a cycle or dates.',
  },
  PERIOD_IN_THE_FUTURE: {
    fr: 'Cette période n’a pas encore commencé.',
    en: 'This period has not started yet.',
  },
  CYCLE_NOT_FOUND: {
    fr: 'Ce cycle n’existe pas encore dans ce groupe.',
    en: 'This cycle does not exist yet in this group.',
  },
  STATEMENT_ALREADY_EXISTS: {
    fr: 'Ce relevé existe déjà.',
    en: 'This statement already exists.',
  },
  EXPORT_NOT_AVAILABLE: {
    fr: 'Le registre n’est pas disponible pour le moment. Réessaie plus tard.',
    en: 'The ledger is not available right now. Try again later.',
  },
} as const satisfies Record<string, Bilingual>;

export const statementTexts = {
  readyTitle: { fr: 'Ton relevé est prêt', en: 'Your statement is ready' },
  readyBody: {
    fr: '{{group}} : ton relevé de {{period}} est prêt.',
    en: '{{group}}: your statement for {{period}} is ready.',
  },
  monthPeriod: { fr: '{{month}} {{year}}', en: '{{month}} {{year}}' },
  cyclePeriod: { fr: 'cycle {{cycle}}', en: 'cycle {{cycle}}' },
  customPeriod: { fr: 'du {{from}} au {{to}}', en: 'from {{from}} to {{to}}' },
} as const satisfies Record<string, Bilingual>;

/** Month names, for "octobre 2026" / "October 2026". */
export const monthNames: Record<Lang, readonly string[]> = {
  fr: [
    'janvier',
    'février',
    'mars',
    'avril',
    'mai',
    'juin',
    'juillet',
    'août',
    'septembre',
    'octobre',
    'novembre',
    'décembre',
  ],
  en: [
    'January',
    'February',
    'March',
    'April',
    'May',
    'June',
    'July',
    'August',
    'September',
    'October',
    'November',
    'December',
  ],
};

/** Everything printed on the statement PDF, in one language. */
export interface StatementPdfLabels {
  title: string;
  group: string;
  member: string;
  period: string;
  issued: string;
  amount: string;
  total: string;
  none: string;
  onTime: string;
  late: string;
  round: string;
  reversal: string;
  sections: {
    contributions: string;
    solidarityContributions: string;
    payouts: string;
    withdrawals: string;
    loans: string;
    repayments: string;
    fines: string;
    bids: string;
    fees: string;
    supportReceived: string;
  };
  kinds: {
    SHORTFALL: string;
    ROUND_PAYOUT: string;
    SHORTFALL_REFUND: string;
    POT: string;
    FUND_SHARE: string;
    REFUND: string;
    WITHDRAWAL_FEE: string;
    LOAN_FEE: string;
    CORRECTION_FEE: string;
    INSTALLMENT: string;
    INSTALLMENT_REFUND: string;
    CLAWBACK: string;
    CLAWBACK_RELEASE: string;
  };
  feeShareNote: string;
  interestNote: string;
  reliability: string;
  reliabilityScore: string;
  reliabilityNew: string;
  reliabilityFormula: string;
  verification: string;
  verifyAt: string;
  footerNote: string;
}

export const statementPdfLabels: Record<Lang, StatementPdfLabels> = {
  fr: {
    title: 'Relevé de membre',
    group: 'Groupe',
    member: 'Membre',
    period: 'Période',
    issued: 'Établi le',
    amount: 'Montant',
    total: 'Total',
    none: 'Aucune opération sur la période.',
    onTime: 'à temps',
    late: 'en retard',
    round: 'Tour',
    reversal: 'annulation',
    sections: {
      contributions: 'Cotisations payées',
      solidarityContributions: 'Cotisations de solidarité',
      payouts: 'Versements reçus',
      withdrawals: 'Retraits',
      loans: 'Prêts reçus',
      repayments: 'Remboursements de prêt',
      fines: 'Amendes',
      bids: 'Enchères gagnées',
      fees: 'Frais supportés',
      supportReceived: 'Soutien reçu (caisse de secours)',
    },
    kinds: {
      SHORTFALL: 'Part de remboursement',
      ROUND_PAYOUT: 'Versement du tour',
      SHORTFALL_REFUND: 'Remboursement reçu',
      POT: 'Mise gagnante',
      FUND_SHARE: 'Part de la caisse générale',
      REFUND: 'Remboursement de départ',
      WITHDRAWAL_FEE: 'Frais de retrait',
      LOAN_FEE: 'Frais de prêt',
      CORRECTION_FEE: 'Frais de correction',
      INSTALLMENT: 'Remboursement',
      INSTALLMENT_REFUND: 'Remboursements restitués (prêt annulé)',
      CLAWBACK: 'Somme à rendre (paiement annulé)',
      CLAWBACK_RELEASE: 'Somme rendue par la caisse de secours',
    },
    feeShareNote: 'dont frais de collecte déjà déduits : {{amount}}',
    interestNote: 'dont intérêts : {{amount}}',
    reliability: 'Fiabilité',
    reliabilityScore: '{{score}} % : {{onTime}} sur {{due}} à temps',
    reliabilityNew: 'Nouveau membre (moins de 3 échéances)',
    reliabilityFormula:
      'Part des {{window}} dernières échéances payées à temps (cotisation et solidarité comptées ensemble, remboursements de prêt).',
    verification: 'Code de vérification',
    verifyAt: 'Vérifier ce relevé sur',
    footerNote:
      'Montants en francs CFA entiers. Dates à l’heure du Cameroun. Le code prouve que ce relevé correspond au registre du groupe.',
  },
  en: {
    title: 'Member statement',
    group: 'Group',
    member: 'Member',
    period: 'Period',
    issued: 'Issued on',
    amount: 'Amount',
    total: 'Total',
    none: 'No transactions in this period.',
    onTime: 'on time',
    late: 'late',
    round: 'Round',
    reversal: 'reversal',
    sections: {
      contributions: 'Contributions paid',
      solidarityContributions: 'Solidarity contributions',
      payouts: 'Payouts received',
      withdrawals: 'Withdrawals',
      loans: 'Loans received',
      repayments: 'Loan repayments',
      fines: 'Fines',
      bids: 'Winning bids',
      fees: 'Fees borne',
      supportReceived: 'Support received (solidarity fund)',
    },
    kinds: {
      SHORTFALL: 'Refund share',
      ROUND_PAYOUT: 'Round payout',
      SHORTFALL_REFUND: 'Refund received',
      POT: 'Winning bid pot',
      FUND_SHARE: 'General fund share',
      REFUND: 'Leaving refund',
      WITHDRAWAL_FEE: 'Withdrawal fee',
      LOAN_FEE: 'Loan fee',
      CORRECTION_FEE: 'Correction fee',
      INSTALLMENT: 'Repayment',
      INSTALLMENT_REFUND: 'Repayments returned (loan cancelled)',
      CLAWBACK: 'Amount to give back (payment reversed)',
      CLAWBACK_RELEASE: 'Amount returned by the solidarity fund',
    },
    feeShareNote: 'of which collection fees already deducted: {{amount}}',
    interestNote: 'of which interest: {{amount}}',
    reliability: 'Reliability',
    reliabilityScore: '{{score}}%: {{onTime}} of {{due}} on time',
    reliabilityNew: 'New member (fewer than 3 due items)',
    reliabilityFormula:
      'Share of the last {{window}} due items paid on time (contribution and solidarity counted together, loan installments).',
    verification: 'Verification code',
    verifyAt: 'Verify this statement at',
    footerNote:
      'Amounts in whole CFA francs. Dates in Cameroon time. The code proves this statement matches the group ledger.',
  },
};

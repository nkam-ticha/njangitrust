import { defineErrors } from '../../lib/errors';

export const loanError = defineErrors({
  NO_ACTIVE_CYCLE: {
    status: 409,
    text: { fr: 'Aucun cycle actif pour ce groupe.', en: 'This group has no active cycle.' },
  },
  LOAN_NOT_FOUND: {
    status: 404,
    text: { fr: 'Ce prêt est introuvable.', en: 'This loan was not found.' },
  },
  LOAN_NOT_PENDING: {
    status: 409,
    text: {
      fr: 'Cette demande de prêt a déjà été traitée.',
      en: 'This loan request has already been decided.',
    },
  },
  LOAN_REQUEST_EXPIRED: {
    status: 409,
    text: {
      fr: 'Le délai de décision de 72 heures est passé.',
      en: 'The 72-hour decision window has expired.',
    },
  },
  LOAN_REASON_REQUIRED: {
    status: 400,
    text: { fr: 'Indique la raison de cette décision.', en: 'Give a reason for this decision.' },
  },
  LOAN_ADMIN_VOTE: {
    status: 409,
    text: {
      fr: 'Le prêt de l’admin doit être décidé par un vote.',
      en: 'An admin’s own loan must be decided by a vote.',
    },
  },
  LOAN_UNAVAILABLE: {
    status: 409,
    text: {
      fr: 'Le service de prêt est momentanément indisponible.',
      en: 'The loan service is temporarily unavailable.',
    },
  },
  NOTHING_TO_REPAY: {
    status: 409,
    text: {
      fr: 'Aucune échéance de prêt ne reste à payer.',
      en: 'There are no loan installments left to repay.',
    },
  },
  AMOUNT_NOT_WHOLE_INSTALLMENTS: {
    status: 400,
    text: {
      fr: 'Choisis un montant correspondant à des échéances entières.',
      en: 'Choose an amount that covers whole installments.',
    },
  },
  LOAN_NOT_YOURS: {
    status: 403,
    text: {
      fr: 'Tu ne peux rembourser que ton propre prêt.',
      en: 'You can only repay your own loan.',
    },
  },
});

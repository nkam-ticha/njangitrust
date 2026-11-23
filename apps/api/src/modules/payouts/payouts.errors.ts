// Payout and withdrawal errors (R5.4, R5.5, R13.5, D11). Each one says what happened and what to do
// in both languages: the app shows the server's text as it is (errorMessage).
import { defineErrors } from '../../lib/errors';

const tx = (fr: string, en: string) => ({ fr, en });

export const payoutError = defineErrors({
  ACTION_NOT_AVAILABLE: {
    status: 409,
    text: tx(
      'Cette action n’est plus disponible. Actualise l’écran puis prépare-la de nouveau.',
      'This action is no longer available. Refresh the screen and prepare it again.',
    ),
  },
  DISBURSEMENTS_PAUSED: {
    status: 409,
    text: tx(
      'Les retraits sont en pause dans ce groupe jusqu’à la prochaine vérification des comptes. Les paiements restent possibles.',
      'Withdrawals are paused in this group until the next account check. Payments still work.',
    ),
  },
  HOLD_ACTIVE: {
    status: 409,
    text: tx(
      'Tu as changé ton numéro de paiement : les retraits sont suspendus jusqu’au {{date}}.',
      'You changed your payment number: withdrawals are held until {{date}}.',
    ),
  },
  NO_ACTIVE_PAYMENT_NUMBER: {
    status: 409,
    text: tx(
      'Ajoute un numéro Mobile Money dans l’onglet Moi avant de retirer.',
      'Add a Mobile Money number in the Me tab before withdrawing.',
    ),
  },
  WITHDRAWAL_IN_PROGRESS: {
    status: 409,
    text: tx(
      'Un retrait est déjà en cours. Attends qu’il soit terminé avant d’en demander un autre.',
      'A withdrawal is already in progress. Wait until it is finished before asking for another.',
    ),
  },
  NOTHING_TO_WITHDRAW: {
    status: 409,
    text: tx(
      'Tu n’as pas assez d’argent disponible pour retirer (minimum {{minimum}}).',
      'You do not have enough available money to withdraw (minimum {{minimum}}).',
    ),
  },
  BELOW_MINIMUM_WITHDRAWAL: {
    status: 400,
    text: tx(
      'Le retrait minimum est de {{minimum}}. Augmente le montant.',
      'The minimum withdrawal is {{minimum}}. Increase the amount.',
    ),
  },
  ABOVE_AVAILABLE: {
    status: 409,
    text: tx(
      'Ce montant dépasse ce que tu peux retirer : {{available}} au plus, frais compris. Baisse le montant.',
      'This amount is more than you can withdraw: {{available}} at most, fees included. Lower the amount.',
    ),
  },
  INVALID_AMOUNT: {
    status: 400,
    text: tx(
      'Le montant doit être un nombre entier de FCFA, supérieur à zéro.',
      'The amount must be a whole number of FCFA, above zero.',
    ),
  },
  INSTALLMENT_PAYMENT_PENDING: {
    status: 409,
    text: tx(
      'Une échéance de prêt est en cours de paiement. Attends qu’elle soit terminée puis réessaie.',
      'A loan installment is being paid. Wait until it is finished, then try again.',
    ),
  },
});

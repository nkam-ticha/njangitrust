import { defineErrors } from '../../lib/errors';

const tx = (fr: string, en: string) => ({ fr, en });

export const paymentError = defineErrors({
  NOTHING_TO_PAY: {
    status: 409,
    text: tx('Aucun paiement à préparer.', 'There is nothing to pay.'),
  },
  PAYMENT_NOT_FOUND: { status: 404, text: tx('Paiement introuvable.', 'Payment not found.') },
  PAYMENT_NUMBER_MISSING: {
    status: 409,
    text: tx(
      'Ajoute un numéro Mobile Money avant de payer.',
      'Add a Mobile Money number before paying.',
    ),
  },
  OBLIGATION_NOT_AVAILABLE: {
    status: 409,
    text: tx('Cette somme ne peut pas être payée maintenant.', 'This amount cannot be paid now.'),
  },
  PAYMENT_ALREADY_PENDING: {
    status: 409,
    text: tx(
      'Une demande de paiement est déjà en cours pour cet élément.',
      'A payment request is already pending for this item.',
    ),
  },
  PAYMENT_BLOCKED_BY_EXIT_VOTE: {
    status: 409,
    text: tx(
      'Un vote sur ton départ est ouvert. Tu pourras payer quand il sera clos.',
      'A vote on your leaving is open. You will be able to pay once it has closed.',
    ),
  },
  PAYMENT_REQUEST_FAILED: {
    status: 503,
    text: tx(
      'La demande Mobile Money n’a pas pu démarrer. Réessaie dans un instant.',
      'The Mobile Money request could not start. Try again shortly.',
    ),
  },
});

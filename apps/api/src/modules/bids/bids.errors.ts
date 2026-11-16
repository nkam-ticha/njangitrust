import { defineErrors } from '../../lib/errors';

export const bidError = defineErrors({
  ROUND_NOT_FOUND: {
    status: 404,
    text: { fr: 'Ce tour est introuvable.', en: 'This round was not found.' },
  },
  BID_NOT_AVAILABLE: {
    status: 409,
    text: { fr: 'Tu ne peux pas enchérir sur ce tour.', en: 'You cannot bid on this round.' },
  },
  BID_ACTION_CHANGED: {
    status: 409,
    text: {
      fr: 'Les enchères ont changé. Prépare une nouvelle mise.',
      en: 'Bidding has changed. Prepare a new bid.',
    },
  },
});

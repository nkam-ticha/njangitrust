import { defineErrors } from '../../lib/errors';

const errors = defineErrors({
  ROUND_NOT_FOUND: {
    status: 404,
    text: {
      fr: 'Ce tour n’existe pas encore. Il apparaît quand le cycle démarre.',
      en: 'This round does not exist yet. It appears when the cycle starts.',
    },
  },
  PAYOUT_NOT_ASSIGNED: {
    status: 409,
    text: {
      fr: 'Le bénéficiaire de ce tour n’est pas encore connu. Le détail du versement sera disponible ensuite.',
      en: 'The beneficiary of this round is not known yet. The payout details will be available afterwards.',
    },
  },
});

export const roundError = errors;

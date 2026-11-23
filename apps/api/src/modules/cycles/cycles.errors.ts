import { defineErrors } from '../../lib/errors';

export const cycleError = defineErrors({
  CYCLE_ALREADY_STARTED: {
    status: 409,
    text: {
      fr: 'Le premier cycle de ce groupe a déjà démarré.',
      en: 'This group’s first cycle has already started.',
    },
  },
  CYCLE_START_UNAVAILABLE: {
    status: 409,
    text: {
      fr: 'Cette opération sur le cycle n’est pas possible pour le moment. Un cycle démarre avec 3 à 50 membres actifs.',
      en: 'This cycle operation is not possible right now. A cycle starts with 3 to 50 active members.',
    },
  },
});

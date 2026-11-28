import { defineErrors } from '../../lib/errors';
import { cycleErrorTexts } from '@njangi/shared/i18n/server/cycles';

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

// D40: closing a cycle and starting the next one.
export const nextCycleError = defineErrors({
  NOT_BETWEEN_CYCLES: { status: 409, text: cycleErrorTexts.NOT_BETWEEN_CYCLES },
  NOT_ENOUGH_MEMBERS: { status: 409, text: cycleErrorTexts.NOT_ENOUGH_MEMBERS },
  TOO_MANY_MEMBERS: { status: 409, text: cycleErrorTexts.TOO_MANY_MEMBERS },
  NOT_ON_PAYOUT_DAY: { status: 409, text: cycleErrorTexts.NOT_ON_PAYOUT_DAY },
  FIRST_PAYOUT_BEFORE_PREVIOUS: { status: 409, text: cycleErrorTexts.FIRST_PAYOUT_BEFORE_PREVIOUS },
  FIRST_DEADLINE_TOO_SOON: { status: 409, text: cycleErrorTexts.FIRST_DEADLINE_TOO_SOON },
  INVALID_CUSTOM_PERIOD: { status: 409, text: cycleErrorTexts.INVALID_CUSTOM_PERIOD },
  CYCLE_NOT_FOUND: { status: 404, text: cycleErrorTexts.CYCLE_NOT_FOUND },
});

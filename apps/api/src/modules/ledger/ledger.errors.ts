import { defineErrors } from '../../lib/errors';

export const ledgerError = defineErrors({
  LEDGER_ENTRY_NOT_FOUND: {
    status: 404,
    text: {
      fr: 'Cette ligne du registre est introuvable.',
      en: 'This ledger entry was not found.',
    },
  },
});

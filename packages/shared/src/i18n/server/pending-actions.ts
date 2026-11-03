// Server texts of the confirmation protocol (spec 4.5).
import type { Bilingual } from '../../lang';

export const pendingActionErrorTexts = {
  ACTION_NOT_FOUND: {
    fr: 'Cette action est introuvable. Prépare-la à nouveau.',
    en: 'This action was not found. Prepare it again.',
  },
  ACTION_EXPIRED: {
    fr: 'Cette action a expiré au bout de 10 minutes. Prépare-la à nouveau.',
    en: 'This action expired after 10 minutes. Prepare it again.',
  },
  ACTION_ALREADY_CONFIRMED: {
    fr: 'Cette action a déjà été confirmée. Son résultat s’affiche sur la carte.',
    en: 'This action was already confirmed. Its result is shown on the card.',
  },
  ACTION_CANCELLED: {
    fr: 'Cette action a été annulée. Prépare-la à nouveau si besoin.',
    en: 'This action was cancelled. Prepare it again if needed.',
  },
  ACTION_NOT_PENDING: {
    fr: 'Cette action n’attend plus de confirmation.',
    en: 'This action is no longer waiting for confirmation.',
  },
  ACTION_CHANGED: {
    fr: 'Les détails ont changé depuis la préparation de cette action. Prépare-la à nouveau pour voir la carte à jour.',
    en: 'The details changed since this action was prepared. Prepare it again to see the updated card.',
  },
  ACTION_NOT_ALLOWED_NOW: {
    fr: 'Cette action n’est plus possible : {{reason}}',
    en: 'This action is no longer possible: {{reason}}',
  },
} as const satisfies Record<string, Bilingual>;

export type PendingActionErrorCode = keyof typeof pendingActionErrorTexts;

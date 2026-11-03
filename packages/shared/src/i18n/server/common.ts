// Server texts shared by every area: generic errors. Placeholders are written {{name}} and filled
// by the API. French uses "tu"; errors say what happened and what to do, without apologising.
import type { Bilingual } from '../../lang';

export const commonErrorTexts = {
  VALIDATION_FAILED: {
    fr: 'Certaines informations sont invalides. Corrige les champs signalés puis réessaie.',
    en: 'Some details are invalid. Fix the highlighted fields and try again.',
  },
  INVALID_JSON: {
    fr: 'La requête est illisible. Mets l’application à jour puis réessaie.',
    en: 'The request could not be read. Update the app and try again.',
  },
  PAYLOAD_TOO_LARGE: {
    fr: 'La requête est trop volumineuse. Raccourcis le texte puis réessaie.',
    en: 'The request is too large. Shorten the text and try again.',
  },
  UNSUPPORTED_MEDIA_TYPE: {
    fr: 'Ce format de requête n’est pas accepté. Mets l’application à jour puis réessaie.',
    en: 'This request format is not accepted. Update the app and try again.',
  },
  UNAUTHENTICATED: {
    fr: 'Ta session a expiré. Reconnecte-toi avec ton numéro et ton code PIN.',
    en: 'Your session has expired. Log in again with your phone number and PIN.',
  },
  FORBIDDEN: {
    fr: 'Tu n’as pas le droit de faire cette action.',
    en: 'You are not allowed to do this.',
  },
  NOT_FOUND: {
    fr: 'Introuvable. Vérifie le lien ou actualise l’écran.',
    en: 'Not found. Check the link or refresh the screen.',
  },
  ROUTE_NOT_FOUND: {
    fr: 'Cette adresse n’existe pas. Mets l’application à jour.',
    en: 'This address does not exist. Update the app.',
  },
  RATE_LIMITED: {
    fr: 'Trop de demandes en peu de temps. Réessaie dans {{seconds}} secondes.',
    en: 'Too many requests in a short time. Try again in {{seconds}} seconds.',
  },
  CSRF_HEADER_MISSING: {
    fr: 'Requête refusée par sécurité. Recharge la page puis réessaie.',
    en: 'Request refused for security. Reload the page and try again.',
  },
  ORIGIN_NOT_ALLOWED: {
    fr: 'Ce site n’est pas autorisé à utiliser NjangiTrust. Ouvre l’application officielle.',
    en: 'This site is not allowed to use NjangiTrust. Open the official app.',
  },
  CONFLICT: {
    fr: 'Une autre opération a modifié ces données en même temps. Actualise puis réessaie.',
    en: 'Another operation changed this data at the same time. Refresh and try again.',
  },
  INTERNAL: {
    fr: 'Une erreur inattendue s’est produite. Réessaie dans un moment.',
    en: 'Something unexpected went wrong. Try again in a moment.',
  },
  SERVICE_UNAVAILABLE: {
    fr: 'Le service est momentanément indisponible. Réessaie dans quelques minutes.',
    en: 'The service is temporarily unavailable. Try again in a few minutes.',
  },
} as const satisfies Record<string, Bilingual>;

export type CommonErrorCode = keyof typeof commonErrorTexts;

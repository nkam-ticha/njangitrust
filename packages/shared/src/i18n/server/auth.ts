// Server texts for authentication, sessions and PIN resets (spec 2.10, D8).
import type { Bilingual } from '../../lang';

export const authErrorTexts = {
  PIN_TOO_WEAK: {
    fr: 'Ce code PIN est trop facile à deviner. Évite les chiffres identiques, les suites comme 123456 et les chiffres de ton numéro.',
    en: 'This PIN is too easy to guess. Avoid repeated digits, sequences like 123456 and the digits of your phone number.',
  },
  PIN_SAME_AS_OLD: {
    fr: 'Le nouveau code PIN doit être différent de l’ancien.',
    en: 'The new PIN must be different from the old one.',
  },
  PHONE_ALREADY_REGISTERED: {
    fr: 'Ce numéro a déjà un compte. Connecte-toi avec ton code PIN, ou demande une réinitialisation si tu l’as oublié.',
    en: 'This number already has an account. Log in with your PIN, or ask for a reset if you forgot it.',
  },
  CONSENT_OUTDATED: {
    fr: 'La politique de confidentialité a changé. Lis la nouvelle version puis accepte-la pour continuer.',
    en: 'The privacy notice has changed. Read the new version and accept it to continue.',
  },
  OPERATOR_REQUIRED: {
    fr: 'Choisis l’opérateur de ton numéro de paiement : MTN ou Orange.',
    en: 'Choose the operator of your payment number: MTN or Orange.',
  },
  INVALID_CREDENTIALS: {
    fr: 'Numéro ou code PIN incorrect. Vérifie-les puis réessaie.',
    en: 'Wrong phone number or PIN. Check them and try again.',
  },
  INVALID_CREDENTIALS_LAST_ATTEMPT: {
    fr: 'Numéro ou code PIN incorrect. Attention : encore une erreur et la connexion sera bloquée 15 minutes.',
    en: 'Wrong phone number or PIN. Careful: one more mistake and login will be blocked for 15 minutes.',
  },
  LOGIN_LOCKED: {
    fr: 'Trop de codes PIN incorrects. La connexion est bloquée pendant {{minutes}} minutes. Si tu as oublié ton code PIN, demande une réinitialisation.',
    en: 'Too many wrong PINs. Login is blocked for {{minutes}} minutes. If you forgot your PIN, ask for a reset.',
  },
  SESSION_INVALID: {
    fr: 'Ta session a expiré. Reconnecte-toi avec ton numéro et ton code PIN.',
    en: 'Your session has expired. Log in again with your phone number and PIN.',
  },
  SESSION_REUSED: {
    fr: 'Ta session a été fermée par sécurité. Reconnecte-toi avec ton numéro et ton code PIN.',
    en: 'Your session was closed for security. Log in again with your phone number and PIN.',
  },
  PIN_REQUIRED: {
    fr: 'Saisis ton code PIN pour confirmer cette action.',
    en: 'Enter your PIN to confirm this action.',
  },
  PIN_INCORRECT: {
    fr: 'Code PIN incorrect. Vérifie-le puis réessaie.',
    en: 'Wrong PIN. Check it and try again.',
  },
  PIN_INCORRECT_LAST_ATTEMPT: {
    fr: 'Code PIN incorrect. Attention : encore une erreur et la confirmation sera bloquée 15 minutes.',
    en: 'Wrong PIN. Careful: one more mistake and confirmations will be blocked for 15 minutes.',
  },
  PIN_LOCKED: {
    fr: 'Trop de codes PIN incorrects. Réessaie dans {{minutes}} minutes.',
    en: 'Too many wrong PINs. Try again in {{minutes}} minutes.',
  },
  PIN_RESET_LINK_INVALID: {
    fr: 'Ce lien de réinitialisation n’est plus valable. Fais une nouvelle demande de réinitialisation.',
    en: 'This reset link is no longer valid. Ask for a new PIN reset.',
  },
  PIN_RESET_PHONE_MISMATCH: {
    fr: 'Ce numéro ne correspond pas à ce lien. Saisis le numéro de connexion du compte.',
    en: 'This number does not match this link. Enter the login number of the account.',
  },
  PIN_RESET_NOT_FOUND: {
    fr: 'Cette demande de réinitialisation n’existe plus. Elle a peut-être expiré ou déjà été confirmée.',
    en: 'This reset request no longer exists. It may have expired or already been confirmed.',
  },
  PIN_RESET_NOT_ALLOWED: {
    fr: 'Tu ne peux pas confirmer cette demande. Seul l’admin du groupe le peut, ou, pour l’admin, deux autres membres actifs.',
    en: 'You cannot confirm this request. Only the group admin can, or, for the admin, two other active members.',
  },
  PIN_RESET_ALREADY_CONFIRMED: {
    fr: 'Tu as déjà confirmé cette demande. Il faut maintenant la confirmation d’un autre membre.',
    en: 'You already confirmed this request. Another member must now confirm it too.',
  },
} as const satisfies Record<string, Bilingual>;

export type AuthErrorCode = keyof typeof authErrorTexts;

/** Notifications (category SECURITY unless noted). */
export const authTexts = {
  sessionReusedTitle: { fr: 'Session fermée par sécurité', en: 'Session closed for security' },
  sessionReusedBody: {
    fr: 'Une ancienne connexion à ton compte a été réutilisée, alors on l’a fermée. Si ce n’était pas toi, change ton code PIN.',
    en: 'An old login to your account was reused, so we closed it. If it wasn’t you, change your PIN.',
  },
  pinChangedTitle: { fr: 'Code PIN modifié', en: 'PIN changed' },
  pinChangedBody: {
    fr: 'Ton code PIN a été modifié et tes autres appareils ont été déconnectés. Si ce n’était pas toi, demande tout de suite une réinitialisation.',
    en: 'Your PIN was changed and your other devices were logged out. If it wasn’t you, ask for a reset right away.',
  },
  pinResetRequestedTitle: { fr: 'Demande de nouveau code PIN', en: 'PIN reset request' },
  pinResetRequestedBody: {
    fr: '{{name}} demande à réinitialiser son code PIN. Confirme seulement si tu as vérifié que c’est bien {{name}}, en personne ou par appel.',
    en: '{{name}} is asking to reset their PIN. Confirm only if you have checked it really is {{name}}, in person or by phone.',
  },
  pinResetDoneTitle: { fr: 'Code PIN réinitialisé', en: 'PIN reset' },
  pinResetDoneBody: {
    fr: 'Ton code PIN a été réinitialisé. Par sécurité, tes retraits sont suspendus pendant le délai de sécurité de chaque groupe.',
    en: 'Your PIN was reset. For security, your withdrawals are paused for each group’s security delay.',
  },
  pinResetDeclinedTitle: { fr: 'Demande de nouveau code PIN refusée', en: 'New PIN request declined' },
  pinResetDeclinedBody: {
    fr: 'Un membre de ton groupe n’a pas reconnu ta demande de nouveau code PIN. Si c’était bien toi, parle-lui puis fais une nouvelle demande.',
    en: 'A member of your group did not recognise your request for a new PIN. If it was you, talk to them, then ask again.',
  },
} as const satisfies Record<string, Bilingual>;


// Server texts for the group chat (spec 1.5, 2.13, 4.4, CHT-01..03). Placeholders are {{name}}.
// French uses "tu". Notification texts never carry a phone number or the content of a private
// message: they show on lock screens.
import type { Bilingual } from '../../lang';

export const chatErrorTexts = {
  MESSAGE_NOT_FOUND: {
    fr: 'Ce message est introuvable.',
    en: 'This message was not found.',
  },
  REPLY_TARGET_INVALID: {
    fr: 'Tu ne peux répondre qu’à un message de ce groupe.',
    en: 'You can only reply to a message of this group.',
  },
  NOT_YOUR_MESSAGE: {
    fr: 'Tu ne peux supprimer que tes propres messages.',
    en: 'You can only delete your own messages.',
  },
  MESSAGE_ALREADY_REMOVED: {
    fr: 'Ce message a déjà été supprimé ou masqué.',
    en: 'This message has already been deleted or hidden.',
  },
  MESSAGE_NOT_HIDEABLE: {
    fr: 'Seuls les messages écrits par des membres peuvent être masqués.',
    en: 'Only messages written by members can be hidden.',
  },
  MENTION_NOT_A_MEMBER: {
    fr: 'Tu ne peux mentionner que des membres de ce groupe.',
    en: 'You can only mention members of this group.',
  },
  MESSAGE_ID_TAKEN: {
    fr: 'Cet identifiant de message est déjà utilisé. Réessaie.',
    en: 'This message ID is already used. Try again.',
  },
  ATTACHMENT_NOT_USABLE: {
    fr: 'Ce fichier n’est pas disponible pour ce message. Envoie-le à nouveau.',
    en: 'This file cannot be used for this message. Upload it again.',
  },
  CHAT_NOT_AVAILABLE: {
    fr: 'Tu ne fais plus partie de ce groupe : le fil n’est plus disponible.',
    en: 'You are no longer in this group: the chat is not available.',
  },
} as const satisfies Record<string, Bilingual>;

export const chatTexts = {
  newMessagesTitle: {
    fr: 'Nouveaux messages dans {{group}}',
    en: 'New messages in {{group}}',
  },
  newMessagesBody: {
    fr: '{{name}} a écrit dans le groupe.',
    en: '{{name}} wrote in the group.',
  },
  mentionBody: {
    fr: 'Dans {{group}}.',
    en: 'In {{group}}.',
  },
  announcementTitle: {
    fr: 'Nouvelle annonce dans {{group}}',
    en: 'New announcement in {{group}}',
  },
  /** Card notes for the actions of the chat. */
  hideNote: {
    fr: 'Le message disparaît pour tout le monde. Ton nom et le motif sont gardés dans le journal.',
    en: 'The message disappears for everyone. Your name and the reason are kept in the log.',
  },
  announcementNote: {
    fr: 'L’annonce est épinglée en haut du groupe et chaque membre est prévenu.',
    en: 'The announcement is pinned at the top of the group and every member is notified.',
  },
  postNote: {
    fr: 'Le message sera publié sous ton nom.',
    en: 'The message will be posted under your name.',
  },
  postedSummary: { fr: 'Message publié.', en: 'Message posted.' },
  hiddenSummary: { fr: 'Message masqué.', en: 'Message hidden.' },
  announcedSummary: { fr: 'Annonce publiée.', en: 'Announcement published.' },
} as const satisfies Record<string, Bilingual>;

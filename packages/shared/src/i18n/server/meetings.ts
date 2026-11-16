// Server texts for meetings (spec R15, FSD MTG-01). Section titles of the minutes and the
// automatic agenda items come from the designer's copy (meetings.minutes.sections, meetings.agenda);
// this file holds the rest. French uses "tu".
import type { Bilingual } from '../../lang';

export const meetingErrorTexts = {
  MEETING_NOT_FOUND: {
    fr: 'Cette réunion est introuvable.',
    en: 'This meeting was not found.',
  },
  MEETING_IN_THE_PAST: {
    fr: 'La réunion doit être planifiée à une date à venir.',
    en: 'The meeting must be scheduled for a future date.',
  },
  MEETING_NOT_SCHEDULED: {
    fr: 'Cette réunion est déjà clôturée ou annulée.',
    en: 'This meeting is already closed or cancelled.',
  },
  MEETING_TOO_FAR: {
    fr: 'Planifie une réunion dans les 12 mois à venir.',
    en: 'Schedule a meeting within the next 12 months.',
  },
  CHECK_IN_NOT_OPEN_YET: {
    fr: 'Le pointage ouvre 1 heure avant la réunion.',
    en: 'Check-in opens 1 hour before the meeting.',
  },
  CHECK_IN_CLOSED: {
    fr: 'Le pointage est fermé : il se termine 2 heures après le début de la réunion.',
    en: 'Check-in is closed: it ends 2 hours after the meeting starts.',
  },
  ALREADY_CHECKED_IN: {
    fr: 'Ta présence est déjà enregistrée.',
    en: 'Your attendance is already recorded.',
  },
  EXCUSE_TOO_LATE: {
    fr: 'Les excuses se font avant le début de la réunion.',
    en: 'Excuses must be sent before the meeting starts.',
  },
  ALREADY_PRESENT: {
    fr: 'Tu es déjà noté présent : une excuse n’est plus utile.',
    en: 'You are already marked present: an excuse is no longer needed.',
  },
  AGENDA_CLOSED: {
    fr: 'La réunion a commencé : on ne peut plus ajouter de point à l’ordre du jour.',
    en: 'The meeting has started: no more items can be added to the agenda.',
  },
  AGENDA_FULL: {
    fr: 'L’ordre du jour est complet : 30 points ajoutés par les membres au plus.',
    en: 'The agenda is full: 30 member items at most.',
  },
  MARK_NOT_ALLOWED: {
    fr: 'Tu peux noter les présences à partir de l’ouverture du pointage, et jusqu’à la clôture de la réunion.',
    en: 'You can mark attendance from the moment check-in opens until the meeting is closed.',
  },
  NOT_A_PARTICIPANT: {
    fr: 'Cette personne n’est pas un membre actif du groupe.',
    en: 'This person is not an active member of the group.',
  },
  MEETING_NOT_STARTED: {
    fr: 'La réunion n’a pas encore commencé : le brouillon du procès-verbal viendra après.',
    en: 'The meeting has not started yet: the minutes draft comes after it.',
  },
  MEETING_NOT_CLOSED: {
    fr: 'Clôture la réunion avant de publier le procès-verbal.',
    en: 'Close the meeting before publishing the minutes.',
  },
  MEETING_ALREADY_CLOSED: {
    fr: 'Cette réunion est déjà clôturée.',
    en: 'This meeting is already closed.',
  },
  CORRECTION_REASON_REQUIRED: {
    fr: 'Un procès-verbal publié ne se modifie pas : une correction se publie avec un motif.',
    en: 'Published minutes cannot be edited: a correction is published with a reason.',
  },
  MINUTES_UNCHANGED: {
    fr: 'Ce texte est identique à la version publiée.',
    en: 'This text is identical to the published version.',
  },
  MINUTES_NOT_PUBLISHED: {
    fr: 'Le procès-verbal n’est pas encore publié.',
    en: 'The minutes are not published yet.',
  },
} as const satisfies Record<string, Bilingual>;

export const meetingTexts = {
  scheduledTitle: {
    fr: 'Nouvelle réunion dans {{group}}',
    en: 'New meeting in {{group}}',
  },
  scheduledBody: { fr: '{{date}}, {{place}}.', en: '{{date}}, {{place}}.' },
  agendaReadyTitle: {
    fr: 'Ordre du jour prêt',
    en: 'Agenda ready',
  },
  agendaReadyBody: {
    fr: '{{group}} : réunion {{date}}.',
    en: '{{group}}: meeting {{date}}.',
  },
  reminderTitle: {
    fr: 'La réunion commence bientôt',
    en: 'The meeting starts soon',
  },
  reminderBody: {
    fr: '{{group}} : {{date}}. Le pointage est ouvert dès {{time}}.',
    en: '{{group}}: {{date}}. Check-in opens at {{time}}.',
  },
  cancelledTitle: { fr: 'Réunion annulée', en: 'Meeting cancelled' },
  cancelledBody: {
    fr: '{{group}} : la réunion du {{date}} est annulée.',
    en: '{{group}}: the meeting of {{date}} is cancelled.',
  },
  minutesPublishedTitle: { fr: 'Procès-verbal publié', en: 'Minutes published' },
  minutesCorrectedTitle: { fr: 'Procès-verbal corrigé', en: 'Minutes corrected' },
  minutesBody: {
    fr: '{{group}} : réunion du {{date}}.',
    en: '{{group}}: meeting of {{date}}.',
  },
  // Cards (spec 4.5): the lines the designer's copy does not have.
  cancelTitle: { fr: 'Annuler la réunion', en: 'Cancel the meeting' },
  cancelButton: { fr: 'Annuler la réunion', en: 'Cancel the meeting' },
  cancelDone: { fr: 'Réunion annulée', en: 'Meeting cancelled' },
  cancelNote: {
    fr: 'Tous les membres seront prévenus.',
    en: 'Every member will be notified.',
  },
  closeTitle: { fr: 'Clôturer la réunion', en: 'Close the meeting' },
  closeButton: { fr: 'Clôturer', en: 'Close' },
  closeDone: { fr: 'Réunion clôturée', en: 'Meeting closed' },
  closeNote: {
    fr: 'Les présences sont figées : les membres non pointés et sans excuse envoyée avant le début sont notés absents.',
    en: 'Attendance is frozen: members who did not check in and sent no excuse before the start are marked absent.',
  },
  closeFineNote: {
    fr: 'Amende d’absence de {{amount}} pour {{count}} membre(s) sans excuse.',
    en: 'Absence fine of {{amount}} for {{count}} member(s) without an excuse.',
  },
  attendanceNote: {
    fr: '{{present}} présent(s), {{absent}} absent(s).',
    en: '{{present}} present, {{absent}} absent.',
  },
  publishNote: {
    fr: 'Une fois publié, le procès-verbal ne peut plus être modifié. Une correction se publie comme une nouvelle version, avec un motif. La publication est inscrite dans le registre.',
    en: 'Once published, the minutes cannot be edited. A correction is published as a new version, with a reason. The publication is recorded in the ledger.',
  },
  publishCorrectionNote: {
    fr: 'Correction : version {{version}}. Motif : {{reason}}',
    en: 'Correction: version {{version}}. Reason: {{reason}}',
  },
  placeLine: { fr: 'Lieu : {{place}}', en: 'Place: {{place}}' },
  dateLine: { fr: 'Date : {{date}}', en: 'Date: {{date}}' },
  itemLine: { fr: 'Point : {{text}}', en: 'Item: {{text}}' },
  excuseLine: { fr: 'Excuse : {{text}}', en: 'Excuse: {{text}}' },
  // The deterministic minutes draft (R15.4).
  minutesTitle: {
    fr: 'Procès-verbal de la réunion du {{date}}',
    en: 'Minutes of the meeting of {{date}}',
  },
  minutesNone: { fr: 'Aucun', en: 'None' },
  minutesNoMoney: {
    fr: 'Aucun paiement pendant la réunion.',
    en: 'No payment during the meeting.',
  },
  minutesMoneyLine: {
    fr: '{{count}} paiement(s), {{amount}} reçus au total.',
    en: '{{count}} payment(s), {{amount}} received in total.',
  },
  minutesVoteLine: {
    fr: '{{title}} : {{status}} ({{yes}} oui, {{no}} non).',
    en: '{{title}}: {{status}} ({{yes}} yes, {{no}} no).',
  },
  minutesVotePassed: { fr: 'adopté', en: 'passed' },
  minutesVoteRejected: { fr: 'rejeté', en: 'rejected' },
  minutesVoteExpired: { fr: 'sans décision', en: 'no decision' },
  minutesEventLine: { fr: '{{text}}', en: '{{text}}' },
  minutesNotes: { fr: 'Notes de l’admin', en: 'Admin notes' },
  minutesEventsTitle: { fr: 'Événements du registre', en: 'Ledger events' },
  minutesNextMeeting: {
    fr: 'Prochaine réunion : {{date}}, {{place}}.',
    en: 'Next meeting: {{date}}, {{place}}.',
  },
  minutesNoNextMeeting: {
    fr: 'Aucune réunion planifiée pour le moment.',
    en: 'No meeting scheduled for now.',
  },
  minutesAbsentFined: {
    fr: '{{name}} (amende d’absence)',
    en: '{{name}} (absence fine)',
  },
  minutesExcusedLine: { fr: '{{name}}', en: '{{name}}' },
} as const satisfies Record<string, Bilingual>;

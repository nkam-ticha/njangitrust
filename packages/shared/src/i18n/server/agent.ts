// Server texts of the agent Njangi (spec Part 4). The designer's copy (ui.*.ts `agent.*`) already
// holds the member-facing sentences of the Njangi tab; these complete it. French uses "tu".
import type { Bilingual } from '../../lang';

export const agentErrorTexts = {
  AGENT_NOT_CONFIGURED: {
    fr: 'Njangi n’est pas encore activé sur ce serveur. Tous les écrans de l’app restent disponibles.',
    en: 'Njangi is not switched on for this server yet. Every screen of the app still works.',
  },
  AGENT_UNAVAILABLE: {
    fr: 'Njangi ne répond pas pour le moment. Réessaie dans quelques minutes, ou utilise les écrans de l’app.',
    en: 'Njangi is not answering right now. Try again in a few minutes, or use the app’s screens.',
  },
  AGENT_RATE_LIMITED: {
    fr: 'Tu as envoyé beaucoup de messages en peu de temps. Tu pourras m’écrire à nouveau à {{time}}. Tous les écrans de l’app restent disponibles.',
    en: 'You sent a lot of messages in a short time. You can write to me again at {{time}}. Every screen of the app still works.',
  },
  AGENT_BUSY: {
    fr: 'Je termine encore ma réponse précédente. Renvoie ton message dans un instant.',
    en: 'I am still finishing my previous answer. Send your message again in a moment.',
  },
  NO_ACTIVE_GROUP: {
    fr: 'Tu n’as pas encore de groupe actif. Crée une njangi ou ouvre le lien d’invitation reçu.',
    en: 'You have no active group yet. Create a njangi or open the invite link you received.',
  },
  MEMBER_NOT_FOUND: {
    fr: 'Je ne trouve aucun membre de ce nom dans le groupe.',
    en: 'I can’t find a member with that name in the group.',
  },
  MEMBER_AMBIGUOUS: {
    fr: 'Plusieurs membres portent ce nom. Lequel veux-tu dire ?',
    en: 'Several members have that name. Which one do you mean?',
  },
  /** Spec 4.4: in the group chat everyone reads the reply; one member's own situation stays private. */
  PERSONAL_IN_GROUP: {
    fr: 'Dans le groupe, je ne parle pas de la situation personnelle d’un membre (amendes, dettes, prêts). Écris-moi en privé.',
    en: 'In the group chat I do not discuss one member’s own situation (fines, debts, loans). Write to me privately.',
  },
  GROUP_NOT_FOUND: {
    fr: 'Je ne trouve aucun de tes groupes avec ce nom.',
    en: 'I can’t find one of your groups with that name.',
  },
  ROUND_NOT_FOUND: {
    fr: 'Ce tour n’existe pas, ou le cycle n’a pas encore démarré.',
    en: 'This round does not exist, or the cycle has not started yet.',
  },
  NOTHING_TO_PAY: {
    fr: 'Tu n’as rien à payer pour le moment.',
    en: 'You have nothing to pay right now.',
  },
  NO_UPCOMING_MEETING: {
    fr: 'Aucune réunion n’est prévue pour le moment.',
    en: 'No meeting is planned at the moment.',
  },
  MEETING_NOT_FOUND: {
    fr: 'Je ne trouve pas cette réunion dans ton groupe.',
    en: 'I can’t find that meeting in your group.',
  },
  AGENT_TURN_NOT_FOUND: {
    fr: 'Cet échange est introuvable.',
    en: 'This exchange was not found.',
  },
} as const satisfies Record<string, Bilingual>;

export type AgentErrorCode = keyof typeof agentErrorTexts;

export const agentTexts = {
  /** Spec 4.2: after 8 tool steps without an answer. */
  turnFailed: {
    fr: 'Je n’ai pas pu terminer. Reformule ta demande, plus simplement.',
    en: 'I couldn’t finish. Please rephrase your request, more simply.',
  },
  /** Spec 4.4: the group reply to a personal question. */
  privateReply: {
    fr: 'Je t’ai répondu en privé, {{name}}.',
    en: 'I answered you privately, {{name}}.',
  },
  /** Result events (spec 4.5 step 5), when the action's own summary is missing. */
  actionDone: { fr: '{{title}} : fait.', en: '{{title}}: done.' },
  actionDoneWithSummary: { fr: '{{title}} : {{summary}}', en: '{{title}}: {{summary}}' },
  actionFailed: { fr: '{{title}} : échec. {{reason}}', en: '{{title}}: failed. {{reason}}' },
  actionCancelled: {
    fr: '{{title}} : annulé. Rien n’a été fait.',
    en: '{{title}}: cancelled. Nothing was done.',
  },
  actionExpired: {
    fr: '{{title}} : expiré. Rien n’a été fait.',
    en: '{{title}}: expired. Nothing was done.',
  },
  /**
   * Written by the server, never by the model, when the reply and the tools disagree (the claim
   * guard, runtime/turn.ts): a card exists but the text says the action is done, or says nothing.
   */
  cardReady: {
    fr: 'Voici la carte. Confirme-la dans l’app pour que ce soit fait : tant que tu n’as pas confirmé, rien ne se passe.',
    en: 'Here is the card. Confirm it in the app to make it happen: nothing is done until you confirm.',
  },
  cardReadyHint: {
    fr: 'Voici la carte : confirme-la dans l’app.',
    en: 'Here is the card: confirm it in the app.',
  },
  /** The reply claimed a card that no tool prepared, and a retry did not fix it. */
  couldNotPrepare: {
    fr: 'Je n’ai pas pu le préparer : {{reason}}',
    en: 'I could not prepare it: {{reason}}',
  },
  nothingPrepared: {
    fr: 'Je n’ai rien préparé : je n’ai pas pu lancer cette action. Redis-moi ce que tu veux faire, avec qui, quoi et combien, et je réessaie.',
    en: 'I prepared nothing: I could not start this action. Tell me again what you want to do, with whom, what and how much, and I will try again.',
  },
  /** The reason when a tool refused the arguments themselves. */
  invalidReason: {
    fr: 'une information manque ou n’est pas valable ({{fields}}). Dis-la-moi à nouveau.',
    en: 'some information is missing or not valid ({{fields}}). Please tell me again.',
  },
  /** Stored instead of a turn about a secret vote (R11.5): the choice is never kept. */
  secretVoteMessage: {
    fr: 'Message au sujet d’un vote secret, non conservé.',
    en: 'Message about a secret vote, not kept.',
  },
  secretVoteReply: {
    fr: 'Vote secret : le choix se fait dans l’écran du vote. Le contenu de cet échange n’est pas conservé.',
    en: 'Secret vote: the choice is made on the vote screen. The content of this exchange is not kept.',
  },
  secretVoteScreen: {
    fr: 'Ce vote est secret. Je ne prends pas ton choix dans la conversation : ouvre l’onglet Votes, choisis OUI ou NON et confirme avec ton PIN. Ne m’écris pas ton choix.',
    en: 'This vote is secret. I do not take your choice in the conversation: open the Votes tab, choose YES or NO and confirm with your PIN. Do not write your choice to me.',
  },
} as const satisfies Record<string, Bilingual>;

/** Tool results the model explains when a part of the app is not built yet. */
export const agentUnavailableTexts = {
  money: {
    fr: 'Les paiements, la caisse, le registre et les prêts ne sont pas encore disponibles dans l’app.',
    en: 'Payments, the funds, the ledger and loans are not available in the app yet.',
  },
  cycles: {
    fr: 'Les cycles et les tours ne sont pas encore disponibles dans l’app.',
    en: 'Cycles and rounds are not available in the app yet.',
  },
  chat: {
    fr: 'Le chat du groupe n’est pas encore disponible pour l’assistant.',
    en: 'The group chat is not available to the assistant yet.',
  },
  meetings: {
    fr: 'Les réunions ne sont pas encore disponibles dans l’app.',
    en: 'Meetings are not available in the app yet.',
  },
  statements: {
    fr: 'Les relevés ne sont pas encore disponibles dans l’app.',
    en: 'Statements are not available in the app yet.',
  },
  account: {
    fr: 'Cette action sur ton compte n’est pas encore disponible dans l’app.',
    en: 'This action on your account is not available in the app yet.',
  },
} as const satisfies Record<string, Bilingual>;

export type AgentCapability = keyof typeof agentUnavailableTexts;

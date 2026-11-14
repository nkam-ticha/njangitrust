// What is built and what is coming (dev builds only, route /progress). The lead keeps this file
// current: change a status or a note here and the Progress screen follows. Texts are bilingual
// pairs because the owner reads this screen in both languages; it never ships in a release build.

export type ProgressStatus = 'done' | 'inProgress' | 'notStarted' | 'waitingApi';

export interface Bilingual {
  fr: string;
  en: string;
}

export interface ProgressArea {
  /** FSD section, e.g. "4.1". */
  ref: string;
  title: Bilingual;
  /** Rules engine (packages/rules), when the area has money or vote rules. */
  rules?: ProgressStatus;
  api: ProgressStatus;
  app: ProgressStatus;
  note: Bilingual;
}

export interface AcceptanceCriterion {
  id: string;
  title: Bilingual;
  status: ProgressStatus;
  note: Bilingual;
}

export const progressUpdatedAt = '2026-11-12';

/** The lead's overall estimate of the whole project, in percent. */
export const overallEstimate = 35;

/** What the owner can try in the app today (with the demo data: `pnpm demo:seed`). */
export const tryNow: Bilingual[] = [
  {
    fr: 'Créer un compte, se connecter, code PIN oublié',
    en: 'Sign up, log in, forgotten PIN',
  },
  {
    fr: 'Créer un groupe, inviter les membres fondateurs, ouvrir un lien d’invitation',
    en: 'Create a group, invite founding members, open an invite link',
  },
  {
    fr: 'Changer de groupe, voir les membres et les règles',
    en: 'Switch groups, see members and rules',
  },
  { fr: 'Notifications et cloche', en: 'Notifications and the bell' },
  { fr: 'Moi : langue, déconnexion', en: 'Me: language, log out' },
];

export const areas: ProgressArea[] = [
  {
    ref: '4.1',
    title: { fr: 'Comptes et accès', en: 'Accounts and access' },
    api: 'done',
    app: 'done',
    note: {
      fr: 'Inscription, connexion, verrouillage, code PIN oublié avec confirmation, invitations, FR/EN.',
      en: 'Sign-up, login, lockout, forgotten PIN with confirmation, invites, FR/EN.',
    },
  },
  {
    ref: '4.2',
    title: { fr: 'Groupes et cycles', en: 'Groups and cycles' },
    rules: 'inProgress',
    api: 'inProgress',
    app: 'inProgress',
    note: {
      fr: 'Créer un groupe et inviter : prêt. Démarrer le cycle (tirage) attend les services d’argent.',
      en: 'Create a group and invite: ready. Starting the cycle (draw) waits for the money services.',
    },
  },
  {
    ref: '4.3',
    title: { fr: 'Cotisations et paiements', en: 'Contributions and payments' },
    rules: 'inProgress',
    api: 'notStarted',
    app: 'waitingApi',
    note: {
      fr: 'Calculs prêts (audit final). Paiements Mobile Money : pas encore commencés.',
      en: 'Calculations ready (final audit). Mobile Money payments: not started.',
    },
  },
  {
    ref: '4.4',
    title: { fr: 'Caisse, versements et retraits', en: 'Caisse, payouts and withdrawals' },
    rules: 'inProgress',
    api: 'notStarted',
    app: 'waitingApi',
    note: {
      fr: 'L’anneau et les montants sont dessinés ; l’onglet Caisse attend les données.',
      en: 'The ring and amounts are designed; the Caisse tab waits for the data.',
    },
  },
  {
    ref: '4.5',
    title: { fr: 'Frais et amendes', en: 'Fees and fines' },
    rules: 'inProgress',
    api: 'notStarted',
    app: 'notStarted',
    note: {
      fr: 'Partage des frais au franc près et amendes : règles écrites et testées.',
      en: 'Fee split to the franc and fines: rules written and tested.',
    },
  },
  {
    ref: '4.6',
    title: { fr: 'Prêts, enchères, caisse de secours', en: 'Loans, bidding, solidarity fund' },
    rules: 'inProgress',
    api: 'inProgress',
    app: 'notStarted',
    note: {
      fr: 'Demande de soutien : prête côté serveur. Prêts et enchères : à venir.',
      en: 'Support requests: ready on the server. Loans and bidding: coming.',
    },
  },
  {
    ref: '4.7',
    title: { fr: 'Votes et membres', en: 'Governance and membership' },
    rules: 'done',
    api: 'done',
    app: 'inProgress',
    note: {
      fr: 'Tous les types de vote existent côté serveur, votes secrets compris. Ils s’ouvrent après le début du premier cycle.',
      en: 'Every vote type exists on the server, secret votes included. They open once the first cycle starts.',
    },
  },
  {
    ref: '4.8',
    title: { fr: 'Numéros de paiement', en: 'Payment numbers' },
    rules: 'done',
    api: 'notStarted',
    app: 'notStarted',
    note: {
      fr: 'Changement de numéro avec blocage de 48 h : à venir.',
      en: 'Number change with the 48-hour hold: coming.',
    },
  },
  {
    ref: '4.9',
    title: { fr: 'Registre et contrôle', en: 'Ledger and accountability' },
    rules: 'inProgress',
    api: 'notStarted',
    app: 'waitingApi',
    note: {
      fr: 'Chaîne de hachage et outil de vérification écrits (audit final). Contrôle quotidien : à venir.',
      en: 'Hash chain and verification tool written (final audit). Daily check: coming.',
    },
  },
  {
    ref: '4.10',
    title: { fr: 'Notifications et discussion', en: 'Notifications and chat' },
    api: 'inProgress',
    app: 'inProgress',
    note: {
      fr: 'Notifications dans l’app : prêtes. Discussion du groupe : pas commencée.',
      en: 'In-app notifications: ready. Group chat: not started.',
    },
  },
  {
    ref: '4.11',
    title: { fr: 'Réunions, relevés, fiabilité', en: 'Meetings, statements, reliability' },
    rules: 'inProgress',
    api: 'notStarted',
    app: 'notStarted',
    note: { fr: 'À venir.', en: 'Coming.' },
  },
  {
    ref: '5',
    title: { fr: 'Agent Njangi (IA)', en: 'Njangi agent (AI)' },
    api: 'notStarted',
    app: 'waitingApi',
    note: {
      fr: 'Les cartes de l’agent sont dessinées ; l’agent lui-même n’est pas commencé.',
      en: 'The agent’s cards are designed; the agent itself is not started.',
    },
  },
];

export const acceptance: AcceptanceCriterion[] = [
  {
    id: 'AC-01',
    title: {
      fr: 'Un tour complet payé par 10 membres, écrans mis à jour en direct',
      en: 'A full round paid by 10 members, screens update live',
    },
    status: 'waitingApi',
    note: { fr: 'Attend les paiements.', en: 'Waits for payments.' },
  },
  {
    id: 'AC-02',
    title: {
      fr: 'L’exemple donne exactement 81 340 et 80 840 FCFA',
      en: 'The example gives exactly 81 340 and 80 840 FCFA',
    },
    status: 'inProgress',
    note: {
      fr: 'Juste au franc dans le moteur de règles ; à montrer dans l’app.',
      en: 'Exact to the franc in the rules engine; to show in the app.',
    },
  },
  {
    id: 'AC-03',
    title: {
      fr: 'Personne ne retire l’argent d’un autre ni vers un autre numéro',
      en: 'Nobody withdraws another’s money or to another number',
    },
    status: 'notStarted',
    note: { fr: 'Arrive avec les retraits.', en: 'Comes with withdrawals.' },
  },
  {
    id: 'AC-04',
    title: {
      fr: 'Changement de numéro : immédiat, annoncé sans chiffres, retraits bloqués 48 h',
      en: 'Number change: immediate, announced without digits, withdrawals held 48 h',
    },
    status: 'notStarted',
    note: { fr: 'À venir.', en: 'Coming.' },
  },
  {
    id: 'AC-05',
    title: {
      fr: 'Une règle change après deux tiers de oui, au tour suivant',
      en: 'A rule changes after two-thirds yes, from the next round',
    },
    status: 'inProgress',
    note: {
      fr: 'Vote prêt ; l’application au tour suivant attend les tours.',
      en: 'Voting ready; applying it from the next round waits for rounds.',
    },
  },
  {
    id: 'AC-06',
    title: {
      fr: 'Aucun écran ne montre le numéro d’un autre membre',
      en: 'No screen shows another member’s number',
    },
    status: 'inProgress',
    note: {
      fr: 'Vérifié automatiquement sur tout ce qui existe ; à revérifier à chaque ajout.',
      en: 'Checked automatically on everything built; re-checked with each addition.',
    },
  },
  {
    id: 'AC-07',
    title: {
      fr: 'Personne ne peut savoir comment un membre a voté en secret',
      en: 'Nobody can find out how a member voted in a secret vote',
    },
    status: 'done',
    note: {
      fr: 'Aucun lien entre vote et votant ; résultat publié à la clôture.',
      en: 'No link between ballot and voter; result published at the close.',
    },
  },
  {
    id: 'AC-08',
    title: {
      fr: 'Toute modification du registre est détectée',
      en: 'Any change to the ledger is detected',
    },
    status: 'inProgress',
    note: {
      fr: 'Outil de vérification écrit ; contrôle quotidien à venir.',
      en: 'Verification tool written; daily check coming.',
    },
  },
  {
    id: 'AC-09',
    title: {
      fr: 'L’agent réussit les 30 scénarios trois fois de suite',
      en: 'The agent passes the 30 scenarios three times in a row',
    },
    status: 'notStarted',
    note: { fr: 'Agent pas commencé.', en: 'Agent not started.' },
  },
  {
    id: 'AC-10',
    title: {
      fr: 'Tout se fait par l’agent comme par les écrans',
      en: 'Everything works through the agent as through the screens',
    },
    status: 'notStarted',
    note: { fr: 'Agent pas commencé.', en: 'Agent not started.' },
  },
  {
    id: 'AC-11',
    title: {
      fr: 'Rappels à l’heure, une seule amende par tour en retard',
      en: 'Reminders on time, exactly one fine per late round',
    },
    status: 'inProgress',
    note: {
      fr: 'Calendrier des rappels prêt ; amendes avec les paiements.',
      en: 'Reminder schedule ready; fines with payments.',
    },
  },
  {
    id: 'AC-12',
    title: {
      fr: 'Un vrai paiement et un vrai retrait en mode test de l’opérateur',
      en: 'One real payment and one real withdrawal in the aggregator’s test mode',
    },
    status: 'notStarted',
    note: { fr: 'Dernière phase.', en: 'Last phase.' },
  },
];

/** Labels for the screen's own chrome. */
export const progressCopy = {
  title: { fr: 'Avancement', en: 'Progress' },
  intro: {
    fr: 'Ce qui est construit et ce qui arrive. Mis à jour le {{date}}.',
    en: 'What is built and what is coming. Updated {{date}}.',
  },
  overall: { fr: 'Estimation globale', en: 'Overall estimate' },
  tryNow: { fr: 'À essayer maintenant', en: 'Try it now' },
  areas: { fr: 'Par domaine (FSD)', en: 'By area (FSD)' },
  acceptance: { fr: 'Critères d’acceptation', en: 'Acceptance criteria' },
  rules: { fr: 'Règles', en: 'Rules' },
  api: { fr: 'Serveur', en: 'Server' },
  app: { fr: 'App', en: 'App' },
  status: {
    done: { fr: 'Fait', en: 'Done' },
    inProgress: { fr: 'En cours', en: 'In progress' },
    notStarted: { fr: 'Pas commencé', en: 'Not started' },
    waitingApi: { fr: 'Attend le serveur', en: 'Waiting for the API' },
  },
  gallery: { fr: 'Galerie des composants', en: 'Component gallery' },
} satisfies Record<string, unknown>;

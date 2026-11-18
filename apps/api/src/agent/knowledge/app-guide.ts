// What the app is and where things are, for the assistant to explain (get_app_guide). Written by
// hand, in French ("tu") and English, from the screens of apps/mobile. Two rules keep it safe:
//  - It states no amount, date, name or rule value. Those come from tools (rule 1 of the system
//    prompt), so the guide never goes out of date and the assistant never quotes a stale number.
//  - It says only what the app really does today. A screen that is not built is not described.
// Keywords (lowercase, accents optional) pick the entry for a question; the assistant can also
// ask for an entry by id, or for the index.

export type GuideLang = 'fr' | 'en';

export interface GuideEntry {
  id: string;
  title: Record<GuideLang, string>;
  /** Words that point to this entry, French and English, lowercase. */
  keywords: readonly string[];
  text: Record<GuideLang, string>;
}

export const APP_GUIDE: readonly GuideEntry[] = [
  {
    id: 'overview',
    title: { fr: 'Le tour de l’application', en: 'A tour of the app' },
    keywords: [
      'app',
      'application',
      'tour',
      'navigation',
      'onglet',
      'tab',
      'menu',
      'ecran',
      'screen',
      'ou trouver',
      'where',
      'comment utiliser',
      'how to use',
      'aide',
      'help',
      'debut',
      'start',
      'commencer',
      'fonctionne',
      'works',
    ],
    text: {
      fr: 'L’application a cinq onglets en bas. Njangi : c’est moi, ton assistant ; tu me parles et je prépare les actions. Groupe : la discussion du groupe. Caisse : le tour en cours (qui a payé, qui reçoit), la caisse générale, la caisse de secours et le registre de toutes les opérations. Votes : les votes ouverts et le bouton pour proposer un changement. Moi : ta situation (ce que tu dois, ce qui est disponible), tes relevés, tes réunions, les membres, les règles du groupe et tes réglages. En haut, tu peux changer de groupe et ouvrir tes notifications.',
      en: 'The app has five tabs at the bottom. Njangi: that is me, your assistant; you talk to me and I prepare actions. Groupe: the group chat. Caisse: the current round (who paid, who receives), the general fund, the solidarity fund and the records of every operation. Votes: open votes and the button to propose a change. Moi: your situation (what you owe, what is available), your statements, meetings, the members, the group rules and your settings. At the top you can switch group and open your notifications.',
    },
  },
  {
    id: 'confirmation',
    title: { fr: 'Comment les actions sont confirmées', en: 'How actions are confirmed' },
    keywords: [
      'confirm',
      'carte',
      'card',
      'valider',
      'confirmer',
      'securite',
      'safe',
      'pin',
      'trust',
      'confiance',
      'assistant',
      'peux faire',
      'can do',
      'capable',
    ],
    text: {
      fr: 'Je ne fais jamais rien tout seul. Quand tu me demandes de payer, retirer, emprunter, voter ou proposer quelque chose, je prépare une carte avec le détail exact calculé par le serveur. Rien ne se passe tant que tu n’as pas appuyé sur « Confirmer » sur la carte. Pour les actions sensibles (changer ton numéro de paiement, supprimer ton compte), il faut aussi ton code PIN. Une carte non confirmée expire au bout d’un court délai, et tu peux l’annuler. Je ne dis qu’une action est faite qu’après avoir reçu son résultat. Je peux tout faire par la conversation ce que tu fais avec les écrans, mais c’est toujours toi qui valides.',
      en: 'I never do anything on my own. When you ask me to pay, withdraw, borrow, vote or propose something, I prepare a card with the exact details worked out by the server. Nothing happens until you tap “Confirm” on the card. For sensitive actions (changing your payment number, deleting your account) your PIN is needed too. A card you do not confirm expires after a short while, and you can cancel it. I only say an action is done once I have received its result. Everything you can do with the screens you can do by talking to me, but you are always the one who confirms.',
    },
  },
  {
    id: 'start',
    title: { fr: 'Créer un compte, un groupe, inviter', en: 'Sign up, create a group, invite' },
    keywords: [
      'creer un groupe',
      'create a group',
      'create group',
      'creer groupe',
      'creer un compte',
      'create an account',
      'lien d invitation',
      'invite link',
      'inscri',
      'sign up',
      'signup',
      'invit',
      'rejoindre',
      'join',
      'fondateur',
      'founding',
      'founder',
      'demarrer',
    ],
    text: {
      fr: 'Tu t’inscris avec ton numéro de téléphone et un code PIN. Pour créer un groupe, utilise le sélecteur de groupe en haut de l’écran, puis « créer un groupe ». Les membres rejoignent avec un lien d’invitation que l’admin crée (je peux le préparer). Avant le premier cycle, l’admin invite les membres fondateurs ; le cycle peut démarrer quand il y a assez de membres actifs, et c’est l’admin qui le lance. Après le début du cycle, un nouveau membre ne peut entrer que par un vote du groupe.',
      en: 'You sign up with your phone number and a PIN. To create a group, use the group switcher at the top of the screen, then “create a group”. Members join with an invite link that the admin creates (I can prepare it). Before the first cycle the admin invites the founding members; the cycle can start once there are enough active members, and the admin starts it. Once the cycle has started, a new member can only join through a group vote.',
    },
  },
  {
    id: 'pay',
    title: { fr: 'Payer ma cotisation', en: 'Paying my contribution' },
    keywords: [
      'payer',
      'pay',
      'paie',
      'cotisation',
      'contribution',
      'verser',
      'mobile money',
      'momo',
      'mtn',
      'orange',
      'dette',
      'debt',
      'amende a payer',
      'dues',
      'doit',
      'owe',
    ],
    text: {
      fr: 'Deux façons. Soit tu me dis « paie ma cotisation » : je prépare la carte avec le montant exact et les frais, tu confirmes, puis tu reçois la demande de paiement Mobile Money (MTN ou Orange) sur ton téléphone pour valider avec ton code. Soit tu ouvres Caisse, section « Tour », et tu appuies sur le bouton de paiement. Tu peux aussi payer tes amendes et remboursements échus en même temps. Le paiement n’est compté que lorsque l’opérateur confirme ; le résultat arrive dans la conversation avec une référence. Si tu n’as rien reçu sur ton téléphone, dis-le-moi et je vérifie l’état du paiement.',
      en: 'Two ways. Either tell me “pay my contribution”: I prepare the card with the exact amount and fees, you confirm, then you get the Mobile Money request (MTN or Orange) on your phone to approve with your code. Or open Caisse, “Tour” section, and tap the payment button. You can also pay your due fines and repayments at the same time. The payment only counts once the operator confirms; the result arrives in the conversation with a reference. If nothing reached your phone, tell me and I will check the payment’s status.',
    },
  },
  {
    id: 'withdraw',
    title: { fr: 'Retirer mon argent', en: 'Withdrawing my money' },
    keywords: [
      'retirer',
      'retrait',
      'withdraw',
      'recevoir',
      'receive',
      'versement',
      'payout',
      'disponible',
      'available',
      'argent',
      'money',
      'beneficiaire',
      'beneficiary',
      'mon tour',
      'my turn',
    ],
    text: {
      fr: 'Quand c’est ton tour, le versement du tour devient disponible pour toi. Tu le retires vers ton numéro de paiement : dis « retire mon argent », ou ouvre Moi et appuie sur « Retirer » à côté de « Disponible ». Je prépare une carte avec le montant et les frais ; tu confirmes. Les retraits attendent un peu après un changement de numéro de paiement, par sécurité ; je te donne la date exacte si c’est le cas. L’argent bloqué ou réservé n’est pas retirable avant la date indiquée.',
      en: 'When it is your turn, the round’s payout becomes available to you. You withdraw it to your payment number: say “withdraw my money”, or open Moi and tap “Retirer” next to “Disponible”. I prepare a card with the amount and fees; you confirm. Withdrawals wait a little after a payment-number change, for safety; I give you the exact date when that applies. Money that is locked or reserved cannot be withdrawn before the date shown.',
    },
  },
  {
    id: 'loans',
    title: { fr: 'Les prêts', en: 'Loans' },
    keywords: [
      'pret',
      'loan',
      'emprunt',
      'borrow',
      'rembours',
      'repay',
      'interet',
      'interest',
      'echeance',
      'installment',
      'plafond',
      'limit',
    ],
    text: {
      fr: 'Tu peux emprunter à la caisse générale. Demande-moi une estimation (« combien puis-je emprunter ? ») : je donne ta limite, l’intérêt, les frais et les échéances, calculés par le serveur. Si tu veux continuer, je prépare la demande ; un admin l’approuve ou la refuse (la demande d’un admin passe par un vote). Quand le prêt est accordé, il est versé sur ton numéro de paiement. Tu rembourses à chaque échéance, ou plus tôt, depuis la conversation ou depuis l’écran « Prêts » (accessible par Caisse ou par Moi).',
      en: 'You can borrow from the general fund. Ask me for an estimate (“how much can I borrow?”): I give your limit, the interest, the fees and the installments, worked out by the server. If you want to go ahead, I prepare the request; an admin approves or rejects it (an admin’s own request goes to a vote). Once granted, the loan is paid to your payment number. You repay at each installment, or earlier, from the conversation or from the “Prêts” screen (reachable from Caisse or Moi).',
    },
  },
  {
    id: 'bids',
    title: { fr: 'Les enchères', en: 'Bids' },
    keywords: ['enchere', 'bid', 'bidding', 'miser', 'mise', 'tirage', 'draw', 'ordre', 'order'],
    text: {
      fr: 'Dans un groupe en mode enchères, l’ordre des bénéficiaires n’est pas fixé à l’avance : chaque membre peut faire une offre scellée pour obtenir le tour. Avant la clôture, tu ne vois que le nombre d’offres et la tienne ; après la clôture, tout le monde voit toutes les offres. Dis-moi « je mise… » et je prépare la carte ; tu confirmes. Dans Caisse, section « Tour », le bouton « Voir les enchères » ouvre la liste. Si ton groupe n’est pas en mode enchères, l’ordre est celui des règles (par exemple tiré au sort).',
      en: 'In a group using bidding, the order of beneficiaries is not fixed in advance: each member can place a sealed bid to get the round. Before the close you only see the number of bids and your own; after the close everyone sees all the bids. Tell me “I bid…” and I prepare the card; you confirm. In Caisse, “Tour” section, the “Voir les enchères” button opens the list. If your group is not in bidding mode, the order follows the rules (for example, drawn by lot).',
    },
  },
  {
    id: 'votes',
    title: { fr: 'Les votes et les propositions', en: 'Votes and proposals' },
    keywords: [
      'vote',
      'voter',
      'proposition',
      'proposal',
      'proposer',
      'propose',
      'changer la regle',
      'change the rule',
      'seuil',
      'threshold',
      'secret',
      'exclure',
      'remove',
      'admin',
      'quitter',
      'leave',
      'exit',
      'rotation',
      'decision',
    ],
    text: {
      fr: 'Dans NjangiTrust, tout changement du groupe passe par un vote : règles, nouveau membre, retrait d’un membre, changement d’admin, ordre des tours, abandon d’une amende, correction du registre, sortie anticipée, aide de la caisse de secours. Pour proposer, appuie sur le bouton de l’onglet Votes, ou dis-le-moi et je prépare la proposition. Chaque membre éligible vote oui ou non dans l’onglet Votes (ou par moi) ; le résultat dépend du seuil et de la durée fixés par les règles, que je peux te lire. Certains votes sont secrets (retrait d’un membre, changement d’admin) : personne, pas même moi, ne peut savoir qui a voté quoi.',
      en: 'In NjangiTrust every change to the group goes through a vote: rules, a new member, removing a member, changing the admin, the order of rounds, waiving a fine, correcting the records, an early exit, solidarity-fund help. To propose, tap the button in the Votes tab, or tell me and I prepare the proposal. Each eligible member votes yes or no in the Votes tab (or through me); the result depends on the threshold and the duration set by the rules, which I can read to you. Some votes are secret (removing a member, changing the admin): nobody, not even me, can know who voted what.',
    },
  },
  {
    id: 'funds',
    title: { fr: 'Les caisses et le registre', en: 'The funds and the records' },
    keywords: [
      'caisse',
      'fund',
      'solidarite',
      'solidarity',
      'secours',
      'registre',
      'ledger',
      'records',
      'historique',
      'history',
      'solde',
      'balance',
      'operation',
      'transaction',
      'correction',
      'annuler paiement',
      'cancel payment',
      'erreur',
      'mistake',
    ],
    text: {
      fr: 'L’onglet Caisse a quatre sections. « Tour » : le tour en cours, qui a payé, qui reçoit, le détail du versement. « Caisse » : la caisse générale et ce qui est disponible pour les prêts. « Secours » : la caisse de secours, alimentée à chaque tour, qui aide un membre lors d’un événement grave après un vote. « Registre » : la liste de toutes les opérations. Le registre ne se modifie jamais et rien n’y est supprimé : si une erreur est trouvée, le groupe vote une correction, qui ajoute une écriture inverse. Les montants exacts, je te les donne en lisant les données du groupe.',
      en: 'The Caisse tab has four sections. “Tour”: the current round, who paid, who receives, the payout breakdown. “Caisse”: the general fund and what is available for loans. “Secours”: the solidarity fund, fed at every round, which helps a member after a serious event once the group votes. “Registre”: the list of every operation. The records are never edited and nothing is deleted: if a mistake is found, the group votes a correction, which adds a reversing entry. For exact amounts I read the group’s data to you.',
    },
  },
  {
    id: 'fines',
    title: { fr: 'Les amendes', en: 'Fines' },
    keywords: ['amende', 'fine', 'retard', 'late', 'penalite', 'penalty', 'absence', 'sanction'],
    text: {
      fr: 'Une amende s’applique selon les règles du groupe, par exemple pour un paiement en retard. Elle apparaît dans « Mes dettes » (onglet Moi) et se paie avec la cotisation ou à part. Pour comprendre pourquoi tu as une amende, demande-moi : je regarde le registre et je te cite la règle officielle avec la vraie date limite. Une amende ne s’efface pas toute seule : le groupe peut voter pour l’abandonner.',
      en: 'A fine applies according to the group’s rules, for example for a late payment. It appears under “Mes dettes” (Moi tab) and is paid with the contribution or separately. To understand why you have a fine, ask me: I look at the records and quote the official rule with the real deadline. A fine does not disappear on its own: the group can vote to waive it.',
    },
  },
  {
    id: 'meetings',
    title: { fr: 'Les réunions', en: 'Meetings' },
    keywords: [
      'reunion',
      'meeting',
      'agenda',
      'ordre du jour',
      'presence',
      'attendance',
      'pv',
      'proces',
      'minutes',
      'excuse',
      'absent',
    ],
    text: {
      fr: 'Les réunions se trouvent dans Moi, « Réunions ». L’admin planifie la réunion. Chaque membre peut ajouter un point à l’ordre du jour, signaler sa présence ou envoyer une excuse avant la réunion ; je peux le faire pour toi. Après la réunion, l’admin marque les présences et publie le procès-verbal ; je peux rédiger un brouillon à relire avant publication. Une amende d’absence n’existe que si le groupe l’a activée dans ses règles.',
      en: 'Meetings are in Moi, “Réunions”. The admin schedules the meeting. Each member can add an agenda item, check in or send an excuse before the meeting; I can do it for you. After the meeting the admin marks attendance and publishes the minutes; I can write a draft to review before publication. An absence fine only exists if the group switched it on in its rules.',
    },
  },
  {
    id: 'chat',
    title: { fr: 'La discussion du groupe', en: 'The group chat' },
    keywords: [
      'chat',
      'discussion',
      'message',
      'ecrire',
      'write',
      'annonce',
      'announcement',
      'resume',
      'summary',
      'non lu',
      'unread',
      'njangi dans le groupe',
      '@njangi',
    ],
    text: {
      fr: 'L’onglet Groupe est la discussion de tout le groupe. Écris-y comme dans n’importe quelle messagerie. Si tu écris @njangi, je réponds dans le groupe aux questions qui concernent tout le monde (le tour, les caisses, les règles, les votes). Pour une question personnelle ou une action, je te réponds en privé dans l’onglet Njangi. Je peux aussi résumer ce que tu n’as pas lu, retrouver un message, ou publier un message à ta place après ta confirmation. Les admins peuvent épingler une annonce et masquer un message abusif.',
      en: 'The Groupe tab is the whole group’s chat. Write there as in any messenger. If you write @njangi, I answer in the group questions that concern everyone (the round, the funds, the rules, the votes). For a personal question or an action, I answer you privately in the Njangi tab. I can also summarise what you have not read, find a message, or post a message for you after your confirmation. Admins can pin an announcement and hide an abusive message.',
    },
  },
  {
    id: 'statements',
    title: { fr: 'Relevés et exports', en: 'Statements and exports' },
    keywords: [
      'releve',
      'statement',
      'pdf',
      'export',
      'telecharger',
      'download',
      'justificatif',
      'proof',
      'recu',
      'receipt',
      'csv',
    ],
    text: {
      fr: 'Ton relevé (la liste de tes opérations sur une période) se génère dans Moi, « Relevés », ou en me le demandant : je te le montre sous forme de carte à télécharger. Le registre complet du groupe peut aussi être exporté en fichier. Ces fichiers s’ouvrent depuis la carte, ils ne passent pas par moi.',
      en: 'Your statement (the list of your operations over a period) is generated in Moi, “Relevés”, or by asking me: I show it as a card you can download. The group’s full records can also be exported as a file. These files open from the card; they do not pass through me.',
    },
  },
  {
    id: 'account',
    title: {
      fr: 'Mon compte, mon numéro, mon PIN, ma langue',
      en: 'My account, number, PIN and language',
    },
    keywords: [
      'numero',
      'number',
      'telephone',
      'phone',
      'changer mon numero',
      'change my number',
      'pin oublie',
      'forgot pin',
      'mot de passe',
      'password',
      'langue',
      'language',
      'francais',
      'english',
      'notification',
      'reglage',
      'settings',
      'supprimer',
      'delete',
      'confidentialite',
      'privacy',
    ],
    text: {
      fr: 'Dans Moi : « Numéro de paiement » (appuie sur « Changer », saisis le nouveau numéro et l’opérateur, puis « Continuer » : une carte s’affiche et tu la confirmes avec ton PIN ; par sécurité, les retraits vers le nouveau numéro attendent ensuite un moment (la durée est fixée par les règles du groupe)), « Réglages » (langue française ou anglaise, notifications), et « Historique de l’assistant » (tout ce que j’ai préparé pour toi). Si tu as oublié ton PIN, utilise « Code PIN oublié ? » sur l’écran de connexion ; l’admin du groupe confirme qu’il te connaît, un lien de réinitialisation à usage unique est alors créé, et les retraits attendent un peu ensuite par sécurité. Pour supprimer ton compte, demande-le-moi : c’est possible seulement quand tu n’as plus d’obligation ni d’argent dans aucun groupe, et il faut ton PIN.',
      en: 'In Moi: “Numéro de paiement” (tap “Changer”, type the new number and the operator, then “Continuer”: a card appears and you confirm it with your PIN; for safety, withdrawals to the new number then wait a while (the length is set by the group’s rules)), “Réglages” (French or English, notifications), and “Historique de l’assistant” (everything I prepared for you). If you forgot your PIN, use “Code PIN oublié ?” on the sign-in screen; the group admin confirms they know you, a one-time reset link is then created, and withdrawals wait a little afterwards for safety. To delete your account, ask me: it is only possible when you have no obligation or money left in any group, and your PIN is needed.',
    },
  },
  {
    id: 'privacy',
    title: { fr: 'Confidentialité', en: 'Privacy' },
    keywords: [
      'prive',
      'private',
      'confidentiel',
      'confidential',
      'donnees',
      'data',
      'qui voit',
      'who sees',
      'voir mon numero',
      'see my number',
      'secret',
      'anonyme',
      'anonymous',
    ],
    text: {
      fr: 'Les autres membres ne voient jamais ton numéro de téléphone ni ton numéro de paiement, et moi non plus je ne les connais pas : l’application les affiche seulement sur ta propre carte. Les votes secrets ne sont liés à personne. Je ne reçois ni ton PIN ni tes jetons de connexion. Tes opérations d’argent sont visibles dans le registre du groupe, sans numéros.',
      en: 'Other members never see your phone number or payment number, and I do not know them either: the app only shows them on your own card. Secret votes are linked to nobody. I receive neither your PIN nor your sign-in tokens. Your money operations are visible in the group’s records, without numbers.',
    },
  },
];

const strip = (text: string): string =>
  text
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase();

const wordsOf = (text: string): string[] => strip(text).match(/[a-z0-9@]+/g) ?? [];

/**
 * Does the keyword occur in the words of the message? A long keyword is a stem ("rembours"
 * matches "remboursement"); a short one (4 letters or fewer) must be the whole word, so that
 * "tour" does not match "retour" nor "pin" "pinceau". A keyword of several words is looked for as is.
 */
function hasKeyword(text: string, words: readonly string[], keyword: string): boolean {
  const key = strip(keyword);
  if (key.includes(' ')) return (' ' + words.join(' ') + ' ').includes(' ' + key + ' ');
  return words.some((word) =>
    key.length <= 4
      ? word === key || word === key + 's' || word === key + 'x'
      : word.startsWith(key),
  );
}

/** The entry a topic points to: an id, or the entry whose keywords match the most. */
export function findGuideEntry(topic: string): GuideEntry | null {
  const wanted = strip(topic).trim();
  if (!wanted) return null;
  const byId = APP_GUIDE.find((entry) => entry.id === wanted);
  if (byId) return byId;
  const words = wordsOf(topic);
  let best: { entry: GuideEntry; score: number } | null = null;
  // The overview's words ("where", "help", "start") are generic: it only answers when no topic does.
  for (const entry of APP_GUIDE.filter((e) => e.id !== 'overview')) {
    let score = 0;
    for (const keyword of entry.keywords) {
      if (hasKeyword(topic, words, keyword)) score += strip(keyword).length;
    }
    if (strip(entry.title.fr).includes(wanted) || strip(entry.title.en).includes(wanted)) {
      score += 10;
    }
    if (score > 0 && (!best || score > best.score)) best = { entry, score };
  }
  if (best) return best.entry;
  const overview = APP_GUIDE.find((e) => e.id === 'overview')!;
  return overview.keywords.some((k) => hasKeyword(topic, words, k)) ? overview : null;
}

/** Words that make a message a question about the app, not an order (accents removed). */
const HOW_TO =
  /(^|\W)(comment|c est quoi|qu est ce|a quoi (sert|servent)|explique\w*|ou (est|sont|puis|trouve\w*|voir|je|on|se)|how (do|can|to|does|should|would)|where|what (is|are|does)|what s|explain|help|aide\w*)(\W|$)/;

/**
 * The guide entry for a message that asks how or where or what something is in the app, or null
 * when it is not such a question (an order such as "paie ma cotisation" never matches) or no topic
 * fits. The runtime hands the entry to the model before its first call (runtime/prefetch.ts).
 */
export function howToTopic(text: string): GuideEntry | null {
  if (text.length > 220) return null;
  const plain = strip(text).replace(/['’]/g, ' ');
  if (/\b(you just|this was from you|you asked|tu viens de|tu m as demande)\b/.test(plain))
    return null;
  if (!HOW_TO.test(plain)) return null;
  return findGuideEntry(text);
}

export function guideIndex(lang: GuideLang): { id: string; title: string }[] {
  return APP_GUIDE.map((entry) => ({ id: entry.id, title: entry.title[lang] }));
}

// What the app is and where things are, for the assistant to explain (get_app_guide). Written by
// hand, in French ("tu") and English, from the real screens of apps/mobile. Rules that keep it true:
//  - Every screen, tab, section and button it names is quoted with its EXACT label as the app shows
//    it in that language: «…» in French, “…” in English. The English app is NOT the French one
//    (“Group”, “Funds”, “Me”, not Groupe, Caisse, Moi). knowledge/app-guide.test.ts checks every
//    quoted label against packages/shared/src/i18n/ui.{fr,en}.ts and every route against
//    apps/mobile/app, so the guide cannot drift. What the member can say to the assistant goes in
//    plain "straight quotes" and is not checked.
//  - It states no amount, date, name or rule value. Those come from tools (rule 1 of the system
//    prompt), so the guide never goes out of date and the assistant never quotes a stale number.
//  - It says only what the app really does today. A screen that is not built is not described; where
//    only the assistant can do something (notification settings), it says so.
// Keywords (lowercase, accents optional) pick the entry for a question; the assistant can also
// ask for an entry by id, or for the index.

export type GuideLang = 'fr' | 'en';

export interface GuideEntry {
  id: string;
  title: Record<GuideLang, string>;
  /** Words that point to this entry, French and English, lowercase. */
  keywords: readonly string[];
  /** Route files of apps/mobile/app this entry sends the member to (without ".tsx"). */
  routes: readonly string[];
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
      'bouton',
      'button',
    ],
    routes: [
      '(app)/(tabs)/index',
      '(app)/(tabs)/groupe',
      '(app)/(tabs)/caisse',
      '(app)/(tabs)/votes',
      '(app)/(tabs)/moi',
      '(app)/notifications',
    ],
    text: {
      fr: 'L’application a cinq onglets en bas (sur grand écran, sur le côté) : «Njangi» (c’est moi : tu m’écris et je prépare des cartes que tu confirmes), «Groupe» (la discussion du groupe), «Caisse» (le tour en cours, les caisses et le registre), «Votes» (les propositions du groupe) et «Moi» (ton numéro de paiement, ta langue, tes groupes et la liste «Réglages»). En haut de chaque onglet : le nom de ton groupe (touche-le pour ouvrir «Mes groupes») et la cloche «Notifications». Sur tous les écrans, le bouton rond «Parler à Njangi» ouvre la conversation avec moi. La liste «Réglages» de l’onglet «Moi» mène à «Membres», «Prêts», «Réunions», «Relevés», «Historique de l’assistant», «Demandes de nouveau code PIN» et «Règles».',
      en: 'The app has five tabs at the bottom (on a wide screen, at the side): “Njangi” (that is me: you write to me and I prepare cards that you confirm), “Group” (the group chat), “Funds” (the current round, the funds and the records), “Votes” (the group’s proposals) and “Me” (your payment number, your language, your groups and the “Settings” list). At the top of each tab: your group’s name (tap it to open “My groups”) and the “Notifications” bell. On every screen, the round “Talk to Njangi” button opens the conversation with me. The “Settings” list of the “Me” tab leads to “Members”, “Loans”, “Meetings”, “Statements”, “Assistant history”, “New PIN requests” and “Rules”.',
    },
  },
  {
    id: 'assistant',
    title: { fr: 'Ce que je peux faire pour toi', en: 'What I can do for you' },
    keywords: [
      'que peux tu faire',
      'tu peux faire',
      'peux tu faire',
      'tu sais faire',
      'what can you do',
      'what can i ask',
      'can you',
      'capable',
      'capacites',
      'fonctionnalites',
      'features',
      'possible',
      'peux faire',
      'can do',
      'tout faire',
      'everything',
    ],
    routes: ['(app)/(tabs)/index', '(app)/(tabs)/votes'],
    text: {
      fr: 'Dans la conversation, je peux : te dire où en est le tour, ce que tu dois et ce qui est disponible ; préparer le paiement de ta cotisation ou de tes dettes, un retrait, une demande de prêt, un remboursement, une mise aux enchères, ton vote ; préparer une proposition au groupe (règle, nouveau membre, changement d’admin, ordre des tours, annulation d’amende, correction du registre, départ), une demande de soutien, une réunion, un message ou une annonce dans le groupe, un relevé ; lire et résumer le groupe ; changer ta langue, tes notifications ou ton groupe actif ; préparer le changement de ton numéro de paiement ou la suppression de ton compte. Tu confirmes chaque carte dans l’app. Seul l’écran peut : te faire voter à un vote secret (onglet «Votes», avec ton code PIN), saisir un code PIN, créer une njangi ou rejoindre avec un lien d’invitation, envoyer une photo, un fichier ou une note vocale dans «Groupe». Dis-moi ce que tu veux : j’essaie toujours d’abord.',
      en: 'In the conversation I can: tell you where the round stands, what you owe and what is available; prepare the payment of your contribution or debts, a withdrawal, a loan request, a repayment, a bid, your vote; prepare a proposal to the group (rule, new member, admin change, order of turns, waiving a fine, correcting the records, leaving), a support request, a meeting, a message or an announcement in the group, a statement; read and summarise the group; change your language, your notifications or your active group; prepare changing your payment number or deleting your account. You confirm every card in the app. Only the screen can: let you cast a secret-vote choice (“Votes” tab, with your PIN), type a PIN, create a njangi or join with an invitation link, send a photo, a file or a voice note in “Group”. Tell me what you want: I always try first.',
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
      'trust',
      'confiance',
      'annuler',
      'cancel',
      'expire',
    ],
    routes: ['(app)/(tabs)/index'],
    text: {
      fr: 'Je ne fais jamais rien tout seul. Quand tu me demandes de payer, retirer, emprunter, voter ou proposer quelque chose, je prépare une carte dans la conversation, avec le détail exact calculé par le serveur. Rien ne se passe tant que tu n’as pas appuyé sur le bouton de confirmation de la carte ; «Annuler» l’annule. Pour les actions sensibles (changer ton numéro de paiement, supprimer ton compte), ton code PIN est demandé en plus. Une carte non confirmée expire au bout de quelques minutes. Je ne dis qu’une action est faite qu’après avoir reçu son résultat, qui arrive dans la conversation.',
      en: 'I never do anything on my own. When you ask me to pay, withdraw, borrow, vote or propose something, I prepare a card in the conversation, with the exact details worked out by the server. Nothing happens until you tap the confirm button of the card; “Cancel” cancels it. For sensitive actions (changing your payment number, deleting your account) your PIN is needed too. A card you do not confirm expires after a few minutes. I only say an action is done once I have received its result, which arrives in the conversation.',
    },
  },
  {
    id: 'start',
    title: {
      fr: 'S’inscrire, se connecter, créer une njangi, rejoindre',
      en: 'Sign up, log in, create a njangi, join',
    },
    keywords: [
      'creer une njangi',
      'create a njangi',
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
      'connecter',
      'connexion',
      'log in',
      'login',
      'rejoindre',
      'join',
      'invitation',
      'nouveau groupe',
      'new group',
    ],
    routes: [
      '(auth)/welcome',
      '(auth)/signup',
      '(auth)/login',
      '(app)/create-group',
      '(app)/join',
      'invite/[token]',
    ],
    text: {
      fr: 'Pour t’inscrire : sur l’écran d’accueil, touche «Créer une njangi» (tu crées ton compte avec ton nom, ton numéro de téléphone, ton numéro de paiement et un code PIN à six chiffres, puis ton groupe) ou «J’ai une invitation» si ton admin t’a envoyé un lien. Si tu as déjà un compte : «J’ai déjà un compte», puis «Se connecter». Pour créer une njangi quand tu es déjà connecté : touche le nom de ton groupe en haut, puis «Créer une njangi» dans «Mes groupes» (le même bouton est dans l’onglet «Njangi» si tu n’as pas encore de groupe). Les étapes : le nom du groupe, quand le bénéficiaire reçoit, combien chacun cotise, les règles, puis «Créer le groupe» et «Inviter des membres». Pour rejoindre une njangi : ouvre le lien d’invitation sur ton téléphone, ou touche «Rejoindre avec une invitation» dans «Mes groupes», puis «Coller le lien».',
      en: 'To sign up: on the welcome screen, tap “Create a njangi” (you create your account with your name, your phone number, your payment number and a six-digit PIN, then your group) or “I have an invitation” if your admin sent you a link. If you already have an account: “I already have an account”, then “Log in”. To create a njangi when you are already logged in: tap your group’s name at the top, then “Create a njangi” in “My groups” (the same button is in the “Njangi” tab if you have no group yet). The steps: the group name, when the beneficiary receives, how much each member contributes, the rules, then “Create the group” and “Invite members”. To join a njangi: open the invitation link on your phone, or tap “Join with an invitation” in “My groups”, then “Paste the link”.',
    },
  },
  {
    id: 'founding',
    title: { fr: 'Membres fondateurs et démarrage', en: 'Founding members and start' },
    keywords: [
      'fondateur',
      'fondateurs',
      'founding',
      'founder',
      'membres fondateurs',
      'founding members',
      'inviter',
      'invite',
      'ajouter un membre',
      'add a member',
      'demarrer le cycle',
      'lancer le premier cycle',
      'start the cycle',
      'start first cycle',
      'premier cycle',
      'first cycle',
    ],
    routes: ['(app)/founding'],
    text: {
      fr: 'Avant le premier cycle, l’admin invite directement les membres fondateurs, sans vote. Ouvre «Membres fondateurs» : depuis «Inviter des membres» à la création du groupe, depuis le bouton «Membres fondateurs» de l’onglet «Votes», ou depuis «Inviter un membre» dans l’onglet «Caisse» (section «Tour»). Touche «Inviter un membre», écris le nom et le numéro de téléphone de la personne, puis «Créer le lien» et envoie-lui le lien. Quand il y a au moins trois membres actifs, l’admin touche «Démarrer le cycle» ; l’ordre des tours est tiré au sort. Je peux aussi préparer l’invitation et le démarrage pour l’admin. Une fois le cycle démarré, chaque nouveau membre passe par un vote.',
      en: 'Before the first cycle, the admin invites the founding members directly, without a vote. Open “Founding members”: from “Invite members” when the group is created, from the “Founding members” button in the “Votes” tab, or from “Invite a member” in the “Funds” tab (“Round” section). Tap “Invite a member”, type the person’s name and phone number, then “Create the link” and send them the link. Once there are at least three active members, the admin taps “Start the cycle”; the order of turns is drawn by lot. I can also prepare the invitation and the start for the admin. Once the cycle has started, every new member goes through a vote.',
    },
  },
  {
    id: 'groups',
    title: { fr: 'Changer de groupe', en: 'Switching group' },
    keywords: [
      'changer de groupe',
      'switch group',
      'autre groupe',
      'other group',
      'mes groupes',
      'my groups',
      'plusieurs groupes',
      'several groups',
      'groupe actif',
      'active group',
    ],
    routes: ['(app)/(tabs)/moi'],
    text: {
      fr: 'Pour changer de groupe : touche le nom du groupe en haut d’un onglet pour ouvrir «Mes groupes» et choisis le groupe (la liste «Mes groupes» de l’onglet «Moi» fait la même chose). Tu peux aussi me dire le nom du groupe et je le change pour toi. Les onglets «Groupe», «Caisse» et «Votes» montrent toujours le groupe actif.',
      en: 'To switch group: tap the group’s name at the top of a tab to open “My groups” and choose the group (the “My groups” list in the “Me” tab does the same). You can also tell me the group’s name and I switch it for you. The “Group”, “Funds” and “Votes” tabs always show the active group.',
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
      'rembourser dette',
    ],
    routes: ['(app)/(tabs)/caisse'],
    text: {
      fr: 'Deux façons. Soit tu me dis "paie ma cotisation" : je prépare la carte avec le montant exact et les frais, tu la confirmes, puis tu reçois la demande de paiement Mobile Money (MTN ou Orange) sur ton téléphone pour valider avec ton code. Soit tu ouvres l’onglet «Caisse», section «Tour», et tu touches «Payer ma cotisation». Tes dettes (amendes, remboursements de prêt) sont listées sous «Mes dettes», au même endroit, et peuvent être payées en même temps. Le paiement n’est compté que lorsque l’opérateur confirme ; le résultat arrive dans la conversation. Si rien n’arrive sur ton téléphone, ne relance pas : attends le résultat, puis dis-le-moi.',
      en: 'Two ways. Either tell me "pay my contribution": I prepare the card with the exact amount and fees, you confirm it, then you get the Mobile Money request (MTN or Orange) on your phone to approve with your code. Or open the “Funds” tab, “Round” section, and tap “Pay my contribution”. Your debts (fines, loan repayments) are listed under “My debts”, in the same place, and can be paid at the same time. The payment only counts once the operator confirms; the result arrives in the conversation. If nothing reaches your phone, do not try again: wait for the result, then tell me.',
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
    routes: ['(app)/(tabs)/caisse'],
    text: {
      fr: 'Quand c’est ton tour, le versement du tour devient disponible pour toi. Ouvre l’onglet «Caisse», section «Tour» : le bloc «Disponible» montre ce que tu peux retirer, avec le bouton «Retirer ton argent» (puis «Tout retirer» ou un montant, et «Continuer»). Ou dis-moi "retire mon argent" : je prépare la carte avec le montant et les frais, et tu confirmes. «Détail du versement» explique comment le montant est calculé. Après un changement de numéro de paiement, les retraits attendent un moment par sécurité ; je te donne la date exacte quand c’est le cas.',
      en: 'When it is your turn, the round’s payout becomes available to you. Open the “Funds” tab, “Round” section: the “Available” block shows what you can withdraw, with the “Withdraw your money” button (then “Withdraw everything” or an amount, and “Continue”). Or tell me "withdraw my money": I prepare the card with the amount and fees, and you confirm. “Payout details” explains how the amount is worked out. After a payment-number change, withdrawals wait a while for safety; I give you the exact date when that applies.',
    },
  },
  {
    id: 'loans',
    title: { fr: 'Les prêts', en: 'Loans' },
    keywords: [
      'pret',
      'prets',
      'loan',
      'loans',
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
    routes: ['(app)/loans'],
    text: {
      fr: 'Tu peux emprunter à la caisse générale. Demande-moi une estimation ("combien puis-je emprunter ?") : je donne ta limite, l’intérêt, les frais et les échéances, calculés par le serveur. Pour le faire toi-même, ouvre «Prêts» (onglet «Moi», liste «Réglages» ; ou onglet «Caisse», section «Caisse», bouton «Demander un prêt») : choisis le montant et la durée, puis «Préparer la demande». L’admin décide ; la demande d’un admin passe par un vote. Sous «Mon prêt» tu vois le prochain remboursement et le bouton «Rembourser maintenant». L’admin y voit aussi «Prêts à décider», avec «Approuver» et «Refuser».',
      en: 'You can borrow from the general fund. Ask me for an estimate ("how much can I borrow?"): I give your limit, the interest, the fees and the installments, worked out by the server. To do it yourself, open “Loans” (“Me” tab, “Settings” list; or “Funds” tab, “Fund” section, “Request a loan” button): choose the amount and the duration, then “Prepare the request”. The admin decides; an admin’s own request goes to a vote. Under “My loan” you see the next repayment and the “Repay now” button. The admin also sees “Loans to decide” there, with “Approve” and “Reject”.',
    },
  },
  {
    id: 'bids',
    title: { fr: 'Les enchères', en: 'Bids' },
    keywords: ['enchere', 'bid', 'bidding', 'miser', 'mise', 'tirage', 'draw', 'ordre', 'order'],
    routes: ['(app)/(tabs)/caisse'],
    text: {
      fr: 'Dans un groupe en mode enchères, l’ordre des bénéficiaires n’est pas fixé à l’avance : chaque membre qui n’a pas encore reçu son tour peut faire une mise secrète. Avant la clôture, tu ne vois que le nombre de mises et la tienne ; après la clôture, tout le monde voit toutes les mises. Dans l’onglet «Caisse», section «Tour», le bloc des enchères du tour a le bouton «Miser» (puis «Augmenter ma mise» pour la relever). Tu peux aussi me dire "je mise…" et je prépare la carte. Si ton groupe n’est pas en mode enchères, l’ordre suit les règles (par exemple tiré au sort).',
      en: 'In a group that uses bidding, the order of beneficiaries is not fixed in advance: each member who has not yet had their turn can place a sealed bid. Before the close you only see the number of bids and your own; after the close everyone sees all the bids. In the “Funds” tab, “Round” section, the round’s bidding block has the “Bid” button (then “Raise my bid” to increase it). You can also tell me "I bid…" and I prepare the card. If your group does not use bidding, the order follows the rules (for example drawn by lot).',
    },
  },
  {
    id: 'votes',
    title: { fr: 'Les votes', en: 'Votes' },
    keywords: [
      'vote',
      'voter',
      'votes',
      'seuil',
      'threshold',
      'secret',
      'decision',
      'oui ou non',
      'yes or no',
      'bulletin',
      'ballot',
    ],
    routes: ['(app)/(tabs)/votes'],
    text: {
      fr: 'Dans NjangiTrust, tout changement du groupe passe par un vote, et les votes commencent avec le premier cycle. L’onglet «Votes» liste les propositions «Ouverts» et «Clos». Sur chaque proposition, «Oui» ou «Non» prépare ton vote, que tu confirmes (avec ton code PIN pour un vote secret). Les votes secrets (exclusion d’un membre, changement d’admin) ne sont liés à personne : je ne prends pas ton choix dans la conversation, tu votes sur l’écran. Pour les autres votes, je peux préparer ton vote si tu me le demandes. Le résultat dépend du seuil et de la durée fixés par les règles, que je peux te lire. Pour faire une proposition, voir «Nouvelle proposition».',
      en: 'In NjangiTrust every change to the group goes through a vote, and votes start with the first cycle. The “Votes” tab lists the proposals “Open” and “Closed”. On each proposal, “Yes” or “No” prepares your vote, which you confirm (with your PIN for a secret vote). Secret votes (removing a member, changing the admin) are linked to nobody: I do not take your choice in the conversation, you vote on the screen. For the other votes, I can prepare your vote if you ask me. The result depends on the threshold and duration set by the rules, which I can read to you. To make a proposal, see “New proposal”.',
    },
  },
  {
    id: 'new_proposal',
    title: { fr: 'Faire une nouvelle proposition', en: 'Making a new proposal' },
    keywords: [
      'nouvelle proposition',
      'new proposal',
      'proposition',
      'proposal',
      'proposer',
      'propose',
      'faire une proposition',
      'make a proposal',
      'comment proposer',
      'how to propose',
      'lancer un vote',
      'ouvrir un vote',
      'exclure',
      'remove',
      'admin',
      'changer d admin',
      'change admin',
      'quitter',
      'leave',
      'exit',
      'rotation',
    ],
    routes: ['(app)/new-proposal'],
    text: {
      fr: 'Va dans l’onglet «Votes» et touche «Proposer». L’écran «Nouvelle proposition» demande ce que tu veux proposer : «Changement de règle», «Nouveau membre», «Exclusion d’un membre», «Changement d’ordre», «Changement d’admin», «Départ en cours de cycle», «Annulation d’amende» ou «Correction du registre». Remplis les champs, puis touche «Préparer la proposition» : la carte s’affiche et tu la confirmes. Tu peux aussi me le dire en une phrase et je prépare la même carte. Avant le premier cycle il n’y a pas de vote : l’admin invite les membres fondateurs directement (voir «Membres fondateurs»). Pour partir à la fin du cycle, sans vote, dis-le-moi.',
      en: 'Go to the “Votes” tab and tap “Propose”. The “New proposal” screen asks what you want to propose: “Rule change”, “New member”, “Member removal”, “Order change”, “Admin change”, “Leaving mid-cycle”, “Fine waiver” or “Records correction”. Fill in the fields, then tap “Prepare the proposal”: the card appears and you confirm it. You can also tell me in one sentence and I prepare the same card. Before the first cycle there is no vote: the admin invites the founding members directly (see “Founding members”). To leave at the end of the cycle, without a vote, tell me.',
    },
  },
  {
    id: 'funds',
    title: { fr: 'Les caisses et le registre', en: 'The funds and the records' },
    keywords: [
      'caisse',
      'fund',
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
      'export',
      'verification du jour',
      'daily check',
    ],
    routes: ['(app)/(tabs)/caisse'],
    text: {
      fr: 'L’onglet «Caisse» a quatre sections : «Tour» (le tour en cours : qui a payé, qui reçoit, tes boutons de paiement et de retrait, «Détail du versement»), «Caisse» (la caisse générale et «Disponible pour les prêts»), «Secours» (la caisse de secours) et «Registre» (la liste de toutes les opérations, avec des filtres et la vérification du jour). Le registre ne se modifie jamais et rien n’y est supprimé : si une erreur est trouvée, le groupe vote une correction, qui ajoute une écriture d’annulation. L’export du registre en fichier se demande dans la conversation. Les montants exacts, je te les donne en lisant les données du groupe.',
      en: 'The “Funds” tab has four sections: “Round” (the current round: who paid, who receives, your payment and withdrawal buttons, “Payout details”), “Fund” (the general fund and “Available for loans”), “Solidarity” (the solidarity fund) and “Records” (the list of every operation, with filters and the daily check). The records are never edited and nothing is deleted: if a mistake is found, the group votes a correction, which adds a reversing entry. Exporting the records as a file is done by asking me in the conversation. For exact amounts I read the group’s data to you.',
    },
  },
  {
    id: 'solidarity',
    title: { fr: 'La caisse de secours', en: 'The solidarity fund' },
    keywords: [
      'secours',
      'solidarite',
      'solidarity',
      'soutien',
      'support',
      'deuil',
      'naissance',
      'maladie',
      'mariage',
      'caisse de secours',
      'solidarity fund',
    ],
    routes: ['(app)/(tabs)/caisse'],
    text: {
      fr: 'La caisse de secours est alimentée à chaque tour et aide un membre lors d’un événement (deuil, naissance, maladie, mariage…). Pour demander un soutien : onglet «Caisse», section «Secours», bouton «Demander un soutien» (pour toi ou pour un autre membre, l’événement, le montant, une note), puis «Préparer la demande». Les membres votent ; si la demande est acceptée, l’argent est versé. Tu peux aussi me demander de préparer la demande. Si la caisse de secours est désactivée, il faut d’abord un changement de règle.',
      en: 'The solidarity fund is fed at every round and helps a member after an event (bereavement, birth, illness, wedding…). To request support: “Funds” tab, “Solidarity” section, “Request support” button (for you or for another member, the event, the amount, a note), then “Prepare the request”. The members vote; if the request is accepted, the money is paid out. You can also ask me to prepare the request. If the solidarity fund is switched off, a rule change is needed first.',
    },
  },
  {
    id: 'fines',
    title: { fr: 'Les amendes', en: 'Fines' },
    keywords: ['amende', 'fine', 'retard', 'late', 'penalite', 'penalty', 'absence', 'sanction'],
    routes: ['(app)/(tabs)/caisse'],
    text: {
      fr: 'Une amende s’applique selon les règles du groupe, par exemple pour un paiement en retard. Elle apparaît sous «Mes dettes» (onglet «Caisse», section «Tour») et se paie avec la cotisation ou à part. Pour comprendre pourquoi tu as une amende, demande-moi : je regarde le registre et je te cite la règle officielle avec la vraie date limite. Une amende ne s’efface pas toute seule : le groupe peut voter pour l’annuler (je peux préparer la proposition «Annulation d’amende»).',
      en: 'A fine applies according to the group’s rules, for example for a late payment. It appears under “My debts” (“Funds” tab, “Round” section) and is paid with the contribution or separately. To understand why you have a fine, ask me: I look at the records and quote the official rule with the real deadline. A fine does not disappear on its own: the group can vote to waive it (I can prepare the “Fine waiver” proposal).',
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
    routes: ['(app)/meetings', '(app)/meetings/[meetingId]'],
    text: {
      fr: 'Ouvre l’onglet «Moi», puis «Réunions» (dans la liste «Réglages») : tu vois les réunions «À venir» et «Passées», et l’admin y touche «Planifier une réunion». Dans une réunion : «Ordre du jour» avec «Ajouter un point», «Je suis là» pour signaler ta présence (le pointage ouvre un peu avant la réunion), «Envoyer une excuse» avant le début, et «Présences». Après la réunion, l’admin marque les présences et publie le «Procès-verbal» : «Préparer le brouillon avec Njangi», puis «Publier le procès-verbal». Je peux faire tout cela pour toi dans la conversation. Une amende d’absence n’existe que si le groupe l’a activée dans ses règles.',
      en: 'Open the “Me” tab, then “Meetings” (in the “Settings” list): you see the “Upcoming” and “Past” meetings, and the admin taps “Schedule a meeting” there. In a meeting: “Agenda” with “Add an item”, “I’m here” to signal your presence (check-in opens a little before the meeting), “Send an apology” before the start, and “Attendance”. After the meeting, the admin marks attendance and publishes the “Minutes”: “Prepare the draft with Njangi”, then “Publish the minutes”. I can do all of this for you in the conversation. An absence fine only exists if the group switched it on in its rules.',
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
      'photo',
      'fichier',
      'file',
      'vocal',
      'voice',
      'supprimer un message',
      'delete a message',
    ],
    routes: ['(app)/(tabs)/groupe'],
    text: {
      fr: 'L’onglet «Groupe» est la discussion de tout le groupe : écris dans «Écris un message…». Le bouton pour joindre propose «Photo de la galerie», «Prendre une photo», «Vidéo» et «Document PDF» ; le bouton micro enregistre une note vocale (les fichiers et les notes vocales ne passent pas par moi). Appuie longuement sur un message pour ouvrir ses options : «Répondre», «Copier le texte», «Demander à Njangi» et, pour ton propre message, «Supprimer pour tout le monde». Si tu écris @njangi, je réponds dans le groupe aux questions qui concernent tout le monde ; pour une question personnelle ou une action, je te réponds en privé dans l’onglet «Njangi». Je peux aussi résumer ce que tu n’as pas lu, retrouver un message, ou publier un message à ta place après ta confirmation. L’admin peut publier une annonce («Annonce épinglée») et masquer un message abusif.',
      en: 'The “Group” tab is the whole group’s chat: write in “Write a message…”. The attach button offers “Photo from gallery”, “Take a photo”, “Video” and “PDF document”; the microphone button records a voice note (files and voice notes do not pass through me). Long-press a message to open its options: “Reply”, “Copy text”, “Ask Njangi” and, for your own message, “Delete for everyone”. If you write @njangi, I answer in the group questions that concern everyone; for a personal question or an action, I answer you privately in the “Njangi” tab. I can also summarise what you have not read, find a message, or post a message for you after your confirmation. The admin can publish an announcement (“Pinned announcement”) and hide an abusive message.',
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
    routes: ['(app)/statements'],
    text: {
      fr: 'Ton relevé (la liste de tes opérations sur une période) se génère dans l’onglet «Moi», liste «Réglages», «Relevés» : touche «Générer un relevé», choisis un mois, un cycle ou des dates, puis ouvre le fichier quand il est prêt. Tu peux aussi me le demander : je te le montre sous forme de carte à ouvrir. L’export du registre complet du groupe se demande dans la conversation. Les fichiers s’ouvrent depuis l’app ; ils ne passent pas par moi.',
      en: 'Your statement (the list of your operations over a period) is generated in the “Me” tab, “Settings” list, “Statements”: tap “Generate a statement”, choose a month, a cycle or dates, then open the file once it is ready. You can also ask me: I show it as a card you can open. Exporting the group’s full records is done by asking me in the conversation. Files open from the app; they do not pass through me.',
    },
  },
  {
    id: 'account',
    title: {
      fr: 'Mon compte, mon numéro, ma langue',
      en: 'My account, number and language',
    },
    keywords: [
      'numero',
      'number',
      'telephone',
      'phone',
      'changer mon numero',
      'change my number',
      'numero de paiement',
      'payment number',
      'langue',
      'language',
      'francais',
      'english',
      'reglage',
      'settings',
      'supprimer',
      'delete',
      'deconnecter',
      'log out',
      'logout',
      'compte',
      'account',
      'profil',
      'profile',
    ],
    routes: ['(app)/(tabs)/moi'],
    text: {
      fr: 'Dans l’onglet «Moi» : la ligne «Numéro de paiement» ouvre «Changer de numéro de paiement» (saisis le nouveau numéro et l’opérateur, puis «Continuer» : une carte s’affiche et tu la confirmes avec ton code PIN ; par sécurité, les retraits vers le nouveau numéro attendent ensuite un moment fixé par les règles du groupe). «Langue» passe l’app et mes réponses en français ou en anglais. En bas : «Se déconnecter», «Se déconnecter partout» (dans «Réglages») et «Supprimer mon compte» (possible seulement quand tu n’as plus d’obligation ni d’argent dans un groupe ; il faut ton code PIN). Il n’y a pas encore d’écran pour régler les notifications ni pour changer ton code PIN : pour les notifications, dis-moi ce que tu veux et je l’applique.',
      en: 'In the “Me” tab: the “Payment number” row opens “Change payment number” (type the new number and the operator, then “Continue”: a card appears and you confirm it with your PIN; for safety, withdrawals to the new number then wait a while, set by the group’s rules). “Language” switches the app and my replies to French or English. At the bottom: “Log out”, “Log out everywhere” (in “Settings”) and “Delete my account” (only possible when you have no obligation or money left in any group; your PIN is needed). There is no screen yet to adjust notifications or to change your PIN: for notifications, tell me what you want and I apply it.',
    },
  },
  {
    id: 'notifications',
    title: { fr: 'Les notifications', en: 'Notifications' },
    keywords: [
      'notification',
      'notifications',
      'cloche',
      'bell',
      'alerte',
      'alert',
      'rappel',
      'reminder',
      'heures calmes',
      'quiet hours',
      'couper',
      'mute',
    ],
    routes: ['(app)/notifications', '(app)/notification-settings'],
    text: {
      fr: 'La cloche «Notifications» en haut de chaque onglet ouvre la liste de tes notifications (paiements, échéances, votes, réunions, sécurité) ; «Tout marquer comme lu» les marque toutes comme lues. Pour choisir lesquelles tu reçois, ouvre l’onglet «Moi» puis la ligne «Notifications» : l’écran «Réglages des notifications» te laisse régler les catégories, les «Heures calmes» et «Couper les messages du groupe» ; je peux aussi le faire pour toi. Les alertes de sécurité ne se coupent jamais.',
      en: 'The “Notifications” bell at the top of each tab opens the list of your notifications (payments, due dates, votes, meetings, security); “Mark all as read” marks them all as read. To choose which ones you receive, open the “Me” tab then the “Notifications” row: the “Notification settings” screen lets you set the categories, “Quiet hours” and “Mute group messages”; I can also do it for you. Security alerts can never be muted.',
    },
  },
  {
    id: 'pin_resets',
    title: { fr: 'Code PIN oublié', en: 'Forgotten PIN' },
    keywords: [
      'pin',
      'code pin',
      'pin oublie',
      'forgot pin',
      'forgotten pin',
      'reinitialiser pin',
      'reset pin',
      'mot de passe',
      'password',
      'nouveau code',
      'approuver pin',
      'confirmer pin',
    ],
    routes: ['(auth)/forgot-pin', '(app)/pin-resets', 'reset-pin/[token]'],
    text: {
      fr: 'Si tu as oublié ton code PIN : sur l’écran de connexion, touche «Code PIN oublié ?», saisis ton numéro puis «Demander un nouveau code». L’admin de ton groupe confirme qu’il te connaît et t’envoie un lien à usage unique ; par sécurité, le lien ne marche qu’après un délai, puis tes retraits attendent un moment. Pour l’admin (ou deux membres si c’est l’admin qui a oublié) : onglet «Moi», «Demandes de nouveau code PIN», puis «Je confirme, créer le lien» ou «Je ne reconnais pas cette demande». Je ne peux ni voir, ni changer, ni réinitialiser un code PIN.',
      en: 'If you forgot your PIN: on the sign-in screen, tap “Forgot your PIN?”, type your number then “Ask for a new PIN”. Your group’s admin confirms they know you and sends you a one-time link; for safety, the link only works after a delay, then your withdrawals wait a while. For the admin (or two members when the admin is the one who forgot): “Me” tab, “New PIN requests”, then “I confirm, create the link” or “I don’t recognise this request”. I can neither see, change nor reset a PIN.',
    },
  },
  {
    id: 'history',
    title: { fr: 'Historique de l’assistant', en: 'Assistant history' },
    keywords: [
      'historique de l assistant',
      'assistant history',
      'ce que tu as fait',
      'what you did',
      'qu as tu fait',
      'what did you do',
      'actions passees',
      'past actions',
    ],
    routes: ['(app)/agent-history'],
    text: {
      fr: 'Tout ce que j’ai consulté, préparé ou fait pour toi est listé dans «Historique de l’assistant» (onglet «Moi», liste «Réglages», ou le lien en haut de l’onglet «Njangi»). Seul toi le vois, pas même l’admin.',
      en: 'Everything I looked at, prepared or did for you is listed in “Assistant history” (“Me” tab, “Settings” list, or the link at the top of the “Njangi” tab). Only you can see it, not even the admin.',
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
      'confidentialite',
      'privacy',
      'donnees',
      'data',
      'qui voit',
      'who sees',
      'voir mon numero',
      'see my number',
      'anonyme',
      'anonymous',
    ],
    routes: ['(app)/(tabs)/moi'],
    text: {
      fr: 'Les autres membres ne voient jamais ton numéro de téléphone ni ton numéro de paiement, et moi non plus je ne les connais pas : l’application les affiche seulement sur ta propre carte. Les votes secrets ne sont liés à personne. Je ne reçois ni ton code PIN ni tes jetons de connexion. Tes opérations d’argent sont visibles dans le registre du groupe, sans numéros.',
      en: 'Other members never see your phone number or payment number, and I do not know them either: the app only shows them on your own card. Secret votes are linked to nobody. I receive neither your PIN nor your sign-in tokens. Your money operations are visible in the group’s records, without numbers.',
    },
  },
  {
    id: 'members',
    title: { fr: 'Les membres du groupe', en: 'Group members' },
    keywords: [
      'membre',
      'membres',
      'member',
      'members',
      'liste des membres',
      'member list',
      'qui est dans le groupe',
      'who is in the group',
      'role',
      'administrateur',
      'admin du groupe',
    ],
    routes: ['(app)/members'],
    text: {
      fr: 'Pour voir les membres : onglet «Moi», liste «Réglages», puis «Membres». Tu y trouves chaque membre avec son rôle et son statut ; les numéros ne sont jamais affichés. Pour faire entrer une nouvelle personne : avant le premier cycle, l’admin l’invite (voir «Membres fondateurs») ; ensuite, par un vote : onglet «Votes», «Proposer», «Nouveau membre».',
      en: 'To see the members: “Me” tab, “Settings” list, then “Members”. You find each member with their role and status; numbers are never shown. To bring in a new person: before the first cycle, the admin invites them (see “Founding members”); afterwards, by a vote: “Votes” tab, “Propose”, “New member”.',
    },
  },
  {
    id: 'rules',
    title: { fr: 'Les règles du groupe', en: 'Group rules' },
    keywords: [
      'regle',
      'regles',
      'rule',
      'rules',
      'reglement',
      'statuts',
      'parametres',
      'parameters',
      'consulter les regles',
      'voir les regles',
      'modifier les regles',
      'changer les regles',
    ],
    routes: ['(app)/group-rules'],
    text: {
      fr: 'Pour consulter les règles du groupe : onglet «Moi», liste «Réglages», puis «Règles» (cotisation, caisse de secours, amende de retard, durée des votes, ordre des bénéficiaires, conditions des prêts…). Les règles ne changent que par un vote, admin compris : onglet «Votes», «Proposer», «Changement de règle» (ou demande-le-moi). La règle votée s’applique à la date indiquée sur la proposition.',
      en: 'To see the group’s rules: “Me” tab, “Settings” list, then “Rules” (contribution, solidarity fund, late fine, vote duration, order of beneficiaries, loan conditions…). Rules only change through a vote, the admin included: “Votes” tab, “Propose”, “Rule change” (or ask me). The voted rule applies from the date shown on the proposal.',
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

const HOW_TO_PHRASES: readonly string[] = [
  // French: how, where, what is, which screen, "I can't find".
  'comment',
  'c est quoi',
  'qu est ce',
  'a quoi (sert|servent|ca sert)',
  String.raw`explique\w*`,
  String.raw`ou (est|sont|puis|trouve\w*|voir|je|on|se|ca|faut|dois|peut|peux|va|vais)`,
  'c est ou',
  'ca se trouve',
  'je (ne )?(le |la |les )?trouve pas',
  'quel(le)?s? (ecran|onglet|bouton|menu|section|page)',
  'sur quel(le)? (ecran|onglet|bouton)',
  'par ou',
  'que (peux|sais) tu faire',
  'tu (peux|sais) faire quoi',
  'je veux comprendre',
  String.raw`aide\w*`,
  // English
  'how (do|can|to|does|should|would|did)',
  'where',
  'what (is|are|does|do|can)',
  'what s',
  'which (screen|tab|button|menu|section|page)',
  'explain',
  'help',
  'show me (how|where)',
  'tell me (how|where|about)',
  'i (can t|cannot|can not|don t|do not|couldn t) (find|see|know where)',
  'i don t know how',
  'i want to understand',
];

/** Words that make a message a question about the app, not an order (accents removed). */
const HOW_TO = new RegExp(String.raw`(^|\W)(` + HOW_TO_PHRASES.join('|') + String.raw`)(\W|$)`);

/**
 * The guide entry for a message that asks how or where or what something is in the app, or null
 * when it is not such a question (an order such as "paie ma cotisation" never matches) or no topic
 * fits. The runtime hands the entry to the model before its first call (runtime/prefetch.ts).
 */
export function howToTopic(text: string): GuideEntry | null {
  if (text.length > 220) return null;
  const plain = strip(text).replace(/['’-]/g, ' ');
  if (/\b(you just|this was from you|you asked|tu viens de|tu m as demande)\b/.test(plain))
    return null;
  if (!HOW_TO.test(plain)) return null;
  return findGuideEntry(text);
}

export function guideIndex(lang: GuideLang): { id: string; title: string }[] {
  return APP_GUIDE.map((entry) => ({ id: entry.id, title: entry.title[lang] }));
}

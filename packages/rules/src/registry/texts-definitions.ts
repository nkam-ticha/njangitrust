// Spec 3.1–3.3: definitions, parameters and conventions, in French and English.

import type { Bilingual, RuleText } from './types';

export function entry(
  id: string,
  title: Bilingual,
  en: string,
  fr: string,
  topics: string[],
): RuleText {
  const section = id.startsWith('R') ? id.split('.')[0]! : '3';
  return { id, section, title, text: { fr, en }, topics };
}

const GENERAL: Bilingual = { fr: 'Définitions et conventions', en: 'Definitions and conventions' };

export const DEFINITIONS: readonly RuleText[] = [
  entry(
    '3.1',
    GENERAL,
    "Group (njangi): members, a rule set, and a sequence of cycles. Cycle: a sequence of rounds in which every active member is beneficiary exactly once. Round: a period with a payment deadline (dueAt) and a payout time (payoutAt). Beneficiary: the member who receives the round's contributions. Pot: all contributions for a round; contributions always go to that round's beneficiary, even when paid late. General fund: group money from fines, loan interest and winning bids, used for loans and shared at cycle end. Solidarity fund: separate group money for members' life events, paid out by vote. Payable: money the group holds for a member (unwithdrawn payout, refund, fund share), reserved for that member only. Receivable (debt): money a member owes the general fund (fine, loan, winning bid). Eligible voters: active members at the moment a proposal is created, minus any exclusions for that proposal type.",
    "Groupe (njangi) : des membres, un ensemble de règles et une suite de cycles. Cycle : une suite de tours où chaque membre actif est bénéficiaire exactement une fois. Tour : une période avec une date limite de paiement (dueAt) et une heure de versement (payoutAt). Bénéficiaire : le membre qui reçoit les cotisations du tour. Cagnotte : toutes les cotisations d'un tour ; elles reviennent toujours au bénéficiaire de ce tour, même payées en retard. Caisse générale : l'argent du groupe venant des amendes, des intérêts des prêts et des enchères gagnantes, utilisé pour les prêts et partagé en fin de cycle. Caisse de secours : un argent séparé du groupe pour les événements de vie des membres, versé par vote. Solde à retirer : l'argent que le groupe garde pour un membre (versement non retiré, remboursement, part de caisse), réservé à ce seul membre. Créance (dette) : l'argent qu'un membre doit à la caisse générale (amende, prêt, enchère gagnante). Votants : les membres actifs au moment où une proposition est créée, moins les exclusions prévues pour ce type de proposition.",
    [
      'definition',
      'définition',
      'glossaire',
      'glossary',
      'cycle',
      'tour',
      'round',
      'beneficiaire',
      'beneficiary',
      'pot',
      'cagnotte',
      'payable',
      'solde',
      'receivable',
      'creance',
      'dette',
      'debt',
      'votants',
      'eligible voters',
    ],
  ),
  entry(
    '3.2',
    GENERAL,
    "Every parameter below is part of the group's rule set. The creator sets the initial values when creating the group; after that, each one changes only through a RULE_CHANGE vote (R11). contributionAmount: default 10 000 FCFA, 500 to 1 000 000. solidarityContribution: 1 000 FCFA per round (0 turns the solidarity fund off), 0 to 50 000. frequency: monthly; weekly, every two weeks or monthly. payoutTime: set at creation (example: last Saturday of the month, 18:00). Payment deadline (dueAt): 24 hours before payoutAt, fixed. lateFine: 1 000 FCFA, 0 to 50 000. rotationMode: FIXED (draw), FIXED or BIDDING. minBid: 500 FCFA, 0 to 1 000 000. loanRatePermille (monthly): 50 (5% per month), 0 to 100. loanMaxMonths: 3, 1 to 6. loanLimitFactor: 1.0, 0 to 3. numberChangeHoldHours: 48, 0 to 168. voteWindowHours: 72, 24 to 168. solidarityVoteWindowHours: 24, 12 to 72. meetingAbsenceFine: 0 (off), 0 to 50 000. distributeFundAtCycleEnd: yes, yes or no. reliabilityWindow: last 12 due payments, 6 to 24.",
    "Chaque paramètre ci-dessous fait partie des règles du groupe. Le créateur fixe les valeurs de départ en créant le groupe ; ensuite, chacun ne change que par un vote RULE_CHANGE (R11). Cotisation (contributionAmount) : 10 000 FCFA par défaut, de 500 à 1 000 000. Caisse de secours (solidarityContribution) : 1 000 FCFA par tour (0 désactive la caisse de secours), de 0 à 50 000. Fréquence : mensuelle ; hebdomadaire, toutes les deux semaines ou mensuelle. Heure de versement (payoutTime) : fixée à la création (exemple : dernier samedi du mois, 18 h). Date limite de paiement (dueAt) : 24 heures avant le versement, fixe. Amende de retard (lateFine) : 1 000 FCFA, de 0 à 50 000. Mode d'ordre (rotationMode) : FIXED (tirage au sort), FIXED ou BIDDING (enchère). Enchère minimale (minBid) : 500 FCFA, de 0 à 1 000 000. Taux du prêt en pour mille par mois (loanRatePermille) : 50 (5 % par mois), de 0 à 100. Durée maximale d'un prêt (loanMaxMonths) : 3 mois, de 1 à 6. Coefficient de plafond de prêt (loanLimitFactor) : 1,0, de 0 à 3. Blocage après changement de numéro (numberChangeHoldHours) : 48 heures, de 0 à 168. Durée d'un vote (voteWindowHours) : 72 heures, de 24 à 168. Durée d'un vote de secours (solidarityVoteWindowHours) : 24 heures, de 12 à 72. Amende d'absence en réunion (meetingAbsenceFine) : 0 (désactivée), de 0 à 50 000. Partage de la caisse générale en fin de cycle (distributeFundAtCycleEnd) : oui, oui ou non. Fenêtre de fiabilité (reliabilityWindow) : les 12 derniers paiements dus, de 6 à 24.",
    [
      'parametres',
      'parameters',
      'regles du groupe',
      'rule set',
      'defaut',
      'default',
      'montant de la cotisation',
      'contribution amount',
      'frequence',
      'frequency',
      'heure de versement',
      'payout time',
      'taux',
      'interest rate',
      'plafond',
      'limit',
      'duree du vote',
      'vote window',
      'blocage',
      'hold',
    ],
  ),
  entry(
    '3.3',
    GENERAL,
    'Amounts are integers in FCFA. No floating-point arithmetic anywhere in money code. Proportional splits use the largest remainder method: floor every share, then give the remaining francs one by one to the shares with the largest fractional parts. Ties go in this fixed order: contribution, shortfall, solidarity, debt; then by rotation order for members. Interest is rounded half up to the nearest franc. dueAt and payoutAt are computed in Africa/Douala time and stored in UTC.',
    "Les montants sont des nombres entiers de FCFA. Aucun calcul à virgule dans le code qui touche à l'argent. Les répartitions au prorata utilisent la méthode des plus forts restes : on arrondit chaque part à l'entier inférieur, puis on donne les francs restants un par un aux parts qui ont les plus grandes décimales. En cas d'égalité, l'ordre est fixe : cotisation, compensation, caisse de secours, dette ; puis l'ordre des tours pour les membres. Les intérêts sont arrondis au franc le plus proche, la moitié vers le haut. La date limite et l'heure de versement sont calculées à l'heure de Douala et enregistrées en UTC.",
    [
      'arrondi',
      'rounding',
      'plus forts restes',
      'largest remainder',
      'repartition',
      'split',
      'francs',
      'heure de douala',
      'time zone',
      'fuseau',
      'entier',
      'integer',
    ],
  ),
];

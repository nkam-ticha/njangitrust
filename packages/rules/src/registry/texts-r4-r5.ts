// Spec Part 3, R4 and R5, in French and English.

import { entry } from './texts-definitions';
import type { RuleText } from './types';

const R4 = { fr: 'Frais', en: 'Fees' };
const R5 = {
  fr: 'Versements, règlement automatique et retraits',
  en: 'Payouts, auto-settlement and withdrawals',
};

export const RULES_R4_R5: readonly RuleText[] = [
  entry(
    'R4.1',
    R4,
    'Principle: whoever receives the money bears the fee. This is how the beneficiary pays the fees of their round.',
    "Principe : celui qui reçoit l'argent supporte les frais. C'est ainsi que le bénéficiaire paie les frais de son tour.",
    ['frais', 'fees', 'fee', 'qui paie', 'who pays'],
  ),
  entry(
    'R4.2',
    R4,
    "Collection fee on a payment is split across its parts in proportion to their amounts (largest remainder, 3.3): contribution part: borne by that round's beneficiary; shortfall part (R12.3): borne by the leaver receiving it; solidarity part: borne by the solidarity fund; debt part (fines, loan installments, bids): borne by the general fund.",
    "Les frais de collecte d'un paiement sont répartis entre ses parts au prorata de leurs montants (plus forts restes, 3.3) : part cotisation : à la charge du bénéficiaire du tour ; part de compensation (R12.3) : à la charge du membre sortant qui la reçoit ; part caisse de secours : à la charge de la caisse de secours ; part dette (amendes, échéances de prêt, enchères) : à la charge de la caisse générale.",
    ['frais', 'fees', 'frais de collecte', 'collection fee', 'repartition', 'split'],
  ),
  entry(
    'R4.3',
    R4,
    'Disbursement fee is borne by the person receiving the disbursement. The amount plus the estimated fee must fit in what is available. If the actual fee differs from the estimate, the difference is absorbed by the general fund and shown in the same ledger entry.',
    "Les frais d'envoi sont à la charge de la personne qui reçoit l'argent. Le montant plus les frais estimés doivent tenir dans ce qui est disponible. Si les frais réels diffèrent de l'estimation, la différence est absorbée par la caisse générale et apparaît dans la même écriture du registre.",
    [
      'frais',
      'fees',
      'frais de retrait',
      'withdrawal fee',
      'frais envoi',
      'disbursement fee',
      'estimation',
      'estimate',
    ],
  ),
  entry(
    'R4.4',
    R4,
    "Fees come from the provider's response when available, otherwise from the configured fee schedule. Each ledger entry records which.",
    'Les frais viennent de la réponse du prestataire de paiement quand elle les donne, sinon du barème configuré. Chaque écriture du registre indique leur origine.',
    ['frais', 'fees', 'bareme', 'fee schedule', 'operateur', 'provider'],
  ),
  entry(
    'R4.5',
    R4,
    'Members are debited exactly the amount shown on the confirmation card, never a fee on top. The app MUST NOT go live with a provider whose fee model breaks this.',
    "Les membres sont débités exactement du montant affiché sur la carte de confirmation, jamais de frais en plus. L'application ne doit pas être mise en service avec un prestataire dont le modèle de frais ne respecte pas cette règle.",
    ['frais', 'fees', 'debite', 'charged', 'montant affiche', 'confirmation card'],
  ),

  entry(
    'R5.1',
    R5,
    "Each confirmed contribution for round r immediately credits the beneficiary's payable with its net amount (amount minus its fee share).",
    'Chaque cotisation confirmée pour le tour r crédite immédiatement le solde du bénéficiaire de son montant net (montant moins sa part de frais).',
    ['versement', 'payout', 'credit', 'solde', 'balance', 'net', 'beneficiaire', 'beneficiary'],
  ),
  entry(
    'R5.2',
    R5,
    "Credits for round r are locked until round r's payoutAt. From then on they can be withdrawn. Contributions that arrive after payoutAt can be withdrawn as soon as they arrive.",
    "Les crédits du tour r sont bloqués jusqu'au versement du tour r (payoutAt). Ensuite, ils peuvent être retirés. Les cotisations qui arrivent après le versement peuvent être retirées dès leur arrivée.",
    [
      'bloque',
      'locked',
      'versement',
      'payout',
      'quand retirer',
      'when withdraw',
      'retrait',
      'withdrawal',
    ],
  ),
  entry(
    'R5.3',
    R5,
    "Auto-settlement. At payoutAt, and whenever a member's payable is credited (locked or not), the member's debts that are due are paid from the payable first, oldest first: winning bid, fines, due or overdue loan installments. Installments that are not yet due are never taken.",
    "Règlement automatique. Au versement, et chaque fois que le solde d'un membre est crédité (bloqué ou non), ses dettes échues sont d'abord payées avec ce solde, de la plus ancienne à la plus récente : enchère gagnante, amendes, échéances de prêt échues ou en retard. Les échéances pas encore échues ne sont jamais prélevées.",
    [
      'reglement automatique',
      'auto settlement',
      'deduction',
      'prelevement',
      'dettes',
      'debts',
      'versement',
      'payout',
      'pourquoi moins',
      'why less',
    ],
  ),
  entry(
    'R5.4',
    R5,
    'A withdrawal can only be made by the member, only to their own active payment number, for any amount from 100 FCFA up to what is available (2.5, "Available to withdraw"). Partial withdrawals are allowed. One withdrawal at a time per member.',
    "Seul le membre peut faire un retrait, uniquement vers son propre numéro de paiement actif, pour tout montant de 100 FCFA jusqu'à ce qui est disponible (2.5, « disponible au retrait »). Les retraits partiels sont permis. Un seul retrait à la fois par membre.",
    [
      'retrait',
      'retirer',
      'withdraw',
      'withdrawal',
      'minimum',
      'disponible',
      'available',
      'retrait partiel',
      'partial',
    ],
  ),
  entry(
    'R5.5',
    R5,
    "Withdrawals are blocked when: the member's payment number changed or their PIN was reset less than numberChangeHoldHours ago (R13.5); the daily reconciliation is in ALERT state. All withdrawals in the group pause until the problem is resolved, and every member is told why.",
    "Les retraits sont bloqués quand : le numéro de paiement du membre a changé ou son PIN a été réinitialisé il y a moins de numberChangeHoldHours (R13.5) ; la vérification quotidienne est en état ALERTE. Tous les retraits du groupe sont alors suspendus jusqu'à la résolution du problème, et chaque membre est informé de la raison.",
    [
      'retrait bloque',
      'withdrawal blocked',
      'blocage',
      'hold',
      'alerte',
      'alert',
      'verification',
      'reconciliation',
      'retrait',
      'withdrawal',
    ],
  ),
  entry(
    'R5.6',
    R5,
    'Money left in a payable stays reserved for that member. It is never lent and never used for anything else.',
    "L'argent laissé sur le solde d'un membre lui reste réservé. Il n'est jamais prêté ni utilisé à autre chose.",
    ['reserve', 'reserved', 'solde', 'balance', 'securite', 'safe', 'argent garde'],
  ),
];

// Gallery fixtures (development only): spec 5.5 demo data, Njangi des Collègues, round 4 of 10.
import type {
  PendingActionDto,
  PendingActionStatus,
} from '@njangi/shared/contracts/pending-actions';
import type { RingMember } from '../ring/NjangiRing';

const id = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;

/** Rotation order; Carine (round 4) is the beneficiary; Brice, Mireille and Ivo already received. */
export const ringMembers: RingMember[] = [
  {
    membershipId: id(1),
    name: 'Brice Tchakounté',
    state: 'paid',
    isBeneficiary: false,
    served: true,
  },
  {
    membershipId: id(2),
    name: 'Mireille Atangana',
    state: 'paid',
    isBeneficiary: false,
    served: true,
  },
  { membershipId: id(3), name: 'Ivo Fon', state: 'paid', isBeneficiary: false, served: true },
  { membershipId: id(4), name: 'Carine Fotso', state: 'paid', isBeneficiary: true, served: false },
  { membershipId: id(5), name: 'Joël Ndi', state: 'late', isBeneficiary: false, served: false },
  {
    membershipId: id(6),
    name: 'Sandrine Ewane',
    state: 'paid',
    isBeneficiary: false,
    served: false,
  },
  {
    membershipId: id(7),
    name: 'Paul Mbarga',
    state: 'unpaid',
    isBeneficiary: false,
    served: false,
  },
  { membershipId: id(8), name: 'Nadège Nkeng', state: 'paid', isBeneficiary: false, served: false },
  {
    membershipId: id(9),
    name: 'Nkam Ticha',
    state: 'pending',
    isBeneficiary: false,
    served: false,
  },
  {
    membershipId: id(10),
    name: 'Larissa Ngono',
    state: 'paid',
    isBeneficiary: false,
    served: false,
  },
];
export const PAUL = id(7);

/** A synthetic ring of n members for the density demo (6.3). */
export function syntheticRing(n: number): RingMember[] {
  const paid = Math.round(n * 0.6);
  return Array.from({ length: n }, (_, k) => ({
    membershipId: id(100 + k),
    name: `M${k + 1}`,
    state: k < paid ? 'paid' : k === paid ? 'late' : 'unpaid',
    isBeneficiary: k === 0,
    served: k >= n - 3,
  }));
}

const NOW = '2026-11-05T13:32:00.000Z';

export function payAction(
  status: PendingActionStatus,
  extra: Partial<PendingActionDto> = {},
): PendingActionDto {
  return {
    id: id(900),
    type: 'pay',
    level: 'L1',
    status,
    origin: 'AGENT',
    groupId: id(500),
    preview: {
      title: { fr: 'Payer ta cotisation', en: 'Pay your contribution' },
      lines: [
        { label: { fr: 'Cotisation, tour 4', en: 'Contribution, round 4' }, amount: 10000 },
        { label: { fr: 'Caisse de secours', en: 'Solidarity fund' }, amount: 1000 },
      ],
      total: 11000,
      notes: [
        {
          fr: 'Tu recevras une demande MTN sur 6•• •• •7 89.',
          en: 'You’ll get an MTN request on 6•• •• •7 89.',
        },
      ],
      confirmLabel: { fr: 'Payer 11 000 FCFA', en: 'Pay 11,000 FCFA' },
    },
    requiresPin: false,
    expiresAt: '2026-11-05T13:42:00.000Z',
    createdAt: NOW,
    result:
      status === 'DONE'
        ? { ref: 'MP2611A9F2', summary: { fr: 'Paiement réussi', en: 'Payment successful' } }
        : null,
    failure:
      status === 'FAILED'
        ? {
            code: 'PROVIDER_REFUSED',
            key: 'insufficientBalance',
            messageFr: 'Solde insuffisant.',
            messageEn: 'Insufficient balance.',
          }
        : null,
    ...extra,
  };
}

export const changeNumberAction: PendingActionDto = payAction('PENDING', {
  type: 'change_payment_number',
  level: 'L2',
  requiresPin: true,
  preview: {
    title: { fr: 'Changer ton numéro de paiement', en: 'Change your payment number' },
    lines: [],
    total: null,
    notes: [
      {
        fr: 'Retraits et prêts vers ce numéro possibles après 48 heures.',
        en: 'Withdrawals and loans to this number are possible after 48 hours.',
      },
      {
        fr: 'S’applique à tous tes groupes. Les admins seront prévenus, sans les chiffres.',
        en: 'Applies to all your groups. Admins are told, without the digits.',
      },
    ],
    confirmLabel: { fr: 'Changer le numéro', en: 'Change the number' },
  },
});

export const withdrawAction: PendingActionDto = payAction('CONFIRMED', {
  type: 'withdraw',
  preview: {
    title: { fr: 'Retirer ton argent', en: 'Withdraw your money' },
    lines: [
      { label: { fr: 'Tu reçois', en: 'You receive' }, amount: 80840 },
      { label: { fr: 'Frais estimés', en: 'Estimated fee' }, amount: 500 },
    ],
    total: 81340,
    notes: [
      { fr: 'Envoi sur ton numéro MTN 6•• •• •3 21.', en: 'Sent to your MTN number 6•• •• •3 21.' },
    ],
    confirmLabel: { fr: 'Retirer 80 840 FCFA', en: 'Withdraw 80,840 FCFA' },
  },
});

/** The 1 000 → 1 500 fine RULE_CHANGE, 5 yes of 7 needed, and the secret removal vote. */
export const ruleChange = { eligible: 10, needed: 7, yes: 5, no: 1, voted: 6 };
export const secretVote = { eligible: 9, needed: 5, voted: 6 };

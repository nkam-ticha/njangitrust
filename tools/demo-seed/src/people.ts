// Demo people and groups (spec 5.5). Every number is fictional, in the +237 6 99 00 xx xx range
// reserved for demos; nothing here is real data.

/** The one demo PIN. Accepted only by an API running with NODE_ENV=development (see index.ts). */
export const DEMO_PIN = '482615';

export interface Person {
  name: string;
  /** E.164 login phone, also the payment number (Orange, detected from 699). */
  phone: string;
  /** App language; French unless set. */
  language?: 'fr' | 'en';
}

const p = (name: string, suffix: string, language?: 'en'): Person => ({
  name,
  phone: `+23769900${suffix}`,
  ...(language ? { language } : {}),
});

export const nkam = p('Nkam Ticha', '0101');
export const carine = p('Carine Fotso', '0102');
export const paul = p('Paul Mbarga', '0103');
export const joel = p('Joël Ndi', '0104');
export const mireille = p('Mireille Atangana', '0105');
export const sandrine = p('Sandrine Ewane', '0106');
export const brice = p('Brice Tchakounté', '0107');
export const nadege = p('Nadège Nkeng', '0108');
export const ivo = p('Ivo Fon', '0109', 'en');
export const larissa = p('Larissa Ngono', '0110');
export const clarisse = p('Clarisse Mvondo', '0201');
export const herve = p('Hervé Nana', '0202');

export interface GroupPlan {
  name: string;
  admin: Person;
  members: Person[];
  /** Body of POST /v1/groups, without `name` and `firstPayoutAt`. */
  frequency: 'WEEKLY' | 'MONTHLY';
  contributionAmount: number;
  solidarityContribution: number;
}

export const groups: GroupPlan[] = [
  {
    // Monthly, last Saturday at 18:00 (spec 3.2 example), 10 000 FCFA as in spec 3.17.
    name: 'Njangi des Collègues',
    admin: nkam,
    members: [carine, paul, joel, mireille, sandrine, brice, nadege, ivo, larissa],
    frequency: 'MONTHLY',
    contributionAmount: 10_000,
    solidarityContribution: 1_000,
  },
  {
    // The second group (spec 5.5), led by Sandrine, so Nkam also sees a group as a plain member.
    name: 'Njangi du quartier',
    admin: sandrine,
    members: [nkam, paul, clarisse, herve],
    frequency: 'WEEKLY',
    contributionAmount: 5_000,
    solidarityContribution: 500,
  },
];

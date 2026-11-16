import { describe, expect, it } from 'vitest';
import { buildAutoAgenda } from './agenda';
import { buildMinutesDraft, type MinutesDraftInput } from './minutes-draft';

/** Designer copy uses non-breaking spaces before a colon. */
const norm = (s: string) => s.replace(/\s/g, ' ');

const EMPTY = { round: null, unpaidNames: [], openVotes: 0, installmentsDue: 0, solidarityOpen: 0 };

describe('the automatic agenda (R15.2)', () => {
  it('lists the round, unpaid members, votes, installments and solidarity in that order', () => {
    const items = buildAutoAgenda({
      round: { number: 4, beneficiaryName: 'Carine Fotso', paidCount: 7, memberCount: 10 },
      unpaidNames: ['Joël Ndi', 'Paul Mbarga'],
      openVotes: 2,
      installmentsDue: 1,
      solidarityOpen: 1,
    });
    expect(items.map((i) => i.key)).toEqual([
      'round',
      'unpaid',
      'votes',
      'installments',
      'solidarity',
    ]);
    expect(norm(items[0]!.text.fr)).toBe('Tour 4 : bénéficiaire Carine Fotso, 7 sur 10 ont payé');
    expect(items[0]!.text.en).toContain('Carine Fotso');
    expect(norm(items[1]!.text.fr)).toBe('Cotisations non payées : Joël Ndi, Paul Mbarga');
    expect(items[2]!.text.fr).toBe('2 votes ouverts');
    expect(items[2]!.text.en).toBe('2 open votes');
  });

  it('uses the singular for one vote and adds no line for an empty category', () => {
    const items = buildAutoAgenda({ ...EMPTY, openVotes: 1 });
    expect(items).toHaveLength(1);
    expect(items[0]!.text.fr).toBe('1 vote ouvert');
    expect(buildAutoAgenda(EMPTY)).toEqual([]);
  });

  it('never carries a name or an amount for installments and solidarity requests', () => {
    const items = buildAutoAgenda({ ...EMPTY, installmentsDue: 3, solidarityOpen: 2 });
    for (const i of items) expect(i.text.fr + i.text.en).not.toMatch(/\d/);
  });
});

describe('the minutes draft (R15.4)', () => {
  const base: MinutesDraftInput = {
    lang: 'fr',
    scheduledAt: new Date('2026-12-05T15:00:00.000Z'),
    place: 'Chez Carine, Bonamoussadi',
    present: ['Carine Fotso', 'Paul Mbarga'],
    excused: ['Joël Ndi'],
    absent: [],
    agendaLines: [{ fr: 'Tour 4 : bénéficiaire Carine Fotso, 7 sur 10 ont payé', en: 'Round 4' }],
    memberItems: [{ text: 'Acheter des chaises', author: 'Paul Mbarga' }],
    payments: { count: 3, totalFcfa: 33_000 },
    votes: [
      {
        title: { fr: 'Amende à 1 500 FCFA', en: 'Fine at 1,500 FCFA' },
        status: 'PASSED',
        yes: 7,
        no: 2,
      },
    ],
    events: [],
    nextMeeting: null,
    notes: null,
  };

  it('fills the fixed template in French with the designer section titles', () => {
    const text = buildMinutesDraft(base);
    for (const title of [
      'Date et lieu',
      'Présents',
      'Excusés',
      'Absents',
      'Points abordés',
      'Argent reçu',
      'Résultats des votes',
      'Prochaine réunion',
    ]) {
      expect(text).toContain(`## ${title}`);
    }
    expect(text).toContain('Lieu : Chez Carine, Bonamoussadi');
    expect(text).toContain('- Carine Fotso');
    expect(text).toContain('- Acheter des chaises (Paul Mbarga)');
    expect(text).toContain('3 paiement(s), 33 000 FCFA reçus au total.');
    expect(text).toContain('Amende à 1 500 FCFA : adopté (7 oui, 2 non).');
    expect(text).toContain('Aucune réunion planifiée pour le moment.');
  });

  it('is written in English when the admin uses English, amounts formatted by formatXAF', () => {
    const text = buildMinutesDraft({ ...base, lang: 'en' });
    expect(text).toContain('## Present');
    expect(text).toContain('3 payment(s), 33,000 FCFA received in total.');
    expect(text).toContain('Fine at 1,500 FCFA: passed (7 yes, 2 no).');
  });

  it('says "None" for an empty list, skips empty events and adds the notes and the next meeting', () => {
    const text = buildMinutesDraft({
      ...base,
      lang: 'en',
      absent: [],
      payments: { count: 0, totalFcfa: 0 },
      votes: [],
      events: [{ fr: 'Nouvelle règle', en: 'New rule from round 5' }],
      nextMeeting: { scheduledAt: new Date('2027-01-09T15:00:00.000Z'), place: 'Online' },
      notes: 'Penser à la caisse.',
    });
    expect(text).toContain('## Absent\nNone');
    expect(text).toContain('No payment during the meeting.');
    expect(text).toContain('## Ledger events\n- New rule from round 5');
    expect(text).toContain('Next meeting: Saturday 9 January at 4 pm, Online.');
    expect(text).toMatch(/## Admin notes\nPenser à la caisse\.$/);
  });

  it('never lists who voted what: only titles and totals', () => {
    const text = buildMinutesDraft({
      ...base,
      votes: [
        { title: { fr: 'Vote secret', en: 'Secret vote' }, status: 'REJECTED', yes: 2, no: 6 },
      ],
    });
    expect(text).toContain('Vote secret : rejeté (2 oui, 6 non).');
  });
});

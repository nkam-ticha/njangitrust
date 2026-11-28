import { describe, expect, it } from 'vitest';
import { ungroundedAmounts, usesVous } from './grounding';

describe('ungroundedAmounts (spec 4.2 rule 1, 5.4)', () => {
  const source = [
    '<session>user: Paul\nmyRound4: à payer, 11 000 FCFA</session>',
    '<tool_result name="get_funds">{"generalFund":"80 500 FCFA"}</tool_result>',
  ];

  it('accepts amounts that appear in the conversation, whatever the separator', () => {
    expect(ungroundedAmounts('Tu dois 11 000 FCFA.', source)).toEqual([]);
    expect(ungroundedAmounts('Tu dois 11000 FCFA.', source)).toEqual([]);
    expect(ungroundedAmounts('The fund holds 80,500 FCFA.', source)).toEqual([]);
  });

  it('accepts an amount the member typed themselves', () => {
    expect(ungroundedAmounts('Je prépare 20 000 FCFA.', [...source, 'Retire 20 000'])).toEqual([]);
  });

  it('reports an amount found nowhere', () => {
    expect(ungroundedAmounts('Tu dois 12 000 FCFA.', source)).toEqual(['12000']);
    expect(ungroundedAmounts('Tu dois 12 000 FCFA et 11 000 FCFA.', source)).toEqual(['12000']);
  });

  it('ignores numbers that are not amounts', () => {
    expect(ungroundedAmounts('Le tour 7 commence, 3 membres.', source)).toEqual([]);
  });

  it('reads XAF and francs as amounts too', () => {
    expect(ungroundedAmounts('Il reste 999 XAF ou 5 000 francs.', source)).toEqual(['999', '5000']);
  });
});

describe('usesVous (CLAUDE.md rule 10: French uses "tu")', () => {
  it('flags the formal address and nothing else', () => {
    expect(usesVous('Votre compte affiche 0 FCFA.')).toBe(true);
    expect(usesVous('Si vous souhaitez payer, dites-le.')).toBe(true);
    expect(usesVous('Tu as 0 FCFA. Ton compte est à jour.')).toBe(false);
    expect(usesVous('Le groupe a voté pour la réunion de nous tous.')).toBe(false);
  });
});

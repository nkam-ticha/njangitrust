import { describe, expect, it } from 'vitest';
import { earlierRounds, roundPayers } from './previousRounds';

const member = (id: string, name: string, status = 'ACTIVE') => ({
  membershipId: id,
  name,
  status,
});

describe('previous rounds', () => {
  it('lists earlier rounds, the most recent first', () => {
    expect(earlierRounds(4)).toEqual([3, 2, 1]);
    expect(earlierRounds(2)).toEqual([1]);
    expect(earlierRounds(1)).toEqual([]);
    expect(earlierRounds(0)).toEqual([]);
  });

  it('names who paid and who did not when the list agrees with the count', () => {
    const members = [member('a', 'Carine'), member('b', 'Paul'), member('c', 'Aïcha')];
    expect(roundPayers(members, ['b'], 2)).toEqual({ unpaid: ['Paul'], paid: ['Carine', 'Aïcha'] });
    expect(roundPayers(members, [], 3)).toEqual({ unpaid: [], paid: ['Carine', 'Paul', 'Aïcha'] });
  });

  it('does not guess the payers when members came or went since the round', () => {
    const members = [member('a', 'Carine'), member('b', 'Paul'), member('c', 'Aïcha')];
    // The server counts 2 payers but 3 members are not in the unpaid list.
    expect(roundPayers(members, [], 2)).toEqual({ unpaid: [], paid: null });
  });

  it('ignores members who were only invited', () => {
    const members = [member('a', 'Carine'), member('b', 'Paul', 'INVITED')];
    expect(roundPayers(members, [], 1)).toEqual({ unpaid: [], paid: ['Carine'] });
  });
});

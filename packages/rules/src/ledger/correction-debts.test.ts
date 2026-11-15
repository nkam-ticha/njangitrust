import { describe, expect, it } from 'vitest';
import { clawbackPostings, correctionDebts } from './corrections';
import { potCorrectionPostings } from './postings';

describe('the CORRECTION obligations a correction block creates (D15, D16.1, D18.3)', () => {
  it('is one debt per correction with a receivable line, for its member, in plan order', () => {
    const plan = [
      {
        membershipId: 'M7',
        postings: potCorrectionPostings({
          roundId: 'r4',
          beneficiaryMembershipId: 'M7',
          amount: 9_909,
          winnerPayable: 4_318,
        }),
      },
      {
        membershipId: 'M2',
        postings: clawbackPostings({
          debtorMembershipId: 'M2',
          from: 'SOLIDARITY_FUND',
          amount: 991,
          fromPayable: 991,
        }),
      },
      {
        membershipId: 'M5',
        postings: clawbackPostings({ debtorMembershipId: 'M5', from: 'PAYABLE', amount: 300 }),
      },
    ];
    expect(correctionDebts(plan)).toEqual([
      { index: 0, membershipId: 'M7', amount: 5_591 },
      { index: 2, membershipId: 'M5', amount: 300 },
    ]);
    expect(correctionDebts([])).toEqual([]);
  });
});

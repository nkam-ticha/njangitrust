import { describe, expect, it } from 'vitest';
import type { PaymentPart } from '../fees';
import { resolvePaymentParts } from './resolve-parts';

const rotation = ['M3', 'M10', 'M1', 'M9', 'M8', 'M2', 'M5', 'M7', 'M4', 'M6'];
const position = (m: string) => rotation.indexOf(m) + 1;

const contribution = (roundId: string): PaymentPart => ({
  kind: 'CONTRIBUTION',
  amount: 10_000,
  roundId,
  creditorMembershipId: null,
  ref: `c-${roundId}`,
});

describe('resolving payment parts when the payment is posted (R3.4, D10, 3.3)', () => {
  it('sends a contribution to the round’s beneficiary with their rotation position as tie order', () => {
    const [part] = resolvePaymentParts([contribution('r4')], {
      beneficiaryOfRound: () => 'M7',
      rotationPosition: position,
    });
    expect(part).toEqual({
      kind: 'CONTRIBUTION',
      amount: 10_000,
      roundId: 'r4',
      creditorMembershipId: 'M7',
      potRoundId: null,
      tieOrder: 8,
      ref: 'c-r4',
    });
  });

  it('sends it to the round pot while a bidding round has no beneficiary yet', () => {
    const [part] = resolvePaymentParts([contribution('r5')], {
      beneficiaryOfRound: () => null,
      rotationPosition: position,
    });
    expect(part).toMatchObject({ creditorMembershipId: null, potRoundId: 'r5', tieOrder: 0 });
  });

  it('pays the winner directly when the bid closed between request and confirmation', () => {
    let winner: string | null = null;
    const ctx = { beneficiaryOfRound: () => winner, rotationPosition: position };
    expect(resolvePaymentParts([contribution('r5')], ctx)[0]).toMatchObject({ potRoundId: 'r5' });
    winner = 'M9';
    expect(resolvePaymentParts([contribution('r5')], ctx)[0]).toMatchObject({
      creditorMembershipId: 'M9',
      potRoundId: null,
    });
  });

  it('orders shortfall parts by the leaver’s rotation position and leaves other parts as they are', () => {
    const parts = resolvePaymentParts(
      [
        { kind: 'SHORTFALL', amount: 1_667, creditorMembershipId: 'M6' },
        { kind: 'SOLIDARITY', amount: 1_000 },
      ],
      { beneficiaryOfRound: () => null, rotationPosition: position },
    );
    expect(parts).toEqual([
      { kind: 'SHORTFALL', amount: 1_667, creditorMembershipId: 'M6', tieOrder: 10 },
      { kind: 'SOLIDARITY', amount: 1_000 },
    ]);
  });

  it('refuses a contribution without its round', () => {
    expect(() =>
      resolvePaymentParts([{ kind: 'CONTRIBUTION', amount: 1, creditorMembershipId: 'M1' }], {
        beneficiaryOfRound: () => 'M1',
        rotationPosition: position,
      }),
    ).toThrow(RangeError);
  });
});

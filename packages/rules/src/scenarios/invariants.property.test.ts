// Spec 5.1: property-based tests. Random sequences of payments, fines, loans, withdrawals, exits,
// solidarity payouts and fine waivers, all decided by the rules engine; every invariant of 2.5 must
// hold after each step.

import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import {
  checkLedger,
  computeBalances,
  negativeAccounts,
  sumsToZero,
  summarizeBalances,
} from '../index';
import { TEST_GROUP } from '../ledger/ledger.test-support';
import {
  borrow,
  distributeFund,
  exitMember,
  solidarityPayout,
  waiveFine,
  withdraw,
} from './group-actions.test-support';
import { GroupSimulator } from './group-simulator.test-support';

const action = fc.oneof(
  fc.record({ kind: fc.constant('pay' as const), seed: fc.nat(), debts: fc.boolean() }),
  fc.record({ kind: fc.constant('payAll' as const), seed: fc.nat(), debts: fc.boolean() }),
  fc.record({ kind: fc.constant('advance' as const), seed: fc.nat(), debts: fc.boolean() }),
  fc.record({ kind: fc.constant('withdraw' as const), seed: fc.nat(), debts: fc.boolean() }),
  fc.record({ kind: fc.constant('borrow' as const), seed: fc.nat(), debts: fc.boolean() }),
  fc.record({ kind: fc.constant('exit' as const), seed: fc.nat(), debts: fc.boolean() }),
  fc.record({ kind: fc.constant('solidarity' as const), seed: fc.nat(), debts: fc.boolean() }),
  fc.record({ kind: fc.constant('waive' as const), seed: fc.nat(), debts: fc.boolean() }),
);
type Action = typeof action extends fc.Arbitrary<infer A> ? A : never;

const applied: Record<Action['kind'], number> = {
  pay: 0,
  payAll: 0,
  advance: 0,
  withdraw: 0,
  borrow: 0,
  exit: 0,
  solidarity: 0,
  waive: 0,
};

function run(sim: GroupSimulator, a: Action): boolean {
  switch (a.kind) {
    case 'pay':
      return sim.pay(sim.everyone[a.seed % sim.everyone.length]!, a.debts);
    case 'payAll':
      return sim.rotation.map((m) => sim.pay(m, a.debts)).some(Boolean);
    case 'advance':
      sim.advance(() => distributeFund(sim));
      return true;
    case 'withdraw':
      return withdraw(sim, a.seed);
    case 'borrow':
      return borrow(sim, a.seed, 1 + (a.seed % 3));
    case 'exit':
      return exitMember(sim, a.seed);
    case 'solidarity':
      return solidarityPayout(sim, a.seed);
    case 'waive':
      return waiveFine(sim, a.seed);
  }
}

describe('ledger invariants under random activity (2.5, spec 5.1)', () => {
  it('holds every invariant after every step', () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 3, max: 10 }),
        fc.integer({ min: 0, max: 200_000 }),
        fc.array(action, { minLength: 10, maxLength: 70 }),
        (members, seedFund, actions) => {
          const sim = new GroupSimulator(members, seedFund);
          for (const a of actions) {
            const before = sim.chain.length;
            if (run(sim, a)) applied[a.kind] += 1;
            for (const tx of sim.chain.slice(before)) expect(sumsToZero(tx.postings)).toBe(true); // invariant 1
            const balances = computeBalances(sim.chain);
            expect(negativeAccounts(balances)).toEqual([]); // invariants 2, 3, 4
            const s = summarizeBalances(balances);
            // R5.6: money reserved for members and the solidarity fund is always covered by cash.
            expect(s.cash - s.payables - s.pots - s.solidarityFund).toBeGreaterThanOrEqual(0);
          }
          // Invariants 1–5 transaction by transaction, including the hash chain and gap-free seq.
          expect(checkLedger(TEST_GROUP, sim.chain)).toEqual([]);
        },
      ),
      { numRuns: 120 },
    );
    // The generator really exercised every kind of action.
    for (const kind of Object.keys(applied) as Action['kind'][])
      expect(applied[kind], kind).toBeGreaterThan(0);
  });

  it('reports any change to a stored transaction at exactly its seq (spec 5.2)', () => {
    fc.assert(
      fc.property(
        fc.array(action, { minLength: 15, maxLength: 40 }),
        fc.nat(),
        fc.constantFrom(
          'amount',
          'account',
          'description',
          'metadata',
          'occurredAt',
          'type',
          'hash',
        ),
        (actions, pickTx, field) => {
          const sim = new GroupSimulator(5, 50_000);
          for (const a of actions) run(sim, a);
          const target = sim.chain[pickTx % sim.chain.length]!;
          const tampered = sim.chain.map((t) => {
            if (t !== target) return t;
            switch (field) {
              case 'amount':
                return t.postings.length
                  ? {
                      ...t,
                      postings: [
                        { ...t.postings[0]!, amount: t.postings[0]!.amount + 1 },
                        ...t.postings.slice(1),
                      ],
                    }
                  : { ...t, descriptionEn: 'x' };
              case 'account':
                return t.postings.length
                  ? {
                      ...t,
                      postings: [
                        { ...t.postings[0]!, account: 'payable:member:X' },
                        ...t.postings.slice(1),
                      ],
                    }
                  : { ...t, descriptionFr: 'x' };
              case 'description':
                return { ...t, descriptionFr: `${t.descriptionFr} ` };
              case 'metadata':
                return { ...t, metadata: { ...t.metadata, note: 'changed' } };
              case 'occurredAt':
                return {
                  ...t,
                  occurredAt: new Date(Date.parse(t.occurredAt) - 1000).toISOString(),
                };
              case 'type':
                return {
                  ...t,
                  type: t.type === 'REVERSAL' ? ('EVENT' as const) : ('REVERSAL' as const),
                };
              default:
                return { ...t, hash: `${t.hash.slice(0, -1)}${t.hash.endsWith('a') ? 'b' : 'a'}` };
            }
          });
          expect(checkLedger(TEST_GROUP, tampered)[0]?.seq).toBe(target.seq);
        },
      ),
      { numRuns: 100 },
    );
  });
});

// Spec 5.1: property-based tests. Random sequences of payments, fines, loans, early repayments,
// withdrawals, exits, solidarity payouts, fine waivers, payment reversals, provider failures and
// operator refunds (with the clawback releases they require), in fixed and bidding rotation, all
// decided by the rules engine; every invariant of 2.5 must hold after each step.

import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import {
  checkLedger,
  computeBalances,
  negativeAccounts,
  reservedShortfall,
  sumsToZero,
  summarizeBalances,
} from '../index';
import { TEST_GROUP } from '../ledger/ledger.test-support';
import {
  borrow,
  distributeFund,
  exitMember,
  repayEarly,
  solidarityPayout,
  withdraw,
} from './group-actions.test-support';
import { reversePayment, waiveFine } from './group-corrections.test-support';
import { resolvePending } from './group-payouts.test-support';
import { advance } from './group-rounds.test-support';
import { GroupSimulator } from './group-simulator.test-support';

const action = fc.oneof(
  fc.record({ kind: fc.constant('pay' as const), seed: fc.nat(), debts: fc.boolean() }),
  fc.record({ kind: fc.constant('payAll' as const), seed: fc.nat(), debts: fc.boolean() }),
  // Weighted so cycles end and new ones start (distribution, D18.2 re-dating).
  {
    arbitrary: fc.record({
      kind: fc.constant('advance' as const),
      seed: fc.nat(),
      debts: fc.boolean(),
    }),
    weight: 5,
  },
  fc.record({ kind: fc.constant('withdraw' as const), seed: fc.nat(), debts: fc.boolean() }),
  fc.record({ kind: fc.constant('borrow' as const), seed: fc.nat(), debts: fc.boolean() }),
  fc.record({ kind: fc.constant('repay' as const), seed: fc.nat(), debts: fc.boolean() }),
  fc.record({ kind: fc.constant('exit' as const), seed: fc.nat(), debts: fc.boolean() }),
  fc.record({ kind: fc.constant('solidarity' as const), seed: fc.nat(), debts: fc.boolean() }),
  fc.record({ kind: fc.constant('waive' as const), seed: fc.nat(), debts: fc.boolean() }),
  fc.record({ kind: fc.constant('reverse' as const), seed: fc.nat(), debts: fc.boolean() }),
  fc.record({ kind: fc.constant('resolve' as const), seed: fc.nat(), debts: fc.boolean() }),
);
type Action = typeof action extends fc.Arbitrary<infer A> ? A : never;

const applied: Record<Action['kind'], number> = {
  pay: 0,
  payAll: 0,
  advance: 0,
  withdraw: 0,
  borrow: 0,
  repay: 0,
  exit: 0,
  solidarity: 0,
  waive: 0,
  reverse: 0,
  resolve: 0,
};
const paths: Record<string, number> = {};
/** A seed whose 300 runs exercise every path (reproducible; the random-seed run keeps exploring). */
const RARE_PATHS_SEED = 20_261_109;
/** The simulator runs hundreds of groups: more than the default 5 s on a busy machine. */
const HEAVY_TIMEOUT_MS = 120_000;

function run(sim: GroupSimulator, a: Action): boolean {
  switch (a.kind) {
    case 'pay':
      return sim.pay(sim.everyone[a.seed % sim.everyone.length]!, a.debts);
    case 'payAll':
      return sim.rotation.map((m) => sim.pay(m, a.debts)).some(Boolean);
    case 'advance':
      advance(sim, a.seed, () => distributeFund(sim));
      return true;
    case 'withdraw':
      return withdraw(sim, a.seed);
    case 'borrow':
      return borrow(sim, a.seed, 1 + (a.seed % 3));
    case 'repay':
      return repayEarly(sim, a.seed);
    case 'exit':
      return exitMember(sim, a.seed);
    case 'solidarity':
      return solidarityPayout(sim, a.seed);
    case 'waive':
      return waiveFine(sim, a.seed);
    case 'reverse':
      return reversePayment(sim, a.seed);
    case 'resolve': {
      const had = sim.pending.length > 0;
      resolvePending(sim, a.seed);
      return had;
    }
  }
}

/** Spec 5.1: runs the simulator and checks every invariant after every step. */
const invariantsProperty = fc.property(
  fc.integer({ min: 3, max: 10 }),
  fc.integer({ min: 0, max: 200_000 }),
  fc.constantFrom('FIXED' as const, 'BIDDING' as const),
  fc.array(action, { minLength: 10, maxLength: 110 }),
  (members, seedFund, mode, actions) => {
    const sim = new GroupSimulator(members, seedFund, mode);
    for (const a of actions) {
      const before = sim.chain.length;
      const paused = sim.reconciliationStatus() === 'ALERT';
      const ran = run(sim, a);
      if (ran) applied[a.kind] += 1;
      // D16.2: while reserved money is not covered, no money leaves the group.
      if (paused && ['withdraw', 'borrow', 'solidarity'].includes(a.kind)) expect(ran).toBe(false);
      for (const tx of sim.chain.slice(before)) expect(sumsToZero(tx.postings)).toBe(true); // invariant 1
      const balances = computeBalances(sim.chain);
      expect(negativeAccounts(balances)).toEqual([]); // invariants 2, 3, 4
      // R5.6, D18.1: disbursements (in flight included) never break coverage; only a provider
      // reversal can (D16.1, D16.2), and coverage comes back once the debts are paid (H1).
      const shortfall = reservedShortfall(summarizeBalances(balances));
      if (a.kind !== 'reverse' && !paused) expect(shortfall).toBe(0);
      if (paused && shortfall === 0) paths.coverageRestored = (paths.coverageRestored ?? 0) + 1;
    }
    // Invariants 1–5 transaction by transaction: chain, shapes, fees, in flight, reversals,
    // corrections, pots and bids. Coverage is not integrity: nothing is filtered (H1).
    expect(checkLedger(TEST_GROUP, sim.chain)).toEqual([]);
    for (const [path, count] of Object.entries(sim.counters))
      paths[path] = (paths[path] ?? 0) + count;
  },
);

describe('ledger invariants under random activity (2.5, spec 5.1)', () => {
  it(
    'holds every invariant after every step (random seed)',
    () => {
      fc.assert(invariantsProperty, { numRuns: 150 });
    },
    HEAVY_TIMEOUT_MS,
  );

  it(
    'holds them on a fixed seed that runs every action and every rare money path',
    () => {
      for (const key of Object.keys(paths)) delete paths[key];
      for (const key of Object.keys(applied) as Action['kind'][]) applied[key] = 0;
      fc.assert(invariantsProperty, { numRuns: 300, seed: RARE_PATHS_SEED });
      for (const kind of Object.keys(applied) as Action['kind'][])
        expect(applied[kind], kind).toBeGreaterThan(0);
      expect(Object.keys(paths).sort()).toEqual(
        [...Object.keys(new GroupSimulator(3, 0).counters), 'coverageRestored'].sort(),
      );
      for (const [path, count] of Object.entries(paths)) expect(count, path).toBeGreaterThan(0);
    },
    HEAVY_TIMEOUT_MS,
  );

  it(
    'reports any change to a stored transaction at exactly its seq (spec 5.2)',
    () => {
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
                  return {
                    ...t,
                    hash: `${t.hash.slice(0, -1)}${t.hash.endsWith('a') ? 'b' : 'a'}`,
                  };
              }
            });
            expect(checkLedger(TEST_GROUP, tampered)[0]?.seq).toBe(target.seq);
          },
        ),
        { numRuns: 100 },
      );
    },
    HEAVY_TIMEOUT_MS,
  );
});

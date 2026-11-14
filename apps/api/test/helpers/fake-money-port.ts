// A recording stand-in for the money modules' governance port, until the real one exists. It
// keeps a rotation per group and records every call, so tests can check what governance asked for.
import { MOCK_FEE_SCHEDULE } from '@njangi/rules';
import type {
  FineDescription,
  LedgerEventInput,
  MoneyGovernancePort,
} from '../../src/modules/proposals/governance-ports';
import {
  registerGovernancePorts,
  resetGovernancePortsForTests,
} from '../../src/modules/proposals/governance-ports';

export interface FakeMoney {
  port: MoneyGovernancePort;
  calls: { name: string; input: Record<string, unknown> }[];
  ledger: LedgerEventInput[];
  rotations: Map<string, { rotation: string[]; currentRound: number }>;
  fines: Map<string, FineDescription & { groupId: string }>;
  solidarityBalance: number;
}

export function installFakeMoney(): FakeMoney {
  const fake: FakeMoney = {
    calls: [],
    ledger: [],
    rotations: new Map(),
    fines: new Map(),
    solidarityBalance: 50_000,
    port: undefined as unknown as MoneyGovernancePort,
  };
  const record = (name: string, input: object) => {
    fake.calls.push({ name, input: input as Record<string, unknown> });
    return Promise.resolve();
  };
  fake.port = {
    currentRotation: (_db, groupId) => {
      const r = fake.rotations.get(groupId);
      return Promise.resolve(r ? { cycleId: groupId, cycleNumber: 1, ...r } : null);
    },
    applyRuleSet: async (_tx, input) => {
      await record('applyRuleSet', input);
      return { effectiveFromRoundId: null, effectiveFromRoundNumber: 2 };
    },
    applyRotationChange: async (_tx, input) => {
      await record('applyRotationChange', input);
      const r = fake.rotations.get(input.groupId);
      if (r) r.rotation = input.newOrder;
    },
    settleExit: (_tx, input) => record('settleExit', input),
    describeFine: (_db, { groupId, obligationId }) => {
      const fine = fake.fines.get(obligationId);
      return Promise.resolve(fine && fine.groupId === groupId ? fine : null);
    },
    waiveFine: (_tx, input) => record('waiveFine', input),
    describeLedgerEntry: (_db, { seq }) => Promise.resolve(seq <= 5 ? { correctable: true } : null),
    correctLedger: (_tx, input) => record('correctLedger', input),
    feeSchedule: () => MOCK_FEE_SCHEDULE,
    solidarityFund: () => Promise.resolve({ balance: fake.solidarityBalance, pendingPayouts: 0 }),
    paySolidarity: (_tx, input) => record('paySolidarity', input),
    decideAdminLoan: (_tx, input) => record('decideAdminLoan', input),
    startCycle: async (tx, input) => {
      await record('startCycle', input);
      const group = await tx.group.findUniqueOrThrow({ where: { id: input.groupId } });
      const cycle = await tx.cycle.create({
        data: {
          groupId: input.groupId,
          number: 1,
          mode: 'FIXED',
          firstPayoutAt: group.firstPayoutAt,
          startedAt: new Date(),
        },
      });
      await tx.group.update({
        where: { id: input.groupId },
        data: { status: 'ACTIVE', currentCycleId: cycle.id },
      });
      return { cycleNumber: 1, firstBeneficiaryMembershipId: null };
    },
  };
  registerGovernancePorts({
    money: fake.port,
    ledgerEvents: { appendEvent: (_tx, e) => Promise.resolve(void fake.ledger.push(e)) },
  });
  return fake;
}

export function uninstallFakeMoney(): void {
  resetGovernancePortsForTests();
}

export const callsTo = (fake: FakeMoney, name: string) => fake.calls.filter((c) => c.name === name);

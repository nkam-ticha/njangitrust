import { describe, expect, it } from 'vitest';
import { proposalError } from '../../modules/proposals/proposals.errors';
import { NumberSlots } from '../guards/number-slots';
import type { AgentCtx } from '../types';
import { runTool } from './execute';
import { ToolRegistry } from './registry';
import { SPECS } from './specs';
import { implement } from './types';

function ctx(overrides: Partial<AgentCtx> = {}): AgentCtx {
  return {
    channel: 'PRIVATE',
    role: 'ADMIN',
    lang: 'fr',
    ...overrides,
  } as AgentCtx;
}

const call = (name: string, args: unknown) => ({
  id: 'c1',
  name,
  arguments: JSON.stringify(args),
});

describe('tool failures reach the model as plain data it can act on', () => {
  it('names the missing field when an argument is missing', async () => {
    const registry = new ToolRegistry([
      implement(SPECS.propose_member_add, () => Promise.resolve({ status: 'OK', data: {} })),
    ]);
    const run = await runTool(registry, ctx(), call('propose_member_add', { name: 'Hervé' }));
    expect(run.status).toBe('INVALID');
    expect(JSON.stringify(run.modelData)).toContain('"phone"');
  });

  it('says so when a [phone-N] marker is not from this message, instead of a vague invalid', async () => {
    const registry = new ToolRegistry([
      implement(SPECS.propose_member_add, () => Promise.resolve({ status: 'OK', data: {} })),
    ]);
    // The member typed the number in an earlier turn: this turn has no marker for it.
    const run = await runTool(
      registry,
      ctx({ numberSlots: new NumberSlots() }),
      call('propose_member_add', { name: 'Hervé Kamga', phone: '[phone-1]' }),
    );
    expect(run.status).toBe('INVALID');
    expect(run.outcome).toMatchObject({
      status: 'INVALID',
      issues: [{ path: 'phone', code: 'NUMBER_NOT_IN_THIS_MESSAGE' }],
    });
    expect(JSON.stringify(run.modelData)).toMatch(/type the (phone )?number again/i);
  });

  it('resolves a marker typed in this very turn', async () => {
    const slots = new NumberSlots();
    const masked = slots.mask('ajoute Hervé 655 44 33 22');
    expect(masked).toContain('[phone-1]');
    let seen = '';
    const registry = new ToolRegistry([
      implement(SPECS.propose_member_add, (_c, a) => {
        seen = a.phone;
        return Promise.resolve({ status: 'OK', data: {} });
      }),
    ]);
    const run = await runTool(
      registry,
      ctx({ numberSlots: slots }),
      call('propose_member_add', { name: 'Hervé Kamga', phone: '[phone-1]' }),
    );
    expect(run.status).toBe('OK');
    expect(seen).toBe('+237655443322');
  });

  it('points to the invite tool when a vote is not yet allowed (before the first cycle)', async () => {
    const registry = new ToolRegistry([
      implement(SPECS.propose_member_add, () => {
        throw proposalError('PROPOSALS_BEFORE_FIRST_CYCLE');
      }),
    ]);
    const run = await runTool(
      registry,
      ctx(),
      call('propose_member_add', { name: 'Hervé Kamga', phone: '655443322' }),
    );
    expect(run.status).toBe('REFUSED');
    const data = run.modelData as { reason: string; nextStep: string };
    expect(data.reason).toMatch(/premier cycle/);
    expect(data.nextStep).toContain('create_invite');
  });

  it('carries the real reason of any refusal to the model', async () => {
    const registry = new ToolRegistry([
      implement(SPECS.propose_admin_change, () => {
        throw proposalError('ALREADY_ADMIN');
      }),
    ]);
    const run = await runTool(registry, ctx(), call('propose_admin_change', { member: 'Carine' }));
    expect(run.modelData).toMatchObject({ status: 'REFUSED', code: 'ALREADY_ADMIN' });
    expect((run.modelData as { reason: string }).reason.length).toBeGreaterThan(10);
  });

  it('gives an unexpected error as a plain sentence, never its details', async () => {
    const registry = new ToolRegistry([
      implement(SPECS.propose_admin_change, () => {
        throw new Error('connection to 10.0.0.5 refused');
      }),
    ]);
    const run = await runTool(registry, ctx(), call('propose_admin_change', { member: 'Carine' }));
    expect(run.status).toBe('ERROR');
    expect(JSON.stringify(run.modelData)).not.toContain('10.0.0.5');
    expect(JSON.stringify(run.modelData)).toContain('Réessaie');
  });
});

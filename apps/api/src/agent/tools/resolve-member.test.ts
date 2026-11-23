import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { AgentCtx } from '../types';

const listMembers = vi.fn();
vi.mock('../../modules/members', () => ({ listMembers: (...a: unknown[]) => listMembers(...a) }));

const { resolveMember } = await import('./resolve-member');

const ctx = { userId: 'u1', lang: 'fr' } as AgentCtx;

beforeEach(() => {
  listMembers.mockResolvedValue({
    members: [
      { id: 'm1', user: { name: 'Carine Fotso' } },
      { id: 'm2', user: { name: 'Paul Mbarga' } },
      { id: 'm3', user: { name: 'Paul Ndi' } },
    ],
  });
});

describe('resolving a member by the name the member said', () => {
  it('finds a unique first name, ignoring accents and case', async () => {
    expect(await resolveMember(ctx, 'g1', 'carine')).toEqual({
      membershipId: 'm1',
      name: 'Carine Fotso',
    });
  });

  it('lists the candidates when a first name is ambiguous', async () => {
    const res = await resolveMember(ctx, 'g1', 'Paul');
    expect(res).toMatchObject({
      outcome: {
        status: 'REFUSED',
        code: 'MEMBER_AMBIGUOUS',
        details: { candidates: ['Paul Mbarga', 'Paul Ndi'] },
      },
    });
  });

  it('gives the group’s names when nobody matches, so a misspelling can be corrected at once', async () => {
    const res = await resolveMember(ctx, 'g1', 'Karine');
    expect(res).toMatchObject({
      outcome: {
        status: 'REFUSED',
        code: 'MEMBER_NOT_FOUND',
        details: { members: ['Carine Fotso', 'Paul Mbarga', 'Paul Ndi'] },
      },
    });
  });
});

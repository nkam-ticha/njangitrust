// Spec 5.3: each endpoint is tested as a member, the admin, a member of another group, a member
// who has left, and an unauthenticated caller. `permissionMatrix` writes one test per role.
import type { Response } from 'supertest';
import { beforeAll, describe, expect, it } from 'vitest';
import { api, type TestUser } from './client';
import { addMember, createGroup, setMembershipStatus, signUp } from './factories';

export interface World {
  groupId: string;
  admin: TestUser & { membershipId: string };
  member: TestUser & { membershipId: string };
  left: TestUser & { membershipId: string };
  outsider: TestUser;
}

export type Role = 'member' | 'admin' | 'outsider' | 'left' | 'anonymous';
export const ROLES: readonly Role[] = ['member', 'admin', 'outsider', 'left', 'anonymous'];

/** A FORMING group with an admin, a member and a member who left, plus an outsider in another group. */
export async function buildWorld(): Promise<World> {
  const admin = await signUp();
  const { groupId, adminMembershipId } = await createGroup(admin);
  const member = await addMember(admin, groupId);
  const left = await addMember(admin, groupId);
  await setMembershipStatus(left.membershipId, 'LEFT');
  const outsider = await signUp();
  await createGroup(outsider, { name: 'Njangi du quartier' });
  return { groupId, admin: { ...admin, membershipId: adminMembershipId }, member, left, outsider };
}

export function clientFor(world: World, role: Role) {
  if (role === 'anonymous') return api(null);
  return api(world[role]);
}

export interface MatrixCase {
  /** Builds the request; runs once per role. */
  call: (client: ReturnType<typeof api>, world: World) => Promise<Response>;
  expect: Record<Role, number>;
}

export function permissionMatrix(name: string, getWorld: () => World, matrix: MatrixCase): void {
  describe(`${name} (permission matrix)`, () => {
    for (const role of ROLES) {
      it(`answers ${matrix.expect[role]} to ${role === 'anonymous' ? 'an unauthenticated caller' : `the ${role}`}`, async () => {
        const world = getWorld();
        const res = await matrix.call(clientFor(world, role), world);
        expect(res.status, JSON.stringify(res.body)).toBe(matrix.expect[role]);
        if (res.status >= 400) {
          expect(res.body).toEqual(
            expect.objectContaining({
              code: expect.any(String),
              messageFr: expect.any(String),
              messageEn: expect.any(String),
            }),
          );
        }
      });
    }
  });
}

/** Builds the world once per test file. */
export function useWorld(): () => World {
  let world: World | undefined;
  beforeAll(async () => {
    world = await buildWorld();
  });
  return () => {
    if (!world) throw new Error('world not built yet');
    return world;
  };
}

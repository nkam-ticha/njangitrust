// A group for the chat, meetings and statements tests: an admin, three active members, a member who
// left, a newcomer who may read but not act yet (INVITED), and a stranger with a group of their own.
// The first cycle is marked started after everyone joined (founding invites stop then, R1.6).
import type { TestUser } from './client';
import {
  addMember,
  createGroup,
  markFirstCycleStarted,
  setMembershipStatus,
  signUp,
} from './factories';

export type Member = TestUser & { membershipId: string };

export interface ChatWorld {
  groupId: string;
  groupName: string;
  admin: Member;
  bea: Member;
  carl: Member;
  dina: Member;
  leaver: Member;
  newcomer: Member;
  stranger: TestUser;
  strangerGroupId: string;
}

export async function chatWorld(): Promise<ChatWorld> {
  const adminUser = await signUp();
  const { groupId, adminMembershipId } = await createGroup(adminUser, {
    name: 'Njangi du quartier',
  });
  const bea = await addMember(adminUser, groupId);
  const carl = await addMember(adminUser, groupId);
  const dina = await addMember(adminUser, groupId);
  const leaver = await addMember(adminUser, groupId);
  const newcomer = await addMember(adminUser, groupId);
  await markFirstCycleStarted(groupId);
  await setMembershipStatus(leaver.membershipId, 'LEFT');
  await setMembershipStatus(newcomer.membershipId, 'INVITED');
  const stranger = await signUp();
  const other = await createGroup(stranger, { name: 'Autre groupe' });
  return {
    groupId,
    groupName: 'Njangi du quartier',
    admin: { ...adminUser, membershipId: adminMembershipId },
    bea,
    carl,
    dina,
    leaver,
    newcomer,
    stranger,
    strangerGroupId: other.groupId,
  };
}

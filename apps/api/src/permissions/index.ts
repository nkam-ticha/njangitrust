export type { AuthActor, ClientKind, GroupActor, GroupStatus, MembershipRef, MembershipRole, MembershipStatus } from './actor';
export { can, type Decision, type DenialReason, type Resource } from './can';
export { GROUP_POLICIES, OWNER_ACTIONS, type Action, type Audience, type GroupAction, type OwnerAction } from './policies';
export { authorizeGroup, authorizeOwner, loadGroupActor, type GroupAccess } from './group-access';
export { denialToError, permissionError } from './permission-errors';

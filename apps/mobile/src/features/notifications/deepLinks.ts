// Server deep links (notifications, spec 1.8) → app routes. The API speaks in resources
// (`/votes/<proposalId>`, `/groups/<groupId>/members`); the app's routes act on the active group.
// Unknown links open nothing rather than an "unmatched route" page.

/** The D14 alert about a pending reset of my own PIN (offers "Annuler" instead of navigating). */
export const PIN_RESET_OWNER_LINK = '/me/pin-reset';

export type AppRoute = '/votes' | '/members' | '/pin-resets' | '/group-rules' | '/notifications';

export interface ResolvedLink {
  route: AppRoute;
  /** Make this group active first. */
  groupId?: string;
}

const GROUP_PAGES: Record<string, AppRoute> = {
  members: '/members',
  'pin-resets': '/pin-resets',
  settings: '/group-rules',
  rules: '/group-rules',
};

export function resolveDeepLink(link: string | null | undefined): ResolvedLink | null {
  if (!link?.startsWith('/')) return null;
  const parts = link.split(/[?#]/)[0]!.split('/').filter(Boolean);
  // A proposal opens the Votes tab (the proposal detail screen comes later).
  if (parts[0] === 'votes') return { route: '/votes' };
  if (parts[0] === 'groups' && parts[1]) {
    const route = GROUP_PAGES[parts[2] ?? ''];
    return route ? { route, groupId: parts[1] } : null;
  }
  return null;
}

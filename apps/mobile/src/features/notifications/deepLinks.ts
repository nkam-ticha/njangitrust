// Server deep links (notifications, spec 1.8) → app routes. The API speaks in resources
// (`/votes/<proposalId>`, `/groups/<groupId>/members`); the app's routes act on the active group.
// Unknown links open nothing rather than an "unmatched route" page.

/** The D14 alert about a pending reset of my own PIN (offers "Annuler" instead of navigating). */
export const PIN_RESET_OWNER_LINK = '/me/pin-reset';

export type AppRoute =
  | '/votes'
  | '/members'
  | '/pin-resets'
  | '/group-rules'
  | '/notifications'
  | '/groupe'
  | '/caisse'
  | '/statements'
  | '/meetings';

export interface ResolvedLink {
  route: AppRoute;
  /** Make this group active first. */
  groupId?: string;
  /** A chat message to scroll to (`/groups/<id>/chat?message=<id>`); it may be gone (D33). */
  messageId?: string;
}

const GROUP_PAGES: Record<string, AppRoute> = {
  members: '/members',
  'pin-resets': '/pin-resets',
  settings: '/group-rules',
  rules: '/group-rules',
  chat: '/groupe',
  statements: '/statements',
  meetings: '/meetings',
};

const MESSAGE_ID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function messageOf(link: string): string | undefined {
  const query = link.split('#')[0]!.split('?')[1];
  if (!query) return undefined;
  const value = new URLSearchParams(query).get('message');
  return value && MESSAGE_ID.test(value) ? value : undefined;
}

export function resolveDeepLink(link: string | null | undefined): ResolvedLink | null {
  if (!link?.startsWith('/')) return null;
  const parts = link.split(/[?#]/)[0]!.split('/').filter(Boolean);
  // A proposal opens the Votes tab (the proposal detail screen comes later).
  if (parts[0] === 'votes') return { route: '/votes' };
  if (parts[0] === 'caisse') return { route: '/caisse' };
  if (parts[0] === 'groups' && parts[1]) {
    const route = GROUP_PAGES[parts[2] ?? ''];
    if (!route) return null;
    const messageId = route === '/groupe' ? messageOf(link) : undefined;
    return { route, groupId: parts[1], ...(messageId ? { messageId } : {}) };
  }
  return null;
}

/** Where to navigate for a resolved link; the message to open travels as the `message` parameter. */
export function hrefFor(target: ResolvedLink): string {
  return target.messageId
    ? `${target.route}?message=${encodeURIComponent(target.messageId)}`
    : target.route;
}

import { describe, expect, it } from 'vitest';
import { hrefFor, resolveDeepLink } from './deepLinks';

const GROUP = '7b1f6d2e-1c3a-4b8e-9d2f-0a1b2c3d4e5f';
const MESSAGE = '0a9c8b7d-6e5f-4a3b-8c2d-1e0f9a8b7c6d';

describe('deep links', () => {
  it('opens the Groupe tab for a chat link and keeps the message to scroll to', () => {
    const target = resolveDeepLink(`/groups/${GROUP}/chat?message=${MESSAGE}`);
    expect(target).toEqual({ route: '/groupe', groupId: GROUP, messageId: MESSAGE });
    expect(hrefFor(target!)).toBe(`/groupe?message=${MESSAGE}`);
  });

  it('opens the chat without a message when the link has none or an invalid one', () => {
    expect(resolveDeepLink(`/groups/${GROUP}/chat`)).toEqual({ route: '/groupe', groupId: GROUP });
    expect(resolveDeepLink(`/groups/${GROUP}/chat?message=not-an-id`)).toEqual({
      route: '/groupe',
      groupId: GROUP,
    });
    expect(hrefFor({ route: '/groupe', groupId: GROUP })).toBe('/groupe');
  });

  it('does not carry a message parameter to other screens', () => {
    expect(resolveDeepLink(`/groups/${GROUP}/members?message=${MESSAGE}`)).toEqual({
      route: '/members',
      groupId: GROUP,
    });
  });

  it('keeps the links that already worked', () => {
    expect(resolveDeepLink('/votes/abc')).toEqual({ route: '/votes' });
    expect(resolveDeepLink(`/groups/${GROUP}/settings`)).toEqual({
      route: '/group-rules',
      groupId: GROUP,
    });
    expect(resolveDeepLink(`/groups/${GROUP}/statements`)).toEqual({
      route: '/statements',
      groupId: GROUP,
    });
    expect(resolveDeepLink(`/groups/${GROUP}/meetings/${MESSAGE}`)).toEqual({
      route: '/meetings',
      groupId: GROUP,
    });
    expect(resolveDeepLink('/caisse')).toEqual({ route: '/caisse' });
  });

  it('opens nothing for an unknown or empty link', () => {
    expect(resolveDeepLink(null)).toBeNull();
    expect(resolveDeepLink('')).toBeNull();
    expect(resolveDeepLink('https://example.com')).toBeNull();
    expect(resolveDeepLink(`/groups/${GROUP}/unknown`)).toBeNull();
    expect(resolveDeepLink('/me/pin-reset')).toBeNull();
  });
});

import { describe, expect, it } from 'vitest';
import { MAX_LOOKUP_PAGES, nextLookupStep } from './jumpLookup';

const base = { ready: true, found: false, hasMore: false, loading: false, pagesRead: 0 };

describe('opening the chat on a message from a notification', () => {
  it('waits for the first page', () => {
    expect(nextLookupStep({ ...base, ready: false })).toBe('wait');
  });

  it('scrolls to the message when it is loaded', () => {
    expect(nextLookupStep({ ...base, found: true })).toBe('found');
    expect(nextLookupStep({ ...base, found: true, hasMore: true })).toBe('found');
  });

  it('reads an older page while the message is not found and there is more', () => {
    expect(nextLookupStep({ ...base, hasMore: true })).toBe('load');
    expect(nextLookupStep({ ...base, hasMore: true, loading: true })).toBe('wait');
  });

  it('says the message is gone once the history is read to its end', () => {
    expect(nextLookupStep({ ...base, hasMore: false })).toBe('gone');
  });

  it('gives up after the page limit instead of reading for ever', () => {
    expect(nextLookupStep({ ...base, hasMore: true, pagesRead: MAX_LOOKUP_PAGES })).toBe('gone');
  });
});

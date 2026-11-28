// The decision behind opening the chat on a message from a notification (D33), without any screen:
// what to do next given what is loaded.

/** Pages of history read at most while looking for the message. */
export const MAX_LOOKUP_PAGES = 10;

export type LookupStep = 'wait' | 'found' | 'load' | 'gone';

export function nextLookupStep(input: {
  /** The first page of messages has arrived. */
  ready: boolean;
  /** The message is among the loaded ones. */
  found: boolean;
  /** An older page exists. */
  hasMore: boolean;
  /** An older page is being read. */
  loading: boolean;
  pagesRead: number;
}): LookupStep {
  if (!input.ready) return 'wait';
  if (input.found) return 'found';
  if (input.hasMore && input.pagesRead < MAX_LOOKUP_PAGES) return input.loading ? 'wait' : 'load';
  // Nothing older to read, or enough pages tried: the message no longer exists (or is too old).
  return input.loading ? 'wait' : 'gone';
}

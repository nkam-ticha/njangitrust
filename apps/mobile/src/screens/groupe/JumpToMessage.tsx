// Opens the chat on one message (a notification's `?message=<id>` link, D33). The message may sit
// further back than the pages loaded, so older pages are read, a few at a time, until it is found.
// It may also be gone (messages are deleted after three months): the chat then simply stays where
// it is and says so calmly. Never an error and never a blank screen.
import { useEffect, useRef } from 'react';
import { nextLookupStep } from './jumpLookup';

interface JumpToMessageProps {
  messageId: string;
  /** Row index of the message in the list, -1 when it is not loaded. */
  index: number;
  /** The first page has arrived. */
  ready: boolean;
  hasMore: boolean;
  loading: boolean;
  loadMore: () => void;
  onFound: () => void;
  onGone: () => void;
  /** Called once the link has been dealt with, so it is not handled again. */
  onDone: () => void;
}

export function JumpToMessage({
  messageId,
  index,
  ready,
  hasMore,
  loading,
  loadMore,
  onFound,
  onGone,
  onDone,
}: JumpToMessageProps) {
  const state = useRef({ id: messageId, pages: 0, handled: false });
  useEffect(() => {
    if (state.current.id !== messageId) state.current = { id: messageId, pages: 0, handled: false };
    if (state.current.handled) return;
    const step = nextLookupStep({
      ready,
      found: index >= 0,
      hasMore,
      loading,
      pagesRead: state.current.pages,
    });
    if (step === 'wait') return;
    if (step === 'load') {
      state.current.pages += 1;
      loadMore();
      return;
    }
    state.current.handled = true;
    if (step === 'found') onFound();
    else onGone();
    onDone();
  }, [messageId, index, ready, hasMore, loading, loadMore, onFound, onGone, onDone]);
  return null;
}

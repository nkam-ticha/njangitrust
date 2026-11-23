// A card never goes backwards, and a tap answered "already confirmed" is the card's state, not an
// error (the owner's double taps). Nothing here touches React or the network.
import { describe, expect, it } from 'vitest';
import type { PendingActionDto } from '@njangi/shared/contracts/pending-actions';
import { applyUpdate, furthest, mayMove } from './actionState';
import { cancelFlow, confirmFlow, type CardStore } from './confirmFlow';

const ID = '11111111-1111-4111-8111-111111111111';

const card = (
  status: PendingActionDto['status'],
  extra: Partial<PendingActionDto> = {},
): PendingActionDto => ({
  id: ID,
  type: 'pay',
  level: 'L1',
  status,
  origin: 'AGENT',
  groupId: null,
  preview: {
    title: { fr: 'Payer', en: 'Pay' },
    lines: [],
    total: 11_000,
    notes: [],
    confirmLabel: { fr: 'Payer 11 000 FCFA', en: 'Pay 11,000 FCFA' },
  },
  requiresPin: false,
  expiresAt: '2026-11-22T10:10:00.000Z',
  createdAt: '2026-11-22T10:00:00.000Z',
  result: null,
  failure: null,
  ...extra,
});

function store(initial: PendingActionDto, latest?: PendingActionDto) {
  let current = initial;
  const puts: PendingActionDto['status'][] = [];
  const s: CardStore & { puts: typeof puts } = {
    puts,
    current: () => current,
    put: (c) => {
      current = c;
      puts.push(c.status);
    },
    fetchLatest: () => (latest ? Promise.resolve(latest) : Promise.reject(new Error('offline'))),
  };
  return s;
}

const error = (code: string) => Object.assign(new Error(code), { code });

describe('card state only moves forward', () => {
  it('ignores a late "PENDING" after the card was confirmed or finished', () => {
    const update = { id: ID, status: 'PENDING' as const, result: null, failure: null };
    expect(applyUpdate(card('CONFIRMED'), update).status).toBe('CONFIRMED');
    expect(applyUpdate(card('DONE'), update).status).toBe('DONE');
  });

  it('applies DONE after CONFIRMED, with its result', () => {
    const result = { ref: 'MP2611', summary: null };
    const next = applyUpdate(card('CONFIRMED'), { id: ID, status: 'DONE', result, failure: null });
    expect(next).toMatchObject({ status: 'DONE', result });
  });

  it('keeps the first final state and ignores an update for another card', () => {
    expect(mayMove('DONE', 'FAILED')).toBe(false);
    expect(mayMove('PENDING', 'CANCELLED')).toBe(true);
    const other = '22222222-2222-4222-8222-222222222222';
    const update = { id: other, status: 'DONE' as const, result: null, failure: null };
    expect(applyUpdate(card('PENDING'), update).status).toBe('PENDING');
  });

  it('keeps the further of two readings', () => {
    expect(furthest(card('DONE'), card('PENDING')).status).toBe('DONE');
    expect(furthest(card('PENDING'), card('CONFIRMED')).status).toBe('CONFIRMED');
    expect(furthest(undefined, card('PENDING')).status).toBe('PENDING');
  });
});

describe('confirmFlow', () => {
  it('stores the answer and returns the action with its one-time data', async () => {
    const s = store(card('PENDING'));
    const done = card('DONE', { result: { ref: 'MP1', summary: null } });
    const out = await confirmFlow(s, () => Promise.resolve({ action: done, data: { link: 'x' } }));
    expect(out).toMatchObject({ alreadyHandled: false, data: { link: 'x' } });
    expect(s.current().status).toBe('DONE');
  });

  it('treats "already confirmed" as the card real state, never as an error', async () => {
    const s = store(card('PENDING'), card('DONE', { result: { ref: 'MP1', summary: null } }));
    const out = await confirmFlow(s, () => Promise.reject(error('ACTION_ALREADY_CONFIRMED')));
    expect(out.alreadyHandled).toBe(true);
    expect(out.action.status).toBe('DONE');
    expect(s.current().result?.ref).toBe('MP1');
  });

  it('shows a card cancelled or expired elsewhere as it is, without an error', async () => {
    for (const [code, status] of [
      ['ACTION_CANCELLED', 'CANCELLED'],
      ['ACTION_EXPIRED', 'EXPIRED'],
    ] as const) {
      const s = store(card('PENDING'), card(status));
      const out = await confirmFlow(s, () => Promise.reject(error(code)));
      expect(out).toMatchObject({ alreadyHandled: true, action: { status } });
    }
  });

  it('throws any other failure and leaves the card as it was', async () => {
    const s = store(card('PENDING'));
    await expect(
      confirmFlow(s, () => Promise.reject(error('PIN_INCORRECT'))),
    ).rejects.toMatchObject({ code: 'PIN_INCORRECT' });
    expect(s.current().status).toBe('PENDING');
  });

  it('throws the original error when the card cannot be read again', async () => {
    const s = store(card('PENDING'));
    await expect(
      confirmFlow(s, () => Promise.reject(error('ACTION_ALREADY_CONFIRMED'))),
    ).rejects.toMatchObject({ code: 'ACTION_ALREADY_CONFIRMED' });
  });
});

describe('cancelFlow', () => {
  it('shows the card cancelled at once, then keeps the server answer', async () => {
    const s = store(card('PENDING'));
    const out = await cancelFlow(s, () => Promise.resolve({ action: card('CANCELLED') }));
    expect(s.puts[0]).toBe('CANCELLED');
    expect(out.status).toBe('CANCELLED');
  });

  it('puts the card back when the cancel fails', async () => {
    const s = store(card('PENDING'));
    await expect(
      cancelFlow(s, () => Promise.reject(error('NETWORK_UNAVAILABLE'))),
    ).rejects.toThrow();
    expect(s.current().status).toBe('PENDING');
  });

  it('shows the real state when the action had already been confirmed', async () => {
    const s = store(card('PENDING'), card('DONE'));
    const out = await cancelFlow(s, () => Promise.reject(error('ACTION_ALREADY_CONFIRMED')));
    expect(out.status).toBe('DONE');
    expect(s.current().status).toBe('DONE');
  });
});

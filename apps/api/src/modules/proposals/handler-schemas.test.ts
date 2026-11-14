// Privacy-guard L-2 (spec 2.11): free text and names are checked again where handlers and stored
// payloads are parsed, not only at the HTTP edge (the agent's tools reach handlers directly).
import { describe, expect, it } from 'vitest';
import { proposalArgsSchema } from './proposals.actions';
import { proposalDefinition } from './types';

const PHONE = 'Appelle le 677-123-456';
const uuid = '8e2f7b3f-2d3e-4f60-9bac-1d2e3f4a5b6c';

describe('handler and payload schemas refuse phone numbers (L-2)', () => {
  it('PROPOSAL_CREATE reason', () => {
    const args = { groupId: uuid, type: 'EARLY_EXIT', input: {} };
    expect(proposalArgsSchema.safeParse({ ...args, reason: 'Je déménage' }).success).toBe(true);
    expect(proposalArgsSchema.safeParse({ ...args, reason: PHONE }).success).toBe(false);
  });

  it('MEMBER_ADD invitee name', () => {
    const schema = proposalDefinition('MEMBER_ADD').payload;
    const payload = { phoneHash: 'a'.repeat(64) };
    expect(schema.safeParse({ ...payload, inviteeName: 'Ivo Fon' }).success).toBe(true);
    expect(schema.safeParse({ ...payload, inviteeName: 'Ivo 677 12 34 56' }).success).toBe(false);
  });

  it('LEDGER_CORRECTION text', () => {
    const schema = proposalDefinition('LEDGER_CORRECTION').input;
    expect(schema.safeParse({ seq: 3, correction: 'Montant 5 000' }).success).toBe(true);
    expect(schema.safeParse({ seq: 3, correction: PHONE }).success).toBe(false);
  });

  it('SOLIDARITY_PAYOUT note', () => {
    const schema = proposalDefinition('SOLIDARITY_PAYOUT').payload;
    const payload = { recipientMembershipId: uuid, event: 'NAISSANCE', amount: 20_000 };
    expect(schema.safeParse({ ...payload, note: 'Bébé arrivé' }).success).toBe(true);
    expect(schema.safeParse({ ...payload, note: null }).success).toBe(true);
    expect(schema.safeParse({ ...payload, note: PHONE }).success).toBe(false);
  });
});

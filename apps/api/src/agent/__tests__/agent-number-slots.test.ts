// A number typed to the agent never reaches the model: it is replaced by a marker, the tool gets the
// real number back from the server, and nothing the model writes can show it (rule 11, R13.7).
import { describe, expect, it } from 'vitest';
import { getPrisma } from '../../lib/prisma';
import { TEST_PIN, confirm, freshPhone, signUp } from '../../../test/helpers/factories';
import { NumberSlots, hideMarkers } from '../guards/number-slots';
import { agentApi, scriptedAgent } from './helpers';

describe('number markers', () => {
  it('gives the same number the same marker, and resolves markers of this turn only', () => {
    const slots = new NumberSlots();
    const text = slots.mask('Appelle le 677 12 34 56 ou le 699-00-11-22, ou encore 677 12 34 56.');
    expect(text).toBe('Appelle le [phone-1] ou le [phone-2], ou encore [phone-1].');
    expect(slots.used).toBe(true);
    expect(slots.resolve({ phone: '[phone-2]', note: 'x [phone-1]', other: '[phone-9]' })).toEqual({
      phone: '+237699001122',
      note: 'x +237677123456',
      other: '[phone-9]',
    });
    expect(new NumberSlots().resolve({ phone: '[phone-1]' })).toEqual({ phone: '[phone-1]' });
  });

  it('hides a marker the model writes back', () => {
    expect(hideMarkers('Le numéro est [phone-1].')).not.toMatch(/phone-1/);
  });

  it('masks a number written with odd separators without ever resolving it', () => {
    const slots = new NumberSlots();
    const text = slots.mask('mon numéro : 677 -- 12 -- 34 -- 56');
    expect(text).not.toMatch(/677/);
    expect(slots.used).toBe(false);
  });
});

describe('changing my payment number through the agent', () => {
  it('sends the model a marker, never the digits, and still changes the number', async () => {
    const user = await signUp();
    const next = await freshPhone();
    const spoken = `${next.slice(4, 7)} ${next.slice(7, 9)} ${next.slice(9, 11)} ${next.slice(11)}`;
    const llm = scriptedAgent([
      { toolCalls: [{ name: 'change_payment_number', args: { number: '[phone-1]' } }] },
      { text: 'Je prépare la carte pour [phone-1]. Confirme-la avec ton PIN.' },
    ]);
    const res = await agentApi(user).post('/v1/agent/messages', {
      text: `Change mon numéro pour ${spoken}`,
    });
    expect(res.status).toBe(200);

    // Everything the provider was sent: no digit of the number, only the marker.
    const sent = llm.bodyTexts().join('\n');
    expect(sent).toContain('[phone-1]');
    expect(sent).not.toContain(spoken);
    expect(sent.replace(/\D/g, '')).not.toContain(next.slice(4));
    // What the member reads: no marker and no number either.
    expect(res.body.turn.reply.text).not.toMatch(/phone-1/);

    // The card exists, asks for the PIN, and the real number is applied only on confirmation.
    const [action] = res.body.turn.actions as { id: string; type: string; requiresPin: boolean }[];
    expect(action).toMatchObject({ type: 'CHANGE_PAYMENT_NUMBER', requiresPin: true });
    expect(await getPrisma().paymentNumber.count({ where: { userId: user.id } })).toBe(1);
    expect((await confirm(user, action!.id, TEST_PIN)).status).toBe(200);
    const active = await getPrisma().paymentNumber.findFirstOrThrow({
      where: { userId: user.id, activeTo: null },
    });
    expect(active.number).toBe(next);
  });
});

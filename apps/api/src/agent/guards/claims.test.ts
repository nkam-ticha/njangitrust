import { describe, expect, it } from 'vitest';
import type { ToolRun } from '../tools/execute';
import {
  claimsCard,
  claimsDone,
  failureReason,
  mentionsCard,
  refusesWithoutTrying,
  verifyReply,
} from './claims';

function run(
  name: string,
  outcome: ToolRun['outcome'],
  modelData: unknown = {},
  status: ToolRun['status'] = outcome.status === 'UNAVAILABLE' ? 'REFUSED' : outcome.status,
): ToolRun {
  return { callId: `c-${name}`, name, status, outcome, args: {}, modelData };
}

const card = run('propose_member_add', {
  status: 'OK',
  data: { pendingActionId: 'pa1', summary: 'x' },
  pendingActionId: 'pa1',
});
const refused = run(
  'propose_member_add',
  { status: 'REFUSED', code: 'PROPOSALS_BEFORE_FIRST_CYCLE', message: 'Pas avant le cycle.' },
  { status: 'REFUSED', code: 'PROPOSALS_BEFORE_FIRST_CYCLE', reason: 'Pas avant le cycle.' },
);
const invalid = run(
  'propose_member_add',
  { status: 'INVALID', issues: [{ path: 'phone', code: 'TOO_SMALL' }] },
  { status: 'INVALID', issues: [{ path: 'phone', code: 'TOO_SMALL' }] },
);
const read = run('get_rules', { status: 'OK', data: { rules: [] } });
const language = run('set_language', { status: 'OK', data: {} });

describe('claims of a card or of a finished action', () => {
  it.each([
    'Voici la carte pour ajouter Hervé.',
    'La carte de retrait est prête. Confirme-la dans l’application.',
    'J’ai préparé la proposition, confirme-la dans l’app.',
    "C'est fait !",
    'Here is the card for the new member.',
    'The proposal card is ready.',
    'I’ve prepared the vote for you.',
    'Done! Hervé will be invited.',
    'Confirme-la dans l’app.',
  ])('reads %j as a claim', (text) => {
    expect(claimsCard(text)).toBe(true);
  });

  it.each([
    'Je n’ai pas pu préparer la carte : le cycle n’a pas démarré.',
    'I could not prepare the card.',
    'Veux-tu que je prépare la carte ?',
    'Voici les membres du groupe : Carine, Paul.',
    'Tu dois 11 000 FCFA pour le tour 4.',
    'Je peux préparer la proposition si tu veux.',
    'Here are the members of the group.',
    'Rien n’est fait tant que tu n’as pas confirmé.',
    'I haven’t prepared anything yet.',
  ])('does not read %j as a claim', (text) => {
    expect(claimsCard(text)).toBe(false);
  });

  it('tells "done" from "ready"', () => {
    expect(claimsDone('C’est fait, Hervé est ajouté.')).toBe(true);
    expect(claimsDone('J’ai envoyé l’invitation.')).toBe(true);
    expect(claimsDone('It is done.')).toBe(true);
    expect(claimsDone('The payment has been sent.')).toBe(true);
    expect(claimsDone('Voici la carte, confirme-la dans l’app.')).toBe(false);
    expect(claimsDone('The card is ready.')).toBe(false);
    expect(claimsDone('I have prepared the card.')).toBe(false);
  });

  it('knows when the reply already mentions the card', () => {
    expect(mentionsCard('Confirme-la dans l’app.')).toBe(true);
    expect(mentionsCard('Voici la carte.')).toBe(true);
    expect(mentionsCard('Please confirm it.')).toBe(true);
    expect(mentionsCard('Bien noté.')).toBe(false);
  });
});

describe('verifyReply: the text must match what the tools did', () => {
  it('flags a card claimed when no tool ran', () => {
    expect(verifyReply('Voici la carte.', [])).toBe('unsupported');
  });

  it('flags a card claimed after a refused, invalid or failed tool', () => {
    expect(verifyReply('La carte est prête !', [refused])).toBe('unsupported');
    expect(verifyReply('Here is the card.', [invalid])).toBe('unsupported');
    expect(verifyReply('C’est fait.', [run('pay', { status: 'ERROR' }, { status: 'ERROR' })])).toBe(
      'unsupported',
    );
  });

  it('flags a card claimed after reads only', () => {
    expect(verifyReply('J’ai préparé la proposition.', [read])).toBe('unsupported');
  });

  it('lets a read report the state of things that already happened', () => {
    expect(verifyReply('Ton retrait de 20 000 FCFA a été effectué.', [read])).toBe('fine');
    expect(verifyReply('Your payment has been sent.', [read])).toBe('fine');
    expect(verifyReply('Le paiement de Paul est bien enregistré.', [read])).toBe('fine');
  });

  it('accepts a card claim when a tool returned a card', () => {
    expect(verifyReply('Voici la carte, confirme-la dans l’app.', [card])).toBe('fine');
  });

  it('accepts a card claimed by a read that returns a card (a statement)', () => {
    const statement = run('get_statement', {
      status: 'OK',
      data: {},
      card: { type: 'STATEMENT', statementId: 's1' },
    });
    expect(verifyReply('Voici ton relevé : la carte est prête.', [statement])).toBe('fine');
  });

  it('never lets a card be called done before its result event', () => {
    expect(verifyReply('C’est fait, Hervé est ajouté.', [card])).toBe('overclaims-done');
    expect(verifyReply('It is done.', [card])).toBe('overclaims-done');
  });

  it('accepts "done" for a preference that applies at once', () => {
    expect(verifyReply('C’est fait : l’app est en anglais.', [language])).toBe('fine');
  });

  it('asks for the card to be mentioned when the reply is silent about it', () => {
    expect(verifyReply('Je m’en occupe.', [card])).toBe('no-card-mention');
    expect(verifyReply('Bien noté.', [card])).toBe('no-card-mention');
  });

  it('does not ask for it after a secret vote, which has no card', () => {
    const secret = run('cast_vote', {
      status: 'OK',
      data: { secretVote: true },
      confidential: true,
    });
    expect(verifyReply('Ouvre l’onglet Votes.', [secret])).toBe('fine');
  });

  it('leaves ordinary answers alone', () => {
    expect(verifyReply('Il y a Carine Fotso.', [read])).toBe('fine');
    expect(verifyReply('Bonjour Paul.', [])).toBe('fine');
    expect(verifyReply('Je n’ai pas pu le préparer : cycle non démarré.', [refused])).toBe('fine');
  });

  it('leaves how-to answers alone: they explain cards, they do not claim one', () => {
    expect(
      verifyReply('Je prépare une carte, tu confirmes. Voici la carte de paiement.', [], {
        guided: true,
      }),
    ).toBe('fine');
  });
});

describe('failureReason: what to tell the member when nothing was prepared', () => {
  it('uses the real reason of a refusal', () => {
    expect(failureReason([read, refused], 'fr')).toBe('Pas avant le cycle.');
  });

  it('names the missing fields of an invalid call', () => {
    expect(failureReason([invalid], 'en')).toMatch(/phone/);
    expect(failureReason([invalid], 'fr')).toMatch(/phone/);
  });

  it('prefers the failed action over a failed read', () => {
    const failedRead = run(
      'get_rules',
      { status: 'ERROR' },
      { status: 'ERROR', message: 'Le service n’a pas répondu.' },
    );
    expect(failureReason([refused, failedRead], 'fr')).toBe('Pas avant le cycle.');
  });

  it('is null when nothing failed', () => {
    expect(failureReason([read, card], 'fr')).toBeNull();
    expect(failureReason([], 'fr')).toBeNull();
  });

  it('uses the message of an unavailable part', () => {
    const unavailable = run(
      'pay',
      { status: 'UNAVAILABLE', capability: 'money', message: 'Pas encore.' },
      { status: 'UNAVAILABLE', message: 'Pas encore.' },
    );
    expect(failureReason([unavailable], 'fr')).toBe('Pas encore.');
  });
});

describe('refusing before trying', () => {
  it.each([
    'Je ne peux pas ajouter un membre.',
    "Désolé, je n'ai pas la possibilité de faire ça.",
    'I can’t add members to the group.',
    'Unfortunately I cannot do that.',
  ])('flags %j', (text) => {
    expect(refusesWithoutTrying(text)).toBe(true);
  });

  it.each([
    'Je ne peux pas partager le numéro d’un membre. Écris-lui dans le groupe.',
    'I cannot confirm an action for you: you confirm it in the app.',
    'Je ne peux pas voir ton code PIN.',
    'Tu as 3 membres.',
  ])('lets %j stand: it is a refusal the rules require', (text) => {
    expect(refusesWithoutTrying(text)).toBe(false);
  });
});

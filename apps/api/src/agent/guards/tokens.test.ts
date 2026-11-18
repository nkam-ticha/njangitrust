import { describe, expect, it } from 'vitest';
import { wrapMemberText, wrapToolResult } from './wrap';

const JWT =
  'eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiIxMjM0NTY3ODkwIn0.dBjftJeZ4CVPmB92K27uhbUJU1p1r_wW1gFWFOEjXk';
const LINK_TOKEN = 'k3J9xQ2mZpL8vR5tYw1nB7cD4fG6hJ0aS2dF5gH8jK1lM3nP';

describe('tokens never go to a model provider', () => {
  it('masks a JWT, a bearer value and a link token in what the member typed', () => {
    const wrapped = wrapMemberText(
      `voici mon lien https://app.example/reset/${LINK_TOKEN} et ${JWT} et Bearer abc.def-ghi`,
    );
    expect(wrapped).not.toContain(LINK_TOKEN);
    expect(wrapped).not.toContain(JWT);
    expect(wrapped).not.toContain('abc.def-ghi');
    expect(wrapped).toContain('[token]');
    expect(wrapped).toContain('[jwt]');
  });

  it('masks them in a tool result too (a chat message or a note can hold one)', () => {
    const wrapped = wrapToolResult('search_chat', {
      messages: [{ text: `le code est ${LINK_TOKEN}` }],
    });
    expect(wrapped).not.toContain(LINK_TOKEN);
    expect(wrapped).toContain('[token]');
  });

  it('leaves ordinary words alone', () => {
    const wrapped = wrapToolResult('get_round', { text: 'Cotisation du tour 4' });
    expect(wrapped).toContain('Cotisation du tour 4');
  });
});

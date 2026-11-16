import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { PROMPT_SHA256, PROMPT_VERSION, promptHash, systemPrompt } from './index';

/** The prompt block of spec 4.7, read from the spec itself. */
function specPrompt(): string {
  const spec = readFileSync(
    new URL('../../../../../docs/NJANGI_SPEC.md', import.meta.url),
    'utf8',
  ).replace(/\r\n/g, '\n');
  const section = spec.slice(spec.indexOf('## 4.7 System prompt'), spec.indexOf('## 4.8'));
  const start = section.indexOf('```\n') + 4;
  return section.slice(start, section.indexOf('\n```', start));
}

function part(text: string, from: string, to: string): string {
  return text.slice(text.indexOf(from), text.indexOf(to));
}

describe('system prompt (spec 4.7)', () => {
  it('is the same text in system.md and in the module the deployed API uses', () => {
    const file = readFileSync(new URL('./system.md', import.meta.url), 'utf8').replace(
      /\r\n/g,
      '\n',
    );
    expect(systemPrompt()).toBe(file);
  });

  it('keeps the identity, the ten numbered rules and the vocabulary word for word', () => {
    const spec = specPrompt();
    const ours = systemPrompt();
    expect(spec.length).toBeGreaterThan(2_000);
    expect(ours).toContain(part(spec, 'You are Njangi', 'VOCABULARY'));
    expect(ours).toContain(part(spec, 'VOCABULARY', 'EXAMPLES'));
    for (let n = 1; n <= 10; n += 1) expect(ours).toMatch(new RegExp(`\\n${n}\\. `));
  });

  it('keeps the spec’s examples', () => {
    expect(systemPrompt()).toContain(specPrompt().slice(specPrompt().indexOf('EXAMPLES')));
  });

  it('is versioned: a change to system.md needs a new PROMPT_VERSION and hash (and an evaluation run)', () => {
    expect(PROMPT_VERSION).toMatch(/^\d{4}-\d{2}-\d{2}\.\d+$/);
    expect(promptHash()).toBe(PROMPT_SHA256);
  });
});

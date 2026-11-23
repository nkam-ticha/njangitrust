import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { APP_GUIDE } from '../knowledge/app-guide';
import { ALL_SPECS } from '../tools/specs';
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

describe('system prompt: try first, never invent a direction', () => {
  const ours = systemPrompt();

  it('makes the model call the matching tool before it ever refuses', () => {
    expect(ours).toContain('ALWAYS TRY FIRST');
    expect(ours).toMatch(/call the matching tool first/);
    expect(ours).toMatch(/Never say "je ne peux pas" or "I\s+can't"/);
    expect(ours).toMatch(/Only after a tool refuses, explain its real\s+reason/);
    expect(ours).toMatch(/at most one short\s+question/);
  });

  it('says a card exists only after an OK result with a pendingActionId', () => {
    expect(ours).toMatch(
      /A card exists only when a tool returned status OK with a pendingActionId/,
    );
    expect(ours).toMatch(/After\s+INVALID, correct the arguments and call again/);
    expect(ours).toMatch(/never say "voici la carte"/);
  });

  it('forbids inventing a screen, a button, a menu or a setting', () => {
    expect(ours).toMatch(/Never invent a screen, a button, a menu or a\s+setting/);
    expect(ours).toMatch(/exact label in the member's language/);
    expect(ours).toMatch(/"Funds" and\s+"Me"/);
  });

  it('names only tools that exist, and only guide topics that exist', () => {
    const tools = new Set(ALL_SPECS.map((spec) => spec.name));
    const named = ours.match(/\b[a-z]+(?:_[a-z]+)+\b/g) ?? [];
    for (const word of new Set(named)) {
      if (word === 'tool_result') continue;
      expect(tools.has(word), word).toBe(true);
    }
    const topics = new Set(APP_GUIDE.map((entry) => entry.id));
    for (const match of ours.matchAll(/get_app_guide with topic "(\w+)"/g)) {
      expect(topics.has(match[1]!), match[1]).toBe(true);
    }
  });

  it('stays small enough for the free tiers (their input budget is a few thousand tokens)', () => {
    expect(ours.length).toBeLessThan(10_000);
  });
});

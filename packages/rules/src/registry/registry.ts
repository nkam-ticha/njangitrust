// The rules registry (spec 4.9): the official text of Part 3 in French and English, for the
// agent's explain_rule tool, so explanations always match the real rules.

import { RULES_R1_R3 } from './texts-r1-r3';
import { RULES_R4_R5 } from './texts-r4-r5';
import { RULES_R6_R10 } from './texts-r6-r10';
import { RULES_R11_R15 } from './texts-r11-r15';
import { DEFINITIONS } from './texts-definitions';
import type { RuleText } from './types';

/** Spec 4.9: every rule of Part 3, in document order. */
export const RULE_REGISTRY: readonly RuleText[] = [
  ...DEFINITIONS,
  ...RULES_R1_R3,
  ...RULES_R4_R5,
  ...RULES_R6_R10,
  ...RULES_R11_R15,
];

const BY_ID = new Map(RULE_REGISTRY.map((r) => [r.id, r]));

/** Combining accents (U+0300 to U+036F) left by NFD normalisation. */
const COMBINING_MARKS = new RegExp(
  `[${String.fromCharCode(0x300)}-${String.fromCharCode(0x36f)}]`,
  'g',
);

/** Lowercase, accents removed, punctuation as spaces: "Numéro de paiement" → "numero de paiement". */
export function normalizeTopic(text: string): string {
  return text
    .normalize('NFD')
    .replace(COMBINING_MARKS, '')
    .toLowerCase()
    .replace(/[^a-z0-9.]+/g, ' ')
    .trim();
}

/** Spec 4.9: one rule by id ("R7.3", "r7.3" or "7.3"; "3.2" for the parameters table). */
export function getRule(id: string): RuleText | null {
  const key = id.trim().toUpperCase();
  return BY_ID.get(key) ?? BY_ID.get(`R${key}`) ?? null;
}

const STOP_WORDS = new Set([
  'de',
  'du',
  'des',
  'la',
  'le',
  'les',
  'un',
  'une',
  'the',
  'a',
  'of',
  'to',
  'my',
  'mon',
  'ma',
  'mes',
  'et',
  'and',
]);

/**
 * Spec 4.9 explain_rule: rules matching a topic, best first. A rule id returns that rule; otherwise
 * each word of the query scores against the rule's topics (whole topic phrases count most), then its
 * title. Works in French and English, accents optional.
 */
export function findRules(query: string, limit = 5): RuleText[] {
  const exact = /^r?\d+(\.\d+)?$/i.test(query.trim()) ? getRule(query) : null;
  if (exact) return [exact];
  const q = normalizeTopic(query);
  const words = q.split(' ').filter((w) => w.length > 1 && !STOP_WORDS.has(w));
  if (words.length === 0) return [];
  const scored = RULE_REGISTRY.map((rule, order) => {
    const topics = rule.topics.map(normalizeTopic);
    const title = normalizeTopic(`${rule.title.fr} ${rule.title.en}`);
    let score = 0;
    for (const topic of topics) if (topic.includes(' ') && q.includes(topic)) score += 5;
    for (const word of words) {
      if (topics.some((t) => t.split(' ').includes(word))) score += 2;
      else if (
        topics.some((t) => t.split(' ').some((part) => part.startsWith(word) && word.length >= 4))
      )
        score += 1;
      if (title.split(' ').some((t) => t === word || (word.length >= 4 && t.startsWith(word))))
        score += 1;
    }
    return { rule, score, order };
  });
  return scored
    .filter((s) => s.score > 0)
    .sort((a, b) => b.score - a.score || a.order - b.order)
    .slice(0, limit)
    .map((s) => s.rule);
}

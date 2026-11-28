// System prompt rule 7: when a member asks why a fine or a debt applies, the answer quotes the
// official rule (explain_rule), not only the ledger entry. Models often read the ledger and stop;
// this finds that case so the runtime can give one correction step. Pure.

const WHY = /(^|[^\p{L}])(pourquoi|why)([^\p{L}]|$)/iu;
const FINE_OR_DEBT = /(amende|dette|fined?|fines?|debts?|\bowe\b)/iu;

/** The member asks why a fine or a debt applies to them. */
export function asksWhyARuleApplies(text: string): boolean {
  return WHY.test(text) && FINE_OR_DEBT.test(text);
}

/** The ledger was read to answer such a question, but explain_rule was never called. */
export function skippedExplainRule(
  text: string,
  runs: readonly { name: string; status: string }[],
): boolean {
  if (!asksWhyARuleApplies(text)) return false;
  const called = (name: string) => runs.some((r) => r.name === name && r.status === 'OK');
  return called('get_ledger') && !called('explain_rule');
}

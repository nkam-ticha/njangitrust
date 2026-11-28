// Spec 4.2 rule 1 and 5.4: the model states no amount the server did not provide. After the final
// text, this finds the FCFA amounts of the reply that appear nowhere in the conversation of the turn
// (session block, tool results, result events, the member's own words): the runtime then gives the
// model one correction step instead of showing an invented figure. Pure.

/** Thousands separators the app writes: thin and plain spaces in French, commas in English. */
const SEPARATOR = /(\d)[\s\u00a0\u202f,](?=\d{3}(?!\d))/g;

function joinDigits(text: string): string {
  let previous = '';
  let current = text;
  while (current !== previous) {
    previous = current;
    current = current.replace(SEPARATOR, '$1');
  }
  return current;
}

/** Whole numbers written in a text, separators removed ("11 000" is 11000). */
function numbersIn(text: string): Set<string> {
  return new Set([...joinDigits(text).matchAll(/\d+/g)].map((m) => String(Number(m[0]))));
}

/** Amounts with their currency ("11 000 FCFA", "10,000 FCFA", "5 000 francs"). */
function amountsIn(text: string): string[] {
  return [...joinDigits(text).matchAll(/(\d+)[\s\u00a0\u202f]*(?:FCFA|XAF|francs?)/gi)].map((m) =>
    String(Number(m[1])),
  );
}

/** The amounts of `reply` that are in none of the `sources` (each a text of the conversation). */
export function ungroundedAmounts(reply: string, sources: readonly string[]): string[] {
  const known = numbersIn(sources.join('\n'));
  return [...new Set(amountsIn(reply))].filter((amount) => !known.has(amount));
}

/** CLAUDE.md rule 10: French uses "tu". True when a French reply addresses the member as "vous". */
export function usesVous(text: string): boolean {
  return /(^|[^\p{L}])(vous|votre|vos)(?=[^\p{L}]|$)/iu.test(text);
}

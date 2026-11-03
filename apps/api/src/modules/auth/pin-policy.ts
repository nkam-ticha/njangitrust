// Which 6-digit PINs are too easy to guess (spec 2.10). Pure: no I/O.

const COMMON = new Set([
  '112233', '223344', '334455', '445566', '556677', '667788', '778899', '998877', '887766',
  '111222', '222111', '100200', '007007', '147258', '258369', '369258', '159753', '951753',
  '135790', '246810', '121314', '101010', '010101', '696969', '199000', '200000',
]);

function digitsOf(e164: string): string {
  return e164.replace(/\D/g, '').replace(/^237/, '');
}

/**
 * True for PINs an attacker would try first: six identical digits, straight sequences (also
 * wrapping, like 890123), repeated pairs or triples (121212, 123123), common patterns, and any six
 * consecutive digits of the member's own numbers.
 */
export function isGuessablePin(pin: string, ownNumbers: readonly string[] = []): boolean {
  if (!/^\d{6}$/.test(pin)) return true;
  const d = [...pin].map(Number);
  if (new Set(d).size === 1) return true;
  const steps = d.slice(1).map((v, i) => (v - d[i]! + 10) % 10);
  if (steps.every((s) => s === 1) || steps.every((s) => s === 9)) return true;
  if (pin.slice(0, 2).repeat(3) === pin || pin.slice(0, 3).repeat(2) === pin) return true;
  if (COMMON.has(pin)) return true;
  return ownNumbers.some((n) => digitsOf(n).includes(pin));
}

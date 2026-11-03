// Canonical JSON for the ledger hash chain (2.5 invariant 5, D6): sorted keys, no whitespace,
// integers only, dates as ISO 8601 UTC strings. Anything ambiguous (undefined, floats, BigInt,
// functions) is refused rather than silently dropped, so a hash always covers every field.

/** JSON values allowed in canonical form. */
export type JsonValue =
  null | boolean | number | string | JsonValue[] | { [key: string]: JsonValue };
export type JsonObject = { [key: string]: JsonValue };

function fail(path: string, what: string): never {
  throw new TypeError(`canonicalJSON: ${what} at ${path || '<root>'}`);
}

function write(value: unknown, path: string): string {
  if (value === null) return 'null';
  switch (typeof value) {
    case 'boolean':
      return value ? 'true' : 'false';
    case 'number':
      if (!Number.isSafeInteger(value)) fail(path, `non-integer number ${String(value)}`);
      return Object.is(value, -0) ? '0' : String(value);
    case 'string':
      return JSON.stringify(value);
    case 'object':
      break;
    default:
      return fail(path, `unsupported ${typeof value}`);
  }
  if (value instanceof Date) {
    if (Number.isNaN(value.getTime())) fail(path, 'invalid date');
    return JSON.stringify(value.toISOString());
  }
  if (Array.isArray(value)) {
    return `[${value.map((item, i) => write(item, `${path}[${i}]`)).join(',')}]`;
  }
  const proto = Object.getPrototypeOf(value) as unknown;
  if (proto !== Object.prototype && proto !== null) fail(path, 'non-plain object');
  const record = value as Record<string, unknown>;
  const keys = Object.keys(record).sort();
  const parts = keys.map((k) => `${JSON.stringify(k)}:${write(record[k], `${path}.${k}`)}`);
  return `{${parts.join(',')}}`;
}

/** 2.5, D6: canonical JSON text of a value (sorted keys, no whitespace, integers only, UTC dates). */
export function canonicalJSON(value: unknown): string {
  return write(value, '');
}

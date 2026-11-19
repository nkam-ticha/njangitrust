// Argument building blocks shared by the tool specs. Plain zod, so the JSON Schema sent to the
// model is exact; the module implementations then parse into the same contracts as the routes.
import { z } from 'zod';

export const s = z.strictObject;

export const PRIVATE = ['PRIVATE'] as const;
export const BOTH = ['PRIVATE', 'GROUP'] as const;
export const GROUP_ONLY = ['GROUP'] as const;

export const roundArg = z.preprocess(
  (val) =>
    val === 'None' || val === 'null' || val === null || val === undefined || val === ''
      ? undefined
      : typeof val === 'string' && /^\d+$/.test(val)
        ? Number(val)
        : val,
  z
    .number()
    .int()
    .min(1)
    .max(60)
    .describe('Round number (tour) in the current cycle. Omit for the current round.'),
);

export const memberArg = z
  .string()
  .min(1)
  .max(80)
  .describe(
    'A member of the active group, by name as shown by list_members. Never a phone number.',
  );

export const idArg = (what: string) =>
  z.string().uuid().describe(`The ${what} id, from a tool result.`);

export const reasonArg = z.string().min(1).max(500).describe('Reason in the member’s own words.');

export const textArg = (max: number, what: string) => z.string().min(1).max(max).describe(what);

export const amountArg = z
  .number()
  .int()
  .min(1)
  .max(100_000_000)
  .describe('Whole FCFA, exactly as the member said it. Never computed by you.');

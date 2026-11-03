// Shared result shapes. Refusals carry a stable `code` (and plain data) so the API and the agent can
// explain them in plain words; they never carry translated text.

/** A refusal with a stable code and optional details. */
export type Refusal<C extends string, D extends object = object> = { ok: false; code: C } & D;

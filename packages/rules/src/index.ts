// @njangi/rules: the pure rules engine (spec Part 3, 2.5). No I/O, no clock, no randomness, integer
// FCFA only. Every function takes `now` when time matters. Refusals are discriminated unions with a
// stable `code` (see result.ts).

export type { Refusal } from './result';

// Money primitives and largest remainder splits (3.3)
export * from './money';

// Hashing and canonical JSON, platform-neutral (2.5, D6)
export * from './crypto';

// Africa/Douala calendar, round dates (R2.2, Q1) and time windows (R11.3, R13.5, R15.3)
export * from './time';

// Rule set parameters and rule changes (3.2, R11.1, R11.6, R11.7)
export * from './ruleset';

// Cycles, the verifiable draw and rotation changes (R1.1, R2, R12.3)
export * from './rotation';

// Contributions and payments (R3)
export * from './contributions';

// Fees (R4)
export * from './fees';

// Payouts, auto-settlement and withdrawals (R5)
export * from './payouts';

// Fines (R6)
export * from './fines';

// Loans (R7)
export * from './loans';

// Bidding (R8)
export * from './bidding';

// General fund distribution (R9)
export * from './funds';

// Solidarity fund (R10)
export * from './solidarity';

// Votes and governance (R11)
export * from './votes';

// Members joining, leaving and removal (R12)
export * from './membership';

// Payment numbers (R13)
export * from './payment-number';

// Reliability score (R14)
export * from './reliability';

// Ledger: accounts, postings, hash chain, balances, invariants, reconciliation, export (2.5, 2.14)
export * from './ledger';

// Official rule texts in French and English for explain_rule (4.9)
export * from './registry';

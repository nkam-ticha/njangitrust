// Starts the API (src/server.ts, unchanged) against the evaluation database only:
//   node ../../node_modules/tsx/dist/cli.mjs --env-file=.env scripts/serve-eval.ts
// The API reads DATABASE_URL; this file points it at EVAL_DATABASE_URL (from apps/api/.env) after
// checking that it is the local njangitrust_eval database. It prints no URL.
export {};
const url = process.env.EVAL_DATABASE_URL;
if (!url) throw new Error('EVAL_DATABASE_URL is required');
const target = new URL(url);
if (!['localhost', '127.0.0.1', '[::1]'].includes(target.hostname)) {
  throw new Error('EVAL_DATABASE_URL must point to a local database');
}
if (target.pathname.replace(/^\//, '') !== 'njangitrust_eval') {
  throw new Error('EVAL_DATABASE_URL must target njangitrust_eval');
}
process.env.DATABASE_URL = url;
process.env.PAYMENT_PROVIDER = 'mock';
await import('../src/server');

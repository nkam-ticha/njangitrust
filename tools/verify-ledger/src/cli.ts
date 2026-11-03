// Entry point: `pnpm verify-ledger <export.json>` from the repository root.

import { readFileSync } from 'node:fs';
import { runVerify } from './verify';

process.exitCode = runVerify(
  process.argv.slice(2),
  { stdout: (t) => process.stdout.write(t), stderr: (t) => process.stderr.write(t) },
  () => readFileSync(0, 'utf8'),
);

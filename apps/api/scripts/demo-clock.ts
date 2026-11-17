// The development demo clock (apps/api/src/lib/clock.ts): move the time every local process sees.
//   tsx scripts/demo-clock.ts show
//   tsx scripts/demo-clock.ts advance 2d | 36h | 90m     (adds to the current offset)
//   tsx scripts/demo-clock.ts to 2026-12-26T18:00:00Z     (sets the offset so that it is then)
//   tsx scripts/demo-clock.ts reset
// Development only: the file is ignored by git and read only when NODE_ENV=development.
import { readFileSync, rmSync, writeFileSync } from 'node:fs';

const file = new URL('../.demo-clock', import.meta.url);
const UNITS: Record<string, number> = { m: 60_000, h: 3_600_000, d: 86_400_000 };

function current(): number {
  try {
    const value = Number(readFileSync(file, 'utf8').trim());
    return Number.isSafeInteger(value) && value >= 0 ? value : 0;
  } catch {
    return 0;
  }
}

function show(): void {
  const offset = current();
  console.log(
    offset === 0
      ? 'Real time (no offset).'
      : `Demo clock: ${new Date(Date.now() + offset).toISOString()} (offset ${Math.round(offset / 3_600_000)} h)`,
  );
}

const [command, value] = process.argv.slice(2);
if (command === 'advance') {
  const match = /^(\d+)([mhd])$/.exec(value ?? '');
  if (!match) throw new Error('Use a number and a unit, for example 2d, 36h or 90m.');
  writeFileSync(file, String(current() + Number(match[1]) * UNITS[match[2]!]!));
} else if (command === 'to') {
  const at = Date.parse(value ?? '');
  if (Number.isNaN(at) || at < Date.now()) throw new Error('Give a date in the future (ISO).');
  writeFileSync(file, String(at - Date.now()));
} else if (command === 'reset') {
  rmSync(file, { force: true });
} else if (command !== 'show') {
  throw new Error('Commands: show, advance <n>m|h|d, to <iso date>, reset.');
}
show();

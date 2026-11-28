// Pure rules for handing a file to the member (no phone module here, so they are tested directly).
import { toDouala } from '@njangi/shared';

export interface DeliverableFile {
  filename: string;
  mime: string;
  content: string;
}

export class FileTooLargeError extends Error {
  constructor() {
    super('FILE_TOO_LARGE');
    this.name = 'FileTooLargeError';
  }
}

/** Characters a phone share can carry: Android's share intent breaks past about 1 MB of text. */
export const SHARE_LIMIT: Record<string, number> = { android: 250_000, ios: 2_000_000 };

export const exceedsShareLimit = (os: string, length: number): boolean =>
  length > (SHARE_LIMIT[os] ?? SHARE_LIMIT.android!);

/** `njangi-registre-2026-11-24.csv`: the day in Cameroon, the format as the extension. */
export function ledgerFilename(format: 'json' | 'csv', now: Date = new Date()): string {
  const d = toDouala(now);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `njangi-registre-${d.year}-${pad(d.month)}-${pad(d.day)}.${format}`;
}

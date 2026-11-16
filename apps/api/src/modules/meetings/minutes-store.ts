// Published minutes (R15.4). The schema keeps one text column for them, so every published version
// is kept there as a JSON list that is only ever appended to; `minutesVersion` and `publishedAt` on
// the meeting always describe the latest one. Each version has a SHA-256 hash over its meeting,
// number, text, reason and time, and that hash is what the ledger EVENT records.
// (If a MeetingMinutesVersion table is added later, only this file changes.)
import { canonicalJSON, sha256Hex } from '@njangi/rules';
import { z } from 'zod';

const versionSchema = z.strictObject({
  version: z.number().int().positive(),
  text: z.string(),
  correctionReason: z.string().nullable(),
  /** ISO 8601 UTC. */
  publishedAt: z.string(),
  publishedByMembershipId: z.string().uuid(),
  hash: z.string().regex(/^[0-9a-f]{64}$/),
});
export type MinutesVersion = z.infer<typeof versionSchema>;

const storeSchema = z.strictObject({ versions: z.array(versionSchema) });

/** R15.4: the hash of one version, over everything a reader sees of it. */
export function minutesHash(input: {
  meetingId: string;
  version: number;
  text: string;
  correctionReason: string | null;
  publishedAt: string;
}): string {
  return sha256Hex(canonicalJSON(input));
}

/** The versions in the column, oldest first; an empty list before the first publication. */
export function readVersions(stored: string | null): MinutesVersion[] {
  if (!stored) return [];
  return storeSchema.parse(JSON.parse(stored)).versions;
}

/** The column's new value with `next` appended. Versions must be consecutive from 1. */
export function appendVersion(stored: string | null, next: MinutesVersion): string {
  const versions = readVersions(stored);
  if (next.version !== versions.length + 1) {
    throw new RangeError(`minutes version ${next.version} does not follow ${versions.length}`);
  }
  return JSON.stringify({ versions: [...versions, versionSchema.parse(next)] });
}

/** True when a version's recorded hash matches its content (a published text was not altered). */
export function versionIsIntact(meetingId: string, v: MinutesVersion): boolean {
  return (
    v.hash ===
    minutesHash({
      meetingId,
      version: v.version,
      text: v.text,
      correctionReason: v.correctionReason,
      publishedAt: v.publishedAt,
    })
  );
}

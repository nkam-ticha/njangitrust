/** Instants leave the API as ISO 8601 UTC strings; the app shows them in Douala time. */
export function iso(date: Date): string {
  return date.toISOString();
}

export function isoOrNull(date: Date | null | undefined): string | null {
  return date ? date.toISOString() : null;
}

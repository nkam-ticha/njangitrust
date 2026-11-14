// When a notification is pushed (spec 1.8, 2.13, FSD NOT-03). The in-app notification is always
// written; only the push obeys categories and quiet hours. SECURITY always gets through.
import { toDoualaLocal } from '@njangi/rules';

export interface DeliveryPrefs {
  mutedCategories: readonly string[];
  /** Minutes after midnight, Africa/Douala. */
  quietStartMinute: number;
  quietEndMinute: number;
}

/** Whether `minute` falls in [start, end), wrapping past midnight; start == end means none. */
export function inQuietHours(minute: number, start: number, end: number): boolean {
  if (start === end) return false;
  return start < end ? minute >= start && minute < end : minute >= start || minute < end;
}

export function shouldPush(input: { category: string; prefs: DeliveryPrefs; now: Date }): boolean {
  if (input.category === 'SECURITY') return true;
  if (input.prefs.mutedCategories.includes(input.category)) return false;
  const local = toDoualaLocal(input.now);
  return !inQuietHours(
    local.hour * 60 + local.minute,
    input.prefs.quietStartMinute,
    input.prefs.quietEndMinute,
  );
}

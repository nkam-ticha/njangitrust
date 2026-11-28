// The notification settings as plain data (spec 1.8): which categories are muted, the quiet hours,
// which group chats are muted. Pure helpers; the screen and the hook call them.
import type {
  NotificationCategory,
  NotificationPrefsDto,
} from '@njangi/shared/contracts/notifications';

export type MutableCategory = Exclude<NotificationCategory, 'SECURITY'>;

/** The categories a member can turn off, in the order of spec 1.8. Security is never in it. */
export const MUTABLE_CATEGORIES: readonly MutableCategory[] = [
  'REMINDERS',
  'MONEY',
  'VOTES',
  'GROUP',
];

/** Spec 1.8: quiet hours 21:00 to 07:00 (Douala) unless the member changes them. */
export const DEFAULT_QUIET_HOURS = { from: '21:00', to: '07:00' } as const;

/** The server reads from == to as "no quiet hours" (delivery-rules). */
export const NO_QUIET_HOURS = { from: '00:00', to: '00:00' } as const;

export const quietHoursOn = (quiet: NotificationPrefsDto['quietHours']): boolean =>
  quiet.from !== quiet.to;

/** Turning a category on removes it from the muted list; Security can never be muted. */
export function withCategory(
  muted: readonly MutableCategory[],
  category: NotificationCategory,
  on: boolean,
): MutableCategory[] {
  if (category === 'SECURITY') return [...muted];
  const rest = muted.filter((c) => c !== category);
  return on ? rest : [...rest, category];
}

/** Muting a group's chat adds it to the list; unmuting removes it. Never twice. */
export function withMutedGroup(ids: readonly string[], groupId: string, muted: boolean): string[] {
  const rest = ids.filter((id) => id !== groupId);
  return muted ? [...rest, groupId] : rest;
}

/** The first time a member picks a time after the quiet hours were off: a sensible pair to start from. */
export function quietHoursAfterToggle(
  current: NotificationPrefsDto['quietHours'],
  on: boolean,
): NotificationPrefsDto['quietHours'] {
  if (!on) return { ...NO_QUIET_HOURS };
  return quietHoursOn(current) ? current : { ...DEFAULT_QUIET_HOURS };
}

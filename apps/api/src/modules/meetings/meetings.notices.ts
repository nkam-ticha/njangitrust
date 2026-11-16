// Notifications and chat lines of meetings (spec 2.13, NOT-02: "meetings"). The in-app notification is
// written with the change; the push follows after the commit. They carry a date, a place and a group
// name, never a phone number, and open the meeting screen.
import { formatDateTime, type Bilingual } from '@njangi/shared';
import type { NotificationCategory } from '@njangi/shared/contracts/notifications';
import { createNotifications } from '../notifications';
import type { Scope } from '../chat';
import { meetingLink, participantsOf } from './meetings.load';

/** A date in both languages, in Douala time, for a text parameter. */
export function dateParam(at: Date): Bilingual {
  return { fr: formatDateTime(at, 'fr'), en: formatDateTime(at, 'en') };
}

export async function notifyParticipants(
  s: Scope,
  input: {
    groupId: string;
    meetingId: string;
    category: NotificationCategory;
    title: Bilingual;
    body: Bilingual;
    /** The member who did it is not told about their own action. */
    exceptMembershipId?: string;
  },
): Promise<void> {
  const members = await participantsOf(s.db, input.groupId);
  await createNotifications(
    members
      .filter((m) => m.id !== input.exceptMembershipId)
      .map((m) => ({
        userId: m.userId,
        groupId: input.groupId,
        category: input.category,
        title: input.title,
        body: input.body,
        deepLink: meetingLink(input.groupId, input.meetingId),
      })),
    s.effects,
    s.db,
  );
}

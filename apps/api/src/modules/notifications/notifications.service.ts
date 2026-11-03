// Notifications (spec 1.8, 2.13): the in-app notification is always written first; realtime (and,
// from Phase 7, push with categories and quiet hours) follows once it is committed.
import type { Bilingual } from '@njangi/shared';
import type { NotificationCategory } from '@njangi/shared/contracts/notifications';
import { AfterCommit, type EffectSink } from '../../lib/after-commit';
import { getPrisma, type Db } from '../../lib/prisma';
import { toNotification } from '../../dto';
import { emitToUser } from '../../realtime/emitter';

export interface NotificationInput {
  userId: string;
  groupId?: string | null;
  category: NotificationCategory;
  title: Bilingual;
  body: Bilingual;
  /** App route; never personal data. */
  deepLink?: string | null;
}

/**
 * Writes the notifications with `db` (a transaction when called inside one) and schedules their
 * delivery on `effects`, which the caller runs after the commit.
 */
export async function createNotifications(
  inputs: readonly NotificationInput[],
  effects: EffectSink,
  db: Db = getPrisma(),
): Promise<void> {
  for (const input of inputs) {
    const row = await db.notification.create({
      data: {
        userId: input.userId,
        groupId: input.groupId ?? null,
        category: input.category,
        titleFr: input.title.fr,
        titleEn: input.title.en,
        bodyFr: input.body.fr,
        bodyEn: input.body.en,
        deepLink: input.deepLink ?? null,
      },
    });
    effects.add(() => emitToUser(row.userId, 'notification.created', toNotification(row)));
  }
}

/** Outside a transaction: write and deliver at once. */
export async function notify(inputs: readonly NotificationInput[]): Promise<void> {
  const effects = new AfterCommit();
  await createNotifications(inputs, effects);
  await effects.run();
}

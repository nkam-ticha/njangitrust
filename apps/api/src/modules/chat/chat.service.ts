// Group chat: system events written by the server in both languages (spec 1.5). Member messages,
// media, mentions, unread state and the admin tools are in chat.messages.ts and chat.read.ts.
import type { Bilingual } from '@njangi/shared';
import type { EffectSink } from '../../lib/after-commit';
import { getPrisma, type Db } from '../../lib/prisma';
import { toChatMessage } from '../../dto/chat';
import { emitToGroup } from '../../realtime/emitter';

/** Writes a SYSTEM message ("Paul a rejoint le groupe.") and announces it after the commit. */
export async function postSystemMessage(
  groupId: string,
  text: Bilingual,
  effects: EffectSink,
  db: Db = getPrisma(),
): Promise<void> {
  const row = await db.message.create({
    data: { groupId, kind: 'SYSTEM', systemText: { fr: text.fr, en: text.en } },
  });
  const message = toChatMessage({ ...row, author: null, attachment: null, replyTo: null });
  effects.add(() => emitToGroup(groupId, 'message.created', message));
}

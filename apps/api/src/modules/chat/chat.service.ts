// Group chat, Phase 0 part: system events written by the server in both languages (spec 1.5).
// Member messages, media and @njangi arrive in Phase 7.
import type { Bilingual } from '@njangi/shared';
import type { EffectSink } from '../../lib/after-commit';
import { getPrisma, type Db } from '../../lib/prisma';
import { toMessage } from '../../dto';
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
  effects.add(() => emitToGroup(groupId, 'message.created', toMessage({ ...row, author: null })));
}

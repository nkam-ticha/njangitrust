// PendingAction handlers of the chat (spec 4.5): CHAT_POST (L1, the agent's `post_to_group`),
// CHAT_ANNOUNCE (L1, admin) and CHAT_HIDE (L1, admin). A member typing in the app posts directly: that
// tap is the confirmation. The agent can only propose a post, which the member confirms on a card.
import { MESSAGE_MAX_CHARS } from '@njangi/shared/contracts/chat-messages';
import { textSchema } from '@njangi/shared/contracts/common';
import { chatTexts as t } from '@njangi/shared/i18n/server/chat';
import { z } from 'zod';
import type { Db } from '../../lib/prisma';
import { getPrisma } from '../../lib/prisma';
import { bilingual, ui } from '../../lib/texts';
import { authorizeGroup, type AuthActor } from '../../permissions';
import { createPendingAction, defineActionHandler, type ActionOrigin } from '../pending-actions';
import { chatError } from './chat.errors';
import { hideMessage, postAnnouncement, sendMessage } from './chat.messages';

const postArgs = z.strictObject({
  groupId: z.string().uuid(),
  text: textSchema(MESSAGE_MAX_CHARS),
  replyToId: z.string().uuid().nullable(),
});

const announceArgs = z.strictObject({ groupId: z.string().uuid(), text: textSchema(1000) });

const hideArgs = z.strictObject({ messageId: z.string().uuid(), reason: textSchema(200) });

/** "Message : <text>" in both languages, from the designer's label. */
function textLine(text: string) {
  const label = ui((c) => c.confirmation.lines.message);
  return { fr: `${label.fr} : ${text}`, en: `${label.en} : ${text}` };
}

export const chatPostHandler = defineActionHandler({
  type: 'CHAT_POST',
  level: 'L1',
  args: postArgs,

  async prepare(ctx, a) {
    await authorizeGroup(ctx.userId, a.groupId, 'group.chat.post', ctx.db);
    return {
      title: ui((c) => c.confirmation.actions.postToGroup.title),
      lines: [],
      total: null,
      notes: [textLine(a.text), bilingual(t.postNote)],
      confirmLabel: ui((c) => c.confirmation.actions.postToGroup.button),
    };
  },

  async execute(ctx, a) {
    const { message } = await sendMessage(
      ctx.userId,
      a.groupId,
      { text: a.text, ...(a.replyToId ? { replyToId: a.replyToId } : {}) },
      { db: ctx.db, effects: ctx.effects },
    );
    return { outcome: 'done', resultRef: message.id, summary: bilingual(t.postedSummary) };
  },
});

export const chatAnnounceHandler = defineActionHandler({
  type: 'CHAT_ANNOUNCE',
  level: 'L1',
  args: announceArgs,

  async prepare(ctx, a) {
    await authorizeGroup(ctx.userId, a.groupId, 'group.announcements.post', ctx.db);
    return {
      title: ui((c) => c.confirmation.actions.postAnnouncement.title),
      lines: [],
      total: null,
      notes: [textLine(a.text), bilingual(t.announcementNote)],
      confirmLabel: ui((c) => c.confirmation.actions.postAnnouncement.button),
    };
  },

  async execute(ctx, a) {
    const message = await postAnnouncement(ctx.userId, a.groupId, a.text, {
      db: ctx.db,
      effects: ctx.effects,
    });
    return { outcome: 'done', resultRef: message.id, summary: bilingual(t.announcedSummary) };
  },
});

/** The checks `hideMessage` makes, without changing anything (a card must refuse early). */
async function checkHideable(db: Db, userId: string, messageId: string): Promise<void> {
  const message = await db.message.findUnique({
    where: { id: messageId },
    select: { groupId: true, authorMembershipId: true, deletedAt: true, hiddenByAdminAt: true },
  });
  if (!message) throw chatError('MESSAGE_NOT_FOUND');
  await authorizeGroup(userId, message.groupId, 'group.chat.hide', db);
  if (message.authorMembershipId === null) throw chatError('MESSAGE_NOT_HIDEABLE');
  if (message.deletedAt || message.hiddenByAdminAt) throw chatError('MESSAGE_ALREADY_REMOVED');
}

export const chatHideHandler = defineActionHandler({
  type: 'CHAT_HIDE',
  level: 'L1',
  args: hideArgs,

  async prepare(ctx, a) {
    await checkHideable(ctx.db, ctx.userId, a.messageId);
    return {
      title: ui((c) => c.confirmation.actions.hideMessage.title),
      lines: [],
      total: null,
      notes: [bilingual(t.hideNote)],
      confirmLabel: ui((c) => c.confirmation.actions.hideMessage.button),
    };
  },

  async execute(ctx, a) {
    await hideMessage(ctx.userId, a.messageId, a.reason, { db: ctx.db, effects: ctx.effects });
    return {
      outcome: 'done',
      resultRef: a.messageId,
      summary: ui((c) => c.confirmation.actions.hideMessage.done),
    };
  },
});

/** The agent's `post_to_group`: a card the member confirms. */
export function requestPost(
  actor: AuthActor,
  groupId: string,
  input: { text: string; replyToId?: string | null },
  origin: ActionOrigin = 'AGENT',
) {
  return createPendingAction({
    userId: actor.userId,
    groupId,
    lang: actor.lang,
    origin,
    type: 'CHAT_POST',
    args: { groupId, text: input.text, replyToId: input.replyToId ?? null },
  });
}

/** R1.2: the admin's announcement, as a card. */
export function requestAnnouncement(
  actor: AuthActor,
  groupId: string,
  text: string,
  origin: ActionOrigin = 'UI',
) {
  return createPendingAction({
    userId: actor.userId,
    groupId,
    lang: actor.lang,
    origin,
    type: 'CHAT_ANNOUNCE',
    args: { groupId, text },
  });
}

/** CHT-02: the admin hides a message, as a card. The group is read from the message. */
export async function requestHide(
  actor: AuthActor,
  messageId: string,
  reason: string,
  origin: ActionOrigin = 'UI',
) {
  const message = await getPrisma().message.findUnique({
    where: { id: messageId },
    select: { groupId: true },
  });
  if (!message) throw chatError('MESSAGE_NOT_FOUND');
  return createPendingAction({
    userId: actor.userId,
    groupId: message.groupId,
    lang: actor.lang,
    origin,
    type: 'CHAT_HIDE',
    args: { messageId, reason },
  });
}

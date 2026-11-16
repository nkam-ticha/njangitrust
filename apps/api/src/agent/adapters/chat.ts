// The agent's chat port (agent/ports.ts) on the chat module's services. Every call acts as the
// member in `ctx`; the services check the permissions themselves. What goes back is short and
// already worded: names, text, a time in Douala, never an id the model has no use for.
import { formatDateTime, type Lang } from '@njangi/shared';
import { getPrisma } from '../../lib/prisma';
import {
  listMessages,
  markChatRead,
  postAgentMessage,
  requestAnnouncement,
  requestHide,
  requestPost,
  summarizeUnread,
  type UnreadSummary,
} from '../../modules/chat';
import type { AgentChatPort } from '../ports';
import type { AgentCtx } from '../types';

const SEARCH_PAGES = 4;
const SEARCH_PAGE_SIZE = 100;
const SEARCH_RESULTS = 20;

const MEDIA = {
  fr: {
    images: ['photo', 'photos'],
    videos: ['vidéo', 'vidéos'],
    voiceNotes: ['note vocale', 'notes vocales'],
    documents: ['document', 'documents'],
    and: ' et ',
    of: 'de',
  },
  en: {
    images: ['photo', 'photos'],
    videos: ['video', 'videos'],
    voiceNotes: ['voice note', 'voice notes'],
    documents: ['document', 'documents'],
    and: ' and ',
    of: 'from',
  },
} as const;

/** "3 photos et 2 notes vocales de Paul" (spec 4.9). */
export function mediaLine(sender: UnreadSummary['mediaBySender'][number], lang: Lang): string {
  const words = MEDIA[lang];
  const parts = (['images', 'videos', 'voiceNotes', 'documents'] as const).flatMap((kind) => {
    const count = sender[kind];
    return count > 0 ? [`${count} ${words[kind][count === 1 ? 0 : 1]}`] : [];
  });
  const list =
    parts.length > 1
      ? `${parts.slice(0, -1).join(', ')}${words.and}${parts.at(-1)}`
      : (parts[0] ?? '');
  return `${list} ${words.of} ${sender.name}`;
}

const fold = (text: string) => text.normalize('NFD').replace(/\p{M}/gu, '').toLowerCase();

function groupOf(ctx: AgentCtx): string {
  // Tools check the active group before calling the port (needGroup).
  if (!ctx.groupId) throw new Error('chat port called without an active group');
  return ctx.groupId;
}

export const chatAdapter: AgentChatPort = {
  async unread(ctx) {
    const unread = await summarizeUnread(ctx.userId, groupOf(ctx));
    return {
      messages: unread.messages.map((m) => ({
        author: m.author?.name ?? 'Njangi',
        kind: m.kind === 'AGENT' ? 'TEXT' : m.kind,
        text: m.text,
        at: formatDateTime(m.at, ctx.lang),
      })),
      moreCount: Math.max(0, unread.total - unread.messages.length),
      events: unread.events.map((e) => e.text[ctx.lang]),
      media: unread.mediaBySender.map((sender) => mediaLine(sender, ctx.lang)),
    };
  },

  async markRead(ctx) {
    await markChatRead(ctx.userId, groupOf(ctx));
  },

  /** The most recent messages (up to 400) whose text contains the words searched. */
  async search(ctx, input) {
    const groupId = groupOf(ctx);
    const wanted = fold(input.query);
    const found: { author: string; text: string; at: string }[] = [];
    let before: string | undefined;
    let searched = 0;
    for (let page = 0; page < SEARCH_PAGES && found.length < SEARCH_RESULTS; page += 1) {
      const { messages, nextBefore } = await listMessages(ctx.userId, groupId, {
        limit: SEARCH_PAGE_SIZE,
        ...(before ? { before } : {}),
      });
      searched += messages.length;
      for (const m of messages) {
        const day = m.createdAt.slice(0, 10);
        if (!m.text || !fold(m.text).includes(wanted)) continue;
        if ((input.from && day < input.from) || (input.to && day > input.to)) continue;
        found.push({
          author: m.author?.name ?? 'Njangi',
          text: m.text,
          at: formatDateTime(m.createdAt, ctx.lang),
        });
        if (found.length === SEARCH_RESULTS) break;
      }
      if (!nextBefore) break;
      before = nextBefore;
    }
    return { messages: found, searchedMessages: searched };
  },

  preparePost: (ctx, input) => requestPost(ctx.actor, groupOf(ctx), { text: input.text }, 'AGENT'),

  prepareAnnouncement: (ctx, input) =>
    requestAnnouncement(ctx.actor, groupOf(ctx), input.text, 'AGENT'),

  prepareHide: (ctx, input) => requestHide(ctx.actor, input.messageId, input.reason, 'AGENT'),

  /** The text of the member's own message, still visible, in that group; anything else is null. */
  async mentionText({ groupId, messageId, userId }) {
    const message = await getPrisma().message.findFirst({
      where: { id: messageId, groupId, author: { userId }, deletedAt: null, hiddenByAdminAt: null },
      select: { text: true },
    });
    return message?.text ?? null;
  },

  async postAgentReply({ groupId, text }) {
    await postAgentMessage(groupId, text);
  },
};

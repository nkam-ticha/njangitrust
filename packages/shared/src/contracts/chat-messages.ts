// Group chat, Phase 7 (spec 1.5, 2.7 Chat, 2.12, 4.4): member messages with media, replies and
// mentions, unread counts and read markers, the chat mute and announcements. `chatMessageSchema`
// extends the Phase 0 `messageSchema` (contracts/chat.ts), which only carried system events.
import { z } from 'zod';
import { instantSchema, textSchema, uuidSchema } from './common';
import { messageSchema } from './chat';
import { attachmentSchema } from './media';

/** A message is 2000 characters at most (a chat message, not a document). */
export const MESSAGE_MAX_CHARS = 2000;
export const MAX_MENTIONS = 20;
export const MESSAGE_PAGE_SIZE = 50;

/** The message a reply points at, reduced to what the quote needs. */
export const replyRefSchema = z.strictObject({
  id: uuidSchema,
  kind: messageSchema.shape.kind,
  author: messageSchema.shape.author,
  /** The first 80 characters of its text; null when it has none or was removed. */
  preview: z.string().nullable(),
});
export type ReplyRefDto = z.infer<typeof replyRefSchema>;

export const chatMessageSchema = messageSchema.extend({
  attachment: attachmentSchema.nullable(),
  replyTo: replyRefSchema.nullable(),
  /** Mentioned memberships (`@Carine`); the agent mention `@njangi` is not listed here. */
  mentions: z.array(uuidSchema),
  /** R1.2: pinned by the admin. */
  isAnnouncement: z.boolean(),
  /** CHT-02: removed by its author or hidden by the admin; its text and file are not served. */
  removed: z.enum(['DELETED', 'HIDDEN']).nullable(),
});
export type ChatMessageDto = z.infer<typeof chatMessageSchema>;

/**
 * POST /groups/:id/messages. `id` is made by the phone for each message, so a message queued
 * offline and sent twice is stored once (spec 1.7). A message needs text, a file, or both (a caption).
 */
export const sendMessageRequestSchema = z
  .strictObject({
    id: uuidSchema.optional(),
    text: textSchema(MESSAGE_MAX_CHARS).optional(),
    attachmentId: uuidSchema.optional(),
    replyToId: uuidSchema.optional(),
    mentions: z.array(uuidSchema).max(MAX_MENTIONS).optional(),
  })
  .refine((m) => m.text !== undefined || m.attachmentId !== undefined, 'EMPTY_MESSAGE');
export type SendMessageRequest = z.infer<typeof sendMessageRequestSchema>;

/** POST /groups/:id/messages answers with the stored message. */
export const messageResponseSchema = z.strictObject({ message: chatMessageSchema });

/** GET /groups/:id/messages: newest first; `before` is the id of the oldest message already shown. */
export const messageListQuerySchema = z.strictObject({
  before: uuidSchema.optional(),
  limit: z.coerce.number().int().min(1).max(100).optional(),
  /** Only the pinned announcements. */
  pinned: z.enum(['true', 'false']).optional(),
});

export type MessageListQuery = z.infer<typeof messageListQuerySchema>;

export const messageListSchema = z.strictObject({
  messages: z.array(chatMessageSchema),
  nextBefore: uuidSchema.nullable(),
});

/** POST /groups/:id/read-marker: everything up to now (or up to `upTo`) is read. */
export const readMarkerRequestSchema = z.strictObject({ upTo: instantSchema.optional() });

export const chatStateSchema = z.strictObject({
  groupId: uuidSchema,
  /** Messages from others since the member last read, system events included. */
  unread: z.number().int().nonnegative(),
  /** Of those, how many mention the member. */
  mentions: z.number().int().nonnegative(),
  lastReadAt: instantSchema.nullable(),
  /** The member muted this chat: no push for new messages (mentions still push). */
  muted: z.boolean(),
});
export type ChatStateDto = z.infer<typeof chatStateSchema>;

export const chatUnreadAllSchema = z.strictObject({ groups: z.array(chatStateSchema) });

export const muteChatRequestSchema = z.strictObject({ muted: z.boolean() });

export const announcementRequestSchema = z.strictObject({ text: textSchema(1000) });

export const hideMessageRequestSchema = z.strictObject({ reason: textSchema(200) });

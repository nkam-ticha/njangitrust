// Chat mappers (spec 2.11, 2.12): an allowlist of fields per message and per file. A removed message
// (deleted by its author, hidden by the admin) leaves with no text and no file; a file never leaves
// with a storage key or a URL (URLs are issued on demand and expire).
import { bilingualSchema } from '@njangi/shared/contracts/common';
import type { AttachmentDto, AttachmentKind } from '@njangi/shared/contracts/media';
import type { ChatMessageDto, ReplyRefDto } from '@njangi/shared/contracts/chat-messages';
import { iso } from './time';

export interface AttachmentSource {
  id: string;
  kind: AttachmentKind;
  mime: string;
  sizeBytes: number;
  durationSec: number | null;
  width: number | null;
  height: number | null;
  thumbnailKey: string | null;
}

export function toAttachment(a: AttachmentSource): AttachmentDto {
  return {
    id: a.id,
    kind: a.kind,
    mime: a.mime,
    sizeBytes: a.sizeBytes,
    durationSec: a.durationSec,
    width: a.width,
    height: a.height,
    hasThumbnail: a.thumbnailKey !== null,
  };
}

interface AuthorSource {
  id: string;
  user: { name: string };
}

export interface ChatMessageSource {
  id: string;
  groupId: string;
  kind: ChatMessageDto['kind'];
  text: string | null;
  systemText: unknown;
  deletedAt: Date | null;
  hiddenByAdminAt: Date | null;
  createdAt: Date;
  isAnnouncement: boolean;
  mentions: string[];
  author: AuthorSource | null;
  attachment: AttachmentSource | null;
  replyTo: {
    id: string;
    kind: ChatMessageDto['kind'];
    text: string | null;
    deletedAt: Date | null;
    hiddenByAdminAt: Date | null;
    author: AuthorSource | null;
  } | null;
}

const PREVIEW_CHARS = 80;

const author = (a: AuthorSource | null) => (a ? { membershipId: a.id, name: a.user.name } : null);

const removal = (m: { deletedAt: Date | null; hiddenByAdminAt: Date | null }) =>
  m.deletedAt !== null
    ? ('DELETED' as const)
    : m.hiddenByAdminAt !== null
      ? ('HIDDEN' as const)
      : null;

function toReplyRef(r: NonNullable<ChatMessageSource['replyTo']>): ReplyRefDto {
  const removed = removal(r) !== null;
  return {
    id: r.id,
    kind: r.kind,
    author: author(r.author),
    preview: removed || !r.text ? null : Array.from(r.text).slice(0, PREVIEW_CHARS).join(''),
  };
}

export function toChatMessage(m: ChatMessageSource): ChatMessageDto {
  const removed = removal(m);
  const system = bilingualSchema.safeParse(m.systemText);
  return {
    id: m.id,
    groupId: m.groupId,
    kind: m.kind,
    text: removed ? null : m.text,
    systemText: system.success ? system.data : null,
    author: author(m.author),
    createdAt: iso(m.createdAt),
    attachment: removed || !m.attachment ? null : toAttachment(m.attachment),
    replyTo: m.replyTo ? toReplyRef(m.replyTo) : null,
    mentions: m.mentions,
    isAnnouncement: m.isAnnouncement,
    removed,
  };
}

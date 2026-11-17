// Sending and reading chat files (spec 2.12, D9). A file goes from the phone straight to object
// storage: ask for an upload slot, PUT the bytes, ask the server to check and register it, then send
// a message that carries it. Files are read back through signed URLs that expire after 5 minutes.
import { useMutation, useQuery, useQueryClient, type QueryClient } from '@tanstack/react-query';
import {
  attachmentAccessSchema,
  completeUploadResponseSchema,
  uploadTicketResponseSchema,
  type AttachmentDto,
  type AttachmentKind,
} from '@njangi/shared/contracts/media';
import { messageResponseSchema } from '@njangi/shared/contracts/chat-messages';
import { api } from '@/api/client';
import { insertMessage, newMessageId } from './useChat';

/** A file chosen by the member: where it is, what it is, and what the phone knows about it. */
export interface PickedFile {
  uri: string;
  kind: AttachmentKind;
  /** The type declared to the server; the real one is read from the bytes afterwards. */
  mime: string;
  /** Seconds, for video and voice notes. */
  durationSec?: number;
  width?: number;
  height?: number;
  /** A short text sent with the file. */
  caption?: string;
}

const positive = (n: number | undefined) => (n && n > 0 ? Math.round(n) : undefined);

/** Uploads one file and returns the registered attachment. Never retried: a retry makes a new slot. */
export async function uploadFile(groupId: string, file: PickedFile): Promise<AttachmentDto> {
  const blob = await (await fetch(file.uri)).blob();
  const durationSec = positive(file.durationSec);
  const width = positive(file.width);
  const height = positive(file.height);
  const ticket = await api.post(
    `/v1/groups/${groupId}/attachments`,
    {
      kind: file.kind,
      mime: file.mime,
      sizeBytes: blob.size,
      ...(durationSec ? { durationSec } : {}),
      ...(width ? { width } : {}),
      ...(height ? { height } : {}),
    },
    { schema: uploadTicketResponseSchema },
  );
  const put = await fetch(ticket.upload.url, {
    method: ticket.upload.method,
    headers: ticket.upload.headers,
    body: blob,
  });
  if (!put.ok) throw new Error('UPLOAD_FAILED');
  const done = await api.post(
    `/v1/groups/${groupId}/attachments/${ticket.ticketId}/complete`,
    {
      ...(durationSec ? { durationSec } : {}),
      ...(width ? { width } : {}),
      ...(height ? { height } : {}),
    },
    { schema: completeUploadResponseSchema },
  );
  return done.attachment;
}

/** Uploads a file, then posts the message that carries it. The phone makes the message id. */
export function useSendFile(groupId: string | null) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (file: PickedFile) => {
      const attachment = await uploadFile(groupId!, file);
      const res = await api.post(
        `/v1/groups/${groupId}/messages`,
        {
          id: newMessageId(),
          attachmentId: attachment.id,
          ...(file.caption ? { text: file.caption } : {}),
        },
        { schema: messageResponseSchema },
      );
      return res.message;
    },
    onSuccess: (message) => insertMessage(qc, groupId, message),
  });
}

export const attachmentKey = (attachmentId: string) => ['attachment', attachmentId] as const;

const loadAccess = (attachmentId: string) =>
  api.get(`/v1/attachments/${attachmentId}`, { schema: attachmentAccessSchema });

/** The signed URLs of a file, asked for now (a tap on a document opens it as soon as they arrive). */
export function fetchAttachmentAccess(qc: QueryClient, attachmentId: string) {
  return qc.fetchQuery({
    queryKey: attachmentKey(attachmentId),
    staleTime: 4 * 60_000,
    queryFn: () => loadAccess(attachmentId),
  });
}

/** The signed URLs of a file; they last 5 minutes, so they are never kept longer than 4. */
export function useAttachmentAccess(attachmentId: string, enabled: boolean) {
  return useQuery({
    queryKey: attachmentKey(attachmentId),
    enabled,
    staleTime: 4 * 60_000,
    gcTime: 4 * 60_000,
    queryFn: () => loadAccess(attachmentId),
  });
}

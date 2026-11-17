// The file of a chat message: a photo, a video, a PDF or a voice note (spec 1.5, 2.12; DD-23).
// Nothing downloads until the member taps: the signed URLs are asked for on tap and last 5 minutes.
import { useEffect, useState } from 'react';
import { Linking } from 'react-native';
import { useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { useAudioPlayer, useAudioPlayerStatus } from 'expo-audio';
import type { AttachmentDto } from '@njangi/shared/contracts/media';
import { DocumentAttachment, VisualMedia, VoiceNote, useLang, type VoiceSpeed } from '@/ui';
import { fetchAttachmentAccess, useAttachmentAccess } from '@/features/chat/useAttachments';
import { clockLabel, formatBytes } from '@/features/chat/media';

interface ChatAttachmentProps {
  attachment: AttachmentDto;
  /** The sender's name, or null for the member's own file. */
  from: string | null;
}

export function ChatAttachment({ attachment, from }: ChatAttachmentProps) {
  if (attachment.kind === 'VOICE') return <ChatVoice attachment={attachment} from={from} />;
  if (attachment.kind === 'DOCUMENT') return <ChatDocument attachment={attachment} />;
  return <ChatVisual attachment={attachment} from={from} />;
}

function ChatVisual({ attachment, from }: { attachment: AttachmentDto; from: string | null }) {
  const lang = useLang();
  const [wanted, setWanted] = useState(false);
  const access = useAttachmentAccess(attachment.id, wanted);
  const image = attachment.kind === 'IMAGE';
  const url = access.data?.url ?? null;
  const state = access.isError ? 'failed' : access.isPending && wanted ? 'downloading' : 'ready';
  return (
    <VisualMedia
      kind={image ? 'image' : 'video'}
      source={image ? url : null}
      width={attachment.width ?? 240}
      height={attachment.height ?? 180}
      state={wanted ? state : 'notDownloaded'}
      sizeLabel={formatBytes(attachment.sizeBytes, lang)}
      durationLabel={attachment.durationSec ? clockLabel(attachment.durationSec) : undefined}
      from={from ?? ''}
      onPress={() => {
        if (access.isError) void access.refetch();
        else if (!wanted) setWanted(true);
        else if (url) void Linking.openURL(url);
      }}
    />
  );
}

function ChatDocument({ attachment }: { attachment: AttachmentDto }) {
  const { t } = useTranslation();
  const lang = useLang();
  const qc = useQueryClient();
  return (
    <DocumentAttachment
      fileName={t('chat.media.document')}
      sizeLabel={formatBytes(attachment.sizeBytes, lang)}
      // The signed link is asked for on the tap and opens as soon as it arrives.
      onOpen={() => {
        fetchAttachmentAccess(qc, attachment.id)
          .then((access) => Linking.openURL(access.url))
          .catch(() => undefined);
      }}
    />
  );
}

function ChatVoice({ attachment, from }: { attachment: AttachmentDto; from: string | null }) {
  const [wanted, setWanted] = useState(false);
  const [speed, setSpeed] = useState<VoiceSpeed>(1);
  const access = useAttachmentAccess(attachment.id, wanted);
  const player = useAudioPlayer(access.data?.url ?? null);
  const status = useAudioPlayerStatus(player);
  // The first tap fetches the file; it starts playing once the signed URL is in.
  const url = access.data?.url ?? null;
  useEffect(() => {
    if (wanted && url) player.play();
  }, [wanted, url, player]);
  useEffect(() => {
    player.setPlaybackRate(speed);
  }, [player, speed]);
  // Back to the start when it ends, ready to play again.
  useEffect(() => {
    if (status.didJustFinish) void player.seekTo(0);
  }, [status.didJustFinish, player]);
  return (
    <VoiceNote
      playing={status.playing}
      position={status.currentTime}
      duration={attachment.durationSec ?? status.duration}
      speed={speed}
      from={from}
      onToggle={() => {
        if (!wanted) setWanted(true);
        else if (status.playing) player.pause();
        else player.play();
      }}
      onSpeed={setSpeed}
    />
  );
}

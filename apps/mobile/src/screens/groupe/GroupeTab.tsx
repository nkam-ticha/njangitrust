// Groupe tab (SCREENS.md S-11; spec 1.5, 2.7 Chat, CHT-01..02): the group's chat, newest at the bottom.
// Messages page back in time; system events (payments, votes, rules, meetings) are compact rows; removed
// messages keep a placeholder. The unread line is captured before the read marker is sent.
import { useEffect, useState } from 'react';
import { FlatList, Platform, StyleSheet, View } from 'react-native';
import * as DocumentPicker from 'expo-document-picker';
import * as ImagePicker from 'expo-image-picker';
import { useTranslation } from 'react-i18next';
import {
  Camera,
  CircleAlert,
  FileText,
  Image as ImageIcon,
  Info,
  MessagesSquare,
  Video,
} from 'lucide-react-native';
import { formatClock, formatDateShort, pick } from '@njangi/shared';
import type { ChatMessageDto } from '@njangi/shared/contracts/chat-messages';
import { space, useTheme } from '@/theme';
import {
  BottomSheet,
  Button,
  Composer,
  DateSeparator,
  EmptyState,
  GroupedList,
  ListRow,
  MessageBubble,
  RecordingBar,
  SkeletonRows,
  SystemEvent,
  Txt,
  UnreadDivider,
  useLang,
} from '@/ui';
import { ApiError } from '@/api/client';
import { useConnectivity } from '@/state/connectivity';
import { useActiveGroup } from '@/features/groups/useGroups';
import {
  useChatRealtime,
  useChatState,
  useDeleteMessage,
  useMarkRead,
  useMessages,
  useSendMessage,
} from '@/features/chat/useChat';
import { errorMessage } from '@/features/errors/errorMessage';
import { useSendFile, type PickedFile } from '@/features/chat/useAttachments';
import { useVoiceRecorder } from '@/features/chat/useVoiceRecorder';
import { baseMime, kindForMime } from '@/features/chat/media';
import { ChatAttachment } from './ChatAttachment';
import { TabScreen } from '../shell/TabScreen';

type Row =
  | { kind: 'message'; key: string; message: ChatMessageDto; firstOfRun: boolean; own: boolean }
  | { kind: 'system'; key: string; message: ChatMessageDto }
  | { kind: 'date'; key: string; label: string }
  | { kind: 'unread'; key: string; count: number };

/** Newest first in, rows out (the list is inverted: index 0 sits at the bottom). */
function buildRows(
  messages: ChatMessageDto[],
  groupMembershipId: string,
  readAt: string | null,
  unread: number,
  lang: 'fr' | 'en',
): Row[] {
  const rows: Row[] = [];
  messages.forEach((message, i) => {
    const newer = messages[i - 1];
    const older = messages[i + 1];
    const unreadHere =
      readAt !== null && message.createdAt <= readAt && (!newer || newer.createdAt > readAt);
    if (unreadHere && unread > 0) {
      rows.push({ kind: 'unread', key: `unread-${message.id}`, count: unread });
    }
    if (message.kind === 'SYSTEM') {
      rows.push({ kind: 'system', key: message.id, message });
    } else {
      const own = message.author?.membershipId === groupMembershipId;
      const sameAsOlder =
        !!older &&
        older.author?.membershipId === message.author?.membershipId &&
        older.kind !== 'SYSTEM';
      rows.push({ kind: 'message', key: message.id, message, firstOfRun: !sameAsOlder, own });
    }
    const dayChanges =
      !older || formatDateShort(older.createdAt, lang) !== formatDateShort(message.createdAt, lang);
    if (dayChanges) {
      rows.push({
        kind: 'date',
        key: `date-${message.id}`,
        label: formatDateShort(message.createdAt, lang),
      });
    }
  });
  return rows;
}

export function GroupeTab() {
  const { t } = useTranslation();
  const { colors } = useTheme();
  const lang = useLang();
  const online = useConnectivity((s) => s.online);
  const { group, loading } = useActiveGroup();
  const groupId = group?.groupId ?? null;
  const left =
    !!group && (group.membershipStatus === 'LEFT' || group.membershipStatus === 'REMOVED');
  const messages = useMessages(groupId);
  const state = useChatState(groupId);
  const send = useSendMessage(groupId);
  const remove = useDeleteMessage(groupId);
  const markRead = useMarkRead(groupId);
  const [draft, setDraft] = useState('');
  const [deleting, setDeleting] = useState<ChatMessageDto | null>(null);
  const sendFile = useSendFile(groupId);
  const voice = useVoiceRecorder();
  const [attachOpen, setAttachOpen] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);

  useChatRealtime(groupId);

  // The unread line uses the read time from before this visit: captured once per group.
  const [seen, setSeen] = useState<{
    groupId: string;
    readAt: string | null;
    unread: number;
  } | null>(null);
  if (state.data && (!seen || seen.groupId !== state.data.groupId)) {
    setSeen({
      groupId: state.data.groupId,
      readAt: state.data.lastReadAt,
      unread: state.data.unread,
    });
  }
  const captured = !!seen && seen.groupId === groupId;
  const { mutate: markAsRead } = markRead;
  useEffect(() => {
    if (captured && !left && groupId) markAsRead();
  }, [captured, left, groupId, markAsRead]);

  // The groups are still loading: a skeleton, not "no group yet".
  if (!group && loading) {
    return (
      <TabScreen>
        <SkeletonRows rows={4} />
      </TabScreen>
    );
  }
  if (!group) {
    return (
      <TabScreen>
        <EmptyState
          icon={MessagesSquare}
          title={t('nav.tabs.groupe')}
          body={t('emptyStates.noGroup.body')}
        />
      </TabScreen>
    );
  }

  const all = messages.data?.pages.flatMap((p) => p.messages) ?? [];
  const rows = buildRows(all, group.membershipId, seen?.readAt ?? null, seen?.unread ?? 0, lang);
  const pinned = all.find((m) => m.isAnnouncement && !m.removed);

  const submit = () => {
    const text = draft.trim();
    if (!text || !online || left) return;
    setDraft('');
    send.mutate(text, { onError: () => setDraft(text) });
  };

  /** A photo, a video or a PDF chosen on the phone (or in the browser): sent as a message. */
  const pickAndSend = async (source: 'photo' | 'camera' | 'video' | 'document') => {
    setAttachOpen(false);
    setNotice(null);
    sendFile.reset();
    try {
      let file: PickedFile | null = null;
      if (source === 'document') {
        const result = await DocumentPicker.getDocumentAsync({
          type: 'application/pdf',
          copyToCacheDirectory: true,
          multiple: false,
        });
        const asset = result.canceled ? null : result.assets[0];
        if (!asset) return;
        const mime = baseMime(asset.mimeType) || 'application/pdf';
        if (kindForMime(mime) !== 'DOCUMENT') {
          setNotice(t('errors.media.documentType'));
          return;
        }
        file = { uri: asset.uri, kind: 'DOCUMENT', mime };
      } else {
        const camera = source === 'camera';
        if (camera) {
          const permission = await ImagePicker.requestCameraPermissionsAsync();
          if (!permission.granted) {
            setNotice(t('errors.permissions.camera'));
            return;
          }
        }
        const options: ImagePicker.ImagePickerOptions = {
          mediaTypes: source === 'video' ? ['videos'] : ['images'],
          quality: 0.8,
        };
        const result = camera
          ? await ImagePicker.launchCameraAsync(options)
          : await ImagePicker.launchImageLibraryAsync(options);
        const asset = result.canceled ? null : result.assets[0];
        if (!asset) return;
        const video = source === 'video' || asset.type === 'video';
        const mime = baseMime(asset.mimeType) || (video ? 'video/mp4' : 'image/jpeg');
        const kind = kindForMime(mime);
        if (kind !== 'IMAGE' && kind !== 'VIDEO') {
          setNotice(t('errors.media.documentType'));
          return;
        }
        file = {
          uri: asset.uri,
          kind,
          mime,
          width: asset.width,
          height: asset.height,
          ...(kind === 'VIDEO' && asset.duration
            ? { durationSec: Math.ceil(asset.duration / 1000) }
            : {}),
        };
      }
      sendFile.mutate(file);
    } catch {
      setNotice(t('errors.media.uploadFailed'));
    }
  };

  const startVoice = async () => {
    setNotice(null);
    sendFile.reset();
    const result = await voice.start();
    if (result === 'denied') setNotice(t('errors.permissions.microphone'));
    else if (result === 'failed') setNotice(t('errors.media.uploadFailed'));
  };

  const sendVoice = async () => {
    const { file, tooShort } = await voice.stop();
    if (tooShort || !file) {
      setNotice(t('chat.voice.tooShort'));
      return;
    }
    sendFile.mutate(file);
  };

  return (
    <TabScreen
      scroll={false}
      footer={
        left ? undefined : voice.phase !== 'idle' ? (
          <RecordingBar
            seconds={voice.seconds}
            ready={voice.phase === 'ready'}
            onCancel={() => void voice.cancel()}
            onSend={() => void sendVoice()}
          />
        ) : (
          <Composer
            kind="chat"
            value={draft}
            onChange={setDraft}
            onSend={submit}
            onAttach={() => setAttachOpen(true)}
            onVoice={() => void startVoice()}
            disabledReason={online ? null : t('common.status.connectionRequired')}
          />
        )
      }
    >
      {left ? <Txt color="textSecondary">{t('chat.leftReadOnly')}</Txt> : null}
      {pinned ? (
        <View style={styles.pinned}>
          <Txt variant="captionStrong" color="textSecondary">
            {t('chat.pinned.label')}
          </Txt>
          <Txt>{pinned.text}</Txt>
        </View>
      ) : null}
      {messages.isPending || state.isPending ? <SkeletonRows rows={5} /> : null}
      {messages.isError ? (
        <EmptyState
          icon={CircleAlert}
          title={t('emptyStates.loadFailed.title')}
          body={errorMessage(messages.error, t, lang)}
          actionLabel={t('common.actions.retry')}
          onAction={() => void messages.refetch()}
        />
      ) : null}
      {messages.isSuccess && !all.length ? (
        <EmptyState icon={Info} title={t('nav.tabs.groupe')} body={t('chat.empty')} />
      ) : null}
      {all.length ? (
        <FlatList
          style={styles.list}
          inverted
          data={rows}
          keyExtractor={(row) => row.key}
          onEndReachedThreshold={0.4}
          onEndReached={() => {
            if (messages.hasNextPage && !messages.isFetchingNextPage) void messages.fetchNextPage();
          }}
          renderItem={({ item }) => <RowView row={item} lang={lang} onDelete={setDeleting} />}
          contentContainerStyle={styles.content}
        />
      ) : null}
      {send.error ? (
        <Txt variant="secondary" color="textDanger">
          {t('agent.errors.notSent')}
        </Txt>
      ) : null}
      {sendFile.isPending ? (
        <Txt variant="secondary" color="textSecondary" accessibilityLiveRegion="polite">
          {t('chat.media.sending')}
        </Txt>
      ) : null}
      {sendFile.error ? (
        <Txt variant="secondary" color="textDanger" accessibilityLiveRegion="assertive">
          {sendFile.error instanceof ApiError
            ? errorMessage(sendFile.error, t, lang)
            : t('errors.media.uploadFailed')}
        </Txt>
      ) : null}
      {notice ? (
        <Txt variant="secondary" color="textDanger" accessibilityLiveRegion="assertive">
          {notice}
        </Txt>
      ) : null}

      <BottomSheet
        visible={attachOpen}
        onClose={() => setAttachOpen(false)}
        title={t('chat.attachMenu.title')}
      >
        <GroupedList>
          <ListRow
            title={t('chat.attachMenu.photo')}
            titleWeight="regular"
            leading={<ImageIcon size={24} color={colors.iconPrimary} strokeWidth={2} />}
            onPress={() => void pickAndSend('photo')}
          />
          {Platform.OS !== 'web' ? (
            <ListRow
              title={t('chat.attachMenu.camera')}
              titleWeight="regular"
              leading={<Camera size={24} color={colors.iconPrimary} strokeWidth={2} />}
              onPress={() => void pickAndSend('camera')}
            />
          ) : null}
          <ListRow
            title={t('chat.attachMenu.video')}
            titleWeight="regular"
            leading={<Video size={24} color={colors.iconPrimary} strokeWidth={2} />}
            onPress={() => void pickAndSend('video')}
          />
          <ListRow
            title={t('chat.attachMenu.document')}
            titleWeight="regular"
            leading={<FileText size={24} color={colors.iconPrimary} strokeWidth={2} />}
            onPress={() => void pickAndSend('document')}
          />
        </GroupedList>
      </BottomSheet>

      <BottomSheet
        visible={!!deleting}
        onClose={() => setDeleting(null)}
        title={t('chat.message.delete')}
      >
        <Txt>{t('chat.message.deleteConfirm')}</Txt>
        <Button
          fullWidth
          variant="destructive"
          label={t('chat.message.delete')}
          offline={!online}
          loading={remove.isPending}
          onPress={() => {
            if (!deleting) return;
            remove.mutate(deleting.id, { onSuccess: () => setDeleting(null) });
          }}
        />
      </BottomSheet>
    </TabScreen>
  );
}

function RowView({
  row,
  lang,
  onDelete,
}: {
  row: Row;
  lang: 'fr' | 'en';
  onDelete: (message: ChatMessageDto) => void;
}) {
  const { t } = useTranslation();
  if (row.kind === 'date') return <DateSeparator label={row.label} />;
  if (row.kind === 'unread')
    return <UnreadDivider label={t('chat.newMessages', { count: row.count })} />;
  if (row.kind === 'system') {
    const text = row.message.systemText ? pick(row.message.systemText, lang) : '';
    return <SystemEvent icon={Info} text={text} time={formatClock(row.message.createdAt, lang)} />;
  }
  const m = row.message;
  const agent = m.kind === 'AGENT';
  const removed = m.removed;
  return (
    <MessageBubble
      author={agent ? 'agent' : row.own ? 'own' : 'other'}
      name={m.author?.name ?? t('common.agentName')}
      firstOfRun={row.firstOfRun}
      time={formatClock(m.createdAt, lang)}
      parts={m.text ? [m.text] : []}
      media={
        m.attachment && !removed ? (
          <ChatAttachment
            attachment={m.attachment}
            from={row.own ? null : (m.author?.name ?? t('common.agentName'))}
          />
        ) : undefined
      }
      deleted={removed === 'DELETED'}
      hidden={removed === 'HIDDEN'}
      delivery="sent"
      onLongPress={row.own && !removed ? () => onDelete(m) : undefined}
    />
  );
}

const styles = StyleSheet.create({
  list: { flex: 1 },
  content: { paddingHorizontal: space.s4, paddingVertical: space.s2, gap: space.s2 },
  pinned: { gap: space.s1, padding: space.s3, marginBottom: space.s2 },
});

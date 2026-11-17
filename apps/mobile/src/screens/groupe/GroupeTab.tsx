// Groupe tab (SCREENS.md S-11; spec 1.5, 2.7 Chat, CHT-01..02): the group's chat, newest at the bottom.
// Messages page back in time; system events (payments, votes, rules, meetings) are compact rows; removed
// messages keep a placeholder. The unread line is captured before the read marker is sent.
import { useEffect, useState } from 'react';
import { FlatList, StyleSheet, View } from 'react-native';
import { useTranslation } from 'react-i18next';
import { CircleAlert, Info, MessagesSquare } from 'lucide-react-native';
import { formatClock, formatDateShort, pick } from '@njangi/shared';
import type { ChatMessageDto } from '@njangi/shared/contracts/chat-messages';
import { space } from '@/theme';
import {
  BottomSheet,
  Button,
  Composer,
  DateSeparator,
  EmptyState,
  MessageBubble,
  SkeletonRows,
  SystemEvent,
  Txt,
  UnreadDivider,
  useLang,
} from '@/ui';
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
  const lang = useLang();
  const online = useConnectivity((s) => s.online);
  const { group } = useActiveGroup();
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

  return (
    <TabScreen
      scroll={false}
      footer={
        left ? undefined : (
          <Composer
            kind="chat"
            value={draft}
            onChange={setDraft}
            onSend={submit}
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

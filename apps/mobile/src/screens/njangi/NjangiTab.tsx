// Njangi, the agent tab (SCREENS.md S-10; spec 1.4, Part 4). The member talks to the agent; the reply
// comes complete in the HTTP response and is streamed while it is written. Any action it prepares
// comes back as a PendingAction card that only the member can confirm (spec 4.5). When the agent is
// not configured on the server, the screen says so and the rest of the app keeps working.
import { memo, useCallback, useEffect, useRef, useState } from 'react';
import { ScrollView, StyleSheet, View, type ScrollViewInstance } from 'react-native';
import { useRouter } from 'expo-router';
import type { TFunction } from 'i18next';
import { useTranslation } from 'react-i18next';
import { CircleAlert, History, Info, Users } from 'lucide-react-native';
import { formatClock, pick } from '@njangi/shared';
import {
  AGENT_MESSAGE_MAX,
  type AgentMessageDto,
  type AgentTurnDto,
} from '@njangi/shared/contracts/agent';
import { space, useTheme } from '@/theme';
import { newRoute } from '../shared/routes';
import {
  AgentActivityLine,
  AgentMessage,
  AgentOrb,
  Button,
  Chip,
  ChipRow,
  Composer,
  EmptyState,
  MessageBubble,
  SkeletonRows,
  SystemEvent,
  Touchable,
  Txt,
  useLang,
} from '@/ui';
import { useConnectivity } from '@/state/connectivity';
import { useAgentActivity } from '@/state/agentActivity';
import { useSession } from '@/state/session';
import { useActiveGroup } from '@/features/groups/useGroups';
import { useCurrentRound, useMyDues } from '@/features/money/queries';
import {
  streamText,
  useAgentConversation,
  useAgentStatus,
  useAgentStream,
  useSendAgentMessage,
} from '@/features/agent/useAgent';
import { errorCode, errorDetails, errorMessage, unlockTime } from '@/features/errors/errorMessage';
import { ActionCard } from '../shared/ActionCard';
import { TabScreen } from '../shell/TabScreen';

const CHIPS = [
  'pay',
  'howMuch',
  'whoUnpaid',
  'myTurn',
  'fund',
  'openVotes',
  'withdraw',
  'missed',
] as const;

/**
 * Each group has its own thread with the agent. The thread is keyed by the active group, so
 * switching group remounts it: the draft, the member's line being sent, the streamed reply and any
 * error belong to the group that produced them and never show in another.
 */
export function NjangiTab({ compact = false }: { compact?: boolean } = {}) {
  const { group } = useActiveGroup();
  return <NjangiThread key={group?.groupId ?? 'none'} compact={compact} />;
}

function NjangiThread({ compact }: { compact: boolean }) {
  const { t } = useTranslation();
  const lang = useLang();
  const router = useRouter();
  const { colors } = useTheme();
  // The floating chat (a small sheet on top of any page) shows only the conversation: no group
  // header, bell, round line, history link or shortcut chips.
  const Shell: typeof TabScreen = compact ? CompactShell : TabScreen;
  const online = useConnectivity((s) => s.online);
  const user = useSession((s) => s.user);
  const { group, loading } = useActiveGroup();
  const groupId = group?.groupId ?? null;
  const status = useAgentStatus();
  const conversation = useAgentConversation(groupId);
  const send = useSendAgentMessage();
  const { stream, reset } = useAgentStream(
    send.isPending,
    groupId,
    conversation.conversation?.id ?? null,
  );
  const round = useCurrentRound(groupId);
  const dues = useMyDues(groupId);
  const [draft, setDraft] = useState('');
  const [sentText, setSentText] = useState<string | null>(null);
  const [reply, setReply] = useState<AgentMessageDto | null>(null);
  const [failure, setFailure] = useState<unknown>(null);
  const scroll = useRef<ScrollViewInstance>(null);
  // Taken synchronously on the first send: a second Enter or tap before the screen re-renders is
  // ignored (the state `send.isPending` only changes on the next render).
  const sendingRef = useRef(false);

  // The whole app shows what the agent is doing: the floating orb and the glow around the screen.
  const setMode = useAgentActivity((s) => s.setMode);
  const answering = send.isPending;
  const writing = answering && streamText(stream).length > 0;
  useEffect(() => {
    setMode(!answering ? 'idle' : writing ? 'speaking' : 'thinking');
  }, [answering, writing, setMode]);
  useEffect(() => () => setMode('idle'), [setMode]);

  const messages = conversation.messages;
  // The member's line and the reply stay on screen from the moment of sending until the server's
  // own copy of the conversation has them (no flicker while it is read again). Derived while
  // rendering: once the server's copy holds the reply, the local ones are simply not drawn, and the
  // next send starts from a clean slate.
  const echoed = reply ? messages.some((m) => m.id === reply.id) : false;
  const newestReplyId = messages.findLast((m) => m.role === 'assistant')?.id ?? null;
  const { mutate: sendMutate } = send;
  const askAgain = useCallback(
    (text: string, restoreDraft = false) => {
      if (sendingRef.current) return;
      sendingRef.current = true;
      setFailure(null);
      setReply(null);
      setSentText(text);
      sendMutate(
        { text, groupId },
        {
          onSuccess: (turn: AgentTurnDto) => setReply(turn.reply),
          onError: (error) => {
            setFailure(error);
            setSentText(null);
            if (restoreDraft) setDraft(text);
          },
          onSettled: () => {
            sendingRef.current = false;
            reset();
            scroll.current?.scrollToEnd({ animated: true });
          },
        },
      );
    },
    [sendMutate, groupId, reset],
  );

  if (loading) {
    return (
      <Shell>
        <SkeletonRows rows={4} />
      </Shell>
    );
  }
  if (!group) {
    return (
      <Shell>
        <EmptyState
          icon={Users}
          title={t('emptyStates.noGroup.title')}
          body={t('emptyStates.noGroup.body')}
          actionLabel={t('welcome.create')}
          onAction={() => router.push('/create-group')}
        />
        <View style={styles.center}>
          <Button
            variant="text"
            label={t('welcome.invitation')}
            onPress={() => router.push('/join')}
          />
        </View>
      </Shell>
    );
  }

  const configured = status.data?.configured !== false;
  const notConfiguredText = status.data?.message
    ? pick(status.data.message, lang)
    : t('agent.errors.unavailable');
  const shownReply = reply && !echoed ? reply : null;
  const empty = !messages.length && !sentText && !shownReply;

  const submit = (text: string) => {
    const clean = text.trim();
    if (!clean || sendingRef.current) return;
    // The composer clears and the member's line appears in this same event, before any network.
    setDraft('');
    askAgain(clean, true);
  };

  const roundLine =
    !compact && round.data ? (
      <Touchable
        onPress={() => router.navigate('/caisse')}
        accessibilityLabel={t('agent.header.a11y')}
      >
        <View style={styles.header}>
          <Txt variant="secondary" color="textSecondary">
            {t('agent.header.round', {
              round: round.data.number,
              total: round.data.contributionCount,
            })}
            {' · '}
            {round.data.beneficiaryMembershipId === group.membershipId
              ? t('agent.header.beneficiaryYou')
              : t('agent.header.beneficiary', { name: round.data.beneficiaryName ?? '' })}
          </Txt>
          {dues.data && round.data ? (
            <Txt variant="secondary" color="textSecondary">
              {t('agent.header.contribution', {
                status: t(
                  dues.data.some(
                    (d) => d.kind === 'CONTRIBUTION' && d.roundNumber === round.data?.number,
                  )
                    ? 'agent.header.status.toPay'
                    : 'agent.header.status.paid',
                ),
              })}
            </Txt>
          ) : null}
        </View>
      </Touchable>
    ) : null;

  return (
    <Shell
      scroll={false}
      footer={
        configured ? (
          <View style={styles.footer}>
            {empty && !compact ? (
              <ChipRow label={t('agent.chips.groupLabel')}>
                {CHIPS.map((key) => (
                  <Chip
                    key={key}
                    label={t(`agent.chips.${key}` as 'agent.chips.pay')}
                    onPress={() => submit(t(`agent.chips.${key}` as 'agent.chips.pay'))}
                  />
                ))}
              </ChipRow>
            ) : null}
            <Composer
              kind="agent"
              value={draft}
              onChange={setDraft}
              onSend={() => submit(draft)}
              disabledReason={
                draft.length > AGENT_MESSAGE_MAX
                  ? t('agent.composer.tooLong')
                  : !online
                    ? t('common.status.connectionRequired')
                    : null
              }
            />
          </View>
        ) : null
      }
    >
      {roundLine}
      {compact ? null : (
        <Touchable
          onPress={() => router.push(newRoute('/agent-history'))}
          accessibilityLabel={t('agentHistory.title')}
        >
          <View style={styles.historyLink}>
            <History size={18} color={colors.iconSecondary} strokeWidth={2} />
            <Txt variant="secondary">{t('agentHistory.title')}</Txt>
          </View>
        </Touchable>
      )}

      {!configured ? <AgentMessage text={notConfiguredText} /> : null}

      <ScrollView
        ref={scroll}
        style={styles.scroll}
        contentContainerStyle={styles.conversation}
        keyboardShouldPersistTaps="handled"
        onContentSizeChange={() => scroll.current?.scrollToEnd({ animated: false })}
      >
        {conversation.hasNextPage ? (
          <Button
            variant="text"
            label={t('agent.loadOlder')}
            loading={conversation.isFetchingNextPage}
            onPress={() => void conversation.fetchNextPage()}
          />
        ) : null}
        {conversation.isPending ? <SkeletonRows rows={3} /> : null}
        {conversation.isError ? (
          <EmptyState
            icon={CircleAlert}
            title={t('emptyStates.loadFailed.title')}
            body={errorMessage(conversation.error, t, lang)}
            actionLabel={t('common.actions.retry')}
            onAction={() => void conversation.refetch()}
          />
        ) : null}
        {empty && configured && conversation.isSuccess ? (
          <View style={compact ? styles.heroCompact : styles.hero}>
            <AgentOrb size={compact ? 64 : 120} mode="idle" />
            <Txt variant="sectionTitle" align="center">
              {t('agent.hero.tagline')}
            </Txt>
          </View>
        ) : null}
        {empty && configured && conversation.isSuccess ? (
          <AgentMessage
            text={t('agent.greeting.firstRun', {
              name: user?.name.split(' ')[0] ?? '',
              group: group.name,
            })}
          />
        ) : null}
        {messages.map((m) => (
          <ConversationLine
            key={m.id}
            message={m}
            lang={lang}
            latest={m.id === newestReplyId}
            onAskAgain={askAgain}
          />
        ))}
        {sentText && !echoed ? (
          <MessageBubble author="own" time="" parts={[sentText]} delivery="queued" />
        ) : null}
        {send.isPending ? (
          <View style={styles.streaming}>
            {streamText(stream) ? (
              <AgentMessage text={streamText(stream)} streaming speaking />
            ) : (
              <View style={styles.thinking} accessible accessibilityLabel={t('agent.typing')}>
                <AgentOrb size={30} mode="thinking" />
              </View>
            )}
            <AgentActivityLine tool={stream?.tool ?? null} />
          </View>
        ) : null}
        {shownReply ? (
          <ConversationLine message={shownReply} lang={lang} latest onAskAgain={askAgain} />
        ) : null}
        {failure ? (
          <Txt variant="secondary" color="textDanger" accessibilityLiveRegion="polite">
            {agentFailureText(failure, t, lang)}
          </Txt>
        ) : null}
      </ScrollView>
    </Shell>
  );
}

/** The floating chat's frame: just the content and the composer, with no header or offline bar. */
const CompactShell: typeof TabScreen = ({ children, footer }) => (
  <View style={styles.compactRoot}>
    <View style={styles.compactBody}>{children}</View>
    {footer ? <View style={styles.compactFooter}>{footer}</View> : null}
  </View>
);

/**
 * One line of the conversation: the member's own text, the agent's reply with the cards it prepared
 * (drawn from the server's PendingAction, so they are here after a reload too), or an event of an
 * action. Memoised: a streamed word changes the screen, not the lines above it.
 */
const ConversationLine = memo(function ConversationLine({
  message,
  lang,
  latest = false,
  onAskAgain,
}: {
  message: AgentMessageDto;
  lang: 'fr' | 'en';
  /** The newest reply: its cards keep their full form; older cancelled or expired ones collapse. */
  latest?: boolean;
  onAskAgain: (text: string) => void;
}) {
  const { t } = useTranslation();
  if (message.role === 'user') {
    return (
      <MessageBubble
        author="own"
        time={formatClock(message.createdAt, lang)}
        parts={[message.text]}
        footer={
          message.fromGroup ? (
            <Txt variant="secondary" color="textSecondary">
              {t('agent.privateFromGroup.label')}
            </Txt>
          ) : undefined
        }
      />
    );
  }
  if (message.role === 'event') {
    return (
      <SystemEvent icon={Info} text={message.text} time={formatClock(message.createdAt, lang)} />
    );
  }
  return (
    <View style={styles.reply}>
      <AgentMessage text={message.text} />
      {message.actions.map((action) => (
        <ActionCard
          key={action.id}
          action={action}
          compact={!latest}
          onRetry={() =>
            onAskAgain(t('agent.prepareAgain', { title: pick(action.preview.title, lang) }))
          }
        />
      ))}
    </View>
  );
});

/** The send failure, in the member's words (spec 1.6): rate limit, unavailable, not sent, or the server's text. */
function agentFailureText(error: unknown, t: TFunction, lang: 'fr' | 'en'): string {
  const code = errorCode(error);
  if (code === 'RATE_LIMITED') {
    const time = unlockTime(error, lang);
    return time ? t('agent.errors.rateLimited', { time }) : t('agent.errors.failed');
  }
  if (code === 'AGENT_UNAVAILABLE' || code === 'AGENT_NOT_CONFIGURED')
    return t('agent.errors.unavailable');
  if (code === 'NETWORK_UNAVAILABLE') return t('agent.errors.notSent');
  const details = errorDetails(error);
  if (details.interrupted === true) return t('agent.errors.interrupted');
  return t('agent.errors.failed');
}

const styles = StyleSheet.create({
  center: { alignItems: 'center' },
  header: { gap: space.s1, paddingVertical: space.s2 },
  historyLink: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.s2,
    paddingVertical: space.s2,
  },
  scroll: { flex: 1 },
  conversation: { gap: space.s3, paddingVertical: space.s3 },
  streaming: { gap: space.s2 },
  reply: { gap: space.s3 },
  hero: { alignItems: 'center', gap: space.s6, paddingVertical: space.s8 },
  heroCompact: { alignItems: 'center', gap: space.s3, paddingVertical: space.s4 },
  compactRoot: { flex: 1, minHeight: 0 },
  compactBody: { flex: 1, minHeight: 0, paddingHorizontal: space.s4, gap: space.s3 },
  compactFooter: { paddingTop: space.s1 },
  thinking: { paddingLeft: space.s4, paddingVertical: space.s3 },
  footer: { gap: space.s3 },
});

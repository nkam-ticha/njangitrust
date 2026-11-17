// Njangi, the agent tab (SCREENS.md S-10; spec 1.4, Part 4). The member talks to the agent; the reply
// comes complete in the HTTP response and is streamed while it is written. Any action it prepares
// comes back as a PendingAction card that only the member can confirm (spec 4.5). When the agent is
// not configured on the server, the screen says so and the rest of the app keeps working.
import { useRef, useState } from 'react';
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
import type { PendingActionDto } from '@njangi/shared/contracts/pending-actions';
import { space, useTheme } from '@/theme';
import { newRoute } from '../shared/routes';
import {
  AgentActivityLine,
  AgentMessage,
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
  TypingDots,
  useLang,
} from '@/ui';
import { useConnectivity } from '@/state/connectivity';
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

export function NjangiTab() {
  const { t } = useTranslation();
  const lang = useLang();
  const router = useRouter();
  const { colors } = useTheme();
  const online = useConnectivity((s) => s.online);
  const user = useSession((s) => s.user);
  const { group, loading } = useActiveGroup();
  const groupId = group?.groupId ?? null;
  const status = useAgentStatus();
  const conversation = useAgentConversation();
  const send = useSendAgentMessage();
  const { stream, reset } = useAgentStream(send.isPending);
  const round = useCurrentRound(groupId);
  const dues = useMyDues(groupId);
  const [draft, setDraft] = useState('');
  const [sentText, setSentText] = useState<string | null>(null);
  const [reply, setReply] = useState<AgentMessageDto | null>(null);
  const [cards, setCards] = useState<PendingActionDto[]>([]);
  const [failure, setFailure] = useState<unknown>(null);
  const scroll = useRef<ScrollViewInstance>(null);

  if (loading) {
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
      </TabScreen>
    );
  }

  const configured = status.data?.configured !== false;
  const notConfiguredText = status.data?.message
    ? pick(status.data.message, lang)
    : t('agent.errors.unavailable');
  const messages = conversation.messages;
  const shownReply = reply && !messages.some((m) => m.id === reply.id) ? reply : null;
  const empty = !messages.length && !sentText && !shownReply;

  const submit = (text: string) => {
    const clean = text.trim();
    if (!clean || send.isPending) return;
    setDraft('');
    setFailure(null);
    setSentText(clean);
    send.mutate(
      { text: clean, groupId },
      {
        onSuccess: (turn: AgentTurnDto) => {
          setReply(turn.reply);
          if (turn.actions.length) setCards((prev) => [...prev, ...turn.actions]);
        },
        onError: (error) => {
          setFailure(error);
          setDraft(clean);
        },
        onSettled: () => {
          setSentText(null);
          reset();
          scroll.current?.scrollToEnd({ animated: true });
        },
      },
    );
  };

  const roundLine = round.data ? (
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
    <TabScreen
      scroll={false}
      footer={
        configured ? (
          <View style={styles.footer}>
            {empty ? (
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
      <Touchable
        onPress={() => router.push(newRoute('/agent-history'))}
        accessibilityLabel={t('agentHistory.title')}
      >
        <View style={styles.historyLink}>
          <History size={18} color={colors.iconSecondary} strokeWidth={2} />
          <Txt variant="secondary">{t('agentHistory.title')}</Txt>
        </View>
      </Touchable>

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
          <AgentMessage
            text={t('agent.greeting.firstRun', {
              name: user?.name.split(' ')[0] ?? '',
              group: group.name,
            })}
          />
        ) : null}
        {messages.map((m) => (
          <ConversationLine key={m.id} message={m} lang={lang} />
        ))}
        {sentText ? (
          <MessageBubble author="own" time="" parts={[sentText]} delivery="queued" />
        ) : null}
        {send.isPending ? (
          <View style={styles.streaming}>
            {streamText(stream) ? (
              <AgentMessage text={streamText(stream)} streaming startOfTurn={false} />
            ) : (
              <TypingDots />
            )}
            <AgentActivityLine tool={stream?.tool ?? null} />
          </View>
        ) : null}
        {shownReply ? <AgentMessage text={shownReply.text} /> : null}
        {cards.map((action) => (
          <ActionCard
            key={action.id}
            action={action}
            onClose={() => setCards((prev) => prev.filter((c) => c.id !== action.id))}
            onCancelled={() => setCards((prev) => prev.filter((c) => c.id !== action.id))}
          />
        ))}
        {failure ? (
          <Txt variant="secondary" color="textDanger" accessibilityLiveRegion="polite">
            {agentFailureText(failure, t, lang)}
          </Txt>
        ) : null}
      </ScrollView>
    </TabScreen>
  );
}

/** One line of the conversation: the member's own text, the agent's reply, or an event of an action. */
function ConversationLine({ message, lang }: { message: AgentMessageDto; lang: 'fr' | 'en' }) {
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
  return <AgentMessage text={message.text} />;
}

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
  footer: { gap: space.s3 },
});

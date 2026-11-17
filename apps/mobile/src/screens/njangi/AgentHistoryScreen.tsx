// "Historique de l'assistant" (spec 4.10): what Njangi looked at, prepared or did for the member. Only the
// member sees it. A prepared action that is still pending can be opened here and confirmed as a card.
import { useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { useRouter } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { CircleAlert } from 'lucide-react-native';
import { formatDateTime } from '@njangi/shared';
import {
  pendingActionResponseSchema,
  type PendingActionDto,
} from '@njangi/shared/contracts/pending-actions';
import { useMutation } from '@tanstack/react-query';
import { api } from '@/api/client';
import { space } from '@/theme';
import {
  AppHeader,
  BottomSheet,
  EmptyState,
  GroupedList,
  ListRow,
  SkeletonRows,
  Txt,
  useLang,
} from '@/ui';
import { useAgentHistory } from '@/features/agent/useAgent';
import { errorMessage } from '@/features/errors/errorMessage';
import { ActionCard } from '../shared/ActionCard';
import { Screen } from '../shared/Screen';

export function AgentHistoryScreen() {
  const { t, i18n } = useTranslation();
  const lang = useLang();
  const router = useRouter();
  const history = useAgentHistory();
  const open = useMutation({
    mutationFn: (id: string) =>
      api.get(`/v1/pending-actions/${id}`, { schema: pendingActionResponseSchema }),
  });
  const [card, setCard] = useState<PendingActionDto | null>(null);
  const items = history.data?.pages.flatMap((p) => p.items) ?? [];
  const toolLabel = (tool: string) => {
    const key = `agentHistory.tools.${tool}`;
    return i18n.exists(key) ? t(key as 'agentHistory.tools.get_funds') : tool;
  };

  return (
    <Screen
      header={
        <AppHeader
          kind="pushed"
          title={t('agentHistory.title')}
          onBack={() => (router.canGoBack() ? router.back() : router.replace('/'))}
        />
      }
    >
      <Txt color="textSecondary">{t('agentHistory.help')}</Txt>
      {history.isPending ? <SkeletonRows rows={5} /> : null}
      {history.isError ? (
        <EmptyState
          icon={CircleAlert}
          title={t('emptyStates.loadFailed.title')}
          body={errorMessage(history.error, t, lang)}
          actionLabel={t('common.actions.retry')}
          onAction={() => void history.refetch()}
        />
      ) : null}
      {history.isSuccess && !items.length ? (
        <EmptyState
          icon={CircleAlert}
          title={t('agentHistory.title')}
          body={t('agentHistory.empty')}
        />
      ) : null}
      {items.length ? (
        <View style={styles.flush}>
          <GroupedList>
            {items.map((item) => (
              <ListRow
                key={item.id}
                titleWeight="regular"
                title={toolLabel(item.tool)}
                subtitle={`${t(`agentHistory.status.${item.status}`)} · ${formatDateTime(item.createdAt, lang)}`}
                chevron={!!item.pendingActionId && item.status === 'prepared'}
                onPress={
                  item.pendingActionId && item.status === 'prepared'
                    ? () =>
                        open.mutate(item.pendingActionId!, {
                          onSuccess: ({ action }) => setCard(action),
                        })
                    : undefined
                }
              />
            ))}
          </GroupedList>
        </View>
      ) : null}
      <BottomSheet visible={!!card} onClose={() => setCard(null)} title={t('agentHistory.title')}>
        {card ? (
          card.status === 'PENDING' ? (
            <ActionCard
              action={card}
              onClose={() => setCard(null)}
              onConfirmed={() => setCard(null)}
              onCancelled={() => setCard(null)}
            />
          ) : (
            <Txt>{t('agentHistory.status.expired')}</Txt>
          )
        ) : null}
      </BottomSheet>
      {open.error ? (
        <Txt variant="secondary" color="textDanger">
          {errorMessage(open.error, t, lang)}
        </Txt>
      ) : null}
      <View style={styles.spacer} />
    </Screen>
  );
}

const styles = StyleSheet.create({
  flush: { marginHorizontal: -space.s4 },
  spacer: { height: space.s4 },
});

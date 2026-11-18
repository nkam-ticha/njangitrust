// Caisse, Secours segment (SCREENS.md S-14; spec 1.4, R10, FSD SOL-01): the solidarity fund's balance,
// its requests and their status, and "Demander un soutien". A request opens a vote: the card is confirmed
// by the member, then the members decide.
import { useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { useTranslation } from 'react-i18next';
import { CircleAlert } from 'lucide-react-native';
import type { MyGroupDto } from '@njangi/shared/contracts/me';
import type { PendingActionDto } from '@njangi/shared/contracts/pending-actions';
import type { SolidarityRequestItem } from '@njangi/shared/contracts/solidarity';
import { formatDateShort, formatXAF } from '@njangi/shared';
import { space } from '@/theme';
import {
  AmountInput,
  AmountText,
  BottomSheet,
  Button,
  ChoiceRow,
  EmptyState,
  GroupedList,
  ListRow,
  SectionHeader,
  SkeletonRows,
  TextField,
  Txt,
  useLang,
} from '@/ui';
import { useConnectivity } from '@/state/connectivity';
import { useMembers } from '@/features/groups/useGroups';
import { useSolidarity, useRefreshMoney } from '@/features/money/queries';
import { useSolidarityRequest } from '@/features/money/mutations';
import { errorMessage } from '@/features/errors/errorMessage';
import { ActionCard } from '../shared/ActionCard';

const EVENTS = ['DEUIL', 'NAISSANCE', 'MALADIE', 'MARIAGE', 'AUTRE'] as const;
type SolidarityEvent = (typeof EVENTS)[number];

/** The contract's statuses, shown with the designer's copy (VOTING reads as "Vote en cours"). */
const STATUS_KEY = {
  VOTING: 'OPEN',
  APPROVED: 'PASSED',
  PAID: 'PAID',
  REFUNDED: 'REFUNDED',
  REJECTED: 'REJECTED',
  FAILED: 'FAILED',
} as const;

export function SolidaritySection({ group }: { group: MyGroupDto }) {
  const { t } = useTranslation();
  const lang = useLang();
  const groupId = group.groupId;
  const query = useSolidarity(groupId);
  const members = useMembers(groupId);
  const [requesting, setRequesting] = useState(false);

  if (query.isPending) return <SkeletonRows rows={3} />;
  if (query.isError) {
    return (
      <EmptyState
        icon={CircleAlert}
        title={t('emptyStates.loadFailed.title')}
        body={errorMessage(query.error, t, lang)}
        actionLabel={t('common.actions.retry')}
        onAction={() => void query.refetch()}
      />
    );
  }
  const { fundBalance, requests } = query.data;

  return (
    <View style={styles.column}>
      <View style={styles.card}>
        <Txt variant="secondary" color="textSecondary">
          {t('caisse.solidarity.balance')}
        </Txt>
        {fundBalance !== null ? (
          <AmountText amount={fundBalance} size="large" align="left" />
        ) : (
          <Txt color="textSecondary">{t('withdraw.nothing')}</Txt>
        )}
        <Txt variant="secondary" color="textSecondary">
          {t('caisse.solidarity.carriesOver')}
        </Txt>
      </View>

      <SectionHeader inset={false} title={t('caisse.solidarity.requests')} />
      {requests.length ? (
        <View style={styles.flush}>
          <GroupedList>
            {requests.map((item) => (
              <RequestRow key={item.id} item={item} lang={lang} />
            ))}
          </GroupedList>
        </View>
      ) : (
        <Txt color="textSecondary">{t('caisse.solidarity.empty')}</Txt>
      )}

      <Button
        fullWidth
        label={t('caisse.solidarity.request')}
        onPress={() => setRequesting(true)}
      />

      <BottomSheet
        visible={requesting}
        onClose={() => setRequesting(false)}
        title={t('solidarityRequest.title')}
      >
        {requesting ? (
          <SolidarityRequestSheet
            groupId={groupId}
            members={(members.data ?? []).filter((m) => m.status === 'ACTIVE')}
            myMembershipId={group.membershipId}
            fundBalance={fundBalance}
            onDone={() => setRequesting(false)}
          />
        ) : null}
      </BottomSheet>
    </View>
  );
}

function RequestRow({ item, lang }: { item: SolidarityRequestItem; lang: 'fr' | 'en' }) {
  const { t } = useTranslation();
  const key = STATUS_KEY[item.status];
  return (
    <ListRow
      title={t('caisse.solidarity.requestRow', {
        name: item.recipient.name,
        event: t(`caisse.solidarity.events.${item.event}`),
      })}
      subtitle={`${t(`caisse.solidarity.statuses.${key}`)} · ${formatDateShort(item.createdAt, lang)}`}
      trailing={<AmountText amount={item.amount} size="small" />}
    />
  );
}

interface SolidarityRequestSheetProps {
  groupId: string | null;
  members: { membershipId: string; name: string }[];
  myMembershipId: string;
  fundBalance: number | null;
  onDone: () => void;
}

function SolidarityRequestSheet({
  groupId,
  members,
  myMembershipId,
  fundBalance,
  onDone,
}: SolidarityRequestSheetProps) {
  const { t } = useTranslation();
  const lang = useLang();
  const online = useConnectivity((s) => s.online);
  const request = useSolidarityRequest(groupId);
  const refresh = useRefreshMoney(groupId);
  const [forOther, setForOther] = useState(false);
  const [recipient, setRecipient] = useState(myMembershipId);
  const [event, setEvent] = useState<SolidarityEvent>('DEUIL');
  const [amount, setAmount] = useState<number | null>(null);
  const [note, setNote] = useState('');
  const [action, setAction] = useState<PendingActionDto | null>(null);

  if (action) {
    return (
      <ActionCard
        action={action}
        onConfirmed={() => {
          refresh();
          onDone();
        }}
        onCancelled={() => setAction(null)}
        onClose={onDone}
      />
    );
  }

  return (
    <View style={styles.column}>
      <Txt variant="sectionTitle">{t('solidarityRequest.recipient')}</Txt>
      <ChoiceRow
        label={t('solidarityRequest.me')}
        selected={!forOther}
        onPress={() => {
          setForOther(false);
          setRecipient(myMembershipId);
        }}
      />
      <ChoiceRow
        label={t('solidarityRequest.other')}
        selected={forOther}
        onPress={() => setForOther(true)}
      />
      {forOther
        ? members
            .filter((m) => m.membershipId !== myMembershipId)
            .map((m) => (
              <ChoiceRow
                key={m.membershipId}
                label={m.name}
                selected={recipient === m.membershipId}
                onPress={() => setRecipient(m.membershipId)}
              />
            ))
        : null}

      <Txt variant="sectionTitle">{t('solidarityRequest.event')}</Txt>
      {EVENTS.map((key) => (
        <ChoiceRow
          key={key}
          label={t(`caisse.solidarity.events.${key}`)}
          selected={event === key}
          onPress={() => setEvent(key)}
        />
      ))}

      <AmountInput
        label={t('solidarityRequest.amount')}
        value={amount}
        onChange={setAmount}
        max={fundBalance ?? undefined}
        helper={
          fundBalance !== null
            ? t('solidarityRequest.max', { amount: formatXAF(fundBalance, lang) })
            : undefined
        }
      />
      <TextField
        label={t('solidarityRequest.note')}
        placeholder={t('solidarityRequest.notePlaceholder')}
        helper={t('solidarityRequest.noteHelp')}
        value={note}
        onChangeText={setNote}
        maxLength={300}
      />
      {request.error ? (
        <Txt variant="secondary" color="textDanger">
          {errorMessage(request.error, t, lang)}
        </Txt>
      ) : null}
      <Button
        fullWidth
        label={t('solidarityRequest.prepare')}
        loading={request.isPending}
        offline={!online}
        disabled={amount === null || request.isPending}
        onPress={() => {
          if (amount === null) return;
          request.mutate(
            {
              recipientMembershipId: recipient,
              event,
              amount,
              ...(note.trim() ? { note: note.trim() } : {}),
            },
            { onSuccess: (prepared) => setAction(prepared) },
          );
        }}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  column: { gap: space.s3 },
  card: { gap: space.s1, paddingVertical: space.s2 },
  flush: { marginHorizontal: -space.s4 },
});

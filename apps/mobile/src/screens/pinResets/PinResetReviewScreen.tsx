// S-05 part 2 (SCREENS.md; ACC-04, D8, D14): requests the viewer may confirm. An admin confirms
// alone; for an admin's own reset, two members each confirm. Confirming is an L2 card (the
// reviewer's PIN); the confirmation that completes it returns the one-time link to send.
import { useState } from 'react';
import { Linking, Platform, Share, View } from 'react-native';
import { useRouter } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { KeyRound, ShieldCheck } from 'lucide-react-native';
import { formatDateTime } from '@njangi/shared';
import {
  pinResetApprovalResultSchema,
  type PinResetRequestItem,
} from '@njangi/shared/contracts/auth';
import type { PendingActionDto } from '@njangi/shared/contracts/pending-actions';
import { space } from '@/theme';
import {
  AppHeader,
  Avatar,
  BottomSheet,
  Button,
  EmptyState,
  GroupedList,
  InfoCard,
  ListRow,
  SkeletonRows,
  Txt,
  useLang,
} from '@/ui';
import { useActiveGroup } from '@/features/groups/useGroups';
import {
  useApprovePinReset,
  useDeclinePinReset,
  usePinResetRequests,
} from '@/features/pinResets/usePinResets';
import { errorMessage } from '@/features/errors/errorMessage';
import { ActionCard } from '../shared/ActionCard';
import { Screen } from '../shared/Screen';

type Outcome = { kind: 'waiting' } | { kind: 'link'; link: string };

export function PinResetReviewScreen() {
  const { t } = useTranslation();
  const lang = useLang();
  const router = useRouter();
  const { group } = useActiveGroup();
  const groupId = group?.groupId ?? null;
  const requests = usePinResetRequests(groupId);
  const approve = useApprovePinReset(groupId);
  const decline = useDeclinePinReset(groupId);
  const [open, setOpen] = useState<PinResetRequestItem | null>(null);
  const [action, setAction] = useState<PendingActionDto | null>(null);
  const [outcome, setOutcome] = useState<Outcome | null>(null);

  const close = () => {
    setOpen(null);
    setAction(null);
    setOutcome(null);
    approve.reset();
    decline.reset();
    void requests.refetch();
  };
  const two = (r: PinResetRequestItem) => r.confirmationsNeeded > 1;
  const list = requests.data ?? [];

  return (
    <Screen
      header={
        <AppHeader
          kind="pushed"
          title={t('groupSettings.pinResets')}
          onBack={() => (router.canGoBack() ? router.back() : router.replace('/moi'))}
        />
      }
    >
      {requests.isPending ? <SkeletonRows rows={2} /> : null}
      {requests.isSuccess && !list.length ? (
        <EmptyState
          icon={ShieldCheck}
          title={t('groupSettings.pinResets')}
          body={t('pinReset.review.empty')}
        />
      ) : null}
      {list.length ? (
        <View style={{ marginHorizontal: -space.s4 }}>
          <GroupedList>
            {list.map((r) => (
              <ListRow
                key={r.id}
                leading={<Avatar name={r.memberName} />}
                title={r.memberName}
                subtitle={[
                  t('pinReset.review.requestedAt', { date: formatDateTime(r.requestedAt, lang) }),
                  two(r) ? t('pinReset.members.progress', { count: r.confirmationsGiven }) : null,
                  r.confirmedByMe ? t('pinReset.members.alreadyConfirmed') : null,
                ]
                  .filter(Boolean)
                  .join(' · ')}
                chevron={!r.confirmedByMe}
                onPress={r.confirmedByMe ? undefined : () => setOpen(r)}
              />
            ))}
          </GroupedList>
        </View>
      ) : null}

      <BottomSheet
        visible={!!open}
        onClose={close}
        title={open && two(open) ? t('pinReset.members.title') : t('pinReset.admin.title')}
      >
        {open && !action && !outcome ? (
          <>
            <Txt>
              {two(open)
                ? t('pinReset.members.body', { name: open.memberName })
                : t('pinReset.admin.body', { name: open.memberName })}
            </Txt>
            <Txt variant="secondary" color="textSecondary">
              {t('pinReset.review.expiresAt', { date: formatDateTime(open.expiresAt, lang) })}
            </Txt>
            {approve.error || decline.error ? (
              <Txt variant="secondary" color="textDanger">
                {errorMessage(approve.error ?? decline.error, t, lang)}
              </Txt>
            ) : null}
            <Button
              fullWidth
              label={two(open) ? t('pinReset.members.confirm') : t('pinReset.admin.confirm')}
              loading={approve.isPending}
              onPress={() => approve.mutate(open.id, { onSuccess: setAction })}
            />
            <Button
              fullWidth
              variant="text"
              label={t('pinReset.admin.decline')}
              loading={decline.isPending}
              onPress={() => decline.mutate(open.id, { onSuccess: close })}
            />
          </>
        ) : null}
        {action && !outcome ? (
          <ActionCard
            action={action}
            onConfirmed={(data) => {
              const result = pinResetApprovalResultSchema.safeParse(data);
              if (result.success && result.data.link)
                setOutcome({ kind: 'link', link: result.data.link });
              else setOutcome({ kind: 'waiting' });
            }}
            onCancelled={close}
            onClose={close}
          />
        ) : null}
        {outcome?.kind === 'waiting' ? <Txt>{t('pinReset.members.waiting')}</Txt> : null}
        {outcome?.kind === 'link' && open ? (
          <InfoCard
            icon={KeyRound}
            title={t('infoCards.pinResetLink.title', { name: open.memberName })}
            lines={[
              two(open)
                ? t('pinReset.members.ready', { name: open.memberName })
                : t('pinReset.admin.linkBody'),
              // D14: the 24-hour wait date needs `linkUsableFrom` in the approval result (asked of the API).
              t('infoCards.pinResetLink.validity'),
            ]}
            actions={[
              {
                label: t('infoCards.inviteLink.shareWhatsApp'),
                variant: 'primary',
                onPress: () => {
                  const text = encodeURIComponent(outcome.link);
                  void Linking.openURL(
                    Platform.OS === 'web'
                      ? `https://wa.me/?text=${text}`
                      : `whatsapp://send?text=${text}`,
                  ).catch(() => Share.share({ message: outcome.link }));
                },
              },
              {
                label: t('infoCards.inviteLink.share'),
                onPress: () => void Share.share({ message: outcome.link }),
              },
            ]}
          />
        ) : null}
      </BottomSheet>
    </Screen>
  );
}

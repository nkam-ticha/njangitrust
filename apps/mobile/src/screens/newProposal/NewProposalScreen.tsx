// S-20 New proposal (SCREENS.md; GOV-01, R11, R12.1). This batch: MEMBER_ADD. The threshold preview
// ("Il faudra 6 oui sur 10 membres") comes from @njangi/rules; the server counts the real voters.
import { useState } from 'react';
import { View } from 'react-native';
import { useRouter } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { PROPOSAL_RULES, thresholdCount } from '@njangi/rules';
import type { PendingActionDto } from '@njangi/shared/contracts/pending-actions';
import { space } from '@/theme';
import { AppHeader, Button, ChoiceRow, PhoneField, TextField, Txt, useLang } from '@/ui';
import { useActiveGroup, useMembers, useRules } from '@/features/groups/useGroups';
import { useCreateProposal, useRefreshProposals } from '@/features/proposals/useProposals';
import { errorMessage } from '@/features/errors/errorMessage';
import { ActionCard } from '../shared/ActionCard';
import { Screen } from '../shared/Screen';

export function NewProposalScreen() {
  const { t } = useTranslation();
  const lang = useLang();
  const router = useRouter();
  const { group } = useActiveGroup();
  const groupId = group?.groupId ?? null;
  const members = useMembers(groupId);
  const rules = useRules(groupId);
  const create = useCreateProposal(groupId);
  const refresh = useRefreshProposals(groupId);
  const [name, setName] = useState('');
  const [phone, setPhone] = useState<string | null>(null);
  const [reason, setReason] = useState('');
  const [action, setAction] = useState<PendingActionDto | null>(null);

  const back = () => (router.canGoBack() ? router.back() : router.replace('/votes'));
  const eligible = (members.data ?? []).filter((m) => m.status === 'ACTIVE').length;
  const kind = PROPOSAL_RULES.MEMBER_ADD.threshold;
  const needed = eligible > 0 ? thresholdCount(kind, eligible) : 0;
  const hours = rules.data?.params.voteWindowHours ?? 72;
  const valid = name.trim().length >= 2 && !!phone;

  return (
    <Screen
      width="form"
      header={<AppHeader kind="pushed" title={t('newProposal.title')} onBack={back} />}
      footer={
        action ? undefined : (
          <>
            {create.error ? (
              <Txt variant="secondary" color="textDanger">
                {errorMessage(create.error, t, lang)}
              </Txt>
            ) : null}
            <Button
              fullWidth
              label={t('newProposal.prepare')}
              disabled={!valid}
              loading={create.isPending}
              onPress={() =>
                phone &&
                create.mutate(
                  {
                    type: 'MEMBER_ADD',
                    name: name.trim(),
                    phone,
                    reason: reason.trim() || undefined,
                  },
                  { onSuccess: setAction },
                )
              }
            />
          </>
        )
      }
    >
      {action ? (
        <ActionCard
          action={action}
          onConfirmed={() => {
            void refresh();
            router.replace('/votes');
          }}
          onCancelled={() => setAction(null)}
          onClose={back}
        />
      ) : (
        <>
          <Txt variant="sectionTitle" accessibilityRole="header">
            {t('newProposal.chooseType')}
          </Txt>
          <ChoiceRow
            label={t('votes.types.MEMBER_ADD')}
            description={t('newProposal.typeHelp.MEMBER_ADD')}
            selected
            onPress={() => {}}
          />
          <View style={{ gap: space.s4 }}>
            <TextField
              label={t('newProposal.memberAdd.name')}
              value={name}
              onChangeText={setName}
              autoComplete="name"
            />
            <PhoneField
              label={t('newProposal.memberAdd.phone')}
              helper={t('newProposal.memberAdd.phoneHelp')}
              onChange={(e164) => setPhone(e164)}
            />
            <TextField
              label={`${t('newProposal.reason')} (${t('common.optional').toLocaleLowerCase(lang)})`}
              placeholder={t('newProposal.reasonPlaceholder')}
              helper={t('newProposal.reasonHelp')}
              value={reason}
              onChangeText={setReason}
              multiline
              maxLength={500}
            />
          </View>
          {needed > 0 ? (
            <Txt>
              {t('newProposal.preview', {
                needed,
                eligible,
                kind: t(
                  kind === 'MAJORITY'
                    ? 'newProposal.previewKinds.majority'
                    : 'newProposal.previewKinds.twoThirds',
                ),
              })}
            </Txt>
          ) : null}
          <Txt variant="secondary" color="textSecondary">
            {t('newProposal.window', { duration: t('time.duration.hours', { count: hours }) })}
          </Txt>
          <Txt variant="secondary" color="textSecondary">
            {t('newProposal.memberAdd.effect')}
          </Txt>
        </>
      )}
    </Screen>
  );
}

// S-32 Group settings, rules part (SCREENS.md): read-only rules. They change only by vote, admin
// included (GOV-01); proposing arrives with the Votes phase.
import { View } from 'react-native';
import { useRouter } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { CircleAlert } from 'lucide-react-native';
import { space } from '@/theme';
import { AppHeader, EmptyState, SkeletonRows, Txt } from '@/ui';
import { useActiveGroup, useRules } from '@/features/groups/useGroups';
import { RulesList } from '../shared/RulesList';
import { Screen } from '../shared/Screen';

export function GroupRulesScreen() {
  const { t } = useTranslation();
  const router = useRouter();
  const { group } = useActiveGroup();
  const rules = useRules(group?.groupId ?? null);
  return (
    <Screen
      header={
        <AppHeader
          kind="pushed"
          title={t('groupSettings.rules')}
          onBack={() => (router.canGoBack() ? router.back() : router.replace('/'))}
        />
      }
    >
      <Txt color="textSecondary">{t('groupSettings.rulesHelp')}</Txt>
      {rules.isPending ? <SkeletonRows rows={6} /> : null}
      {rules.isError ? (
        <EmptyState
          icon={CircleAlert}
          title={t('emptyStates.loadFailed.title')}
          body={t('emptyStates.loadFailed.body')}
          actionLabel={t('common.actions.retry')}
          onAction={() => void rules.refetch()}
        />
      ) : null}
      {rules.data ? (
        <>
          <Txt variant="secondary" color="textSecondary">
            {t('signup.consent.version', { version: String(rules.data.version) })}
          </Txt>
          <View style={{ marginHorizontal: -space.s4 }}>
            <RulesList params={rules.data.params} />
          </View>
          {group?.role === 'ADMIN' ? (
            <Txt variant="secondary" color="textSecondary">
              {t('groupSettings.adminLimits')}
            </Txt>
          ) : null}
        </>
      ) : null}
    </Screen>
  );
}

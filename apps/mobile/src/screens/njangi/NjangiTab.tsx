// S-10 Njangi tab (SCREENS.md), Phase 0: the app-built briefing and the chips that apply before the
// agent lands (DD-14). No group: create one or join from an invitation (J-1, J-2).
import { StyleSheet, View } from 'react-native';
import { useRouter } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { Users } from 'lucide-react-native';
import { useSession } from '@/state/session';
import { space } from '@/theme';
import { AgentMessage, Button, Chip, ChipRow, EmptyState, SkeletonRows } from '@/ui';
import { useActiveGroup } from '@/features/groups/useGroups';
import { TabScreen } from '../shell/TabScreen';

export function NjangiTab() {
  const { t } = useTranslation();
  const router = useRouter();
  const user = useSession((s) => s.user);
  const { group, loading } = useActiveGroup();
  const firstName = user?.name.split(' ')[0] ?? '';

  if (loading)
    return (
      <TabScreen>
        <SkeletonRows rows={4} />
      </TabScreen>
    );
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

  const admin = group.role === 'ADMIN';
  const forming = group.status === 'FORMING';
  const left = group.membershipStatus === 'LEFT' || group.membershipStatus === 'REMOVED';
  return (
    <TabScreen>
      <View style={styles.conv}>
        {left ? (
          <AgentMessage text={t('agent.greeting.left', { group: group.name })} />
        ) : (
          <>
            <AgentMessage
              text={t('agent.greeting.firstRun', { name: firstName, group: group.name })}
            />
            <AgentMessage startOfTurn={false} text={t('agent.greeting.firstRunTrust')} />
            {forming ? (
              <AgentMessage
                startOfTurn={false}
                text={
                  admin
                    ? t('agent.greeting.notStartedAdmin', { count: group.memberCount })
                    : t('agent.greeting.notStartedMember')
                }
              />
            ) : null}
          </>
        )}
      </View>
      {forming && admin ? (
        <ChipRow label={t('agent.chips.groupLabel')}>
          <Chip label={t('agent.chips.inviteMember')} onPress={() => router.push('/founding')} />
          <Chip label={t('agent.chips.startCycle')} onPress={() => router.push('/founding')} />
        </ChipRow>
      ) : null}
    </TabScreen>
  );
}

const styles = StyleSheet.create({
  center: { alignItems: 'center' },
  conv: { gap: space.s3, paddingTop: space.s4, marginHorizontal: -space.s4 },
});

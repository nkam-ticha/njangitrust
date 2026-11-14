// Caisse tab (SCREENS.md S-12 to S-17), Phase 0: the four segments with their designed empty
// states; before the first cycle the admin is sent to the founding members screen (S-08).
import { useState } from 'react';
import { View } from 'react-native';
import { useRouter } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { HeartHandshake, Landmark, ScrollText, Wallet } from 'lucide-react-native';
import { space } from '@/theme';
import { DailyCheckStrip, EmptyState, SegmentedControl } from '@/ui';
import { useActiveGroup } from '@/features/groups/useGroups';
import { TabScreen } from '../shell/TabScreen';

type Segment = 'tour' | 'fund' | 'solidarity' | 'ledger';

export function CaisseTab() {
  const { t } = useTranslation();
  const router = useRouter();
  const { group } = useActiveGroup();
  const [segment, setSegment] = useState<Segment>('tour');
  const admin = group?.role === 'ADMIN';
  const forming = !group || group.status === 'FORMING';

  return (
    <TabScreen>
      <View style={{ marginHorizontal: -space.s4 }}>
        <SegmentedControl
          accessibilityLabel={t('caisse.segmentsA11y')}
          value={segment}
          onChange={setSegment}
          segments={(['tour', 'fund', 'solidarity', 'ledger'] as const).map((key) => ({
            key,
            label: t(`caisse.segments.${key}`),
          }))}
        />
      </View>
      {segment === 'tour' ? (
        <EmptyState
          icon={Wallet}
          title={t('caisse.segments.tour')}
          body={
            forming
              ? admin
                ? t('caisse.tour.noCycleAdmin')
                : t('caisse.tour.noCycle')
              : t('caisse.tour.nobodyPaid')
          }
          actionLabel={forming && admin ? t('invite.founding.add') : undefined}
          onAction={forming && admin ? () => router.push('/founding') : undefined}
        />
      ) : null}
      {segment === 'fund' ? (
        <EmptyState
          icon={Landmark}
          title={t('caisse.fund.title')}
          body={t('caisse.fund.emptyLoans')}
        />
      ) : null}
      {segment === 'solidarity' ? (
        <EmptyState
          icon={HeartHandshake}
          title={t('caisse.solidarity.title')}
          body={t('caisse.solidarity.empty')}
        />
      ) : null}
      {segment === 'ledger' ? (
        <>
          <View style={{ marginHorizontal: -space.s4 }}>
            <DailyCheckStrip status="NOT_YET" onPress={() => {}} />
          </View>
          <EmptyState
            icon={ScrollText}
            title={t('caisse.ledger.title')}
            body={t('caisse.ledger.emptyAll')}
          />
        </>
      ) : null}
    </TabScreen>
  );
}

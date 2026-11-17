// Caisse tab (SCREENS.md S-12 to S-17; spec 1.4): the round, the general fund, the solidarity fund and
// the ledger. Each segment is its own section; the money figures and every change are the server's,
// and every money action is a card the member confirms (spec 4.5).
import { useState } from 'react';
import { View } from 'react-native';
import { useRouter } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { Wallet } from 'lucide-react-native';
import { space } from '@/theme';
import { EmptyState, SegmentedControl, SkeletonRows } from '@/ui';
import { useActiveGroup } from '@/features/groups/useGroups';
import { TabScreen } from '../shell/TabScreen';
import { FundSection } from './FundSection';
import { LedgerSection } from './LedgerSection';
import { SolidaritySection } from './SolidaritySection';
import { TourSection } from './TourSection';

type Segment = 'tour' | 'fund' | 'solidarity' | 'ledger';

export function CaisseTab() {
  const { t } = useTranslation();
  const router = useRouter();
  const { group, loading } = useActiveGroup();
  const [segment, setSegment] = useState<Segment>('tour');

  // The groups are still loading: a skeleton, not "no group yet".
  if (!group && loading) {
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
          icon={Wallet}
          title={t('caisse.segments.tour')}
          body={t('emptyStates.noGroup.body')}
          actionLabel={t('welcome.create')}
          onAction={() => router.push('/create-group')}
        />
      </TabScreen>
    );
  }

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
      {segment === 'tour' ? <TourSection group={group} /> : null}
      {segment === 'fund' ? <FundSection group={group} /> : null}
      {segment === 'solidarity' ? <SolidaritySection group={group} /> : null}
      {segment === 'ledger' ? <LedgerSection group={group} /> : null}
    </TabScreen>
  );
}

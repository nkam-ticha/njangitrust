// S-11 Groupe tab (SCREENS.md), Phase 0: the designed empty state until the chat module lands.
import { MessagesSquare } from 'lucide-react-native';
import { useTranslation } from 'react-i18next';
import { EmptyState } from '@/ui';
import { useActiveGroup } from '@/features/groups/useGroups';
import { TabScreen } from '../shell/TabScreen';

export function GroupeTab() {
  const { t } = useTranslation();
  const { group } = useActiveGroup();
  const left = group && (group.membershipStatus === 'LEFT' || group.membershipStatus === 'REMOVED');
  return (
    <TabScreen>
      <EmptyState
        icon={MessagesSquare}
        title={t('nav.tabs.groupe')}
        body={
          left ? t('chat.leftReadOnly') : group ? t('chat.empty') : t('emptyStates.noGroup.body')
        }
      />
    </TabScreen>
  );
}

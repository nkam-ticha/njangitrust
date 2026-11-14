// Every tab: the header (group switcher and bell, DESIGN_SYSTEM.md 5.8), the offline banner and
// the content, centred on wide screens.
import { useState, type ReactNode } from 'react';
import { useRouter } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { AppHeader } from '@/ui';
import { useActiveGroup } from '@/features/groups/useGroups';
import { useUnreadCount } from '@/features/notifications/useNotifications';
import { Screen } from '../shared/Screen';
import { GroupSwitcherSheet } from './GroupSwitcherSheet';

interface TabScreenProps {
  children: ReactNode;
  scroll?: boolean;
  width?: 'reading' | 'full';
  footer?: ReactNode;
}

export function TabScreen({ children, scroll = true, width = 'reading', footer }: TabScreenProps) {
  const { t } = useTranslation();
  const router = useRouter();
  const { group, groups, setGroupId } = useActiveGroup();
  const [switcher, setSwitcher] = useState(false);
  const unread = useUnreadCount();
  return (
    <>
      <Screen
        inTabs
        scroll={scroll}
        width={width}
        footer={footer}
        header={
          <AppHeader
            kind="tab"
            groupName={group?.name ?? t('common.appName')}
            unreadNotifications={unread}
            onSwitchGroup={() => setSwitcher(true)}
            onOpenNotifications={() => router.push('/notifications')}
          />
        }
      >
        {children}
      </Screen>
      <GroupSwitcherSheet
        visible={switcher}
        onClose={() => setSwitcher(false)}
        groups={groups}
        activeId={group?.groupId ?? null}
        onSelect={setGroupId}
      />
    </>
  );
}

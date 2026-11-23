// Developer console (D28): two tabs, Users and Groups. Shown only with a developer session; the
// route shows the developer login otherwise.
import { useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { useTranslation } from 'react-i18next';
import { LogOut } from 'lucide-react-native';
import { space } from '@/theme';
import { Banner, Button, SegmentedControl, Txt } from '@/ui';
import { endDeveloperSession } from '@/features/developer/developerApi';
import { Screen } from '../shared/Screen';
import { GroupsPanel } from './GroupsPanel';
import { UsersPanel } from './UsersPanel';

type Tab = 'users' | 'groups';

export function DeveloperConsoleScreen() {
  const { t } = useTranslation();
  const [tab, setTab] = useState<Tab>('users');

  return (
    <Screen
      header={
        <View style={styles.head}>
          <Txt variant="screenTitle" accessibilityRole="header" style={styles.title}>
            {t('developer.console.title')}
          </Txt>
          <Button
            variant="text"
            icon={LogOut}
            label={t('developer.console.leave')}
            onPress={() => endDeveloperSession()}
          />
        </View>
      }
    >
      <Banner kind="info" text={t('developer.console.notice')} />
      <SegmentedControl<Tab>
        segments={[
          { key: 'users', label: t('developer.console.tabs.users') },
          { key: 'groups', label: t('developer.console.tabs.groups') },
        ]}
        value={tab}
        onChange={setTab}
      />
      {tab === 'users' ? <UsersPanel /> : <GroupsPanel />}
    </Screen>
  );
}

const styles = StyleSheet.create({
  head: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.s1,
    paddingHorizontal: space.s4,
    minHeight: 56,
  },
  title: { flex: 1 },
});

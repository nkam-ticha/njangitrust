// S-26 Group switcher (SCREENS.md; GRP-05): my groups with their status, create or join another.
import { useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { useRouter } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { Check } from 'lucide-react-native';
import type { MyGroupDto } from '@njangi/shared/contracts/me';
import { space, useTheme } from '@/theme';
import { Avatar, BottomSheet, Button, GroupedList, ListRow, TextField } from '@/ui';
import { inviteTokenFrom } from '../welcome/WelcomeScreen';

interface GroupSwitcherSheetProps {
  visible: boolean;
  onClose: () => void;
  groups: MyGroupDto[];
  activeId: string | null;
  onSelect: (groupId: string) => void;
}

export function GroupSwitcherSheet({
  visible,
  onClose,
  groups,
  activeId,
  onSelect,
}: GroupSwitcherSheetProps) {
  const { t } = useTranslation();
  const { colors } = useTheme();
  const router = useRouter();
  const [joining, setJoining] = useState(false);
  const [link, setLink] = useState('');
  const [linkError, setLinkError] = useState<string | null>(null);

  const status = (g: MyGroupDto): string => {
    if (g.membershipStatus === 'LEFT' || g.membershipStatus === 'REMOVED')
      return t('groupSwitcher.rowLeft');
    if (g.status === 'FORMING') return t('groupSwitcher.rowNotStarted');
    return t('common.membersCount', { count: g.memberCount });
  };

  return (
    <BottomSheet visible={visible} onClose={onClose} title={t('groupSwitcher.title')}>
      {groups.length ? (
        <GroupedList style={styles.flush}>
          {groups.map((g) => (
            <ListRow
              key={g.groupId}
              leading={<Avatar name={g.name} />}
              title={g.name}
              subtitle={status(g)}
              selected={g.groupId === activeId}
              trailing={
                g.groupId === activeId ? (
                  <Check size={20} color={colors.iconActive} strokeWidth={2} />
                ) : undefined
              }
              accessibilityLabel={`${g.name}, ${status(g)}${g.groupId === activeId ? `, ${t('groupSwitcher.active')}` : ''}`}
              onPress={() => {
                onSelect(g.groupId);
                onClose();
              }}
            />
          ))}
        </GroupedList>
      ) : null}
      <View style={styles.actions}>
        {joining ? (
          <>
            <TextField
              label={t('welcome.invitationHelp.paste')}
              placeholder={t('welcome.invitationHelp.pastePlaceholder')}
              value={link}
              onChangeText={(v) => {
                setLink(v);
                setLinkError(null);
              }}
              autoCapitalize="none"
              keyboardType="url"
              error={linkError}
            />
            <Button
              fullWidth
              label={t('common.actions.continue')}
              disabled={!link.trim()}
              onPress={() => {
                const token = inviteTokenFrom(link);
                if (!token) return setLinkError(t('welcome.invitationHelp.invalid'));
                onClose();
                router.push(`/invite/${token}`);
              }}
            />
          </>
        ) : (
          <Button
            fullWidth
            variant="secondary"
            label={t('groupSwitcher.join')}
            onPress={() => setJoining(true)}
          />
        )}
        <Button
          fullWidth
          variant="text"
          label={t('groupSwitcher.create')}
          onPress={() => {
            onClose();
            router.push('/create-group');
          }}
        />
      </View>
    </BottomSheet>
  );
}

const styles = StyleSheet.create({
  flush: { marginHorizontal: 0 },
  actions: { gap: space.s2 },
});

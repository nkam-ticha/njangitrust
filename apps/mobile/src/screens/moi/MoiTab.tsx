// S-29 Moi (SCREENS.md), Phase 0: who I am, my payment number (masked), my groups, language,
// the group's rules, log out and log out everywhere (S-37, S-38).
import { useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { useRouter } from 'expo-router';
import { newRoute } from '../shared/routes';
import { useTranslation } from 'react-i18next';
import { signOut } from '@/api/session';
import { useSession } from '@/state/session';
import { space } from '@/theme';
import {
  Avatar,
  BottomSheet,
  Button,
  ChoiceRow,
  GroupedList,
  ListRow,
  MaskedNumber,
  SectionHeader,
  Txt,
  useLang,
} from '@/ui';
import { useActiveGroup } from '@/features/groups/useGroups';
import { useChangeLanguage } from '@/features/me/useMe';
import { progressCopy } from '@/dev/progress';
import { TabScreen } from '../shell/TabScreen';
import { ChangeNumberSheet, DeleteAccountSheet } from './AccountSheets';

type Sheet = 'language' | 'logout' | 'logoutAll' | 'number' | 'delete' | null;

export function MoiTab() {
  const { t } = useTranslation();
  const router = useRouter();
  const lang = useLang();
  const user = useSession((s) => s.user);
  const { groups, setGroupId, group } = useActiveGroup();
  const changeLanguage = useChangeLanguage();
  const [sheet, setSheet] = useState<Sheet>(null);
  const [leaving, setLeaving] = useState(false);
  if (!user) return null;

  const logout = async (everywhere: boolean) => {
    setLeaving(true);
    await signOut({ everywhere });
  };

  return (
    <TabScreen>
      <View style={styles.me}>
        <Avatar size={56} name={user.name} />
        <Txt variant="groupTitle" style={styles.flex}>
          {user.name}
        </Txt>
      </View>

      <View style={styles.flush}>
        <GroupedList>
          <ListRow
            title={t('moi.paymentNumber')}
            titleWeight="regular"
            subtitle={
              user.paymentNumber ? t(`common.operators.${user.paymentNumber.operator}`) : undefined
            }
            trailing={
              user.paymentNumber ? (
                <MaskedNumber
                  e164={user.paymentNumber.number}
                  variant="secondary"
                  color="textSecondary"
                />
              ) : undefined
            }
            chevron
            onPress={() => setSheet('number')}
          />
          <ListRow
            title={t('moi.language')}
            titleWeight="regular"
            trailing={<Txt>{t(`language.${lang}`)}</Txt>}
            chevron
            onPress={() => setSheet('language')}
          />
        </GroupedList>
      </View>

      {groups.length ? (
        <>
          <SectionHeader title={t('moi.groups')} />
          <View style={styles.flush}>
            <GroupedList>
              {groups.map((g) => (
                <ListRow
                  key={g.groupId}
                  title={g.name}
                  subtitle={
                    g.status === 'FORMING'
                      ? t('groupSwitcher.rowNotStarted')
                      : t('common.membersCount', { count: g.memberCount })
                  }
                  trailing={
                    g.role === 'ADMIN' ? (
                      <Txt variant="captionStrong" color="textSecondary">
                        {t('common.roles.ADMIN')}
                      </Txt>
                    ) : undefined
                  }
                  selected={g.groupId === group?.groupId}
                  onPress={() => setGroupId(g.groupId)}
                />
              ))}
            </GroupedList>
          </View>
        </>
      ) : null}

      <SectionHeader title={t('moi.settingsTitle')} />
      <View style={styles.flush}>
        <GroupedList>
          {group ? (
            <ListRow
              title={t('members.title')}
              titleWeight="regular"
              chevron
              onPress={() => router.push('/members')}
            />
          ) : null}
          {group ? (
            <ListRow
              title={t('loans.title')}
              titleWeight="regular"
              chevron
              onPress={() => router.push(newRoute('/loans'))}
            />
          ) : null}
          {group ? (
            <ListRow
              title={t('meetings.title')}
              titleWeight="regular"
              chevron
              onPress={() => router.push(newRoute('/meetings'))}
            />
          ) : null}
          {group ? (
            <ListRow
              title={t('moi.statements')}
              titleWeight="regular"
              chevron
              onPress={() => router.push(newRoute('/statements'))}
            />
          ) : null}
          <ListRow
            title={t('moi.agentHistory')}
            titleWeight="regular"
            chevron
            onPress={() => router.push(newRoute('/agent-history'))}
          />
          {group ? (
            <ListRow
              title={t('groupSettings.pinResets')}
              titleWeight="regular"
              chevron
              onPress={() => router.push('/pin-resets')}
            />
          ) : null}
          {group ? (
            <ListRow
              title={t('groupSettings.rules')}
              titleWeight="regular"
              chevron
              onPress={() => router.push('/group-rules')}
            />
          ) : null}
          <ListRow
            title={t('security.logoutEverywhere')}
            titleWeight="regular"
            subtitle={t('security.logoutEverywhereHelp')}
            onPress={() => setSheet('logoutAll')}
          />
          {/* Development builds only: what is built and what is coming. */}
          {__DEV__ ? (
            <ListRow
              title={progressCopy.title[lang]}
              titleWeight="regular"
              chevron
              onPress={() => router.push('/progress')}
            />
          ) : null}
        </GroupedList>
      </View>
      <Button
        variant="secondary"
        fullWidth
        label={t('moi.logout')}
        onPress={() => setSheet('logout')}
      />
      <Button
        variant="text"
        fullWidth
        label={t('privacy.delete.title')}
        onPress={() => setSheet('delete')}
      />
      <Txt variant="caption" color="textSecondary" align="center">
        {t('moi.version', { version: '0.1.0' })}
      </Txt>

      <BottomSheet
        visible={sheet === 'language'}
        onClose={() => setSheet(null)}
        title={t('language.title')}
      >
        <ChoiceRow
          label={t('language.fr')}
          selected={lang === 'fr'}
          onPress={() => changeLanguage.mutate('fr')}
        />
        <ChoiceRow
          label={t('language.en')}
          selected={lang === 'en'}
          onPress={() => changeLanguage.mutate('en')}
        />
        <Txt variant="secondary" color="textSecondary">
          {t('language.note')}
        </Txt>
      </BottomSheet>
      <BottomSheet
        visible={sheet === 'number'}
        onClose={() => setSheet(null)}
        title={t('paymentNumber.title')}
      >
        {sheet === 'number' ? <ChangeNumberSheet onDone={() => setSheet(null)} /> : null}
      </BottomSheet>
      <BottomSheet
        visible={sheet === 'delete'}
        onClose={() => setSheet(null)}
        title={t('privacy.delete.title')}
      >
        {sheet === 'delete' ? <DeleteAccountSheet onDone={() => setSheet(null)} /> : null}
      </BottomSheet>
      <BottomSheet
        visible={sheet === 'logout' || sheet === 'logoutAll'}
        onClose={() => setSheet(null)}
        title={
          sheet === 'logoutAll' ? t('session.logoutEverywhere.title') : t('session.logout.title')
        }
        footer={
          <Button
            fullWidth
            variant={sheet === 'logoutAll' ? 'destructive' : 'primary'}
            loading={leaving}
            label={
              sheet === 'logoutAll'
                ? t('session.logoutEverywhere.confirm')
                : t('session.logout.confirm')
            }
            onPress={() => void logout(sheet === 'logoutAll')}
          />
        }
      >
        <Txt>
          {sheet === 'logoutAll' ? t('session.logoutEverywhere.body') : t('session.logout.body')}
        </Txt>
      </BottomSheet>
    </TabScreen>
  );
}

const styles = StyleSheet.create({
  me: { flexDirection: 'row', alignItems: 'center', gap: space.s3, paddingTop: space.s2 },
  flush: { marginHorizontal: -space.s4 },
  flex: { flex: 1 },
});

// S-02 Welcome (SCREENS.md): create a njangi, join from an invitation, or log in.
import { useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { useRouter } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { Globe } from 'lucide-react-native';
import { setLanguage } from '@/i18n';
import { space, useTheme } from '@/theme';
import { BottomSheet, Button, RingMark, TextField, Txt, useLang } from '@/ui';
import { Screen } from '../shared/Screen';

/** The token from a pasted invitation link (`…/invite/<token>`), or null. */
export function inviteTokenFrom(text: string): string | null {
  const match = text.trim().match(/\/invite\/([A-Za-z0-9_-]{16,})/);
  return match?.[1] ?? null;
}

export function WelcomeScreen() {
  const { t } = useTranslation();
  const { colors } = useTheme();
  const router = useRouter();
  const lang = useLang();
  const [inviteOpen, setInviteOpen] = useState(false);
  const [link, setLink] = useState('');
  const [linkError, setLinkError] = useState<string | null>(null);

  return (
    <Screen
      width="form"
      footer={
        <>
          <Button fullWidth label={t('welcome.create')} onPress={() => router.push('/signup')} />
          <Button
            fullWidth
            variant="secondary"
            label={t('welcome.invitation')}
            onPress={() => setInviteOpen(true)}
          />
          <Button
            fullWidth
            variant="text"
            label={t('welcome.login')}
            onPress={() => router.push('/login')}
          />
        </>
      }
    >
      <View style={styles.lang}>
        <Button
          variant="text"
          icon={Globe}
          label={t('welcome.languageSwitch')}
          onPress={() => void setLanguage(lang === 'fr' ? 'en' : 'fr')}
        />
      </View>
      <View style={styles.hero}>
        <RingMark size={64} color={colors.iconActive} strokeWidth={1.5} />
        <Txt variant="screenTitle" align="center" accessibilityRole="header">
          {t('welcome.title')}
        </Txt>
        <Txt color="textSecondary" align="center">
          {t('welcome.body')}
        </Txt>
      </View>

      <BottomSheet
        visible={inviteOpen}
        onClose={() => setInviteOpen(false)}
        title={t('welcome.invitationHelp.title')}
        footer={
          <Button
            fullWidth
            label={t('common.actions.continue')}
            disabled={!link.trim()}
            onPress={() => {
              const token = inviteTokenFrom(link);
              if (!token) {
                setLinkError(t('welcome.invitationHelp.invalid'));
                return;
              }
              setInviteOpen(false);
              router.push(`/invite/${token}`);
            }}
          />
        }
      >
        <Txt>{t('welcome.invitationHelp.body')}</Txt>
        <TextField
          label={t('welcome.invitationHelp.paste')}
          placeholder={t('welcome.invitationHelp.pastePlaceholder')}
          value={link}
          onChangeText={(v) => {
            setLink(v);
            setLinkError(null);
          }}
          autoCapitalize="none"
          autoCorrect={false}
          keyboardType="url"
          error={linkError}
        />
      </BottomSheet>
    </Screen>
  );
}

const styles = StyleSheet.create({
  lang: { alignItems: 'flex-end' },
  hero: { alignItems: 'center', gap: space.s4, paddingTop: space.s10, paddingBottom: space.s6 },
});

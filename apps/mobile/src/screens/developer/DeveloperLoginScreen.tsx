// Developer login (D28): a separate sign-in for the app's owner. It never touches the member session.
import { useRef, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { useRouter } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { ArrowLeft } from 'lucide-react-native';
import { space, useTheme } from '@/theme';
import { Banner, Button, TextField, Touchable, Txt, useLang } from '@/ui';
import { useDeveloperLogin } from '@/features/developer/useDeveloper';
import { errorMessage } from '@/features/errors/errorMessage';
import { useDeveloperSession } from '@/state/developerSession';
import { Screen } from '../shared/Screen';

export function DeveloperLoginScreen() {
  const { t } = useTranslation();
  const { colors } = useTheme();
  const lang = useLang();
  const router = useRouter();
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  // Read when the request is made; never a mutation variable (it would sit in the cache).
  const typed = useRef({ username: '', password: '' });
  const login = useDeveloperLogin(() => ({
    username: typed.current.username.trim(),
    password: typed.current.password,
  }));
  const ended = useDeveloperSession((s) => s.ended);

  const submit = () => {
    if (!username.trim() || !password) return;
    login.mutate(undefined, {
      // The password never stays in memory longer than the attempt.
      onSettled: () => {
        typed.current.password = '';
        setPassword('');
      },
    });
  };

  const message = login.error ? errorMessage(login.error, t, lang) : null;

  return (
    <Screen
      width="form"
      header={
        <View style={styles.head}>
          <Touchable
            onPress={() => (router.canGoBack() ? router.back() : router.replace('/'))}
            radius={24}
            accessibilityRole="button"
            accessibilityLabel={t('common.actions.back')}
            style={styles.back}
          >
            <ArrowLeft size={24} color={colors.iconPrimary} strokeWidth={2} />
          </Touchable>
          <Txt variant="screenTitle" accessibilityRole="header" style={styles.title}>
            {t('developer.login.title')}
          </Txt>
        </View>
      }
      footer={
        <Button
          fullWidth
          label={login.isPending ? t('developer.login.checking') : t('developer.login.submit')}
          loading={login.isPending}
          disabled={!username.trim() || !password}
          onPress={submit}
        />
      }
    >
      {ended ? <Banner kind="info" text={t('developer.console.sessionEnded')} /> : null}
      <Txt color="textSecondary">{t('developer.login.body')}</Txt>
      <TextField
        label={t('developer.login.username')}
        value={username}
        onChangeText={(value) => {
          if (login.error) login.reset();
          typed.current.username = value;
          setUsername(value);
        }}
        autoCapitalize="none"
        autoCorrect={false}
        autoComplete="off"
        textContentType="username"
        returnKeyType="next"
      />
      <TextField
        label={t('developer.login.password')}
        value={password}
        onChangeText={(value) => {
          if (login.error) login.reset();
          typed.current.password = value;
          setPassword(value);
        }}
        secureTextEntry
        autoCapitalize="none"
        autoCorrect={false}
        autoComplete="off"
        textContentType="password"
        returnKeyType="go"
        onSubmitEditing={submit}
        error={message}
      />
    </Screen>
  );
}

const styles = StyleSheet.create({
  head: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.s1,
    paddingHorizontal: space.s1,
    minHeight: 56,
  },
  back: { width: 48, height: 48, alignItems: 'center', justifyContent: 'center' },
  title: { flex: 1 },
});

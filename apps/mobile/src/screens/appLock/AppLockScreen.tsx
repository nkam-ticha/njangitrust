// S-06 App lock (SCREENS.md; D4, D36): a full-screen cover over the signed-in app, phone only. The
// fingerprint or face check opens by itself and again on "Déverrouiller". "Utiliser mon code PIN" leaves
// this phone's session so the member logs in again with their number and PIN. The lock never replaces
// the PIN for sensitive actions, and it cannot trap a member: with nothing to check against, it opens.
import { useCallback, useEffect, useRef, useState } from 'react';
import { BackHandler, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTranslation } from 'react-i18next';
import { signOut } from '@/api/session';
import { space, useTheme } from '@/theme';
import { Button, RingMark, Txt } from '@/ui';
import { biometrics } from '@/features/appLock/biometrics';
import { setAuthenticating, unlockApp } from '@/features/appLock/appLockStore';

export function AppLockScreen() {
  const { t } = useTranslation();
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const [failed, setFailed] = useState(false);
  const [leaving, setLeaving] = useState(false);
  const busy = useRef(false);

  const check = useCallback(async () => {
    if (busy.current) return;
    busy.current = true;
    setAuthenticating(true);
    try {
      const result = await biometrics.authenticate({
        prompt: t('appLock.title'),
        cancel: t('common.actions.cancel'),
      });
      if (result === 'success' || result === 'unavailable') unlockApp();
      setFailed(result === 'failed');
    } finally {
      setAuthenticating(false);
      busy.current = false;
    }
  }, [t]);

  // The check opens as soon as the cover appears.
  useEffect(() => {
    void check();
  }, [check]);

  // The Android back button must not reveal the app under the cover.
  useEffect(() => {
    const sub = BackHandler.addEventListener('hardwareBackPress', () => true);
    return () => sub.remove();
  }, []);

  return (
    <View
      accessibilityViewIsModal
      style={[
        styles.cover,
        {
          backgroundColor: colors.canvas,
          paddingTop: insets.top + space.s6,
          paddingBottom: insets.bottom + space.s6,
        },
      ]}
    >
      <View style={styles.center}>
        <RingMark size={64} color={colors.iconActive} strokeWidth={1.5} />
        <Txt variant="screenTitle" align="center" accessibilityRole="header">
          {t('appLock.title')}
        </Txt>
        <Txt color="textSecondary" align="center">
          {t('appLock.body')}
        </Txt>
        {failed ? (
          <Txt
            variant="secondary"
            color="textDanger"
            align="center"
            accessibilityLiveRegion="polite"
          >
            {t('appLock.failed')}
          </Txt>
        ) : null}
      </View>
      <View style={styles.actions}>
        <Button fullWidth label={t('appLock.unlock')} onPress={() => check()} />
        <Button
          fullWidth
          variant="text"
          label={t('appLock.usePin')}
          loading={leaving}
          onPress={async () => {
            setLeaving(true);
            await signOut({ everywhere: false });
          }}
        />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  cover: {
    ...StyleSheet.absoluteFill,
    zIndex: 1000,
    paddingHorizontal: space.s6,
    justifyContent: 'space-between',
  },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: space.s4 },
  actions: { gap: space.s2, width: '100%', maxWidth: 440, alignSelf: 'center' },
});

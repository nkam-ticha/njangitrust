// Moi > Sécurité, the app lock (S-06, S-38; D4, D36): phone only, off by default. Turning it on asks
// for the fingerprint or face once, so a lock that cannot be opened is never switched on. The PIN still
// guards every sensitive action. Hidden on the web.
import { useState } from 'react';
import { Platform, StyleSheet, View } from 'react-native';
import { useTranslation } from 'react-i18next';
import { space } from '@/theme';
import { ChoiceRow, SectionHeader, SwitchRow, Txt } from '@/ui';
import { biometrics } from '@/features/appLock/biometrics';
import {
  LOCK_DELAYS,
  DEFAULT_LOCK_DELAY,
  type LockDelayMinutes,
} from '@/features/appLock/appLockLogic';
import { saveAppLock, setAuthenticating, useAppLock } from '@/features/appLock/appLockStore';

const DELAY_KEY = {
  0: 'appLock.settings.immediately',
  1: 'appLock.settings.after1',
  5: 'appLock.settings.after5',
} as const satisfies Record<LockDelayMinutes, string>;

export function SecuritySection() {
  return Platform.OS === 'web' ? null : <PhoneSecurity />;
}

function PhoneSecurity() {
  const { t } = useTranslation();
  const settings = useAppLock((s) => s.settings);
  const [unavailable, setUnavailable] = useState(false);
  const [working, setWorking] = useState(false);

  const turnOn = async () => {
    setWorking(true);
    setUnavailable(false);
    try {
      const availability = await biometrics.availability();
      if (availability !== 'ok') {
        setUnavailable(true);
        return;
      }
      setAuthenticating(true);
      const result = await biometrics.authenticate({
        prompt: t('appLock.title'),
        cancel: t('common.actions.cancel'),
      });
      if (result === 'success')
        await saveAppLock({ enabled: true, afterMinutes: DEFAULT_LOCK_DELAY });
      else if (result === 'unavailable') setUnavailable(true);
    } finally {
      setAuthenticating(false);
      setWorking(false);
    }
  };

  return (
    <>
      <SectionHeader title={t('moi.security')} />
      <SwitchRow
        label={t('appLock.settings.toggle')}
        helper={unavailable ? t('appLock.settings.unavailable') : t('appLock.settings.help')}
        value={settings.enabled}
        disabled={working}
        onChange={(on) => {
          if (on) void turnOn();
          else void saveAppLock({ ...settings, enabled: false });
        }}
      />
      {settings.enabled ? (
        <View style={styles.delays}>
          <Txt variant="secondaryStrong">{t('appLock.settings.after')}</Txt>
          {LOCK_DELAYS.map((minutes) => (
            <ChoiceRow
              key={minutes}
              label={t(DELAY_KEY[minutes])}
              selected={settings.afterMinutes === minutes}
              onPress={() => void saveAppLock({ ...settings, afterMinutes: minutes })}
            />
          ))}
        </View>
      ) : null}
    </>
  );
}

const styles = StyleSheet.create({
  delays: { gap: space.s2, paddingHorizontal: space.s4 },
});

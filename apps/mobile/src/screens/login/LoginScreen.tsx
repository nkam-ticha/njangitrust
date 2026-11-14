// S-04 Login (SCREENS.md; ACC-02): phone, then PIN. Five wrong PINs lock login for 15 minutes.
import { useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { useRouter } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { ArrowLeft } from 'lucide-react-native';
import { maskNumber } from '@njangi/shared';
import { space, useTheme } from '@/theme';
import { Button, PhoneField, PinPad, Touchable, Txt, useLang } from '@/ui';
import { useLogin } from '@/features/auth/useAuth';
import { errorCode, errorMessage } from '@/features/errors/errorMessage';
import { Screen } from '../shared/Screen';

export function LoginScreen() {
  const { t } = useTranslation();
  const { colors } = useTheme();
  const lang = useLang();
  const router = useRouter();
  const login = useLogin();
  const [phone, setPhone] = useState<string | null>(null);
  const [step, setStep] = useState<'phone' | 'pin'>('phone');
  const [pin, setPin] = useState('');

  const code = errorCode(login.error);
  const locked = code === 'LOGIN_LOCKED';
  const message = login.error ? errorMessage(login.error, t, lang) : null;

  const header = (
    <View style={styles.head}>
      <Touchable
        onPress={() =>
          step === 'pin' ? (setStep('phone'), setPin(''), login.reset()) : router.back()
        }
        radius={24}
        accessibilityRole="button"
        accessibilityLabel={t('common.actions.back')}
        style={styles.back}
      >
        <ArrowLeft size={24} color={colors.iconPrimary} strokeWidth={2} />
      </Touchable>
      <Txt variant="screenTitle" accessibilityRole="header">
        {t('login.title')}
      </Txt>
    </View>
  );

  if (step === 'phone') {
    return (
      <Screen
        width="form"
        header={header}
        footer={
          <>
            <Button
              fullWidth
              label={t('common.actions.continue')}
              disabled={!phone}
              onPress={() => setStep('pin')}
            />
            <Button
              fullWidth
              variant="text"
              label={t('login.noAccount')}
              onPress={() => router.replace('/signup')}
            />
          </>
        }
      >
        <PhoneField
          label={t('login.phoneLabel')}
          initialDigits={phone?.slice(4) ?? ''}
          onChange={(e164) => setPhone(e164)}
        />
      </Screen>
    );
  }

  return (
    <Screen width="form" header={header}>
      <View style={styles.center}>
        <Txt variant="sectionTitle" align="center">
          {t('login.pinTitle')}
        </Txt>
        {phone ? (
          <Txt color="textSecondary" align="center">
            {t('login.pinBody', { maskedPhone: maskNumber(phone) })}
          </Txt>
        ) : null}
        <Button
          variant="text"
          label={t('login.changeNumber')}
          onPress={() => {
            setStep('phone');
            setPin('');
            login.reset();
          }}
        />
      </View>
      <PinPad
        value={pin}
        onChange={(v) => {
          if (login.error) login.reset();
          setPin(v);
        }}
        error={!!message && !login.isPending}
        disabled={login.isPending || locked}
        onComplete={(p) => {
          if (!phone) return;
          login.mutate({ phone, pin: p }, { onError: () => setPin('') });
        }}
      />
      <Txt
        variant="secondary"
        color={message ? 'textDanger' : 'textSecondary'}
        align="center"
        accessibilityLiveRegion="assertive"
      >
        {login.isPending ? t('pinSheet.checking') : (message ?? '')}
      </Txt>
      <View style={styles.center}>
        <Button
          variant={locked ? 'secondary' : 'text'}
          label={t('login.forgotPin')}
          onPress={() => router.push('/forgot-pin')}
        />
      </View>
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
  center: { alignItems: 'center', gap: space.s1 },
});

// S-05 Forgot PIN, part 3 (SCREENS.md; ACC-04): from the one-time link, confirm the login phone
// and choose a new PIN twice. Success signs the member in; withdrawals then wait 48 hours.
import { useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { CircleAlert, Clock } from 'lucide-react-native';
import { formatDateTime } from '@njangi/shared';
import { space } from '@/theme';
import { Button, EmptyState, PhoneField, PinPad, SkeletonRows, Txt, useLang } from '@/ui';
import { usePinResetComplete, usePinResetLink } from '@/features/auth/useAuth';
import { errorCode, errorDetails, errorMessage } from '@/features/errors/errorMessage';
import { isTrivialPin } from '../signup/SignupFlow';
import { Screen } from '../shared/Screen';

export function ResetPinScreen() {
  const { token = '' } = useLocalSearchParams<{ token: string }>();
  const { t } = useTranslation();
  const lang = useLang();
  const router = useRouter();
  const link = usePinResetLink(token);
  const complete = usePinResetComplete(token);
  const [phone, setPhone] = useState<string | null>(null);
  const [step, setStep] = useState<'phone' | 'pin' | 'confirm'>('phone');
  const [pin, setPin] = useState('');
  const [pin2, setPin2] = useState('');
  const [localError, setLocalError] = useState<string | null>(null);

  if (link.isPending)
    return (
      <Screen width="form">
        <SkeletonRows rows={3} />
      </Screen>
    );
  if (link.isError) {
    const used = errorCode(link.error) === 'PIN_RESET_LINK_USED';
    // D14: the link only works 24 hours after the approval; the server says from when.
    const usableFrom = errorDetails(link.error).usableFrom;
    if (typeof usableFrom === 'string') {
      return (
        <Screen width="form">
          <EmptyState
            icon={Clock}
            title={t('pinReset.set.title')}
            body={t('pinReset.set.wait', { date: formatDateTime(usableFrom, lang) })}
          />
        </Screen>
      );
    }
    return (
      <Screen width="form">
        <EmptyState
          icon={CircleAlert}
          title={t('pinReset.set.title')}
          body={used ? t('pinReset.set.used') : t('pinReset.set.expired')}
          actionLabel={t('pinReset.request.submit')}
          onAction={() => router.replace('/forgot-pin')}
        />
      </Screen>
    );
  }

  const serverError = complete.error ? errorMessage(complete.error, t, lang) : null;
  const message = localError ?? serverError;
  return (
    <Screen
      width="form"
      footer={
        step === 'phone' ? (
          <Button
            fullWidth
            label={t('common.actions.continue')}
            disabled={!phone}
            onPress={() => setStep('pin')}
          />
        ) : undefined
      }
    >
      <Txt variant="screenTitle" accessibilityRole="header">
        {step === 'confirm' ? t('signup.pin.confirmTitle') : t('pinReset.set.title')}
      </Txt>
      <Txt color="textSecondary">{link.data.name}</Txt>
      {step === 'phone' ? (
        <PhoneField
          label={t('login.phoneLabel')}
          error={serverError}
          onChange={(e164) => setPhone(e164)}
        />
      ) : null}
      {step === 'pin' ? (
        <PinPad
          value={pin}
          onChange={setPin}
          error={!!message}
          onComplete={(p) => {
            if (isTrivialPin(p)) {
              setLocalError(t('signup.pin.tooSimple'));
              setPin('');
              return;
            }
            setLocalError(null);
            setStep('confirm');
          }}
        />
      ) : null}
      {step === 'confirm' ? (
        <PinPad
          value={pin2}
          onChange={setPin2}
          disabled={complete.isPending}
          error={!!message}
          onComplete={(p) => {
            if (p !== pin || !phone) {
              setLocalError(t('signup.pin.mismatch'));
              setPin('');
              setPin2('');
              setStep('pin');
              return;
            }
            complete.mutate(
              { phone, newPin: p },
              {
                onError: (err) => {
                  setPin('');
                  setPin2('');
                  setStep(errorCode(err) === 'PIN_TOO_WEAK' ? 'pin' : 'phone');
                },
              },
            );
          }}
        />
      ) : null}
      {step !== 'phone' ? (
        <View accessibilityLiveRegion="assertive">
          <Txt variant="secondary" color={message ? 'textDanger' : 'textSecondary'} align="center">
            {complete.isPending ? t('pinSheet.checking') : (message ?? t('signup.pin.createHelp'))}
          </Txt>
        </View>
      ) : null}
      <Txt variant="secondary" color="textSecondary" style={styles.note}>
        {t('pinReset.request.sent.holdNote', { hours: 48 })}
      </Txt>
    </Screen>
  );
}

const styles = StyleSheet.create({
  note: { marginTop: space.s4 },
});

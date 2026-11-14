// S-03 Sign-up steps (SCREENS.md; ACC-01): name, login phone, payment number with operator,
// consent, PIN, PIN again. Shared by Sign-up and by accepting an invitation.
import { useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { useTranslation } from 'react-i18next';
import { ArrowLeft } from 'lucide-react-native';
import { detectOperator, formatOwnNumber, type Operator } from '@njangi/shared';
import { CURRENT_CONSENT_VERSION } from '@njangi/shared/contracts/auth';
import { space, useTheme } from '@/theme';
import { Button, ChoiceRow, PhoneField, PinPad, TextField, Touchable, Txt, useLang } from '@/ui';
import { errorCode, errorMessage } from '@/features/errors/errorMessage';
import { Screen } from '../shared/Screen';

export interface SignupValues {
  name: string;
  phone: string;
  paymentNumber?: { number: string; operator: 'MTN' | 'ORANGE' };
  pin: string;
}

interface SignupFlowProps {
  onSubmit: (values: SignupValues) => void;
  submitting: boolean;
  error: unknown;
  onLogin: () => void;
  onExit: () => void;
  /** Shown above the first step when joining a group. */
  context?: string;
}

type Step = 'name' | 'phone' | 'payment' | 'consent' | 'pin' | 'confirm';
const STEPS: Step[] = ['name', 'phone', 'payment', 'consent', 'pin', 'confirm'];

/** 111111, 123456, 654321 and the like (the server applies the full policy, PIN_TOO_WEAK). */
export function isTrivialPin(pin: string): boolean {
  const d = pin.split('').map(Number);
  const same = d.every((x) => x === d[0]);
  const up = d.every((x, i) => i === 0 || x === (d[i - 1]! + 1) % 10);
  const down = d.every((x, i) => i === 0 || x === (d[i - 1]! + 9) % 10);
  return same || up || down;
}

export function SignupFlow({
  onSubmit,
  submitting,
  error,
  onLogin,
  onExit,
  context,
}: SignupFlowProps) {
  const { t } = useTranslation();
  const { colors } = useTheme();
  const lang = useLang();
  const [step, setStep] = useState<Step>('name');
  const [name, setName] = useState('');
  const [phone, setPhone] = useState<string | null>(null);
  const [useOther, setUseOther] = useState(false);
  const [other, setOther] = useState<string | null>(null);
  const [operator, setOperator] = useState<Operator | null>(null);
  const [consent, setConsent] = useState(false);
  const [pin, setPin] = useState('');
  const [pin2, setPin2] = useState('');
  const [localError, setLocalError] = useState<string | null>(null);

  // Server errors send the member back to the step they concern.
  const code = errorCode(error);
  const serverError = error ? errorMessage(error, t, lang) : null;
  const errorStep: Step | null = !error
    ? null
    : code === 'PHONE_ALREADY_REGISTERED' || code === 'INVITE_PHONE_MISMATCH'
      ? 'phone'
      : code === 'PIN_TOO_WEAK'
        ? 'pin'
        : 'confirm';

  const [seenError, setSeenError] = useState<unknown>(error);
  if (seenError !== error) {
    setSeenError(error);
    if (errorStep && errorStep !== 'confirm') {
      setPin('');
      setPin2('');
      setStep(errorStep);
    }
  }

  const index = STEPS.indexOf(step);
  const go = (next: Step) => {
    setLocalError(null);
    setStep(next);
  };
  const back = () => (index === 0 ? onExit() : go(STEPS[index - 1]!));
  const paymentNumber = useOther ? other : phone;
  const shownOperator = operator ?? (paymentNumber ? detectOperator(paymentNumber) : null);

  const submit = (finalPin: string) => {
    if (!phone || !paymentNumber || (shownOperator !== 'MTN' && shownOperator !== 'ORANGE')) return;
    onSubmit({
      name: name.trim(),
      phone,
      paymentNumber: { number: paymentNumber, operator: shownOperator },
      pin: finalPin,
    });
  };

  const canContinue =
    (step === 'name' && name.trim().length >= 2) ||
    (step === 'phone' && !!phone) ||
    (step === 'payment' &&
      !!paymentNumber &&
      (shownOperator === 'MTN' || shownOperator === 'ORANGE')) ||
    (step === 'consent' && consent);

  const header = (
    <View style={styles.head}>
      <Touchable
        onPress={back}
        radius={24}
        accessibilityRole="button"
        accessibilityLabel={t('common.actions.back')}
        style={styles.back}
      >
        <ArrowLeft size={24} color={colors.iconPrimary} strokeWidth={2} />
      </Touchable>
      <Txt
        variant="secondary"
        color="textSecondary"
        accessibilityLabel={t('a11y.stepProgress', { current: index + 1, total: STEPS.length })}
      >
        {t('common.stepOf', { current: index + 1, total: STEPS.length })}
      </Txt>
    </View>
  );
  const footer =
    step === 'pin' || step === 'confirm' ? undefined : (
      <Button
        fullWidth
        label={t('common.actions.continue')}
        disabled={!canContinue}
        onPress={() => go(STEPS[index + 1]!)}
      />
    );
  const stepError = localError ?? (errorStep === step ? serverError : null);

  return (
    <Screen width="form" header={header} footer={footer}>
      {context && step === 'name' ? <Txt color="textSecondary">{context}</Txt> : null}
      {step === 'name' ? (
        <>
          <Txt variant="screenTitle" accessibilityRole="header">
            {t('signup.name.title')}
          </Txt>
          <TextField
            label={t('signup.name.label')}
            placeholder={t('signup.name.placeholder')}
            helper={t('signup.name.help')}
            value={name}
            onChangeText={setName}
            autoComplete="name"
            textContentType="name"
            autoFocus
          />
        </>
      ) : null}
      {step === 'phone' ? (
        <>
          <Txt variant="screenTitle" accessibilityRole="header">
            {t('signup.loginPhone.title')}
          </Txt>
          <PhoneField
            label={t('signup.loginPhone.label')}
            helper={t('signup.loginPhone.help')}
            error={stepError}
            initialDigits={phone?.slice(4) ?? ''}
            onChange={(e164) => setPhone(e164)}
          />
          {code === 'PHONE_ALREADY_REGISTERED' ? (
            <Button variant="text" label={t('login.submit')} onPress={onLogin} />
          ) : null}
        </>
      ) : null}
      {step === 'payment' ? (
        <>
          <Txt variant="screenTitle" accessibilityRole="header">
            {t('signup.paymentNumber.title')}
          </Txt>
          <Txt color="textSecondary">{t('signup.paymentNumber.body')}</Txt>
          <ChoiceRow
            label={t('signup.paymentNumber.sameAsLogin')}
            description={phone ? formatOwnNumber(phone) : undefined}
            selected={!useOther}
            onPress={() => {
              setUseOther(false);
              setOperator(null);
            }}
          />
          <ChoiceRow
            label={t('signup.paymentNumber.other')}
            selected={useOther}
            onPress={() => {
              setUseOther(true);
              setOperator(null);
            }}
          />
          {useOther ? (
            <PhoneField
              label={t('signup.paymentNumber.label')}
              initialDigits={other?.slice(4) ?? ''}
              onChange={(e164) => {
                setOther(e164);
                setOperator(null);
              }}
            />
          ) : null}
          {paymentNumber ? (
            <>
              <Txt variant="secondaryStrong">{t('signup.paymentNumber.operatorLabel')}</Txt>
              <Txt variant="secondary" color="textSecondary">
                {shownOperator === 'UNKNOWN'
                  ? t('signup.paymentNumber.unknownOperator')
                  : t('signup.paymentNumber.detected', {
                      operator: t(`common.operators.${shownOperator ?? 'UNKNOWN'}`),
                    })}
              </Txt>
              <ChoiceRow
                label={t('common.operators.MTN')}
                selected={shownOperator === 'MTN'}
                onPress={() => setOperator('MTN')}
              />
              <ChoiceRow
                label={t('common.operators.ORANGE')}
                selected={shownOperator === 'ORANGE'}
                onPress={() => setOperator('ORANGE')}
              />
            </>
          ) : null}
          <Txt variant="secondary" color="textSecondary">
            {t('signup.paymentNumber.help')}
          </Txt>
        </>
      ) : null}
      {step === 'consent' ? (
        <>
          <Txt variant="screenTitle" accessibilityRole="header">
            {t('signup.consent.title')}
          </Txt>
          <Txt>{t('signup.consent.intro')}</Txt>
          {(['name', 'identity', 'money', 'votes', 'agent'] as const).map((k) => (
            <Txt key={k} color="textSecondary">{`•  ${t(`signup.consent.items.${k}`)}`}</Txt>
          ))}
          <Txt variant="secondary" color="textSecondary">
            {t('signup.consent.abroad')}
          </Txt>
          <ChoiceRow
            kind="check"
            label={t('signup.consent.checkbox')}
            description={t('signup.consent.version', { version: CURRENT_CONSENT_VERSION })}
            selected={consent}
            onPress={() => setConsent(!consent)}
          />
          <Txt variant="secondary" color="textSecondary">
            {t('signup.consent.rights')}
          </Txt>
        </>
      ) : null}
      {step === 'pin' ? (
        <>
          <Txt variant="screenTitle" accessibilityRole="header">
            {t('signup.pin.createTitle')}
          </Txt>
          <Txt color="textSecondary">{t('signup.pin.createBody')}</Txt>
          <PinPad
            value={pin}
            onChange={setPin}
            error={!!stepError}
            onComplete={(p) => {
              if (isTrivialPin(p)) {
                setLocalError(t('signup.pin.tooSimple'));
                setPin('');
                return;
              }
              setPin2('');
              go('confirm');
            }}
          />
          <Txt
            variant="secondary"
            color={stepError ? 'textDanger' : 'textSecondary'}
            align="center"
          >
            {stepError ?? t('signup.pin.createHelp')}
          </Txt>
        </>
      ) : null}
      {step === 'confirm' ? (
        <>
          <Txt variant="screenTitle" accessibilityRole="header">
            {t('signup.pin.confirmTitle')}
          </Txt>
          <Txt color="textSecondary">{t('signup.pin.confirmBody')}</Txt>
          <PinPad
            value={pin2}
            onChange={setPin2}
            disabled={submitting}
            error={!!stepError}
            onComplete={(p) => {
              if (p !== pin) {
                setPin('');
                setPin2('');
                setLocalError(t('signup.pin.mismatch'));
                setStep('pin');
                return;
              }
              submit(p);
            }}
          />
          <Txt
            variant="secondary"
            color={stepError ? 'textDanger' : 'textSecondary'}
            align="center"
            accessibilityLiveRegion="polite"
          >
            {submitting ? t('signup.creating') : (stepError ?? '')}
          </Txt>
        </>
      ) : null}
    </Screen>
  );
}

const styles = StyleSheet.create({
  head: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.s2,
    paddingHorizontal: space.s1,
    minHeight: 56,
  },
  back: { width: 48, height: 48, alignItems: 'center', justifyContent: 'center' },
});

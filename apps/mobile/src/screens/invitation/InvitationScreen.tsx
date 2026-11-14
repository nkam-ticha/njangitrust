// S-09 Invitation (SCREENS.md; ACC-03, R1.5): the group, who invited, the current rules, then
// sign-up, login, or joining as the signed-in member. Reachable signed in or out.
import { useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { CircleAlert, CircleCheck } from 'lucide-react-native';
import { formatXAF } from '@njangi/shared';
import { CURRENT_CONSENT_VERSION } from '@njangi/shared/contracts/auth';
import { useSession } from '@/state/session';
import { space, useTheme } from '@/theme';
import { Button, EmptyState, PhoneField, PinPad, RingMark, SkeletonRows, Txt, useLang } from '@/ui';
import { useLogin } from '@/features/auth/useAuth';
import { useAcceptInvite, useInvitePreview } from '@/features/invites/useInvites';
import { errorCode, errorMessage } from '@/features/errors/errorMessage';
import { SignupFlow } from '../signup/SignupFlow';
import { RulesList } from '../shared/RulesList';
import { Screen } from '../shared/Screen';

type Mode = 'preview' | 'signup' | 'login';

export function InvitationScreen() {
  const { token = '' } = useLocalSearchParams<{ token: string }>();
  const { t } = useTranslation();
  const { colors } = useTheme();
  const lang = useLang();
  const router = useRouter();
  const signedIn = useSession((s) => s.status === 'signedIn');
  const preview = useInvitePreview(token);
  const accept = useAcceptInvite(token);
  const login = useLogin();
  const [mode, setMode] = useState<Mode>('preview');
  const [phone, setPhone] = useState<string | null>(null);
  const [pin, setPin] = useState('');

  if (preview.isPending)
    return (
      <Screen width="form">
        <SkeletonRows rows={4} />
      </Screen>
    );
  if (preview.isError) {
    return (
      <Screen width="form">
        <EmptyState
          icon={CircleAlert}
          title={t('welcome.invitation')}
          body={errorMessage(preview.error, t, lang)}
          actionLabel={t('common.actions.close')}
          onAction={() => router.replace('/')}
        />
      </Screen>
    );
  }
  const invite = preview.data;
  const inviter = invite.invitedByName;

  if (accept.isSuccess) {
    return (
      <Screen
        width="form"
        footer={
          <Button
            fullWidth
            label={t('common.actions.continue')}
            onPress={() => router.replace('/')}
          />
        }
      >
        <View style={styles.center}>
          <CircleCheck size={32} color={colors.statusPaid} strokeWidth={2} />
          <Txt variant="sectionTitle" align="center">
            {t('invite.landing.joined', { group: invite.groupName })}
          </Txt>
          {!invite.founding ? (
            <Txt color="textSecondary" align="center">
              {t('chat.pendingActivationNote')}
            </Txt>
          ) : null}
        </View>
      </Screen>
    );
  }

  if (mode === 'signup' && !signedIn) {
    return (
      <SignupFlow
        context={t('invite.landing.title', { inviter, group: invite.groupName })}
        submitting={accept.isPending}
        error={accept.error}
        onLogin={() => setMode('login')}
        onExit={() => setMode('preview')}
        onSubmit={(v) => {
          accept.reset();
          accept.mutate({
            mode: 'signup',
            ...v,
            consent: true,
            consentVersion: CURRENT_CONSENT_VERSION,
            language: lang,
          });
        }}
      />
    );
  }

  if (mode === 'login' && !signedIn) {
    const message = login.error ? errorMessage(login.error, t, lang) : null;
    return (
      <Screen
        width="form"
        footer={
          <Button
            fullWidth
            variant="text"
            label={t('common.actions.back')}
            onPress={() => setMode('preview')}
          />
        }
      >
        <Txt variant="screenTitle" accessibilityRole="header">
          {t('login.title')}
        </Txt>
        <PhoneField label={t('login.phoneLabel')} onChange={(e164) => setPhone(e164)} />
        {phone ? (
          <>
            <Txt variant="sectionTitle" align="center">
              {t('login.pinTitle')}
            </Txt>
            <PinPad
              value={pin}
              onChange={setPin}
              error={!!message}
              disabled={login.isPending || errorCode(login.error) === 'LOGIN_LOCKED'}
              onComplete={(p) => login.mutate({ phone, pin: p }, { onError: () => setPin('') })}
            />
            <Txt
              variant="secondary"
              color={message ? 'textDanger' : 'textSecondary'}
              align="center"
            >
              {login.isPending ? t('pinSheet.checking') : (message ?? '')}
            </Txt>
          </>
        ) : null}
      </Screen>
    );
  }

  const acceptError = accept.error ? errorMessage(accept.error, t, lang, { inviter }) : null;
  return (
    <Screen
      width="form"
      footer={
        <>
          {acceptError ? (
            <Txt variant="secondary" color="textDanger" accessibilityLiveRegion="assertive">
              {acceptError}
            </Txt>
          ) : null}
          <Button
            fullWidth
            label={t('invite.landing.join', { group: invite.groupName })}
            loading={accept.isPending}
            onPress={() => (signedIn ? accept.mutate({ mode: 'existing' }) : setMode('signup'))}
          />
          {!signedIn ? (
            <Button
              fullWidth
              variant="text"
              label={t('invite.landing.haveAccount')}
              onPress={() => setMode('login')}
            />
          ) : null}
        </>
      }
    >
      <View style={styles.center}>
        <RingMark size={64} color={colors.iconActive} strokeWidth={1.5} />
        <Txt variant="screenTitle" align="center" accessibilityRole="header">
          {t('invite.landing.title', { inviter, group: invite.groupName })}
        </Txt>
        <Txt color="textSecondary" align="center">
          {[
            t('invite.landing.facts.members', { count: invite.memberCount }),
            t('invite.landing.facts.contribution', {
              amount: formatXAF(invite.rules.params.contributionAmount, lang),
              frequency: t(`common.frequency.${invite.rules.params.frequency}`).toLocaleLowerCase(
                lang,
              ),
            }),
          ].join(' · ')}
        </Txt>
        {invite.founding ? (
          <Txt variant="secondary" color="textSecondary" align="center">
            {t('invite.landing.facts.notStarted')}
          </Txt>
        ) : null}
      </View>
      <Txt variant="sectionTitle" accessibilityRole="header">
        {t('invite.landing.rulesTitle')}
      </Txt>
      <RulesList params={invite.rules.params} />
      <Txt variant="secondary" color="textSecondary">
        {t('invite.landing.rulesNote')}
      </Txt>
    </Screen>
  );
}

const styles = StyleSheet.create({
  center: { alignItems: 'center', gap: space.s3, paddingTop: space.s6 },
});

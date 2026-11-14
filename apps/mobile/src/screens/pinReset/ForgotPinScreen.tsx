// S-05 Forgot PIN, part 1 (SCREENS.md; ACC-04, D8): the member asks; an admin (or, for the admin,
// two members) confirms in the app and sends the 30-minute link.
import { useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { useRouter } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { ArrowLeft, CircleCheck } from 'lucide-react-native';
import { space, useTheme } from '@/theme';
import { Button, PhoneField, Touchable, Txt, useLang } from '@/ui';
import { usePinResetRequest } from '@/features/auth/useAuth';
import { errorMessage } from '@/features/errors/errorMessage';
import { Screen } from '../shared/Screen';

export function ForgotPinScreen() {
  const { t } = useTranslation();
  const { colors } = useTheme();
  const lang = useLang();
  const router = useRouter();
  const request = usePinResetRequest();
  const [phone, setPhone] = useState<string | null>(null);

  const header = (
    <View style={styles.head}>
      <Touchable
        onPress={() => router.back()}
        radius={24}
        accessibilityRole="button"
        accessibilityLabel={t('common.actions.back')}
        style={styles.back}
      >
        <ArrowLeft size={24} color={colors.iconPrimary} strokeWidth={2} />
      </Touchable>
      <Txt variant="screenTitle" accessibilityRole="header">
        {t('pinReset.request.title')}
      </Txt>
    </View>
  );

  if (request.isSuccess) {
    return (
      <Screen
        width="form"
        header={header}
        footer={
          <Button fullWidth label={t('login.submit')} onPress={() => router.replace('/login')} />
        }
      >
        <View style={styles.done}>
          <CircleCheck size={32} color={colors.statusPaid} strokeWidth={2} />
          <Txt variant="sectionTitle" align="center">
            {t('pinReset.request.sent.title')}
          </Txt>
          <Txt align="center">{t('pinReset.request.sent.body')}</Txt>
          <Txt color="textSecondary" align="center">
            {t('pinReset.request.sent.bodyAdmin')}
          </Txt>
          <Txt variant="secondary" color="textSecondary" align="center">
            {t('pinReset.request.sent.holdNote', { hours: 48 })}
          </Txt>
        </View>
      </Screen>
    );
  }

  return (
    <Screen
      width="form"
      header={header}
      footer={
        <Button
          fullWidth
          label={t('pinReset.request.submit')}
          disabled={!phone}
          loading={request.isPending}
          onPress={() => phone && request.mutate(phone)}
        />
      }
    >
      <Txt>{t('pinReset.request.body')}</Txt>
      <PhoneField
        label={t('pinReset.request.phoneLabel')}
        error={request.error ? errorMessage(request.error, t, lang) : null}
        onChange={(e164) => {
          request.reset();
          setPhone(e164);
        }}
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
  done: { alignItems: 'center', gap: space.s3, paddingTop: space.s10 },
});

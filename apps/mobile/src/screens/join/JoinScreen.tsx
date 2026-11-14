// Joining another group while signed in (GRP-05, ACC-03): paste the invitation link.
import { useState } from 'react';
import { useRouter } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { AppHeader, Button, TextField, Txt } from '@/ui';
import { inviteTokenFrom } from '../welcome/WelcomeScreen';
import { Screen } from '../shared/Screen';

export function JoinScreen() {
  const { t } = useTranslation();
  const router = useRouter();
  const [link, setLink] = useState('');
  const [error, setError] = useState<string | null>(null);
  return (
    <Screen
      width="form"
      header={
        <AppHeader
          kind="pushed"
          title={t('welcome.invitationHelp.title')}
          onBack={() => (router.canGoBack() ? router.back() : router.replace('/'))}
        />
      }
      footer={
        <Button
          fullWidth
          label={t('common.actions.continue')}
          disabled={!link.trim()}
          onPress={() => {
            const token = inviteTokenFrom(link);
            if (!token) return setError(t('welcome.invitationHelp.invalid'));
            router.replace(`/invite/${token}`);
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
          setError(null);
        }}
        autoCapitalize="none"
        keyboardType="url"
        error={error}
      />
    </Screen>
  );
}

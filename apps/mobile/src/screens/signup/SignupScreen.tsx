// S-03 Sign-up (SCREENS.md; ACC-01). After it, the app opens on the Njangi tab, whose empty state
// leads to creating the group (J-1).
import { useRouter } from 'expo-router';
import { CURRENT_CONSENT_VERSION, useSignup } from '@/features/auth/useAuth';
import { useLang } from '@/ui';
import { SignupFlow } from './SignupFlow';

export function SignupScreen() {
  const router = useRouter();
  const lang = useLang();
  const signup = useSignup();
  return (
    <SignupFlow
      submitting={signup.isPending}
      error={signup.error}
      onLogin={() => router.replace('/login')}
      onExit={() => router.back()}
      onSubmit={(v) => {
        signup.reset();
        signup.mutate({
          ...v,
          consent: true,
          consentVersion: CURRENT_CONSENT_VERSION,
          language: lang,
        });
      }}
    />
  );
}

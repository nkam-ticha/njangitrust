// Type-checked translation keys: t('confirmation.pay.title') fails to compile if the
// key doesn't exist in the French copy (the reference for both languages).
import 'i18next';
import type { uiFr } from '@njangi/shared/i18n';

declare module 'i18next' {
  interface CustomTypeOptions {
    defaultNS: 'translation';
    resources: { translation: typeof uiFr };
    returnNull: false;
  }
}

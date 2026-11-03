import { useTranslation } from 'react-i18next';
import type { Lang } from '@njangi/shared';

/** The member's current language, reactive to changes (Moi › Langue). */
export function useLang(): Lang {
  const { i18n } = useTranslation();
  return i18n.language === 'en' ? 'en' : 'fr';
}

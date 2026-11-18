import './pluralRules';
import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';
import { getLocales } from 'expo-localization';
import AsyncStorage from '@react-native-async-storage/async-storage';
import type { Lang } from '@njangi/shared';
import { I18N_NAMESPACE, resources } from '@njangi/shared/i18n';

const LANG_STORAGE_KEY = '@njangi/language';

/** The phone's language if it is English, otherwise French (spec 1.6). */
export function deviceLanguage(): Lang {
  return getLocales()[0]?.languageCode === 'en' ? 'en' : 'fr';
}

void i18n.use(initReactI18next).init({
  resources,
  lng: deviceLanguage(),
  fallbackLng: 'fr',
  ns: [I18N_NAMESPACE],
  defaultNS: I18N_NAMESPACE,
  // React already escapes text; amounts and names are inserted as plain strings.
  interpolation: { escapeValue: false },
  returnNull: false,
});

// Restore persisted language choice if available
AsyncStorage.getItem(LANG_STORAGE_KEY)
  .then((saved) => {
    if (saved === 'en' || saved === 'fr') {
      void i18n.changeLanguage(saved);
    }
  })
  .catch(() => {});

/** Switches the app's language (Moi > Langue, Welcome screen, or the agent's set_language). */
export function setLanguage(lang: Lang): Promise<unknown> {
  void AsyncStorage.setItem(LANG_STORAGE_KEY, lang).catch(() => {});
  return i18n.changeLanguage(lang);
}

export function currentLanguage(): Lang {
  return i18n.language === 'en' ? 'en' : 'fr';
}

export default i18n;

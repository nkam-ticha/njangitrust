export const LANGS = ['fr', 'en'] as const;
export type Lang = (typeof LANGS)[number];

/** A text the server produces in both languages; the app shows the member's one. */
export interface Bilingual {
  fr: string;
  en: string;
}

export function pick(text: Bilingual, lang: Lang): string {
  return text[lang];
}

type Param = string | number;

/** Fills `{{name}}` placeholders. A missing parameter is a bug, never shown to a member. */
export function interpolate(template: string, params: Record<string, Param> = {}): string {
  return template.replace(/\{\{\s*(\w+)\s*\}\}/g, (_match, key: string) => {
    const value = params[key];
    if (value === undefined) throw new Error(`Missing text parameter: ${key}`);
    return String(value);
  });
}

/**
 * Builds a server text in both languages. A parameter may differ per language,
 * e.g. an amount formatted with formatXAF for each one.
 */
export function bilingual(
  template: Bilingual,
  params: Record<string, Param | Bilingual> = {},
): Bilingual {
  const forLang = (lang: Lang) =>
    Object.fromEntries(
      Object.entries(params).map(([key, value]) => [
        key,
        typeof value === 'object' ? value[lang] : value,
      ]),
    );
  return {
    fr: interpolate(template.fr, forLang('fr')),
    en: interpolate(template.en, forLang('en')),
  };
}

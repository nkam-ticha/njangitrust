// i18next needs Intl.PluralRules for the _one / _other keys. Some JavaScript
// engines on Android ship without it, so provide the two locales we use.

type Category = 'one' | 'other';

function selectCategory(locale: string, n: number): Category {
  // CLDR: French uses "one" for 0 and 1; English only for 1.
  if (locale.startsWith('fr')) return n >= 0 && n < 2 ? 'one' : 'other';
  return n === 1 ? 'one' : 'other';
}

class MinimalPluralRules {
  private readonly locale: string;

  constructor(locales?: string | string[]) {
    this.locale = (Array.isArray(locales) ? locales[0] : locales) ?? 'fr';
  }

  select(n: number): Category {
    return selectCategory(this.locale, n);
  }

  resolvedOptions() {
    return { locale: this.locale, pluralCategories: ['one', 'other'] as Category[], type: 'cardinal' };
  }

  static supportedLocalesOf(locales: string | string[]): string[] {
    return (Array.isArray(locales) ? locales : [locales]).filter((l) => /^(fr|en)/.test(l));
  }
}

const globalIntl = globalThis as { Intl?: Record<string, unknown> };
if (!globalIntl.Intl) globalIntl.Intl = {};
if (typeof globalIntl.Intl.PluralRules !== 'function') {
  globalIntl.Intl.PluralRules = MinimalPluralRules;
}

// UI copy for i18next (CLAUDE.md rule 10). The designer owns ui.fr.ts and ui.en.ts;
// server texts live in ./server/<area>.ts and are imported per area.

import { uiEn } from './ui.en';
import { uiFr } from './ui.fr';

export { uiEn, uiFr };
export type { UiCopyShape } from './ui.types';

export const I18N_NAMESPACE = 'translation';

export const resources = {
  fr: { [I18N_NAMESPACE]: uiFr },
  en: { [I18N_NAMESPACE]: uiEn },
} as const;

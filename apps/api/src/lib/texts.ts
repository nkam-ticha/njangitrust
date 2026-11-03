// Server texts. One source of wording: the designer's UI copy (packages/shared/src/i18n/ui.*.ts)
// where it already has the sentence, and the server text files (i18n/server/*) otherwise. Both
// use `{{name}}` placeholders, filled by `bilingual` from @njangi/shared (per-language values
// allowed, e.g. an amount formatted with formatXAF for each language; a missing one throws).
import { bilingual, type Bilingual } from '@njangi/shared';
import { uiEn, uiFr, type UiCopyShape } from '@njangi/shared/i18n';

export { bilingual };

export type TextParams = Record<string, string | number | Bilingual>;

/** A sentence of the designer's copy in both languages: `ui((c) => c.confirmation.notes.voteFinal)`. */
export function ui(select: (copy: UiCopyShape) => string, params: TextParams = {}): Bilingual {
  return bilingual({ fr: select(uiFr as UiCopyShape), en: select(uiEn) }, params);
}

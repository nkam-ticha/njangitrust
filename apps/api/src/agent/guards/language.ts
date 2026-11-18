// Reply language from the member's latest message (spec 4.7 rule 4, FSD AGT-08). Deterministic
// word scores; a tie or a message with no clue keeps the member's app language.
import type { Lang } from '@njangi/shared';

const FRENCH =
  'je j tu te t moi mon ma mes ton ta tes le la les de des du un une et est pour pas avec dans ' +
  'sur qui quoi quand combien pourquoi comment quel quelle quels c ça oui non merci bonjour ' +
  'bonsoir paie payer retire retirer dois peux veux suis ai mets annule supprime donne montre ' +
  'envoie ajoute emprunter cotisation amende prêt tour caisse relevé mise raté numéro ou au aux ' +
  'ce cette n il elle nous vous sont prochaine réunion resume resumer groupe lire continuer ' +
  'francais parler ouais accord';
const ENGLISH =
  'i me my you your the a an and is are for not with in on who what when how much many why ' +
  'which yes no thanks thank hello hi please pay withdraw owe can want am have has do does did ' +
  'show give send add borrow contribution fine loan round fund statement bid missed number of ' +
  'to it there this that we they tell exact amount turn solidarity next meeting summarize ' +
  'summary notes group chat read open continue english speak speaking sure yeah yep nope okay ' +
  'explain balance where';
const FR = new Set(FRENCH.split(' '));
const EN = new Set(ENGLISH.split(' '));
const ACCENTED = /[àâçéèêëîïôûùüÿœæ]/iu;

/** The words of a text: letters only, apostrophes split ("j'ai" -> "j", "ai"). */
function words(text: string): string[] {
  return text
    .normalize('NFC')
    .toLowerCase()
    .split(/[^\p{L}]+/u)
    .filter(Boolean);
}

export function detectLanguage(text: string, fallback: Lang): Lang {
  let fr = ACCENTED.test(text) ? 1 : 0;
  let en = 0;
  for (const word of words(text)) {
    if (FR.has(word)) fr += 1;
    if (EN.has(word)) en += 1;
  }
  if (fr === en) return fallback;
  return fr > en ? 'fr' : 'en';
}

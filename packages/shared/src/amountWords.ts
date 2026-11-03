import type { Lang } from './lang';

// Amounts read as words for screen readers (spec 1.7): "onze mille francs CFA".

const FR_UNITS = [
  'zéro', 'un', 'deux', 'trois', 'quatre', 'cinq', 'six', 'sept', 'huit', 'neuf',
  'dix', 'onze', 'douze', 'treize', 'quatorze', 'quinze', 'seize',
];
const FR_TENS = ['', '', 'vingt', 'trente', 'quarante', 'cinquante', 'soixante'];

/** 0..99, traditional spelling. `final`: nothing follows, so "quatre-vingts" takes its s. */
function frBelow100(n: number, final: boolean): string {
  if (n < 17) return FR_UNITS[n]!;
  if (n < 20) return `dix-${FR_UNITS[n - 10]}`;
  if (n < 70) {
    const tens = FR_TENS[Math.floor(n / 10)]!;
    const unit = n % 10;
    if (unit === 0) return tens;
    if (unit === 1) return `${tens} et un`;
    return `${tens}-${FR_UNITS[unit]}`;
  }
  if (n < 80) {
    const rest = n - 60;
    if (rest === 11) return 'soixante et onze';
    return `soixante-${frBelow100(rest, false)}`;
  }
  const rest = n - 80;
  if (rest === 0) return final ? 'quatre-vingts' : 'quatre-vingt';
  return `quatre-vingt-${frBelow100(rest, false)}`;
}

/** 0..999. `final` as above; also controls the s of "deux cents". */
function frBelow1000(n: number, final: boolean): string {
  const hundreds = Math.floor(n / 100);
  const rest = n % 100;
  const parts: string[] = [];
  if (hundreds === 1) parts.push('cent');
  else if (hundreds > 1) {
    parts.push(`${FR_UNITS[hundreds]} ${rest === 0 && final ? 'cents' : 'cent'}`);
  }
  if (rest > 0 || hundreds === 0) parts.push(frBelow100(rest, final));
  return parts.join(' ');
}

function frWords(n: number): { words: string; endsWithNoun: boolean } {
  if (n === 0) return { words: 'zéro', endsWithNoun: false };
  const parts: string[] = [];
  let endsWithNoun = false;
  const scales: Array<[number, string]> = [
    [1_000_000_000, 'milliard'],
    [1_000_000, 'million'],
  ];
  let rest = n;
  for (const [size, noun] of scales) {
    const count = Math.floor(rest / size);
    rest %= size;
    if (count > 0) {
      // Before a noun, vingt and cent keep their plural s ("quatre-vingts millions").
      parts.push(`${count === 1 ? 'un' : frWords(count).words} ${noun}${count > 1 ? 's' : ''}`);
      endsWithNoun = rest === 0;
    }
  }
  const thousands = Math.floor(rest / 1000);
  rest %= 1000;
  if (thousands > 0) {
    parts.push(thousands === 1 ? 'mille' : `${frBelow1000(thousands, false)} mille`);
  }
  if (rest > 0) parts.push(frBelow1000(rest, true));
  return { words: parts.join(' '), endsWithNoun };
}

const EN_UNITS = [
  'zero', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine', 'ten',
  'eleven', 'twelve', 'thirteen', 'fourteen', 'fifteen', 'sixteen', 'seventeen', 'eighteen',
  'nineteen',
];
const EN_TENS = ['', '', 'twenty', 'thirty', 'forty', 'fifty', 'sixty', 'seventy', 'eighty', 'ninety'];

function enBelow1000(n: number): string {
  const parts: string[] = [];
  const hundreds = Math.floor(n / 100);
  const rest = n % 100;
  if (hundreds > 0) parts.push(`${EN_UNITS[hundreds]} hundred`);
  if (rest > 0) {
    if (rest < 20) parts.push(EN_UNITS[rest]!);
    else {
      const unit = rest % 10;
      parts.push(EN_TENS[Math.floor(rest / 10)]! + (unit ? `-${EN_UNITS[unit]}` : ''));
    }
  }
  return parts.join(' ');
}

function enWords(n: number): string {
  if (n === 0) return 'zero';
  const scales: Array<[number, string]> = [
    [1_000_000_000_000, 'trillion'],
    [1_000_000_000, 'billion'],
    [1_000_000, 'million'],
    [1_000, 'thousand'],
  ];
  const parts: string[] = [];
  let rest = n;
  for (const [size, name] of scales) {
    const count = Math.floor(rest / size);
    rest %= size;
    if (count > 0) parts.push(`${enWords(count)} ${name}`);
  }
  if (rest > 0) parts.push(enBelow1000(rest));
  return parts.join(' ');
}

export function amountToWords(amount: number, lang: Lang): string {
  if (!Number.isSafeInteger(amount)) {
    throw new RangeError(`Amounts are whole francs CFA; got ${amount}`);
  }
  const abs = Math.abs(amount);
  if (lang === 'fr') {
    const { words, endsWithNoun } = frWords(abs);
    const currency = abs <= 1 ? 'franc CFA' : 'francs CFA';
    const prefix = amount < 0 ? 'moins ' : '';
    return `${prefix}${words} ${endsWithNoun ? 'de ' : ''}${currency}`;
  }
  const prefix = amount < 0 ? 'minus ' : '';
  return `${prefix}${enWords(abs)} ${abs === 1 ? 'CFA franc' : 'CFA francs'}`;
}

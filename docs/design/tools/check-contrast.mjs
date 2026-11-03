#!/usr/bin/env node
// NjangiTrust colour contrast check.
//
// Plain Node (no dependencies). Defines the palette (the nine tokens of spec 1.2,
// each with a light and a dark value), the semantic aliases built on them
// (a token, optionally with an alpha composited over a surface), and every
// text/background and non-text pair the design uses. Computes WCAG 2.x contrast
// ratios and exits with code 1 if any pair is below its threshold.
//
//   node docs/design/tools/check-contrast.mjs            Markdown report
//   node docs/design/tools/check-contrast.mjs --json     resolved aliases as JSON
//
// Thresholds: text 4.5:1 (all sizes, stricter than WCAG for large text, as the
// spec asks), meaningful non-text marks 3:1. Pairs marked "decorative" are
// printed for information and never fail.

// ---------------------------------------------------------------------------
// 1. Palette: the only hex values in the product.
// ---------------------------------------------------------------------------
export const palette = {
  light: {
    indigo: '#1E2A5A',
    indigoInk: '#1B2140',
    night: '#141B3D',
    cloud: '#F5F6FA',
    line: '#D9DCE6',
    raffia: '#D9A520',
    paid: '#2E7D4F',
    late: '#B42318',
    pending: '#A86A0B',
  },
  dark: {
    indigo: '#AEBBF0',
    indigoInk: '#E8EBF6',
    night: '#141B3D',
    cloud: '#F5F6FA',
    line: '#313A66',
    raffia: '#D9A520',
    paid: '#5DBB87',
    late: '#F08A7E',
    pending: '#C98A2E',
  },
};

// ---------------------------------------------------------------------------
// 2. Semantic aliases. A value is a token name, or { token, alpha, over }.
//    `over` names the alias the colour is composited on when alpha < 1.
//    Aliases that are drawn on several surfaces (textSecondary, outline, ...)
//    are composited on whichever background the pair names.
// ---------------------------------------------------------------------------
const a = (token, alpha, over) => ({ token, alpha, over });

export const aliases = {
  light: {
    // surfaces
    canvas: 'cloud',
    surfaceRaised: 'cloud',
    surfaceTint: a('indigoInk', 0.06, 'canvas'),
    bubbleOwn: a('indigo', 0.14, 'canvas'),
    bubbleOther: a('indigoInk', 0.06, 'canvas'),
    selectedTint: a('indigo', 0.1, 'canvas'),
    hoverLayer: a('indigoInk', 0.05, 'canvas'),
    disabledFill: a('indigoInk', 0.08, 'canvas'),
    dangerTint: a('late', 0.1, 'canvas'),
    scrim: a('night', 0.48, 'canvas'),
    // text
    textPrimary: 'indigoInk',
    textSecondary: a('indigoInk', 0.72),
    textOnPrimary: 'cloud',
    textLink: 'indigo',
    textDanger: 'late',
    // fills
    primary: 'indigo',
    primaryPressed: a('cloud', 0.14, 'primary'),
    danger: 'late',
    dangerPressed: a('cloud', 0.14, 'danger'),
    // lines and marks
    divider: 'line',
    outline: a('indigoInk', 0.56),
    focusRing: 'indigo',
    iconPrimary: 'indigoInk',
    iconSecondary: a('indigoInk', 0.72),
    iconActive: 'indigo',
    // status (non-text marks unless stated)
    statusPaid: 'paid',
    statusLate: 'late',
    statusPending: 'pending',
    accentRaffia: 'raffia',
    raffiaKeyline: 'indigo',
    onRaffia: 'indigo',
    // brand constants (the cloth and the icon never change with the theme)
    brandGround: 'indigo',
    brandMotif: 'cloud',
  },
  dark: {
    canvas: 'night',
    surfaceRaised: a('indigo', 0.08, 'canvas'),
    surfaceTint: a('indigoInk', 0.08, 'canvas'),
    bubbleOwn: a('indigo', 0.2, 'canvas'),
    bubbleOther: a('indigoInk', 0.08, 'canvas'),
    selectedTint: a('indigo', 0.14, 'canvas'),
    hoverLayer: a('indigoInk', 0.06, 'canvas'),
    disabledFill: a('indigoInk', 0.1, 'canvas'),
    dangerTint: a('late', 0.14, 'canvas'),
    scrim: a('night', 0.72, 'canvas'),
    textPrimary: 'indigoInk',
    textSecondary: a('indigoInk', 0.72),
    textOnPrimary: 'night',
    textLink: 'indigo',
    textDanger: 'late',
    primary: 'indigo',
    primaryPressed: a('night', 0.14, 'primary'),
    danger: 'late',
    dangerPressed: a('night', 0.14, 'danger'),
    divider: 'line',
    outline: a('indigoInk', 0.56),
    focusRing: 'indigo',
    iconPrimary: 'indigoInk',
    iconSecondary: a('indigoInk', 0.72),
    iconActive: 'indigo',
    statusPaid: 'paid',
    statusLate: 'late',
    statusPending: 'pending',
    accentRaffia: 'raffia',
    // In dark mode raffia itself clears 3:1 on night, so the keyline takes the
    // fill's colour: same geometry in both themes, the mark simply reads as raffia.
    raffiaKeyline: 'raffia',
    onRaffia: 'night',
    // brand constants keep their light values in dark mode (see DESIGN_SYSTEM.md)
    brandGround: { token: 'indigo', theme: 'light' },
    brandMotif: { token: 'cloud', theme: 'light' },
  },
};

// ---------------------------------------------------------------------------
// 3. Pairs. [foreground, background, kind, where it is used]
//    kind: 'text' (4.5), 'mark' (3.0), 'decorative' (reported only).
//    A background may be written 'x>y' meaning alias x composited on alias y
//    (for tints drawn on raised surfaces).
// ---------------------------------------------------------------------------
const TEXT = 'text';
const MARK = 'mark';
const DECO = 'decorative';

const pairs = [
  // Body text on every surface it can appear on
  ['textPrimary', 'canvas', TEXT, 'Body text, row titles, agent replies'],
  ['textPrimary', 'surfaceRaised', TEXT, 'Sheets, confirmation card, dialogs'],
  ['textSecondary', 'canvas', TEXT, 'Secondary lines, timestamps, captions, placeholders'],
  ['textSecondary', 'surfaceRaised', TEXT, 'Secondary text in sheets and cards'],
  ['textPrimary', 'surfaceTint', TEXT, 'Offline banner, segmented track, skeleton-free tint rows'],
  ['textSecondary', 'surfaceTint', TEXT, 'Secondary text on tinted strips'],
  ['textPrimary', 'surfaceTint>surfaceRaised', TEXT, 'Tinted rows inside a sheet'],
  ['textSecondary', 'surfaceTint>surfaceRaised', TEXT, 'Secondary text on tinted rows inside a sheet'],
  ['textPrimary', 'bubbleOther', TEXT, 'Chat: other members’ messages'],
  ['textSecondary', 'bubbleOther', TEXT, 'Chat: time and reply quote in others’ bubbles'],
  ['textPrimary', 'bubbleOwn', TEXT, 'Chat and agent tab: own messages'],
  ['textSecondary', 'bubbleOwn', TEXT, 'Chat: time and ticks in own bubbles'],
  ['textLink', 'bubbleOther', TEXT, '@mention and links in others’ messages'],
  ['textLink', 'bubbleOwn', TEXT, '@mention and links in own messages'],
  ['textPrimary', 'selectedTint', TEXT, 'Selected row (web master-detail), active nav item'],
  ['textSecondary', 'selectedTint', TEXT, 'Secondary text on a selected row'],
  ['textLink', 'selectedTint', TEXT, 'Active nav label on its tint'],
  ['textPrimary', 'hoverLayer', TEXT, 'Hovered row (web)'],
  ['textSecondary', 'hoverLayer', TEXT, 'Secondary text on a hovered row (web)'],
  ['textPrimary', 'dangerTint', TEXT, 'Error banner, failed daily check strip'],
  ['textSecondary', 'dangerTint', TEXT, 'Secondary text in the failed check strip'],
  ['textPrimary', 'dangerTint>surfaceRaised', TEXT, 'Failure block inside the confirmation card'],
  ['textSecondary', 'disabledFill', TEXT, 'Disabled button label ("Connexion requise")'],
  ['textSecondary', 'disabledFill>surfaceRaised', TEXT, 'Disabled button inside a card or sheet'],

  // Interactive text
  ['textLink', 'canvas', TEXT, 'Text buttons, links, agent name, secondary button label'],
  ['textLink', 'surfaceRaised', TEXT, 'Text buttons and links in sheets and cards'],
  ['textOnPrimary', 'primary', TEXT, 'Primary button label, selected segment, count badge'],
  ['textOnPrimary', 'primaryPressed', TEXT, 'Primary button label while pressed'],
  ['textOnPrimary', 'danger', TEXT, 'Destructive button label'],
  ['textOnPrimary', 'dangerPressed', TEXT, 'Destructive button label while pressed'],
  ['textDanger', 'canvas', TEXT, 'Field errors, "en retard" labels'],
  ['textDanger', 'surfaceRaised', TEXT, 'Field errors in sheets'],
  ['textDanger', 'selectedTint', TEXT, '"En retard" on a selected row'],
  ['textDanger', 'hoverLayer', TEXT, '"En retard" on a hovered row'],

  // Non-text marks: controls
  ['outline', 'canvas', MARK, 'Input borders, chips, unpaid ring dots, checkboxes, switch off'],
  ['outline', 'surfaceRaised', MARK, 'Input borders and PIN dots in sheets'],
  ['outline', 'bubbleOther', MARK, 'Voice note: unplayed bars (others)'],
  ['outline', 'bubbleOwn', MARK, 'Voice note: unplayed bars (own)'],
  ['primary', 'canvas', MARK, 'Paid ring dots, filled PIN dots, switch on, progress fill, unread dot'],
  ['primary', 'surfaceRaised', MARK, 'Primary marks in sheets'],
  ['primary', 'surfaceTint', MARK, 'Vote progress fill on its track'],
  ['primary', 'bubbleOther', MARK, 'Voice note: played bars and play button (others)'],
  ['primary', 'bubbleOwn', MARK, 'Voice note: played bars and play button (own)'],
  ['iconActive', 'selectedTint', MARK, 'Active tab icon on its pill'],
  ['focusRing', 'canvas', MARK, 'Keyboard focus ring (2 px, 2 px gap)'],
  ['focusRing', 'surfaceRaised', MARK, 'Focus ring in sheets and dialogs'],
  ['iconPrimary', 'canvas', MARK, 'Icons'],
  ['iconSecondary', 'canvas', MARK, 'Secondary icons (inactive tabs, row chevrons)'],
  ['iconSecondary', 'surfaceRaised', MARK, 'Secondary icons in sheets'],

  // Non-text marks: status
  ['statusPaid', 'canvas', MARK, 'Paid check icons, daily check OK shield'],
  ['statusPaid', 'surfaceRaised', MARK, 'Done check in the confirmation card'],
  ['statusLate', 'canvas', MARK, 'Late ring dot outline, late icons'],
  ['statusLate', 'surfaceRaised', MARK, 'Failed icon in the confirmation card'],
  ['statusLate', 'dangerTint', MARK, 'Alert icon in the failed check strip'],
  ['statusPending', 'canvas', MARK, 'Pending clock icon, pending dot'],
  ['statusPending', 'surfaceRaised', MARK, 'Processing marker in the confirmation card'],
  ['statusPending', 'selectedTint', MARK, 'Pending icon on a selected row'],
  ['raffiaKeyline', 'canvas', MARK, 'Keyline around raffia marks (beneficiary dot, served badge)'],
  ['raffiaKeyline', 'surfaceRaised', MARK, 'Keyline around raffia marks in sheets'],
  ['onRaffia', 'accentRaffia', MARK, 'Check drawn on the raffia "already served" badge'],
  ['accentRaffia', 'brandGround', MARK, 'Raffia on the Ndop band and the app icon'],
  ['brandMotif', 'brandGround', MARK, 'White motifs of the Ndop band, ring mark on the splash'],

  // Decorative: reported, never enforced
  ['divider', 'canvas', DECO, 'Row dividers (rows are also separated by spacing)'],
  ['divider', 'surfaceRaised', DECO, 'Dividers in sheets, card borders'],
  ['accentRaffia', 'canvas', DECO, 'Raffia fill; carries a keyline in light mode'],
  ['accentRaffia', 'surfaceRaised', DECO, 'Raffia fill in sheets'],
  ['brandGround', 'canvas', DECO, 'Ndop band edge against the canvas'],
  ['surfaceRaised', 'canvas', DECO, 'Raised surface edge (also bordered and shadowed)'],
];

// ---------------------------------------------------------------------------
// Colour maths (WCAG 2.x relative luminance)
// ---------------------------------------------------------------------------
const hexToRgb = (hex) => {
  const h = hex.replace('#', '');
  return [0, 2, 4].map((i) => parseInt(h.slice(i, i + 2), 16));
};
const rgbToHex = (rgb) =>
  '#' + rgb.map((v) => Math.round(v).toString(16).padStart(2, '0')).join('').toUpperCase();
const channel = (v) => {
  const s = v / 255;
  return s <= 0.04045 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
};
const luminance = ([r, g, b]) => 0.2126 * channel(r) + 0.7152 * channel(g) + 0.0722 * channel(b);
const ratio = (fg, bg) => {
  const l1 = luminance(fg);
  const l2 = luminance(bg);
  return (Math.max(l1, l2) + 0.05) / (Math.min(l1, l2) + 0.05);
};
const blend = (top, alpha, under) => top.map((c, i) => c * alpha + under[i] * (1 - alpha));

// Resolve an alias (or 'x>y' stack) to an opaque RGB in a theme.
function resolve(name, theme, under) {
  if (name.includes('>')) {
    const [top, base] = name.split('>');
    return resolve(top, theme, resolve(base, theme));
  }
  const def = aliases[theme][name];
  if (def === undefined) throw new Error(`Unknown alias "${name}" in ${theme}`);
  if (typeof def === 'string') return tokenRgb(def, theme);
  const tokenTheme = def.theme ?? theme;
  const rgb = tokenRgb(def.token, tokenTheme);
  if (def.alpha === undefined || def.alpha >= 1) return rgb;
  const base = under ?? (def.over ? resolve(def.over, theme) : null);
  if (!base) throw new Error(`Alias "${name}" has an alpha and needs a background`);
  return blend(rgb, def.alpha, base);
}
function tokenRgb(token, theme) {
  const hex = palette[theme][token];
  if (!hex) throw new Error(`Alias uses "${token}", which is not a palette token`);
  return hexToRgb(hex);
}

// Structural check: every alias must point to a palette token.
const tokenNames = new Set(Object.keys(palette.light));
for (const theme of ['light', 'dark']) {
  const lightKeys = Object.keys(aliases.light).sort().join();
  if (Object.keys(aliases[theme]).sort().join() !== lightKeys) {
    throw new Error(`Alias names differ between light and dark`);
  }
  for (const [name, def] of Object.entries(aliases[theme])) {
    const token = typeof def === 'string' ? def : def.token;
    if (!tokenNames.has(token)) throw new Error(`${theme}.${name} uses unknown token ${token}`);
  }
}

// ---------------------------------------------------------------------------
// Report
// ---------------------------------------------------------------------------
const THRESHOLD = { text: 4.5, mark: 3.0, decorative: 0 };
const describe = (name, theme) => {
  if (name.includes('>')) {
    const [top, base] = name.split('>');
    return `${top} on ${base}`;
  }
  const def = aliases[theme][name];
  if (typeof def === 'string') return `${def}`;
  const alpha = def.alpha !== undefined && def.alpha < 1 ? ` ${Math.round(def.alpha * 100)}%` : '';
  return `${def.theme ? def.theme + ' ' : ''}${def.token}${alpha}`;
};

if (process.argv.includes('--json')) {
  const out = {};
  for (const theme of ['light', 'dark']) {
    out[theme] = {};
    for (const name of Object.keys(aliases[theme])) {
      const def = aliases[theme][name];
      const needsBase = typeof def === 'object' && def.alpha !== undefined && def.alpha < 1 && !def.over;
      out[theme][name] = {
        definition: describe(name, theme),
        onCanvas: rgbToHex(resolve(name, theme, needsBase ? resolve('canvas', theme) : undefined)),
      };
    }
  }
  console.log(JSON.stringify({ palette, aliases: out }, null, 2));
  process.exit(0);
}

let failures = 0;
const lines = [];
lines.push('NjangiTrust contrast check (WCAG 2.x). Text >= 4.5:1, marks >= 3:1.');
lines.push('');
lines.push('Palette');
lines.push('');
lines.push('| Token | Light | Dark |');
lines.push('|---|---|---|');
for (const t of Object.keys(palette.light)) {
  lines.push(`| ${t} | ${palette.light[t]} | ${palette.dark[t]} |`);
}
lines.push('');
lines.push('Composited aliases (shown on the canvas unless they name their own surface)');
lines.push('');
lines.push('| Alias | Light | Light hex | Dark | Dark hex |');
lines.push('|---|---|---|---|---|');
for (const name of Object.keys(aliases.light)) {
  const row = [name];
  for (const theme of ['light', 'dark']) {
    const def = aliases[theme][name];
    const needsBase = typeof def === 'object' && def.alpha !== undefined && def.alpha < 1 && !def.over;
    const rgb = resolve(name, theme, needsBase ? resolve('canvas', theme) : undefined);
    row.push(describe(name, theme), rgbToHex(rgb));
  }
  lines.push(`| ${row.join(' | ')} |`);
}

for (const theme of ['light', 'dark']) {
  lines.push('');
  lines.push(`Pairs, ${theme} theme`);
  lines.push('');
  lines.push('| Result | Ratio | Need | Foreground | Background | Used for |');
  lines.push('|---|---|---|---|---|---|');
  for (const [fgName, bgName, kind, use] of pairs) {
    const bg = resolve(bgName, theme);
    const fg = resolve(fgName, theme, bg);
    const r = ratio(fg, bg);
    const need = THRESHOLD[kind];
    const pass = kind === DECO || r + 1e-9 >= need;
    if (!pass) failures++;
    const result = kind === DECO ? 'info' : pass ? 'PASS' : 'FAIL';
    lines.push(
      `| ${result} | ${r.toFixed(2)} | ${kind === DECO ? '-' : need.toFixed(1)} | ${fgName} ${rgbToHex(fg)} | ${bgName} ${rgbToHex(bg)} | ${use} |`,
    );
  }
}

lines.push('');
const enforced = pairs.filter((p) => p[2] !== DECO).length * 2;
lines.push(
  failures === 0
    ? `All ${enforced} enforced pairs pass (${pairs.length} pairs x 2 themes, decorative pairs reported only).`
    : `${failures} pair(s) FAIL.`,
);
console.log(lines.join('\n'));
process.exit(failures === 0 ? 0 : 1);

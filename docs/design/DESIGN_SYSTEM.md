# NjangiTrust design system

The single reference for how NjangiTrust looks, moves, reads and adapts, on Android and on the web. It implements spec Part 1 (sections 1.2 to 1.8) and decisions D1, D4 and D5. Screen-by-screen UX is in [SCREENS.md](SCREENS.md). All interface text lives in `packages/shared/src/i18n/ui.fr.ts` and `ui.en.ts`; this document cites their keys as `copy:` followed by the key path (for example `copy: confirmation.actions.pay`).

Files in this folder:

| Path | What it is |
|---|---|
| `DESIGN_SYSTEM.md` | This document |
| `SCREENS.md` | Every screen, state and user journey |
| `tools/check-contrast.mjs` | Palette, aliases and every colour pair, verified (exits 1 on any failure) |
| `assets/` | Original SVGs: Ndop band, ring mark, app icon set, splash |
| `board/index.html` | Visual board for the owner: tokens, ring, cards, phone and wide mockups |

## Contents

1. [Principles](#1-principles)
2. [Colour](#2-colour)
3. [Typography](#3-typography)
4. [Layout foundations](#4-layout-foundations)
5. [Components](#5-components)
6. [The NjangiRing](#6-the-njangiring)
7. [Motion](#7-motion)
8. [Responsive and web](#8-responsive-and-web)
9. [Accessibility](#9-accessibility)
10. [Low data and offline](#10-low-data-and-offline)
11. [Brand assets](#11-brand-assets)
12. [Writing](#12-writing)
13. [Implementation notes for Phase B](#13-implementation-notes-for-phase-b)
14. [Design decisions](#14-design-decisions)
15. [Owner decisions on the design questions](#15-owner-decisions-on-the-design-questions)

---

## 1. Principles

The concept is spec 1.2's *le cercle*: people sitting in a circle while the money goes round, dressed in Ndop indigo and white. Every rule below serves five design principles, each tied to a product principle.

| Design principle | What it means on screen | Product principle |
|---|---|---|
| The next step is obvious | Every screen opens on what the member must do now (pay, withdraw, vote) with one primary button. The Njangi tab opens on a status line and chips that match the member's situation. | Talk, don't tap |
| Money is stated, never implied | Amounts are always written in full, right-aligned, in one typeface, with the same figures on the card the server prepared. Nothing is rounded, abbreviated or coloured to mean something. | Code decides, the AI explains |
| Calm surfaces, warm moments | Flat indigo-on-cloud surfaces, plain lists, two raised surfaces only. Warmth comes from names and from the two signature motions (a dot filling, the raffia ring closing). | Everything visible, nothing leaked |
| Every state is designed | Loading, empty, offline, failed, expired, permission-limited and "member who has left" are designed, written and tested like the happy path. | Every franc traceable |
| Nothing is hidden behind colour | Status always carries a word or an icon shape as well as a colour. Secret votes show participation only. Phone numbers are masked everywhere except for their owner. | Change only by vote |

---

## 2. Colour

### 2.1 Palette

The nine tokens of spec 1.2 are the only colours in the product. Each has a light value (the spec's hex) and a dark value defined here. `tools/check-contrast.mjs` holds the same table and is the source of truth for the theme file.

| Token | Light | Dark | Role |
|---|---|---|---|
| `indigo` | `#1E2A5A` | `#AEBBF0` | Primary: primary buttons, active tab, selected segment, links, focus ring, paid dots |
| `indigoInk` | `#1B2140` | `#E8EBF6` | Text and icons |
| `night` | `#141B3D` | `#141B3D` | The dark pole: dark-mode canvas, scrim, text on primary in dark mode |
| `cloud` | `#F5F6FA` | `#F5F6FA` | The light pole: light-mode canvas, text on primary in light mode |
| `line` | `#D9DCE6` | `#313A66` | Dividers and container borders |
| `raffia` | `#D9A520` | `#D9A520` | The beneficiary, "your turn", the payout moment. Fills and marks only, never text |
| `paid` | `#2E7D4F` | `#5DBB87` | Paid, on time, success. Icons and marks only (see 2.5) |
| `late` | `#B42318` | `#F08A7E` | Late, failed, destructive. Text, icons, marks, destructive fill |
| `pending` | `#A86A0B` | `#C98A2E` | Waiting for confirmation. Non-text marks only (D5) |

**Why `cloud` and `night` keep one value.** The spec defines them as the light and the dark backgrounds: they are the two poles of the palette. Their hex values never change; the theme decides which one is the canvas (`canvas` is `cloud` in light mode and `night` in dark mode) and which one sits on the primary colour. The other seven tokens are colours drawn *on* a canvas, so they get a dark value tuned for `night`.

**How the dark values were chosen.** Same hue family as the light value, lifted until every pair in 2.6 passes on `night` and on the dark raised surface, and no further, so dark mode stays as calm as light mode. `raffia` keeps its value: it reaches 7.46:1 on `night` as it is.

### 2.2 Semantic aliases

Components never use a token directly; they use these aliases. An alias is a token, or a token at an opacity composited over a named surface. No alias introduces a hue that is not in the palette.

| Alias | Light | Dark | Used for |
|---|---|---|---|
| `canvas` | `cloud` | `night` | App background |
| `surfaceRaised` | `cloud` | `indigo` 8% over `night` = `#20284B` | Bottom sheets, ConfirmationCard, desktop dialogs |
| `surfaceTint` | `indigoInk` 6% = `#E8E9EF` | `indigoInk` 8% = `#252C4C` | Segmented track, offline banner, skeleton blocks, avatar fill |
| `bubbleOwn` | `indigo` 14% = `#D7D9E4` | `indigo` 20% = `#333B61` | Own chat messages, own messages to Njangi |
| `bubbleOther` | `indigoInk` 6% = `#E8E9EF` | `indigoInk` 8% = `#252C4C` | Other members' chat messages |
| `selectedTint` | `indigo` 10% = `#E0E2EA` | `indigo` 14% = `#2A3156` | Active tab pill, selected row, pressed chip |
| `hoverLayer` | `indigoInk` 5% | `indigoInk` 6% | Web hover on rows and buttons |
| `disabledFill` | `indigoInk` 8% = `#E4E5EB` | `indigoInk` 10% = `#293050` | Disabled and "Connexion requise" buttons |
| `dangerTint` | `late` 10% = `#EFE1E3` | `late` 14% = `#332B46` | Error banner, failed daily check, failure block in a card |
| `scrim` | `night` 48% | `night` 72% | Behind sheets and dialogs |
| `textPrimary` | `indigoInk` | `indigoInk` | Body text, titles, amounts |
| `textSecondary` | `indigoInk` 72% = `#585D74` | `indigoInk` 72% = `#ADB1C2` | Secondary lines, captions, timestamps, placeholders |
| `textOnPrimary` | `cloud` | `night` | Labels on `primary` and `danger` fills |
| `textLink` | `indigo` | `indigo` | Text buttons, links, agent name, mentions |
| `textDanger` | `late` | `late` | Field errors, "en retard" |
| `primary` | `indigo` | `indigo` | Primary fill and primary marks |
| `primaryPressed` | `cloud` 14% over `indigo` = `#3C4770` | `night` 14% over `indigo` = `#98A5D7` | Primary button while pressed |
| `danger` / `dangerPressed` | `late` / `cloud` 14% over `late` | `late` / `night` 14% over `late` | Destructive button |
| `divider` | `line` | `line` | Row dividers, container borders |
| `outline` | `indigoInk` 56% = `#7B7F92` | `indigoInk` 56% = `#8B8FA5` | Input borders, chips, unpaid dots, empty PIN dots, switch off, unplayed voice track |
| `focusRing` | `indigo` | `indigo` | Keyboard focus (2 px ring, 2 px gap) |
| `iconPrimary` / `iconSecondary` / `iconActive` | `indigoInk` / `indigoInk` 72% / `indigo` | same tokens | Icons |
| `statusPaid` / `statusLate` / `statusPending` | `paid` / `late` / `pending` | same tokens | Status icons and ring marks |
| `accentRaffia` | `raffia` | `raffia` | Beneficiary dot, served badge, the closed ring, Ndop accent |
| `raffiaKeyline` | `indigo` | `raffia` | 1.5 px keyline around every raffia mark (light mode carries the 3:1 edge) |
| `onRaffia` | `indigo` | `night` | The check drawn on the "already served" badge |
| `brandGround` / `brandMotif` | `indigo` / `cloud` | light `indigo` / light `cloud` | The Ndop band and the app icon: brand constants that keep their light values in dark mode |

**Opacity rule.** Alpha aliases are applied as `rgba` of the token in the theme file, so they composite over whatever surface is behind them. Every surface they can land on is listed in 2.6 and checked; the hex values above are the composites on the canvas.

### 2.3 Secondary text

Secondary text is `indigoInk` at 72% opacity. It is not a new grey: it is the body ink, thinned. The composite is `#585D74` on `cloud` (6.04:1) and `#ADB1C2` on `night` (7.83:1). Its lowest composite anywhere in the product is 5.25:1, on `bubbleOwn` in light mode. There is no third text level: anything quieter than secondary text would fail 4.5:1, so it does not exist.

### 2.4 Raised surfaces and shadows

Only two kinds of surface are raised (spec 1.2): the ConfirmationCard and bottom sheets (including their desktop dialog form). In light mode the raised surface is `cloud` like the canvas and is separated by a 1 px `divider` border and a shadow. In dark mode shadows disappear on `night`, so the surface itself lifts (`#20284B`) and keeps the 1 px border.

| Surface | Light shadow | Android elevation | Dark |
|---|---|---|---|
| ConfirmationCard | `night` 10%, y 2, blur 12 | 3 | No shadow; `surfaceRaised` + border |
| Bottom sheet, dialog | `night` 16%, y -2 (sheet) or y 8 (dialog), blur 24 | 12 | No shadow; `surfaceRaised` + border + `scrim` |

### 2.5 Rules of use

1. **Raffia never carries meaning alone and never sets text.** On a light canvas raffia reaches only 2.08:1, so every raffia mark wears a 1.5 px `raffiaKeyline` (indigo) that carries the 3:1 edge. In dark mode the keyline takes the raffia value and the mark reads as solid raffia (7.46:1). Raffia is reserved for the beneficiary, "your turn", the payout sheet and the closed ring.
2. **`pending` is for marks only** (D5): the processing spinner, the clock icon, the dashed outline of a pending dot. Text beside it is `textPrimary`.
3. **No green text.** `paid` reaches 4.67:1 on `cloud`, a thin margin that fails on tinted rows. Success is a green icon or mark next to `textPrimary` words: "Payé" is written in ink beside a green check.
4. **Amounts are never coloured.** Direction is carried by the sign (`+10 900`, `−80 840`, from `formatAmount` with `sign: 'always'`), status by a word. A red or green amount would turn money into a mood.
5. **Colour is never the only signal.** Paid, late and pending always come with a word or an icon shape; selected states add weight or a check; the ring adds stroke weight and dashes (6.4).
6. **Disabled still reads.** Disabled labels sit at 5.57:1. The WCAG exemption for disabled controls is not used, because "Connexion requise" carries information.
7. **Dividers are decorative.** `line` reaches 1.27:1 on `cloud`. Rows are also separated by spacing, so dividers never carry meaning. Anything that identifies a control's boundary (inputs, chips, unpaid dots) uses `outline` (3.69:1).

### 2.6 Contrast table

Generated by `node docs/design/tools/check-contrast.mjs`, which exits with code 1 if any enforced pair fails. Text pairs need 4.5:1 at every size (stricter than WCAG for large text, as spec 1.2 asks); meaningful marks need 3:1; "info" rows are decorative and reported only. Run it again after any colour change and paste the new output here.

NjangiTrust contrast check (WCAG 2.x). Text >= 4.5:1, marks >= 3:1.

**Palette**

| Token | Light | Dark |
|---|---|---|
| indigo | #1E2A5A | #AEBBF0 |
| indigoInk | #1B2140 | #E8EBF6 |
| night | #141B3D | #141B3D |
| cloud | #F5F6FA | #F5F6FA |
| line | #D9DCE6 | #313A66 |
| raffia | #D9A520 | #D9A520 |
| paid | #2E7D4F | #5DBB87 |
| late | #B42318 | #F08A7E |
| pending | #A86A0B | #C98A2E |

**Composited aliases (shown on the canvas unless they name their own surface)**

| Alias | Light | Light hex | Dark | Dark hex |
|---|---|---|---|---|
| canvas | cloud | #F5F6FA | night | #141B3D |
| surfaceRaised | cloud | #F5F6FA | indigo 8% | #20284B |
| surfaceTint | indigoInk 6% | #E8E9EF | indigoInk 8% | #252C4C |
| bubbleOwn | indigo 14% | #D7D9E4 | indigo 20% | #333B61 |
| bubbleOther | indigoInk 6% | #E8E9EF | indigoInk 8% | #252C4C |
| selectedTint | indigo 10% | #E0E2EA | indigo 14% | #2A3156 |
| hoverLayer | indigoInk 5% | #EAEBF1 | indigoInk 6% | #212748 |
| disabledFill | indigoInk 8% | #E4E5EB | indigoInk 10% | #293050 |
| dangerTint | late 10% | #EFE1E3 | late 14% | #332B46 |
| scrim | night 48% | #898D9F | night 72% | #141B3D |
| textPrimary | indigoInk | #1B2140 | indigoInk | #E8EBF6 |
| textSecondary | indigoInk 72% | #585D74 | indigoInk 72% | #ADB1C2 |
| textOnPrimary | cloud | #F5F6FA | night | #141B3D |
| textLink | indigo | #1E2A5A | indigo | #AEBBF0 |
| textDanger | late | #B42318 | late | #F08A7E |
| primary | indigo | #1E2A5A | indigo | #AEBBF0 |
| primaryPressed | cloud 14% | #3C4770 | night 14% | #98A5D7 |
| danger | late | #B42318 | late | #F08A7E |
| dangerPressed | cloud 14% | #BD4138 | night 14% | #D17A75 |
| divider | line | #D9DCE6 | line | #313A66 |
| outline | indigoInk 56% | #7B7F92 | indigoInk 56% | #8B8FA5 |
| focusRing | indigo | #1E2A5A | indigo | #AEBBF0 |
| iconPrimary | indigoInk | #1B2140 | indigoInk | #E8EBF6 |
| iconSecondary | indigoInk 72% | #585D74 | indigoInk 72% | #ADB1C2 |
| iconActive | indigo | #1E2A5A | indigo | #AEBBF0 |
| statusPaid | paid | #2E7D4F | paid | #5DBB87 |
| statusLate | late | #B42318 | late | #F08A7E |
| statusPending | pending | #A86A0B | pending | #C98A2E |
| accentRaffia | raffia | #D9A520 | raffia | #D9A520 |
| raffiaKeyline | indigo | #1E2A5A | raffia | #D9A520 |
| onRaffia | indigo | #1E2A5A | night | #141B3D |
| brandGround | indigo | #1E2A5A | light indigo | #1E2A5A |
| brandMotif | cloud | #F5F6FA | light cloud | #F5F6FA |

**Pairs, light theme**

| Result | Ratio | Need | Foreground | Background | Used for |
|---|---|---|---|---|---|
| PASS | 14.53 | 4.5 | textPrimary #1B2140 | canvas #F5F6FA | Body text, row titles, agent replies |
| PASS | 14.53 | 4.5 | textPrimary #1B2140 | surfaceRaised #F5F6FA | Sheets, confirmation card, dialogs |
| PASS | 6.04 | 4.5 | textSecondary #585D74 | canvas #F5F6FA | Secondary lines, timestamps, captions, placeholders |
| PASS | 6.04 | 4.5 | textSecondary #585D74 | surfaceRaised #F5F6FA | Secondary text in sheets and cards |
| PASS | 12.97 | 4.5 | textPrimary #1B2140 | surfaceTint #E8E9EF | Offline banner, segmented track, skeleton-free tint rows |
| PASS | 5.69 | 4.5 | textSecondary #545971 | surfaceTint #E8E9EF | Secondary text on tinted strips |
| PASS | 12.97 | 4.5 | textPrimary #1B2140 | surfaceTint>surfaceRaised #E8E9EF | Tinted rows inside a sheet |
| PASS | 5.69 | 4.5 | textSecondary #545971 | surfaceTint>surfaceRaised #E8E9EF | Secondary text on tinted rows inside a sheet |
| PASS | 12.97 | 4.5 | textPrimary #1B2140 | bubbleOther #E8E9EF | Chat: other members’ messages |
| PASS | 5.69 | 4.5 | textSecondary #545971 | bubbleOther #E8E9EF | Chat: time and reply quote in others’ bubbles |
| PASS | 11.19 | 4.5 | textPrimary #1B2140 | bubbleOwn #D7D9E4 | Chat and agent tab: own messages |
| PASS | 5.25 | 4.5 | textSecondary #50556E | bubbleOwn #D7D9E4 | Chat: time and ticks in own bubbles |
| PASS | 11.31 | 4.5 | textLink #1E2A5A | bubbleOther #E8E9EF | @mention and links in others’ messages |
| PASS | 9.76 | 4.5 | textLink #1E2A5A | bubbleOwn #D7D9E4 | @mention and links in own messages |
| PASS | 12.09 | 4.5 | textPrimary #1B2140 | selectedTint #E0E2EA | Selected row (web master-detail), active nav item |
| PASS | 5.48 | 4.5 | textSecondary #525770 | selectedTint #E0E2EA | Secondary text on a selected row |
| PASS | 10.55 | 4.5 | textLink #1E2A5A | selectedTint #E0E2EA | Active nav label on its tint |
| PASS | 13.22 | 4.5 | textPrimary #1B2140 | hoverLayer #EAEBF1 | Hovered row (web) |
| PASS | 5.75 | 4.5 | textSecondary #555A71 | hoverLayer #EAEBF1 | Secondary text on a hovered row (web) |
| PASS | 12.35 | 4.5 | textPrimary #1B2140 | dangerTint #EFE1E3 | Error banner, failed daily check strip |
| PASS | 5.55 | 4.5 | textSecondary #56576E | dangerTint #EFE1E3 | Secondary text in the failed check strip |
| PASS | 12.35 | 4.5 | textPrimary #1B2140 | dangerTint>surfaceRaised #EFE1E3 | Failure block inside the confirmation card |
| PASS | 5.57 | 4.5 | textSecondary #535870 | disabledFill #E4E5EB | Disabled button label ("Connexion requise") |
| PASS | 5.57 | 4.5 | textSecondary #535870 | disabledFill>surfaceRaised #E4E5EB | Disabled button inside a card or sheet |
| PASS | 12.68 | 4.5 | textLink #1E2A5A | canvas #F5F6FA | Text buttons, links, agent name, secondary button label |
| PASS | 12.68 | 4.5 | textLink #1E2A5A | surfaceRaised #F5F6FA | Text buttons and links in sheets and cards |
| PASS | 12.68 | 4.5 | textOnPrimary #F5F6FA | primary #1E2A5A | Primary button label, selected segment, count badge |
| PASS | 8.39 | 4.5 | textOnPrimary #F5F6FA | primaryPressed #3C4770 | Primary button label while pressed |
| PASS | 6.09 | 4.5 | textOnPrimary #F5F6FA | danger #B42318 | Destructive button label |
| PASS | 4.90 | 4.5 | textOnPrimary #F5F6FA | dangerPressed #BD4138 | Destructive button label while pressed |
| PASS | 6.09 | 4.5 | textDanger #B42318 | canvas #F5F6FA | Field errors, "en retard" labels |
| PASS | 6.09 | 4.5 | textDanger #B42318 | surfaceRaised #F5F6FA | Field errors in sheets |
| PASS | 5.06 | 4.5 | textDanger #B42318 | selectedTint #E0E2EA | "En retard" on a selected row |
| PASS | 5.54 | 4.5 | textDanger #B42318 | hoverLayer #EAEBF1 | "En retard" on a hovered row |
| PASS | 3.69 | 3.0 | outline #7B7F92 | canvas #F5F6FA | Input borders, chips, unpaid ring dots, checkboxes, switch off |
| PASS | 3.69 | 3.0 | outline #7B7F92 | surfaceRaised #F5F6FA | Input borders and PIN dots in sheets |
| PASS | 3.55 | 3.0 | outline #75798D | bubbleOther #E8E9EF | Voice note: unplayed bars (others) |
| PASS | 3.38 | 3.0 | outline #6E7288 | bubbleOwn #D7D9E4 | Voice note: unplayed bars (own) |
| PASS | 12.68 | 3.0 | primary #1E2A5A | canvas #F5F6FA | Paid ring dots, filled PIN dots, switch on, progress fill, unread dot |
| PASS | 12.68 | 3.0 | primary #1E2A5A | surfaceRaised #F5F6FA | Primary marks in sheets |
| PASS | 11.31 | 3.0 | primary #1E2A5A | surfaceTint #E8E9EF | Vote progress fill on its track |
| PASS | 11.31 | 3.0 | primary #1E2A5A | bubbleOther #E8E9EF | Voice note: played bars and play button (others) |
| PASS | 9.76 | 3.0 | primary #1E2A5A | bubbleOwn #D7D9E4 | Voice note: played bars and play button (own) |
| PASS | 10.55 | 3.0 | iconActive #1E2A5A | selectedTint #E0E2EA | Active tab icon on its pill |
| PASS | 12.68 | 3.0 | focusRing #1E2A5A | canvas #F5F6FA | Keyboard focus ring (2 px, 2 px gap) |
| PASS | 12.68 | 3.0 | focusRing #1E2A5A | surfaceRaised #F5F6FA | Focus ring in sheets and dialogs |
| PASS | 14.53 | 3.0 | iconPrimary #1B2140 | canvas #F5F6FA | Icons |
| PASS | 6.04 | 3.0 | iconSecondary #585D74 | canvas #F5F6FA | Secondary icons (inactive tabs, row chevrons) |
| PASS | 6.04 | 3.0 | iconSecondary #585D74 | surfaceRaised #F5F6FA | Secondary icons in sheets |
| PASS | 4.67 | 3.0 | statusPaid #2E7D4F | canvas #F5F6FA | Paid check icons, daily check OK shield |
| PASS | 4.67 | 3.0 | statusPaid #2E7D4F | surfaceRaised #F5F6FA | Done check in the confirmation card |
| PASS | 6.09 | 3.0 | statusLate #B42318 | canvas #F5F6FA | Late ring dot outline, late icons |
| PASS | 6.09 | 3.0 | statusLate #B42318 | surfaceRaised #F5F6FA | Failed icon in the confirmation card |
| PASS | 5.17 | 3.0 | statusLate #B42318 | dangerTint #EFE1E3 | Alert icon in the failed check strip |
| PASS | 4.11 | 3.0 | statusPending #A86A0B | canvas #F5F6FA | Pending clock icon, pending dot |
| PASS | 4.11 | 3.0 | statusPending #A86A0B | surfaceRaised #F5F6FA | Processing marker in the confirmation card |
| PASS | 3.42 | 3.0 | statusPending #A86A0B | selectedTint #E0E2EA | Pending icon on a selected row |
| PASS | 12.68 | 3.0 | raffiaKeyline #1E2A5A | canvas #F5F6FA | Keyline around raffia marks (beneficiary dot, served badge) |
| PASS | 12.68 | 3.0 | raffiaKeyline #1E2A5A | surfaceRaised #F5F6FA | Keyline around raffia marks in sheets |
| PASS | 6.10 | 3.0 | onRaffia #1E2A5A | accentRaffia #D9A520 | Check drawn on the raffia "already served" badge |
| PASS | 6.10 | 3.0 | accentRaffia #D9A520 | brandGround #1E2A5A | Raffia on the Ndop band and the app icon |
| PASS | 12.68 | 3.0 | brandMotif #F5F6FA | brandGround #1E2A5A | White motifs of the Ndop band, ring mark on the splash |
| info | 1.27 | - | divider #D9DCE6 | canvas #F5F6FA | Row dividers (rows are also separated by spacing) |
| info | 1.27 | - | divider #D9DCE6 | surfaceRaised #F5F6FA | Dividers in sheets, card borders |
| info | 2.08 | - | accentRaffia #D9A520 | canvas #F5F6FA | Raffia fill; carries a keyline in light mode |
| info | 2.08 | - | accentRaffia #D9A520 | surfaceRaised #F5F6FA | Raffia fill in sheets |
| info | 12.68 | - | brandGround #1E2A5A | canvas #F5F6FA | Ndop band edge against the canvas |
| info | 1.00 | - | surfaceRaised #F5F6FA | canvas #F5F6FA | Raised surface edge (also bordered and shadowed) |

**Pairs, dark theme**

| Result | Ratio | Need | Foreground | Background | Used for |
|---|---|---|---|---|---|
| PASS | 14.07 | 4.5 | textPrimary #E8EBF6 | canvas #141B3D | Body text, row titles, agent replies |
| PASS | 12.04 | 4.5 | textPrimary #E8EBF6 | surfaceRaised #20284B | Sheets, confirmation card, dialogs |
| PASS | 7.83 | 4.5 | textSecondary #ADB1C2 | canvas #141B3D | Secondary lines, timestamps, captions, placeholders |
| PASS | 6.97 | 4.5 | textSecondary #B0B4C6 | surfaceRaised #20284B | Secondary text in sheets and cards |
| PASS | 11.48 | 4.5 | textPrimary #E8EBF6 | surfaceTint #252C4C | Offline banner, segmented track, skeleton-free tint rows |
| PASS | 6.73 | 4.5 | textSecondary #B1B5C6 | surfaceTint #252C4C | Secondary text on tinted strips |
| PASS | 9.66 | 4.5 | textPrimary #E8EBF6 | surfaceTint>surfaceRaised #303759 | Tinted rows inside a sheet |
| PASS | 5.87 | 4.5 | textSecondary #B5B9CA | surfaceTint>surfaceRaised #303759 | Secondary text on tinted rows inside a sheet |
| PASS | 11.48 | 4.5 | textPrimary #E8EBF6 | bubbleOther #252C4C | Chat: other members’ messages |
| PASS | 6.73 | 4.5 | textSecondary #B1B5C6 | bubbleOther #252C4C | Chat: time and reply quote in others’ bubbles |
| PASS | 9.11 | 4.5 | textPrimary #E8EBF6 | bubbleOwn #333B61 | Chat and agent tab: own messages |
| PASS | 5.60 | 4.5 | textSecondary #B5BACC | bubbleOwn #333B61 | Chat: time and ticks in own bubbles |
| PASS | 7.26 | 4.5 | textLink #AEBBF0 | bubbleOther #252C4C | @mention and links in others’ messages |
| PASS | 5.76 | 4.5 | textLink #AEBBF0 | bubbleOwn #333B61 | @mention and links in own messages |
| PASS | 10.52 | 4.5 | textPrimary #E8EBF6 | selectedTint #2A3156 | Selected row (web master-detail), active nav item |
| PASS | 6.28 | 4.5 | textSecondary #B3B7C9 | selectedTint #2A3156 | Secondary text on a selected row |
| PASS | 6.66 | 4.5 | textLink #AEBBF0 | selectedTint #2A3156 | Active nav label on its tint |
| PASS | 12.13 | 4.5 | textPrimary #E8EBF6 | hoverLayer #212748 | Hovered row (web) |
| PASS | 7.02 | 4.5 | textSecondary #B0B4C5 | hoverLayer #212748 | Secondary text on a hovered row (web) |
| PASS | 11.26 | 4.5 | textPrimary #E8EBF6 | dangerTint #332B46 | Error banner, failed daily check strip |
| PASS | 6.63 | 4.5 | textSecondary #B5B5C5 | dangerTint #332B46 | Secondary text in the failed check strip |
| PASS | 9.57 | 4.5 | textPrimary #E8EBF6 | dangerTint>surfaceRaised #3D3652 | Failure block inside the confirmation card |
| PASS | 6.43 | 4.5 | textSecondary #B3B7C7 | disabledFill #293050 | Disabled button label ("Connexion requise") |
| PASS | 5.61 | 4.5 | textSecondary #B6BACB | disabledFill>surfaceRaised #343B5C | Disabled button inside a card or sheet |
| PASS | 8.91 | 4.5 | textLink #AEBBF0 | canvas #141B3D | Text buttons, links, agent name, secondary button label |
| PASS | 7.62 | 4.5 | textLink #AEBBF0 | surfaceRaised #20284B | Text buttons and links in sheets and cards |
| PASS | 8.91 | 4.5 | textOnPrimary #141B3D | primary #AEBBF0 | Primary button label, selected segment, count badge |
| PASS | 6.92 | 4.5 | textOnPrimary #141B3D | primaryPressed #98A5D7 | Primary button label while pressed |
| PASS | 6.89 | 4.5 | textOnPrimary #141B3D | danger #F08A7E | Destructive button label |
| PASS | 5.41 | 4.5 | textOnPrimary #141B3D | dangerPressed #D17A75 | Destructive button label while pressed |
| PASS | 6.89 | 4.5 | textDanger #F08A7E | canvas #141B3D | Field errors, "en retard" labels |
| PASS | 5.90 | 4.5 | textDanger #F08A7E | surfaceRaised #20284B | Field errors in sheets |
| PASS | 5.15 | 4.5 | textDanger #F08A7E | selectedTint #2A3156 | "En retard" on a selected row |
| PASS | 5.94 | 4.5 | textDanger #F08A7E | hoverLayer #212748 | "En retard" on a hovered row |
| PASS | 5.26 | 3.0 | outline #8B8FA5 | canvas #141B3D | Input borders, chips, unpaid ring dots, checkboxes, switch off |
| PASS | 4.83 | 3.0 | outline #9095AB | surfaceRaised #20284B | Input borders and PIN dots in sheets |
| PASS | 4.70 | 3.0 | outline #9297AB | bubbleOther #252C4C | Voice note: unplayed bars (others) |
| PASS | 4.06 | 3.0 | outline #989EB4 | bubbleOwn #333B61 | Voice note: unplayed bars (own) |
| PASS | 8.91 | 3.0 | primary #AEBBF0 | canvas #141B3D | Paid ring dots, filled PIN dots, switch on, progress fill, unread dot |
| PASS | 7.62 | 3.0 | primary #AEBBF0 | surfaceRaised #20284B | Primary marks in sheets |
| PASS | 7.26 | 3.0 | primary #AEBBF0 | surfaceTint #252C4C | Vote progress fill on its track |
| PASS | 7.26 | 3.0 | primary #AEBBF0 | bubbleOther #252C4C | Voice note: played bars and play button (others) |
| PASS | 5.76 | 3.0 | primary #AEBBF0 | bubbleOwn #333B61 | Voice note: played bars and play button (own) |
| PASS | 6.66 | 3.0 | iconActive #AEBBF0 | selectedTint #2A3156 | Active tab icon on its pill |
| PASS | 8.91 | 3.0 | focusRing #AEBBF0 | canvas #141B3D | Keyboard focus ring (2 px, 2 px gap) |
| PASS | 7.62 | 3.0 | focusRing #AEBBF0 | surfaceRaised #20284B | Focus ring in sheets and dialogs |
| PASS | 14.07 | 3.0 | iconPrimary #E8EBF6 | canvas #141B3D | Icons |
| PASS | 7.83 | 3.0 | iconSecondary #ADB1C2 | canvas #141B3D | Secondary icons (inactive tabs, row chevrons) |
| PASS | 6.97 | 3.0 | iconSecondary #B0B4C6 | surfaceRaised #20284B | Secondary icons in sheets |
| PASS | 7.12 | 3.0 | statusPaid #5DBB87 | canvas #141B3D | Paid check icons, daily check OK shield |
| PASS | 6.09 | 3.0 | statusPaid #5DBB87 | surfaceRaised #20284B | Done check in the confirmation card |
| PASS | 6.89 | 3.0 | statusLate #F08A7E | canvas #141B3D | Late ring dot outline, late icons |
| PASS | 5.90 | 3.0 | statusLate #F08A7E | surfaceRaised #20284B | Failed icon in the confirmation card |
| PASS | 5.51 | 3.0 | statusLate #F08A7E | dangerTint #332B46 | Alert icon in the failed check strip |
| PASS | 5.71 | 3.0 | statusPending #C98A2E | canvas #141B3D | Pending clock icon, pending dot |
| PASS | 4.88 | 3.0 | statusPending #C98A2E | surfaceRaised #20284B | Processing marker in the confirmation card |
| PASS | 4.27 | 3.0 | statusPending #C98A2E | selectedTint #2A3156 | Pending icon on a selected row |
| PASS | 7.46 | 3.0 | raffiaKeyline #D9A520 | canvas #141B3D | Keyline around raffia marks (beneficiary dot, served badge) |
| PASS | 6.38 | 3.0 | raffiaKeyline #D9A520 | surfaceRaised #20284B | Keyline around raffia marks in sheets |
| PASS | 7.46 | 3.0 | onRaffia #141B3D | accentRaffia #D9A520 | Check drawn on the raffia "already served" badge |
| PASS | 6.10 | 3.0 | accentRaffia #D9A520 | brandGround #1E2A5A | Raffia on the Ndop band and the app icon |
| PASS | 12.68 | 3.0 | brandMotif #F5F6FA | brandGround #1E2A5A | White motifs of the Ndop band, ring mark on the splash |
| info | 1.54 | - | divider #313A66 | canvas #141B3D | Row dividers (rows are also separated by spacing) |
| info | 1.32 | - | divider #313A66 | surfaceRaised #20284B | Dividers in sheets, card borders |
| info | 7.46 | - | accentRaffia #D9A520 | canvas #141B3D | Raffia fill; carries a keyline in light mode |
| info | 6.38 | - | accentRaffia #D9A520 | surfaceRaised #20284B | Raffia fill in sheets |
| info | 1.22 | - | brandGround #1E2A5A | canvas #141B3D | Ndop band edge against the canvas |
| info | 1.17 | - | surfaceRaised #20284B | canvas #141B3D | Raised surface edge (also bordered and shadowed) |

All 124 enforced pairs pass (68 pairs x 2 themes, decorative pairs reported only).

---

## 3. Typography

### 3.1 Families and files

| Family | Weights | Role (spec 1.2) |
|---|---|---|
| Bricolage Grotesque | 600, 700 | Amounts, screen titles, the group switcher label, sheet titles, the ring centre |
| Atkinson Hyperlegible | 400, 700 | Everything else: body, buttons, chat, records, labels, captions |

React Native on Android does not apply variable-font axes reliably, so the app bundles four static files, committed with their OFL licence (D9): `BricolageGrotesque-SemiBold`, `BricolageGrotesque-Bold`, `AtkinsonHyperlegible-Regular`, `AtkinsonHyperlegible-Bold`, in `apps/mobile/assets/fonts/`, loaded with `expo-font` before the splash hides. Each weight is its own `fontFamily` name in the theme; `fontWeight` is never used to synthesise a weight. There are no italics: emphasis is weight or wording.

Fallback stacks (web, and while fonts load): Bricolage `"Bricolage Grotesque", ui-sans-serif, system-ui, sans-serif`; Atkinson `"Atkinson Hyperlegible", system-ui, "Segoe UI", Roboto, sans-serif`.

### 3.2 Styles

Line height is 1.4 for reading text (spec 1.2) and 1.25 for titles and display figures. Values are density-independent pixels (dp on Android, CSS px on the web).

| Style | Family, weight | Size / line | Used for |
|---|---|---|---|
| `amountDisplay` | Bricolage 700 | 32 / 40 | Ring centre, payout amount in the withdraw sheet, fund balances on wide screens, amount input value |
| `screenTitle` | Bricolage 700 | 24 / 30 | Pushed screen titles, onboarding step titles, Welcome headline |
| `amountLarge` | Bricolage 600 | 24 / 30 | Fund balances (Caisse générale, Secours), "Disponible" in Moi |
| `groupTitle` | Bricolage 700 | 19 / 24 | Group switcher label, sheet and dialog titles |
| `amountTotal` | Bricolage 700 | 19 / 24 | Total line of the ConfirmationCard and breakdowns |
| `sectionTitle` | Atkinson 700 | 19 / 26 | Section headers ("Payé (7)"), card titles ("Payer ta cotisation") |
| `body` | Atkinson 400 | 16 / 22 | Body, chat, agent replies, row titles that are sentences |
| `bodyStrong` | Atkinson 700 | 16 / 22 | Row titles (names), button labels, emphasis |
| `amount` | Bricolage 600 | 16 / 22 | Amounts in rows and card lines |
| `secondary` | Atkinson 400 | 14 / 20 | Sub-lines, helper text, notes, metadata |
| `secondaryStrong` | Atkinson 700 | 14 / 20 | Chips, segment labels, field labels |
| `amountSmall` | Bricolage 600 | 14 / 20 | Amounts inside sub-lines |
| `caption` | Atkinson 400 | 12 / 17 | Timestamps, references, legends |
| `captionStrong` | Atkinson 700 | 12 / 17 | Tab labels, badges, counts |

Rules:

- **The currency suffix steps down.** `AmountText` renders the figure in the amount style and "FCFA" one step smaller in `textSecondary` (32 → 19, 24 → 16, 19 → 14, 16 and 14 → 14), so the figure leads. The screen reader hears one phrase (9.3).
- **Amounts inside sentences** ("Tu dois 11 000 FCFA avant vendredi") stay in the sentence's font. Bricolage is for amounts that stand alone: list columns, card lines, totals, balances.
- **Digits** use `fontVariant: ['tabular-nums']` where the font supports it, so stacked amounts align on the right edge.
- **Sentence case everywhere.** No all-caps labels, no letter-spaced eyebrows (spec 1.2). Initials in avatars are the only capitals by design.
- **References and fingerprints** ("MP2611A9F2", hashes) are set in Atkinson Hyperlegible, whose distinct 0/O and 1/l/I is why it was chosen; long fingerprints break into groups of 8 characters.

### 3.3 Text at 200%

Text follows the system font scale (Android font size, browser zoom) up to 200%. No text container has a fixed height; components grow vertically.

| Component | Behaviour as text grows |
|---|---|
| List row | At font scale ≥ 1.5 the trailing amount moves under the title, still right-aligned on its own line. Titles wrap; nothing truncates except chat previews (2 lines) and group names in the header (2 lines). |
| ConfirmationCard | Line labels wrap above their amount when they would collide; buttons stack (primary first, then "Annuler" as a text button) when both labels do not fit on one line. |
| Segmented control | When the four labels do not fit, the control becomes a horizontally scrollable row of the same segments, each sized to its label. |
| Bottom tab bar, navigation rail | Labels are capped at 1.5× (`maxFontSizeMultiplier`); icons stay 24. The full label is in the accessibility label. |
| NjangiRing | At font scale ≥ 1.3 the centre amount moves out of the ring to a line directly below it, where it scales fully. The 64 px ring never holds text. |
| Njangi status header | The three status lines wrap; the 64 px ring stays the same size and aligns to the first line. |
| PIN pad | Digits are capped at 1.3× so the 3 × 4 pad fits a 360 dp screen; the title and errors scale fully. |
| Chips | Chips grow taller and the row keeps scrolling horizontally. |

These caps are the only exceptions; they are listed again in decision DD-10.

### 3.4 French typography

French copy uses a no-break space (U+00A0) before `:` `;` `?` `!` and inside « », the typographic apostrophe ’, and a decimal comma ("1,5×"). Amounts come from `formatXAF`, which uses a narrow no-break space as thousands separator and a no-break space before "FCFA", so an amount never breaks across lines. The copy files already contain these characters; never retype them with plain spaces.

---

## 4. Layout foundations

### 4.1 Spacing

A 4 dp base on an 8 dp rhythm. Components use these steps only.

| Token | dp | Typical use |
|---|---|---|
| `space1` | 4 | Gap inside a bubble run, icon-to-text in badges |
| `space2` | 8 | Chip gaps, label-to-field, between stacked buttons |
| `space3` | 12 | Row vertical padding, leading slot to text, between runs of chat messages |
| `space4` | 16 | Screen gutter (phone), card and sheet inner padding (compact) |
| `space5` | 20 | ConfirmationCard padding, button horizontal padding |
| `space6` | 24 | Section spacing, sheet padding on wide screens, gutter on tablets |
| `space8` | 32 | Between major blocks, gutter on desktop |
| `space10` | 40 | Empty-state top padding |
| `space12` | 48 | Minimum touch target, standard control height |
| `space16` | 64 | Tab bar height, header ring |

### 4.2 Screen structure and safe areas

Phone (compact width), top to bottom:

```
status bar inset (safe area top)
header ............ 56   group switcher + bell, or back + title
banners ........... 0+   offline / error / check strip, full width, never overlaid
content ........... flex scrolls; 16 dp gutters
composer .......... 48+  Njangi and Groupe tabs only
tab bar ........... 64   + safe area bottom (gesture bar)
```

- Safe areas come from `react-native-safe-area-context`. The header pads by the top inset; the tab bar and any sticky footer (sheet actions, composers) pad by the bottom inset. In landscape, horizontal insets pad the gutters.
- The keyboard: Android `softwareKeyboardLayoutMode: "resize"`. The tab bar hides while the keyboard is open; composers and sheet footers sit on the keyboard.
- Content width on a phone is the screen minus 32 dp. The design is drawn at 360 × 800 dp (the most common entry-level size) and checked at 320 dp wide, where every component still fits.

### 4.3 Radii

Radius follows hierarchy (spec 1.2). Only three values exist.

| Radius | Applied to |
|---|---|
| 20 | Bottom sheets (top corners), desktop dialogs, ConfirmationCard |
| 12 | Grouped lists, bordered blocks (ProposalCard, information cards, daily check strip when in alert), inputs, buttons, chat bubbles, images in chat, skeleton blocks |
| Full | Chips, avatars, badges, segmented control, PIN dots, ring dots, toggle switches, radio and check circles, the tab pill |

Rows inside a grouped list have no radius of their own; the container clips them.

### 4.4 Elevation

Two raised surfaces, as 2.4. Everything else is flat: grouped lists, ProposalCard and information cards are *bordered*, not raised (1 px `divider`, no shadow). This keeps the confirmation card unmistakable: if something floats, it is about money or the group, and it is waiting for you.

### 4.5 Dividers and borders

- Row dividers: 1 px `divider` (on Android `StyleSheet.hairlineWidth` is not used; 1 dp reads consistently on low-density screens). Inset to the start of the row text (16 + leading slot + 12), never under avatars.
- Container border (grouped list, bordered blocks, raised surfaces): 1 px `divider`.
- Control borders: 1 px `outline` at rest, 2 px `primary` when focused, 2 px `late` when in error. The field does not change size between states (the border is drawn inside).
- Section separation is spacing (24 dp) plus a section title, never a heavy rule.

### 4.6 Icons

Lucide outline icons (`lucide-react-native`) at 24 dp with a 2 px stroke in `iconPrimary` or `iconActive` (spec 1.2). Smaller sizes are allowed only inside dense components, with the stroke kept at 2 px: 20 dp in buttons, banners and chevrons; 16 dp in notes, system events and badges. The one custom glyph is `RingMark` (`assets/ring-mark.svg`), drawn on lucide's grid, used as the Njangi tab icon and the agent's avatar.

| Meaning | Lucide name | Meaning | Lucide name |
|---|---|---|---|
| Njangi tab, agent | `RingMark` (custom) | Groupe tab | `messages-square` |
| Caisse tab | `wallet` | Votes tab | `vote` |
| Moi tab | `circle-user-round` | Notifications | `bell` |
| Group switcher | `chevron-down` | Back | `arrow-left` |
| Close | `x` | Row chevron | `chevron-right` |
| Paid, done | `circle-check` | Late, failed | `circle-alert` |
| Pending | `clock` | Expired | `timer-off` |
| Cancelled | `circle-slash` | Not yet paid | `circle-dashed` |
| Daily check OK | `shield-check` | Daily check alert | `shield-alert` |
| Offline | `wifi-off` | Secret vote, PIN | `lock` |
| Payment received | `arrow-down-to-line` | Withdrawal | `arrow-up-from-line` |
| Fine | `alarm-clock` | Loan | `hand-coins` |
| Bid | `gavel` | Solidarity | `heart-handshake` |
| Automatic deduction | `repeat` | Decision (event) | `scale` |
| Reversal | `undo-2` | Fund sharing | `split` |
| Meeting | `calendar-days` | Attendance | `user-round-check` |
| Statement | `file-text` | Export, download | `download` |
| Share | `share-2` | Copy | `copy` |
| Attach | `paperclip` | Voice note | `mic` |
| Play, pause | `play`, `pause` | Send | `send-horizontal` |
| Photo | `image` | Video | `film` |
| Reply | `reply` | Deleted message | `ban` |
| Hidden by admin | `eye-off` | Pinned announcement | `pin` |
| Summarise | `list-checks` | Mention | `at-sign` |
| Language | `languages` | Security | `shield` |
| Privacy | `user-round-cog` | Assistant history | `history` |
| Log out | `log-out` | Fingerprint unlock | `fingerprint` |
| Search | `search` | Filters | `list-filter` |
| Phone, payment number | `smartphone` | Info note | `info` |
| Members | `users-round` | Settings | `settings` |
| Rejected vote | `circle-x` | Invite link | `link` |
| PIN reset link | `key-round` | Delete | `delete` (PIN pad), `trash-2` |

Icons that convey meaning carry an accessibility label or sit beside text that does; decorative icons are hidden from screen readers.

### 4.7 Touch targets

Every interactive element has a hit area of at least 48 × 48 dp (spec 1.7), even when its visual is smaller (chips are 40 high, the bell glyph 24, ring dots 18): the difference is padding or `hitSlop`, and neighbouring hit areas never overlap. Adjacent targets keep at least 8 dp between their visuals.

---

## 5. Components

Each component lists its anatomy, sizes, states, accessibility and copy keys. Phase B builds them in `apps/mobile/src/ui/` (one PascalCase file each) and shows every state in a dev-only gallery route.

### 5.1 Buttons

| Variant | Fill | Label | Border | Use |
|---|---|---|---|---|
| Primary | `primary` | `textOnPrimary` | none | The one main action of a screen, sheet or card |
| Secondary | none | `textLink` | 1.5 px `primary` | Alternatives of equal weight ("Oui" / "Non" on a proposal) |
| Destructive | `danger` | `textOnPrimary` | none | Irreversible group or account actions (delete account, hide message) |
| Text | none | `textLink` | none | Low-emphasis actions ("Annuler", "Voir le détail", "Changer") |

- **Size:** height 48, horizontal padding 20, radius 12, label `bodyStrong` (16). Optional 20 dp leading icon, 8 dp gap. Inside cards and sheets on phones, buttons span the available width; in a row of two, "Annuler" takes its natural width and the primary takes the rest.
- **Label:** names exactly what happens, with the amount when money moves: "Payer 11 000 FCFA" (`copy: confirmation.actions.pay.button`). Never "OK", "Valider" or "Soumettre".
- **States:**

| State | Look | Accessibility |
|---|---|---|
| Rest | As the table | role `button`, label = visible label |
| Pressed | Primary: `primaryPressed`; others: `selectedTint` layer | — |
| Hover (web, pointer) | 8% layer of the label colour | cursor `pointer` |
| Focus-visible (keyboard) | 2 px `focusRing`, 2 px gap, radius 14 | — |
| Loading | Label replaced by a 20 dp `ActivityIndicator` in the label colour; width kept | `accessibilityState.busy`, label unchanged |
| Disabled | `disabledFill`, label `textSecondary`, no border | `accessibilityState.disabled`; hint explains why when there is a reason |
| Offline ("Connexion requise") | Disabled look, leading `wifi-off` 20, label `copy: offline.connectionRequired` | hint `copy: offline.actionsHint` |

- **Rule:** every money and vote button becomes "Connexion requise" offline (spec 1.7). Other buttons that need the network (send a statement, export) do the same; reading buttons stay enabled and work from the cache.

### 5.2 Inputs

**Text field.** Label above (`secondaryStrong`, `textPrimary`), field 56 high, radius 12, 1 px `outline`, inner padding 16, text `body`. Helper text below (`secondary`, `textSecondary`). Focus: 2 px `primary`. Error: 2 px `late`, helper replaced by the error (`secondary`, `textDanger`) with a 16 dp `circle-alert`; the error is announced politely. Placeholder in `textSecondary` (6.04:1), never used as the label. Multi-line fields grow up to 5 lines, then scroll. Errors appear on blur or on submit, never while typing the first characters.

**Phone field** (sign-up, login, payment number, invitations).

```
Numéro de téléphone
┌──────┬──────────────────────────────┬────────┐
│ +237 │ 677 12 34 56                 │  MTN   │
└──────┴──────────────────────────────┴────────┘
Il sert à te connecter. Les autres membres ne le voient jamais.
```

- A fixed "+237" prefix (`textSecondary`, not editable, separated by a 1 px `divider`), then the 9-digit national number, grouped 3-2-2-2 as typed, numeric keyboard (`keyboardType="phone-pad"`, `autoComplete="tel"`). Pasting "+237 6…", "00237…" or spaced forms is normalised with `normalizeCameroonPhone`.
- **Operator detection:** once 3 digits are typed, `detectOperator` fills a trailing operator badge ("MTN" or "Orange", text only, 1 px `outline` pill). Unknown prefixes show "Choisir". On the payment-number step the operator is an explicit two-option choice (MTN, Orange) prefilled from the detection with `copy: signup.paymentNumber.detected`; the member confirms or corrects it. No operator logos: names only.
- Validation: 9 digits starting with 6 (`copy: errors.validation.phoneInvalid`).
- Accessibility: label includes "+237"; the value is read digit by digit in groups.

**PIN pad** (sign-up, login, PIN sheet, PIN change). A custom keypad, never the system keyboard, so no keyboard learns the PIN and screenshots can be blocked (`expo-screen-capture`).

```
         ○  ○  ○  ●  ●  ●            6 dots, 14 dp, 16 dp apart
      1        2        3
      4        5        6            keys 64 high, max 96 wide
      7        8        9
               0        ⌫
           Code PIN oublié ?
```

- Dots: empty = 1.5 px `outline` ring; filled = `primary` disc. After a wrong PIN all six turn to `late` rings for the error, then clear when the next digit is typed.
- Keys: digits in Atkinson 700 24 (`textPrimary`), no key borders; pressed = `selectedTint` circle 64 dp behind the digit. Delete key: `delete` icon, label `copy: pinSheet.delete`. The bottom-left cell is empty (biometrics never replace the PIN for L2, spec 4.5).
- Behaviour: submits automatically on the sixth digit, shows `copy: pinSheet.checking` under the dots, then success closes the sheet or the error appears (`copy: pinSheet.wrong_one` / `_other`, `copy: pinSheet.locked`). The member can never paste into the pad on Android; on the web, a 6-digit paste is accepted (8.6).
- Accessibility: the dot row is one element read as `copy: pinSheet.digitsA11y`; each key is a button labelled with its digit; errors are announced assertively.

**Amount input** (withdraw, loan, bid, solidarity request).

- The value in `amountDisplay` (32), right-aligned, with "FCFA" in `groupTitle` size beside it; formatted live with `formatAmount` (thousands separators appear as you type). Numeric keyboard (`number-pad`), integers only; pasted text keeps digits only.
- Above it: label (`secondaryStrong`). Below it: the allowed range or the available balance (`copy: withdraw.max`) and quick chips where useful ("Tout retirer", the member's loan limit).
- Errors: below minimum, above maximum (`copy: errors.validation.amountMin` / `amountMax`). The primary button stays disabled until the amount is valid.
- Accessibility: label plus value as words (`amountToWords`).

**Slider** (loan amount; built in-house with `PanResponder`, no library). Track 4 dp (`outline`), filled part `primary`, thumb 24 dp `primary` disc with a 2 dp `canvas` ring, 48 dp hit area. Step 1 000 FCFA (500 below 5 000). Always paired with the amount input above it, so the slider is never the only way to set the value. Accessibility: role `adjustable`, `accessibilityValue` with min, max and the value as words; increment and decrement actions move one step.

**Choice controls.** Radio and check marks are circles (radius full), 22 dp, 2 px `outline`. Selected radio: `primary` 10 dp inner dot. Checked check: `primary` disc with a `textOnPrimary` check. Always inside a full-width choice row (48+ high) where the whole row is the target and the label is the row text. The consent checkbox is one such row.

**Switch.** React Native `Switch`: track `outline` (off) and `primary` (on), thumb `canvas`. Always in a row with a text label and, if needed, a helper line. A switch that cannot be changed (Sécurité notifications) is shown on and disabled, with the reason as helper text (`copy: notifications.settings.securityLocked`).

**Date and time fields** (create a group, schedule a meeting, statements). Built in-house (no picker library is approved): the field looks like a text field showing the formatted value ("samedi 28 novembre 2026", "18:00"); tapping opens a bottom sheet. Date sheet: month title with previous and next buttons, 7-column grid of 48 dp day cells (selected = `primary` disc, today = 1.5 px `primary` ring, unavailable days `textSecondary` and disabled). Time sheet: a scrolling list of times every 15 minutes, 48 dp rows, the current value selected. Both confirm with a primary button. Web keyboard: arrows move the day, Page Up/Down change month, Enter selects.

### 5.3 List rows, grouped lists, section headers

Lists are plain rows separated by `divider` lines, never stacks of cards (spec 1.2).

```
┌ leading ┐  title ......................... trailing ┐
│ 40 dp   │  subtitle                        amount   │   min 56 (one line), 72 (two lines)
└─────────┘                                  status   ┘
```

- **Leading slot (optional):** avatar 40, or a 24 icon centred in 40, or a status icon 24. 12 dp to the text.
- **Title:** `bodyStrong` for names and things, `body` for sentences. **Subtitle:** `secondary`.
- **Trailing slot (one of):** an amount (`AmountText` size 16, right-aligned) with an optional status word under it in `secondary` ("en retard" in `textDanger`, "à temps" in `textSecondary`); a chevron (20, `iconSecondary`) for navigation; a switch; a text button.
- Padding: 16 horizontal, 12 vertical. Whole row is the target when it does something; pressed shows `selectedTint`, hover shows `hoverLayer`.
- Accessibility: the row is one element whose label joins its parts in reading order with amounts as words ("Joël Ndi, dix mille francs CFA, en retard").
- **Grouped list:** rows inside a container with radius 12 and a 1 px `divider` border, no fill. Used for settings, the Moi summary, breakdowns and member lists of fixed length. Long or live lists (Registre, chat, notifications) are ungrouped full-width rows.
- **Section header:** `sectionTitle` (19) with an optional count in the text ("Payé (7)") and an optional trailing text button ("Tout voir"). 24 dp above, 8 dp below. Role `header`.

### 5.4 Chips

| Kind | Look | Behaviour |
|---|---|---|
| Context chip (Njangi tab) | 40 high (48 hit), radius full, 1 px `outline`, label `secondaryStrong` in `textLink`, 16 padding | Sends its label as the member's message (it appears as their bubble), so the conversation stays an honest record. Max 4 visible; the row scrolls horizontally above the composer. |
| Filter chip (Registre, member list) | Same shape; selected = `primary` fill, `textOnPrimary` label and a 16 dp leading check | Toggles a filter. Selection is shown by fill and the check, not by colour alone. |
| Quick-amount chip (amount input) | Same as context chip | Fills the amount ("Tout retirer"). |

Accessibility: context chips are buttons labelled `copy: agent.chips.a11yLabel`; the chip row is a group labelled `copy: agent.chips.groupLabel`. Filter chips expose `selected` state.

### 5.5 Avatars

Initials in a circle: 32 (chat), 40 (rows), 56 (profile sheet). Fill `selectedTint`, initials `captionStrong` / `bodyStrong` / `groupTitle` in `textLink`. Initials are the first letters of the first two words of the name ("Carine Fotso" → "CF"; "Ivo" → "I"). No photos (nothing to upload, nothing to download on cellular), no colour coding per person. The agent's avatar is the `RingMark` glyph in `iconActive` on the same fill. Avatars are decorative for screen readers: the name next to them is read.

### 5.6 Badges

- **Label badge** ("Vote secret", "Admin", "Nouveau membre"): 24 high, radius full, 1 px `outline`, `captionStrong` in `textPrimary`, 8 padding; "Vote secret" carries a 14 dp `lock` icon first (`copy: votes.card.secretBadge`).
- **Count badge** (bell, tabs): min 20 × 20, radius full, `primary` fill, `captionStrong` in `textOnPrimary`, offset to the top-right of the icon; "99+" above 99. The count is part of the parent's accessibility label (`copy: nav.bell.labelUnread_other`).
- **Dot badge** (Njangi tab when a private reply waits): 8 dp `primary` disc; label "Non lu".

### 5.7 Segmented control (Caisse: Tour, Caisse, Secours, Registre)

Container 48 high, radius full, `surfaceTint` fill, 4 dp inner padding. Four equal segments, 40 high, label `secondaryStrong`. Selected: `primary` fill, `textOnPrimary` label. Unselected: no fill, `textPrimary` label. The selection moves without a slide (no motion outside spec 1.2's two moments). Labels: `copy: caisse.segments.*`. Accessibility: role `tablist` with `tab` children and `selected` state; on the web, arrow keys move between segments (roving focus). When labels do not fit (3.3), the control scrolls horizontally.

### 5.8 Header: group switcher and bell

```
┌─────────────────────────────────────────────┐
│ Njangi des Collègues ⌄                [🔔3] │  56 high
└─────────────────────────────────────────────┘
```

- **Group switcher** (left): group name in `groupTitle` (19, one line, two lines at large text, then ellipsis) followed by a 20 dp `chevron-down`. The whole label is one 48+ dp target that opens the group switcher sheet (SCREENS S-26). Label `copy: nav.groupSwitcher.a11yLabel`. With a single group it still opens the sheet (to create or join another).
- **Bell** (right): 48 dp button, `bell` icon, count badge for unread notifications. Opens Notifications.
- **Pushed screens** (detail views, settings) replace the switcher with a 48 dp back button and the screen title in `screenTitle` (24, one line with ellipsis, two at large text). The bell stays on tab screens only.
- The header sits on `canvas`, with a 1 px `divider` below only once content scrolls under it.

### 5.9 Bottom tab bar (phones)

Five equal items, 64 high plus the bottom inset, `canvas` fill, 1 px `divider` on top. Each item: 24 dp icon above a `captionStrong` label. Active: a 56 × 32 `selectedTint` pill behind the icon, icon and label in `textLink`. Inactive: icon `iconSecondary`, label `textSecondary` regular. Badges: Groupe shows the unread count, Votes the number of open votes waiting for the member's vote, Njangi a dot when a private reply is waiting. Labels: `copy: nav.tabs.*`; accessibility labels with counts: `copy: nav.tabsA11y.*`. Tapping the active tab scrolls it to the top (in Groupe and Njangi, to the latest message). On medium and wide screens the same items move to a navigation rail or sidebar (8.2).

### 5.10 Bottom sheet

Built in-house (D4) with `Animated`, `PanResponder` and `Modal`.

```
            ───                         handle 32 × 4, `outline`, 8 from top (inside a 24 high drag zone)
 Titre de la feuille                ✕   `groupTitle` + 48 dp close button
 ─────────────────────────────────────
 content (scrolls)                      16 padding (24 on wide)
 ─────────────────────────────────────
 [ Action secondaire ] [ Action principale ]   sticky footer + bottom inset
```

- Surface `surfaceRaised`, top radius 20, 1 px `divider` border, shadow as 2.4, over `scrim`.
- Height fits content up to 92% of the window; beyond that the content scrolls and the footer stays visible.
- Dismiss: drag down past 25% of the height or with a fast flick, tap the scrim, Android back, Escape on the web, or the close button. A sheet whose content is a ConfirmationCard in processing state can be closed; the operation continues and its result arrives as an event.
- Focus: on open, focus moves to the title; on the web, focus is trapped inside and `aria-modal` is set; on close, focus returns to the control that opened it. The sheet is announced with its title.
- On wide screens the same component renders as a centred dialog (8.4).

### 5.11 PIN sheet (L2 confirmation)

A bottom sheet that opens after the member taps the primary button of an L2 ConfirmationCard (spec 4.5): changing the payment number, deleting the account.

- Title `copy: pinSheet.title`; subtitle = the card title ("Changer ton numéro de paiement"); then the PIN pad (5.2); then `copy: pinSheet.forgot` as a text button.
- The card underneath stays in its ready state until the PIN is accepted, then switches to processing and done.
- Wrong PIN: error with remaining tries; after the lockout the sheet shows `copy: pinSheet.locked` and the card returns to ready (it will expire on its own).
- Screenshots are blocked while it is open (phone only). Not dismissible by dragging while checking.

### 5.12 Banners

Full-width strips directly under the header, never floating, never covering content. Minimum 40 high, 16 gutters, 20 dp icon, `secondary` text, optional trailing text button. They appear and disappear without animation and are announced politely.

| Banner | Fill | Icon | Copy | Action |
|---|---|---|---|---|
| Offline | `surfaceTint` | `wifi-off` (`iconPrimary`) | `copy: offline.banner` ("Hors ligne, mis à jour à 14:32"), or `bannerYesterday`, `bannerDate`, `bannerNever` | none |
| Error (load failed, withdrawals paused) | `dangerTint` | `circle-alert` / `shield-alert` (`statusLate`) | what happened, then what to do | "Réessayer" or "Voir le détail" |
| Info (number-change hold, pending activation) | `surfaceTint` | `info` | `copy: withdraw.hold`, `copy: chat.pendingActivationNote` | optional |
| Unread summary (Groupe tab, 20+ unread) | `surfaceTint` | `list-checks` | `copy: chat.summarize.banner_other` | "Résumer" (`copy: chat.summarize.action`) |

Only one banner shows at a time, in this priority: offline, error, info, unread summary.

### 5.13 Daily check strip

Shows the latest reconciliation (spec 1.4, 2.9) at the bottom of Caisse › Tour and at the top of Caisse › Registre.

| Status | Look | Copy |
|---|---|---|
| OK | A plain 48 dp row: `shield-check` 20 in `statusPaid`, text `secondary` in `textSecondary`, chevron | `copy: caisse.dailyCheck.ok` ("Vérification du jour : conforme, 06:00. Registre intact.") |
| WARNING | Same row, `clock` in `statusPending`, text `textPrimary` | `copy: caisse.dailyCheck.warning` |
| ALERT | Bordered block (radius 12) on `dangerTint`, `shield-alert` 24 in `statusLate`, first sentence in `bodyStrong`, body in `secondary`, "Voir le détail" | `copy: caisse.dailyCheck.alert` + `sheet.alertBody` |
| Not yet run / stale | Plain row, `clock` in `iconSecondary` | `copy: caisse.dailyCheck.notYet`, `stale` |

In ALERT state the strip also moves to the top of every Caisse segment, the Njangi status header adds `copy: agent.header.withdrawalsPaused`, and every "Retirer" button is replaced by the explanation (SCREENS J-10). Tapping the strip opens the daily check sheet (provider balance, ledger cash, in-flight, difference, chain status) in plain words (`copy: caisse.dailyCheck.sheet.*`).

### 5.14 Feedback without toasts

There are no toasts or snackbars: they would be a third floating surface (spec 1.2 allows two) and they vanish before slow readers finish. Feedback appears where the action happened:

- Copy buttons change their label to "Copié" (`copy: common.actions.copied`) for 2 seconds.
- Results of money and governance actions arrive as a system event in the conversation and as the card's done state.
- Saved settings show their new value in place; a failed save shows the error under the control.
- Background events the member did not start (a payment landed, a vote closed) become notifications and system events, not pop-ups.

### 5.15 Empty states

Centred in the available space, max width 320: a 32 dp icon in `iconSecondary`, a title in `sectionTitle`, one or two sentences in `body` / `textSecondary` that say what to do next, and at most one button. No illustrations. Every list in SCREENS.md names its empty state and copy key (for example `copy: votes.emptyOpen`: "Aucun vote ouvert. Propose un changement de règle ou un nouveau membre.").

### 5.16 Loading

- Cached data first: TanStack Query shows the last known state immediately and refreshes in the background; nothing blanks out to reload.
- Skeletons only on a first load with no cache, and only after 300 ms (fast responses never flash). Skeletons are static `surfaceTint` shapes that match the real layout (a 40 dp circle and two text bars of 12 and 10 dp per row, radius full for bars, 12 for blocks). No shimmer: it costs battery on entry-level phones and is motion the spec does not allow.
- Screen readers hear one `copy: a11y.skeleton` with `busy` state, not each bar.
- Pull to refresh uses the platform `RefreshControl`.

### 5.17 AmountText

The only component that displays money. Wraps `formatXAF` / `formatAmount` from `packages/shared` (spec 1.5); never `Intl`, never string concatenation.

| Prop | Values |
|---|---|
| `amount` | integer FCFA |
| `size` | `display` 32, `large` 24, `total` 19, `body` 16, `small` 14 |
| `sign` | `auto` (minus only) or `always` (`+10 900`, Registre and breakdowns) |
| `currency` | `suffix` (default: figure + smaller "FCFA"), `none` (ring "sur 100 000", via `formatAmount`) |
| `tone` | `primary` or `secondary` (only for struck amounts like "Déjà retiré") |

- Right-aligned in every list and card line (spec 1.2). Does not wrap: the figure and "FCFA" stay together (the no-break space in `formatXAF`).
- Accessibility label: `amountToWords(amount, lang)` ("onze mille francs CFA", "eleven thousand CFA francs"), with "plus" / "moins" for signed amounts. The visible text is hidden from the screen reader so it is not read twice.

### 5.18 MaskedNumber

Shows another member's or the member's own payment number as `maskNumber(e164)`: `6•• •• •7 89` (first digit and last three, spec 1.5). Atkinson `body` or `secondary`. Accessibility: `copy: a11y.maskedNumber` with the last three digits spaced ("se terminant par 7 8 9"). The member's own full number appears only in its information card and in Moi › Numéro de paiement, through `formatOwnNumber` (`677 12 34 56`), read with `copy: a11y.ownNumber`. Other members' numbers never reach the app (spec 2.11), so there is nothing to mask for them: they are simply absent.

### 5.19 LedgerRow

```
[icon]  Paiement reçu : Paul Mbarga, tour 4          +10 900 FCFA
        3 nov., 14:32 · n° 412 · MP2611A9F2
```

- Leading: the transaction type icon (4.6) in `iconPrimary` on a 40 dp `surfaceTint` circle.
- Title: the description in the member's language (`descriptionFr` / `descriptionEn` from the server), `body`, up to 2 lines.
- Subtitle: date and time (Douala), the short sequence reference (`copy: caisse.ledger.shortRef`) and the operator reference truncated to 10 characters, `secondary`.
- Trailing: the amount as it moved at the operator (`cash:provider`): signed with `sign: 'always'` for payments, withdrawals, loans and support; unsigned in `textSecondary` for entries that move no cash (fines, automatic deductions, bids, fund sharing); nothing for EVENT entries. Never coloured.
- Tap opens the entry detail (SCREENS S-14). Accessibility label `copy: caisse.ledger.rowA11y`.

### 5.20 ProposalCard

A bordered block (radius 12, 1 px `divider`, 16 padding), not raised: it is information until the member votes, and voting opens a ConfirmationCard.

```
Changement de règle                          [🔒 Vote secret]
Amende de retard : 1 000 → 1 500 FCFA
Proposé par Paul Mbarga · Clôture dans 2 jours
████████████████████░░░░░░░░│░░░░░░░░░░░░   5 oui sur 7 requis · 1 non
○ Tu n’as pas encore voté
[        Oui        ] [        Non        ]
```

- Type (`secondary`, `copy: votes.types.*`) and the "Vote secret" badge when `secret`.
- Title (`bodyStrong`, up to 3 lines, `copy: votes.titles.*`), proposer and time left (`secondary`).
- **Progress (open, not secret):** an 8 dp bar, radius full, `surfaceTint` track whose full width is the number of eligible voters; `primary` fill for yes votes; a 2 × 14 dp `textPrimary` tick at the threshold. Text: `copy: votes.card.progress` and `copy: votes.card.noCount`. The bar never shows "no" as a coloured segment.
- **Secret vote, open:** no yes/no figures anywhere. The bar shows participation (voted ÷ eligible), text `copy: votes.card.participation` ("6 membres sur 9 ont voté") and `copy: votes.card.participationNote`.
- **Your vote:** one line with an icon: `circle-dashed` "Tu n’as pas encore voté", `circle-check` "Tu as voté oui", or for secret votes "Tu as voté. Ton choix reste secret." When the member cannot vote, the reason (`copy: votes.card.yourVote.excludedTarget` and siblings) replaces the buttons.
- **Buttons:** "Oui" and "Non", two secondary buttons of equal width. Each opens a ConfirmationCard ("Voter oui") in a sheet. Offline: one disabled "Connexion requise" button.
- **Closed:** result badge with icon ("Adopté" with `circle-check` in `statusPaid`, "Rejeté" with `circle-x` in `statusLate`, "Expiré" with `timer-off`), the final tally (`copy: votes.card.tally`) and the effect ("Appliqué au tour 5", `copy: votes.card.effect.round`). Secret votes show their totals only now.
- Accessibility: the card is a group; progress is read as `copy: votes.card.a11yProgress`.

### 5.21 ConfirmationCard

The heart of "talk, don't tap" (spec 1.5, 4.5). Every action that moves money or changes the group is shown as this card before it happens, whether the agent or a screen started it. The card is drawn **from the server's PendingAction**, never from the agent's text: the app receives a structured preview (action type, line items with their kind and integer amount, total, note kinds, level, expiry) and renders it with the copy keys below, so wording and amounts cannot drift.

**Anatomy (ready state)**

```
┌──────────────────────────────────────────┐   radius 20, `surfaceRaised`, 1 px `divider`, shadow 2.4
│ Payer ta cotisation                      │   `sectionTitle`   copy: confirmation.actions.pay.title
│                                          │
│ Cotisation, tour 4          10 000 FCFA  │   `body` label, `amount` value
│ Caisse de secours            1 000 FCFA  │
│ ──────────────────────────────────────── │   `divider`
│ Total                       11 000 FCFA  │   `bodyStrong` + `amountTotal`
│                                          │
│ ⓘ Tu recevras une demande MTN sur        │   `secondary`, 16 dp `info` icon
│   6•• •• •7 89.                          │   copy: confirmation.notes.operatorRequest
│                                          │
│ [ Annuler ]  [   Payer 11 000 FCFA    ]  │   text button + primary
└──────────────────────────────────────────┘
```

- Width: the content width on phones; max 440 in a conversation on wide screens. Padding 20; 12 between lines; 16 before the note; 20 before the actions.
- **Title:** verb + object (`copy: confirmation.actions.<type>.title`).
- **Lines:** label left, amount right (`copy: confirmation.lines.*`). Non-money cards (votes, proposals, meetings) use label/value lines in `body` ("Actuellement 1 000 FCFA", "Proposé 1 500 FCFA", "Seuil 7 oui sur 10").
- **Total:** bold line, only for money.
- **Notes:** at most two, the most important first (`copy: confirmation.notes.*`). "Modifier" appears inside the note when the member can change the round (`copy: confirmation.notes.oldestFirst`).
- **Actions:** "Annuler" (text button) and the primary button repeating the verb and amount (`copy: confirmation.actions.<type>.button`). At large text they stack, primary first.
- **L2 actions** (change payment number, delete account) carry a `lock` icon and `copy: confirmation.pinRequired` next to the title; the primary tap opens the PIN sheet (5.11).
- **Expiry:** unconfirmed cards expire after 10 minutes (spec 4.5). In the last 2 minutes the note area adds `copy: confirmation.notes.expiresSoon`.

**States.** The title verb carries through (spec 1.5): Payer → Payé, Retirer → Retiré, Voter → Voté. Lines stay visible in every state, so the member always sees what the state refers to. State changes cross-fade the changing parts in 160 ms (7.3) and are announced politely.

| State | Header | Body | Actions |
|---|---|---|---|
| Ready | Title | Lines, total, notes | Annuler · primary |
| Offline | Title | Lines, total, notes | Annuler · disabled "Connexion requise" |
| Waiting for PIN (L2) | Title + `lock` | Lines | Card unchanged under the PIN sheet |
| Processing (payment) | Title | Lines; status block: 20 dp spinner in `statusPending` + `copy: confirmation.processing.payment` ("En attente de ta validation MTN…") in `bodyStrong`, then `processing.paymentHelp` in `secondary` | none (the request is with the operator); after 2 minutes `processing.stillWaiting` is added |
| Processing (withdrawal, loan, support) | Title | Status block with `processing.withdrawal` ("Envoi vers ton numéro 6•• •• •7 89…") | none |
| Processing (non-money) | Title | Status block with `processing.generic` | none |
| Done | 24 dp `circle-check` in `statusPaid` + done verb ("Payé", `copy: confirmation.actions.<type>.done`) in `sectionTitle`, `textPrimary` | Lines; reference `copy: common.reference` ("Réf. MP2611A9F2", selectable) | "Voir dans le registre" (text) |
| Failed | 24 dp `circle-alert` in `statusLate` + failure title (`copy: confirmation.failed.<reason>.title`, "Paiement refusé par MTN") | Lines; `dangerTint` block (radius 12) with what to do (`failed.<reason>.body`, "Vérifie ton solde, puis réessaie.") | Fermer · "Réessayer" (prepares a new card) |
| Pending too long (operator silent at 10 min) | 24 dp `clock` in `statusPending` + `copy: confirmation.pendingLate.title` | `pendingLate.body`: keep checking 24 h, do not pay again | Fermer |
| Expired | 24 dp `timer-off` in `iconSecondary` + "Expiré" | `copy: confirmation.expired.body` ("Rien n’a été fait.") | "Préparer à nouveau" (secondary) |
| Cancelled | 24 dp `circle-slash` in `iconSecondary` + "Annulé" | `copy: confirmation.cancelled.body` | none |

Failure reasons map one to one to server error codes: `insufficientBalance`, `declined`, `operatorTimeout`, `providerUnavailable`, `invalidNumber`, `disbursementFailed`, `situationChanged`, `alreadyPaid`, `holdActive`, `withdrawalsPaused`, `limitExceeded`, `voteClosed`, `alreadyVoted`, `notEligible`, `generic`. Every one says what happened and what to do, and never apologises.

**In the conversation.** Cancelled and expired cards collapse to a one-line summary once the member scrolls past them ("Payer ta cotisation · Annulé"), so old cards do not clutter the history; done and failed cards stay full. A card is never re-confirmed from history: "Réessayer" and "Préparer à nouveau" always create a new PendingAction.

**Accessibility.** The card is a group labelled `copy: confirmation.a11y.card`. Each line reads as `copy: confirmation.a11y.line` with the amount in words; the total as `copy: confirmation.a11y.total`. Focus lands on the title when the card appears from an agent reply only if the member is not typing. State changes are announced (`polite`), failures `assertive`.

### 5.22 Information cards

Read results that carry sensitive values are drawn by the app from the server, not written by the agent (spec 4.5). They are bordered blocks (radius 12, 1 px `divider`, 16 padding), not raised: nothing is waiting for confirmation.

| Card | Content | Actions | Copy |
|---|---|---|---|
| Own payment number | `smartphone` icon, title, the full number (`formatOwnNumber`) in `amountLarge`-size Atkinson 700, operator name, "Actif depuis le…", hold notice if any, `onlyYou` note | Changer · Copier | `copy: infoCards.paymentNumber.*` |
| Statement | `file-text`, "Relevé : octobre 2026", "PDF, 84 Ko", verification code | Ouvrir · Partager | `copy: infoCards.statement.*` |
| Ledger export | `download`, "Registre complet : Njangi des Collègues", "Tableur CSV, 412 opérations", masking note | Télécharger · Partager | `copy: infoCards.ledgerExport.*` |
| Invite link | `link` icon, "Invitation pour Hervé Kamga", validity (72 h, single use, tied to the number) | Envoyer par WhatsApp (primary) · Copier le lien · Partager | `copy: infoCards.inviteLink.*`, share text `copy: invite.shareMessage` |
| PIN reset link (admin) | `key-round` icon, "Lien pour Paul Mbarga", 30-minute validity | Envoyer par WhatsApp · Copier le lien | `copy: infoCards.pinResetLink.*` |

Sharing uses React Native's `Share` API; "Envoyer par WhatsApp" opens `whatsapp://send?text=` with the prepared message and falls back to the share sheet. On the web, "Partager" uses the Web Share API when present, otherwise copy.

### 5.23 Chat elements (Groupe tab)

```
        CF  Carine Fotso                                      first message of a run: avatar 32 + name
            ┌──────────────────────────────┐
            │ On se voit samedi ?   18:02  │                   `bubbleOther`
            └──────────────────────────────┘
                        ┌─────────────────────────────┐
                        │ Oui, à 16 h chez toi.  18:04 ✓│      `bubbleOwn`, no name
                        └─────────────────────────────┘
             ✓ Paul Mbarga a payé la cotisation du tour 4. · 18:10    system event, centred
        ◌   Njangi  Assistant
            ┌──────────────────────────────┐
            │ 7 membres ont payé le tour 4… │                  agent: no fill, 1 px `divider`
            └──────────────────────────────┘
```

**Bubbles.** Radius 12 on all corners (no tails: tails would add a fourth radius). Padding 12 horizontal, 8 vertical. Max width 80% of the column (560 dp on wide screens). Text `body`; time `caption` in `textSecondary`, bottom-right inside the bubble. Messages from the same author within 5 minutes form a run: 4 dp apart, name and avatar on the first only; 12 dp between runs. Own messages carry a 14 dp status icon after the time: `clock` while queued offline, `check` once sent (there are no read receipts). A failed send shows `circle-alert` in `statusLate` and `copy: chat.message.failed` under the bubble; tapping retries.

| Element | Design | Copy |
|---|---|---|
| Text | As above. Links and @mentions in `textLink`, `bodyStrong`; tapping a mention opens the mini-profile | `copy: chat.message.a11y` |
| Image | Clipped to radius 12 inside the bubble, max 240 × 320, aspect kept. Before the full image downloads: its 320 px thumbnail (uploaded with every image, D9, a few kilobytes) fills the frame with a 24 dp `download` disc and `copy: chat.media.tapToDownload` ("Touche pour télécharger, 240 Ko"); if even the thumbnail is missing, a `surfaceTint` block with the `image` icon; downloading shows a spinner | `copy: chat.media.photoA11y` |
| Video | Same frame with a 48 dp play disc (`night` 60% with `cloud` icon) and the duration bottom-left; plays full screen in `expo-video` | `copy: chat.media.videoA11y` |
| Document | A row inside the bubble: `file-text` 24, file name (`bodyStrong`, 2 lines), "PDF, 1,2 Mo" (`secondary`), tap opens | `copy: chat.media.documentA11y` |
| Voice note | 40 dp `primary` play/pause disc with `textOnPrimary` icon; a 4 dp progress track (`outline`, played part `primary`, 12 dp thumb, draggable); elapsed or total duration (`caption`, "0:42"); a speed pill cycling 1× → 1,5× → 2× (48 dp target, `captionStrong`, 1 px `outline`) | `copy: chat.voice.*` |
| Reply quote | At the top of the bubble: a block with the opposite tint (`surfaceTint` on own bubbles, `canvas` on others), radius 12, 8 padding: author in `captionStrong` `textLink` and one line of the quoted text in `caption`. No coloured rail. Tap scrolls to the original | `copy: chat.message.replyTo` |
| Deleted | No bubble: 16 dp `ban` + `copy: chat.message.deleted` in `secondary`, in the author's lane | |
| Hidden by admin | No bubble: 16 dp `eye-off` + `copy: chat.message.hidden` | |
| System event | Not a bubble (spec 1.5): centred, max width 320, 16 dp icon (status icon for payments, `vote` for votes, `scale` for rules, `users-round` for members, `smartphone` for numbers, `file-text` for minutes) + text in `secondary`, `textSecondary`, + " · 18:10". Events that link somewhere (payment → entry, vote → proposal) end with a 16 dp chevron and are buttons | `copy: chat.system.*` |
| Agent reply in the group | Avatar = `RingMark`; name "Njangi" in `bodyStrong` `textLink` + `copy: agent.group.caption` ("Assistant") in `caption`; bubble with no fill and a 1 px `divider` border. "Je t’ai répondu en privé, Carine." is the same style; for Carine only, it ends with a text button "Ouvrir" to the Njangi tab | `copy: agent.group.privateReply` |
| Typing | A `caption` line above the composer: `copy: chat.typing` / `typingMany` (static text, no animation) | |
| Date separator | Centred `captionStrong` in `textSecondary` ("Aujourd’hui", "Hier", "lundi 2 novembre") | `copy: time.today` |
| Unread divider | A 1 px `primary` line across with `copy: chat.newMessages_other` in `captionStrong` `textLink` | |

**Composer.**

```
[📎]  ┌ Écris un message…                ┐  [🎙]      48 high, grows to 5 lines
```

- Attach (48), text field (radius 12, 1 px `outline`, `body`), and a mic button that becomes send (`send-horizontal`, `primary` disc) as soon as there is text.
- Voice: press and hold to record (`PanResponder`): the field is replaced by a recording row (a static `late` dot, the running time "0:07", `copy: chat.voice.slideToCancel`). Release sends; sliding left 80 dp cancels. Tap-to-record is the accessible alternative: one tap starts, a "Arrêter et envoyer" button stops (`copy: chat.composer.voiceTap`, `chat.voice.stopAndSend`). Recording stops at 3 minutes (`copy: chat.voice.maxReached`). AAC, low bitrate (spec 1.7).
- Typing `@` opens a member suggestion list above the composer (names only, 48 dp rows); "njangi" is first.
- Replying shows a quote strip above the composer with "Annuler la réponse".
- Attach opens a small sheet: Photo de la galerie, Prendre une photo, Vidéo, Document PDF (`copy: chat.attachMenu.*`). Images are resized to 1600 px, about 80% JPEG, before upload (spec 1.7).
- Offline: messages queue and show `clock` (spec 1.7); attachments queue too, voice notes included.

**Pinned announcement.** A 48 dp strip under the header: `pin` 16, the first line of the latest announcement, "Voir les annonces" opens a sheet with all of them (`copy: chat.pinned.*`).

### 5.24 Agent conversation elements (Njangi tab)

- **Member message:** `bubbleOwn`, right-aligned, same bubble rules as chat.
- **Agent reply:** no bubble. Plain `body` text in `textPrimary` from the left gutter across the full column, so long answers and lists read like a page. Bold and simple bullet lists are rendered; headings, tables, images and raw links are not (the agent offers chips or cards instead). A 16 dp `RingMark` in `iconActive` marks the start of each agent turn, aligned with the first line.
- **Streaming:** text appears as `agent.delta` events arrive, word groups at a time, with a static 2 × 16 dp `textSecondary` caret at the end until `agent.done`. No typewriter animation.
- **Typing indicator:** three 6 dp dots in `outline` before the first delta, opacity stepping 0.4 → 1 in turn (900 ms loop, 7.3); static under reduce motion. Accessible text `copy: agent.typing`.
- **AgentActivityLine** (spec 1.5): under the typing dots, one `secondary` line in `textSecondary` with a 14 dp spinner: what the agent is checking, from the tool being run (`copy: agent.activity.<tool>`, "Je vérifie la caisse…"). Each new tool replaces the line (no stacking); it disappears when the reply starts streaming. Announced politely, at most once every 2 seconds.
- **Cards inline:** ConfirmationCards and information cards sit in the flow at full column width, below the agent sentence that introduced them.
- **Result event:** when `pendingAction.updated` arrives, a compact centred event row like chat system events, with the status icon: "Paiement de 11 000 FCFA : réussi, réf. MP2611A9F2." (`copy: agent.results.*`). The agent only states success after this event (spec 4.5).
- **Errors:** a `secondary` row with `circle-alert` and the message (`copy: agent.errors.*`) plus "Réessayer" when retrying makes sense.
- **Private reply from the group:** the member's group message is quoted at the top of the private exchange in a reply-quote block labelled `copy: agent.privateFromGroup.label` ("Depuis le groupe").

### 5.25 Member mini-profile sheet

Opened by tapping a ring dot, a member row, an avatar or a mention (spec 1.2). Public data only, never a phone number.

```
 ‹  Carine Fotso                          ›  ✕     previous / next in rotation order (48 dp each)
    CF  Bénéficiaire de ce tour    [Admin]
 ────────────────────────────────────────────
 Ce tour            A payé, 3 nov.              ✓
 Son tour           Tour 4, samedi 7 novembre
 Fiabilité          92 % · 11 sur 12 à temps   ⓘ
 Membre depuis      octobre 2026
```

- Title row: avatar 56, name in `groupTitle`, role badge; "(toi)" for the member themself.
- Rows: this round's status with its icon (`copy: memberProfile.roundStatus.*`), their turn or "A reçu au tour 2" with a small raffia served badge, reliability (5.26), member since.
- Previous / next buttons step through the rotation order (`copy: memberProfile.previous`, `next`); they make a slightly missed tap on a dense ring a one-tap fix (6.6).
- A member who has left shows `copy: memberProfile.left` and no round status.

### 5.26 Reliability

- Shown as "92 %" (`bodyStrong`) followed by "11 sur 12 à temps" (`secondary`) (`copy: reliability.score`, `value`; R14.3).
- Under 3 due items: the "Nouveau membre" label badge instead of a score (R14.2).
- An `info` button opens the formula inline (`copy: reliability.formula.*`), with the member's own numbers as the example.
- No colour, no gauge, no ranking: the figure is a fact about payments, not a judgement of a person.

### 5.27 NdopBand

The original band from `assets/ndop-band.svg`, drawn with a react-native-svg `Pattern` (64 × 32 tile) across the full width. Heights: 32 dp on phones, 40 on wide screens, 48 on the splash (scaled tile). Colours are the brand constants (`brandGround`, `brandMotif`, `accentRaffia`), the same in both themes. Used in exactly two places (spec 1.2): the in-app splash and the top edge of the payout (withdraw) sheet, where it is clipped by the sheet's 20 radius. Decorative: hidden from screen readers.

---

## 6. The NjangiRing

The one memorable element of the app (spec 1.2): members sit as dots around a circle in rotation order, the current beneficiary at 12 o'clock. One component, `NjangiRing`, draws all three sizes with `react-native-svg`; the motions use React Native's `Animated` (D4).

### 6.1 Inputs

```ts
type RingMember = {
  membershipId: string;
  name: string;                    // for the profile sheet and the accessibility labels
  state: 'paid' | 'unpaid' | 'late' | 'pending';
  isBeneficiary: boolean;
  served: boolean;                 // already beneficiary earlier in this cycle
};
type RingProps = {
  size: 'large' | 'header' | 'thumb';
  members: RingMember[];           // in rotation order, as the server sends them
  collected: number; target: number; // integer FCFA, for the centre and the summary
  round: number; roundsTotal: number;
  onMemberPress?: (membershipId: string) => void;  // large only
};
```

The `round.updated` realtime event (spec 2.8) carries exactly this per-member state; no phone number or private field is involved.

### 6.2 Geometry

Let `n` be the number of members, `S` the box size, `c = S / 2` the centre and `R` the track radius. Members are placed by their offset from the current beneficiary in the rotation, `i = (k − b + n) mod n` (k: the member's rotation index, b: the beneficiary's), at

```
θi = −90° + i × 360° / n            (clockwise from 12 o'clock)
xi = c + R × cos θi     yi = c + R × sin θi
```

So the beneficiary is at 12 o'clock, the next beneficiary is the first dot clockwise, and the members already served sit just counter-clockwise of the top: the money visibly goes round clockwise.

| Size | Where | S | R | r max | r min | Outline / late stroke | Track | Beneficiary | Served badge |
|---|---|---|---|---|---|---|---|---|---|
| Large | Caisse › Tour (phones ≥ 360 dp) | 280 | 118 | 9 | 3.5 | 2 / 3 | 2 px | r × 1.33, 1.5 keyline | yes |
| Large, small phone | width < 360 dp | 248 | 104 | 8 | 3.5 | 2 / 3 | 2 px | same | yes |
| Large, wide | Caisse two-column (≥ 1024), Njangi side panel uses 240 | 320 | 136 | 10 | 3.5 | 2 / 3 | 2 px | same | yes |
| Header | Njangi status header | 64 | 26 | 3.5 | 1.75 | 1.25 / 1.75 | 1 px | r × 1.33, 1 keyline | no |
| Thumbnail | Group switcher rows | 40 | 15.5 | 2.5 | 1.5 | 1 / 1.5 | 1 px | r × 1.4, 0.75 keyline | no |

`R` leaves room outside the track for the largest beneficiary dot with its keyline and, on the large sizes, for the served badge (R + r + 1.5 + 2 × badge radius stays inside S / 2).

### 6.3 Dot size and density, 3 to 50 members

The distance between neighbouring dot centres is the chord `d = 2R × sin(π / n)`. Each dot's radius is

```
r = min(r max, 0.3 × d)
```

so a dot's diameter is at most 60% of the spacing and the gap between neighbours never falls below 40% of it. The beneficiary dot (r × 1.33) still leaves a gap of 30% of the spacing.

| n | Large (R 118) | Header (R 26) | Thumbnail (R 15.5) |
|---|---|---|---|
| 3 to 11 | r = 9 | r = 3.5 | r = 2.5 |
| 15 | 9 | 3.2 | 1.9 |
| 19 | 9 | 2.6 | 1.5 |
| 20 | 9 | 2.4 | segments |
| 25 | 8.9 | 1.95 | segments |
| 30 | 7.4 | segments | segments |
| 40 | 5.6 | segments | segments |
| 50 | 4.4 | segments | segments |

**When dots would get too small** (`0.3 × d < r min`: from 28 members on the header ring, from 20 on the thumbnail), the ring switches to **segment mode**: each member becomes an arc centred on its angle, spanning 70% of its share of the circle (a 30% gap), drawn on the track radius. Paid = full-width arc in `primary` (3 dp header, 2.5 thumbnail); unpaid = 1 dp arc in `outline`; late = 1.5 dp arc in `late`; pending = 1 dp arc in `pending`; beneficiary = full-width `raffia` arc over a slightly wider `raffiaKeyline` arc. No track is drawn in segment mode (the arcs are the ring). The large ring never needs segment mode (its dots stay at 4.4 dp or more up to 50 members).

### 6.4 States

| State | Large drawing | Small drawing | Also said in words |
|---|---|---|---|
| Paid | Disc, `primary` | Disc | "a payé", Payé list |
| Not yet paid | Ring, 2 dp `outline`, empty | Ring, 1 to 1.25 dp | "n’a pas encore payé", À payer list |
| Late | Ring, 3 dp `late` (heavier than unpaid, so it reads in greyscale) | Ring, heavier stroke | "en retard" |
| Pending (payment sent, operator not yet confirmed) | Ring, 2 dp `pending`, dashed in 12 dashes | Solid `pending` ring | "paiement en attente" |
| Beneficiary | Disc r × 1.33, `raffia`, 1.5 dp `raffiaKeyline` | Same, thinner keyline | "bénéficiaire du tour" |
| Already served this cycle | Badge outside the dot on its radius: `raffia` disc (radius max(3, 0.5 r)), 1 dp `raffiaKeyline`, a check in `onRaffia` | Not drawn | "a déjà reçu son tour" |
| Round fully paid | The track turns into a 3 dp `raffia` circle (the closed ring) | Track or arcs unchanged, beneficiary unchanged | "Tour complet" |

The beneficiary is always drawn as the raffia disc, whatever their own payment state; their state is in the lists and their profile. The served badge sits on top of whatever state the member has this round (served members still pay every round, R3.1).

**Track:** a full circle at R, `divider`, 2 dp (1 dp on small sizes), under the dots.

**Dark mode:** the same drawing with the dark aliases: periwinkle `primary` discs, `#8B8FA5` outlines, `#F08A7E` late rings, a `#313A66` track, and raffia marks whose keyline takes the raffia value (2.5 rule 1). Verified in 2.6.

**Bidding mode, before the bids close:** there is no beneficiary yet. Served members are placed counter-clockwise from the top in the order they were served, the others clockwise in alphabetical order, and 12 o'clock holds an empty 1.5 dp `raffiaKeyline` ring (the seat still to be won). When bidding closes, the winner moves to the top.

### 6.5 Centre (large only)

- Line 1: the amount collected for the round, `AmountText` size `display` (`amountDisplay` figure, "FCFA" at 19). Line 2: `copy: ring.center.of` ("sur 100 000", `formatAmount` without currency) in `secondary`.
- The text must fit inside `2 × (R − r max − 12)` (194 dp on the 280 ring). If the figure is wider at 32, it steps down to 24, then 19 (for example "50 000 000 FCFA" in a 50-member group).
- Fully paid: line 2 becomes `copy: ring.center.complete` ("Tour complet") in `secondaryStrong`. Before the first cycle: `copy: ring.center.notStarted`.
- At a font scale of 1.3 or more, both lines leave the ring and sit centred directly below it, where they scale freely (3.3). The header and thumbnail rings never carry text; the text beside them does.

### 6.6 Touch, keyboard and screen readers

- **Large ring, up to 15 members:** each dot owns the angular sector around it between radii R − 28 and R + 28, which is at least 48 dp wide along the track (49 dp at n = 15). A tap opens that member's mini-profile (5.25).
- **Large ring, 16 to 50 members:** the same sector logic picks the nearest dot to the touch. Because sectors are then narrower than 48 dp, the profile sheet has previous and next buttons in rotation order, so a slightly missed tap is corrected with one tap. The paid and unpaid lists below the ring remain the full-size, accessible path to every member.
- Pressed dot: a 2 dp `focusRing` circle at r + 4 while the finger is down.
- **Header ring:** the whole status header is one button that opens Caisse › Tour. **Thumbnail:** decorative inside its row.
- **Screen readers (Android):** the ring is one element (role `image`) with a summary built from `copy: ring.a11y.summary` + `paidCount` + `unpaidCount` + `lateCount` (or `complete`), for example: "Tour 4 sur 10. Bénéficiaire : Carine Fotso. soixante-dix mille francs CFA collectés sur cent mille francs CFA. 7 membres ont payé. 3 n’ont pas encore payé. Dont 1 en retard." Hint `copy: ring.a11y.hint`; double-tap moves focus to the "Payé" section. Individual dots are not separate screen-reader stops (the lists below are).
- **Web keyboard:** the ring is one tab stop (`role="group"`, summary as its label). Arrow keys move a visible focus ring from dot to dot in rotation order (roving focus), announcing `copy: ring.a11y.dot` ("Paul Mbarga, a payé"); Enter opens the profile; Home jumps to the beneficiary. Hint `copy: ring.a11y.keyboardHint`.
- Live changes: when a contribution lands while the ring is on screen, the summary updates and `copy: ring.a11y.contributionLanded` is announced only for the member's own payment and for the round completing (`roundCompleted`), so a 50-member group does not chatter.

### 6.7 The two motions

Both are built with `Animated`; neither uses Reanimated (D4).

**1. A contribution lands (spec 1.2).** Triggered by `round.updated` when a member's state becomes `paid` while the ring is visible.

| Time (ms) | What happens | Driver |
|---|---|---|
| 0 | The SVG dot is committed to its paid state (filled). An `Animated.View` disc of the same size and colour, absolutely positioned over the dot, starts the pulse. | — |
| 0 to 200 | Disc scale 1 → 1.4, `Easing.out(Easing.cubic)` | native (`transform`) |
| 200 to 600 | Disc scale 1.4 → 1, `Easing.inOut(Easing.cubic)` | native |
| 0 to 600 | Halo: an `Animated.View` ring (2 dp `primary` border) scale 1 → 2.6, opacity 0.5 → 0, `Easing.out(Easing.quad)` | native (`transform`, `opacity`) |
| 600 | Overlays removed; only the SVG dot remains | — |

A single pulse, 600 ms in total. If several contributions land together, pulses start 120 ms apart, at most three; the rest fill without motion. Nothing animates when the ring is off screen or the app is in the background.

**2. The round is fully paid: the raffia sweep (spec 1.2).** Triggered when `collected` reaches `target` (all contributions of the round received).

| Time (ms) | What happens | Driver |
|---|---|---|
| after the last pulse ends (or 0) | An SVG `Circle` on the track, `stroke = raffia`, width 3, `strokeDasharray = 2πR`, rotated −90° so it starts at 12 o'clock and runs clockwise | — |
| 0 to 1 200 | `strokeDashoffset` 2πR → 0, `Easing.inOut(Easing.cubic)`, via `Animated.createAnimatedComponent(Circle)` | JS (`useNativeDriver: false`; SVG props cannot use the native driver; one property for 1.2 s is cheap even on entry-level phones) |
| 1 200 to 1 400 | Centre line 2 cross-fades from "sur 100 000" to "Tour complet" | native (`opacity`) |
| after | The track stays raffia for the rest of the round (the closed ring) | — |

**Reduce motion** (`AccessibilityInfo.isReduceMotionEnabled()` and its change listener on Android; `prefers-reduced-motion` on the web): no scale, no halo, no sweep. The dot fills and the track turns raffia at once; the text changes at once; announcements are unchanged.

---

## 7. Motion

### 7.1 Rules

Motion is kept for two moments only (spec 1.2): a contribution landing and the round closing (6.7). Everything else is direct feedback to the member's own action, short and functional, and never decorative. All of it is achievable with React Native's `Animated` API (plus `react-native-svg` for the sweep), using the native driver wherever the property allows (`transform`, `opacity`).

### 7.2 Tokens

| Token | Value | Use |
|---|---|---|
| `duration.press` | 0 in, 120 out | Pressed layer appears instantly, fades out on release |
| `duration.crossFade` | 160 | Card state changes, centre text, banner text swaps |
| `duration.sheetIn` / `sheetOut` | 240 / 200 | Bottom sheet |
| `duration.dialogIn` / `dialogOut` | 160 / 120 | Dialogs on wide screens |
| `duration.pulse` | 600 | Contribution landing |
| `duration.sweep` | 1 200 | Round complete |
| `easing.out` | `Easing.out(Easing.cubic)` | Things arriving |
| `easing.in` | `Easing.in(Easing.cubic)` | Things leaving |
| `easing.inOut` | `Easing.inOut(Easing.cubic)` | Things transforming in place |

### 7.3 Direct feedback

| Interaction | Motion | Reduce motion |
|---|---|---|
| Press on any pressable | State layer at 100% instantly on press-in, opacity → 0 in 120 ms on release (native) | Same (opacity, not movement) |
| Bottom sheet opens | `translateY` from its height to 0 in 240 ms `easing.out`; scrim opacity 0 → 1 in 240 ms (native) | Opacity 0 → 1 in 120 ms, no movement |
| Bottom sheet closes | `translateY` to its height in 200 ms `easing.in`; scrim fades (native) | Opacity to 0 in 120 ms |
| Sheet drag | Follows the finger (`PanResponder`), springs back with `Animated.spring` (friction 9, tension 80) if not dismissed | Snaps back without spring |
| Dialog (wide screens) | Opacity 0 → 1 and scale 0.98 → 1 in 160 ms | Opacity only |
| ConfirmationCard state change | The changing block cross-fades 80 ms out, 80 ms in; the card's height changes without animation | Instant swap |
| Agent typing dots | Each dot steps opacity 0.4 → 1 → 0.4, 300 ms apart, 900 ms loop, only while waiting for the first word | Static dots |
| Tabs, segments, chips selection | No motion: the selection changes in place | — |
| Screen push (stack) | Platform default of Expo Router on Android; none on the web | System setting applies |
| Pull to refresh | Platform `RefreshControl` | Platform |

Nothing loops except the typing dots and system spinners, and nothing moves on its own when the member is not doing anything, apart from the two signature moments.

---

## 8. Responsive and web

Decision D1: one codebase, same components, "perfect on both". At phone widths the web app is identical to Android. On wider windows the layout adapts; components do not change, only where they sit and how wide they get.

### 8.1 Breakpoints

Measured on the window width in dp (CSS px on the web), read with `useWindowDimensions` through a `useBreakpoint()` hook.

| Name | Width | Navigation | Content | Sheets |
|---|---|---|---|---|
| `compact` | < 600 | Bottom tab bar (5.9) | One column, 16 gutters | Bottom sheets, full width |
| `medium` | 600 to 1023 | Navigation rail on the left, 80 wide: icon over label, same active pill | One column centred, max 640 (forms 480), 24 gutters | Bottom sheets, max 560 wide, centred horizontally |
| `expanded` | 1024 to 1279 | Sidebar 256 wide: brand row (RingMark + "NjangiTrust"), the five destinations as 48 dp rows (icon + label, active = `selectedTint` pill), member name and "Moi" at the bottom | Two-column layouts where they help (8.3), 32 gutters, max 1120 | Centred dialogs (8.4) |
| `large` | ≥ 1280 | Same sidebar | Adds side panels to Njangi and Groupe (8.3), max 1200 | Centred dialogs |

The header (group switcher and bell, 5.8) stays at the top of the content area at every width: it is the same component in the same place, so members never relearn where the group is.

### 8.2 What changes per screen

| Screen | compact | medium | expanded | large |
|---|---|---|---|---|
| Njangi | Status header, conversation, chips, composer | Same, centred, max 640 | Conversation column max 720, status header above it | Conversation (flex, max 720) + right panel 360: "Ce tour" with the large ring at 240, status lines, "À faire" chips as a vertical list (`copy: agent.panel.*`). The 64 px header ring is hidden while the panel shows it |
| Groupe | Chat, composer | Centred, max 640 | Chat column max 720 | Chat + right panel 320: pinned announcements, next meeting, members |
| Caisse › Tour | Ring, beneficiary, lists, check strip | Ring 280 centred, lists below | Two columns: ring 320 + beneficiary + breakdown link + check strip (left, sticky, 400 wide) / Payé and À payer lists (right) | Same |
| Caisse › Registre | List; entry detail is a pushed screen | Same | Master-detail: filters and list (left) / entry detail (right, 440, empty state "Choisis une opération") | Same |
| Votes | List; proposal detail is a pushed screen | Same | Master-detail: proposals (left) / detail with votes (right, 440) | Same |
| Moi | One column of grouped lists | Same, max 640 | Two columns: situation and money (left) / settings (right) | Same |
| Settings, forms, onboarding | One column | Centred, max 480 | Centred, max 480 | Same |

### 8.3 Content widths

- Reading text never exceeds 720 dp (about 75 characters of `body`).
- Forms and sign-up never exceed 480.
- Bubbles never exceed 560; the ConfirmationCard never exceeds 440.
- Side panels and detail panes scroll independently of the main column; the sidebar and header never scroll.

### 8.4 Sheets on wide screens

- `BottomSheet` renders as a centred dialog at `expanded` and up: radius 20 on all corners, max width 480 (withdraw sheet 520, PIN sheet 400, date picker 400), max height 85% of the window, the same title row, content and sticky footer, over the same `scrim`.
- The withdraw sheet keeps the Ndop band along its top edge in dialog form.
- The group switcher opens as a popover anchored under the switcher (width 360, radius 20, same raised surface) instead of a dialog.
- Escape closes; clicking the scrim closes, except while a PIN is being checked or a card is processing.

### 8.5 Pointer, hover, focus and scroll (web)

- **Hover** (only when `(hover: hover)`): `hoverLayer` on rows, chips and secondary buttons; an 8% layer of the label colour on filled buttons. Cursor `pointer` on everything pressable, `text` on fields, `not-allowed` on disabled controls.
- **Focus-visible:** a 2 px `focusRing` with a 2 px gap that follows the component's radius, shown only for keyboard focus (`:focus-visible`), never after a mouse click. Every interactive element is reachable with Tab in visual order: sidebar, header, content, side panel, composer.
- **Keys:** Enter and Space activate; Escape closes sheets and dialogs; arrow keys move within segmented controls, the ring, filter chip rows and date grids (roving focus, one tab stop each). In composers, Enter sends and Shift+Enter adds a line (on Android, Enter adds a line and the send button sends).
- **Scroll:** the content pane and side panes scroll separately with thin scrollbars (8 px, `outline` thumb, transparent track); chats are anchored to the bottom and load older messages on scrolling up; dialogs use `overscroll-behavior: contain`. No scroll-jacking, no smooth-scroll overrides.
- **Selection:** messages, references and fingerprints are selectable; buttons and labels are not.
- **Document title:** "NjangiTrust · Caisse" (destination, then app name) for browser tabs and history.

### 8.6 PIN pad with a physical keyboard

The on-screen pad stays visible and is the same component. A focused, visually hidden input (`type="password"`, `inputmode="numeric"`, `autocomplete="off"`) receives typing: digits 0 to 9 (top row and numpad) fill the dots and flash the matching key's pressed state for 120 ms; Backspace deletes; Escape cancels the sheet; a pasted 6-digit PIN is accepted; anything else is ignored. The sixth digit submits, as on the phone. `copy: pinSheet.keyboardHint` appears under the pad when a physical keyboard is detected (first key event).

### 8.7 Phone-only features on the web

Push notifications, biometric unlock and screenshot blocking do not exist on the web (D1). Their settings rows are not shown at all (not shown disabled). Notifications still arrive in the app, and the settings say so (`copy: notifications.settings.webNote`).

---

## 9. Accessibility

Targets: WCAG 2.2 AA, plus spec 1.7 (48 dp targets, text to 200%, amounts read as words), tested with TalkBack on an entry-level Android phone and with NVDA or VoiceOver on the web.

### 9.1 Roles and labels

- Every interactive element has a role (`button`, `link`, `tab`, `switch`, `checkbox`, `radio`, `adjustable`, `header` for section titles) and a label from the copy files. Icon-only buttons always have a label ("Fermer", "Notifications, 3 non lues").
- Rows, cards and chat messages are single accessible elements whose label reads in visual order (5.3, 5.21, `copy: chat.message.a11y`), so TalkBack does not stop on each fragment.
- Decorative elements are hidden: avatars, the Ndop band, divider lines, skeleton bars, icons next to text that says the same thing.
- State is exposed, not only drawn: `selected`, `checked`, `disabled`, `busy`, `expanded`.

### 9.2 Focus order and announcements

- Focus order follows the visual order: header, banners, content, composer, tab bar.
- Opening a sheet moves focus to its title; closing it returns focus to the control that opened it. On the web, focus is trapped inside dialogs.
- Live updates use polite announcements (agent activity line, card state changes, a contribution landing for the member's own payment, connection lost and back via `copy: a11y.offlineNow` / `connectionBack`). Errors that block the member (wrong PIN, failed payment) are assertive.
- A streaming agent reply is announced once, complete, when `agent.done` arrives, not word by word.

### 9.3 Amounts, numbers and dates read aloud

- **Amounts:** every amount's accessibility label comes from `amountToWords(amount, lang)` in `packages/shared` (already implemented and tested): French traditional spelling ("onze mille francs CFA", "quatre-vingt mille francs CFA", "un million de francs CFA"), English ("eleven thousand CFA francs"). Signed amounts get "plus" / "moins" ("plus" / "minus"). An amount inside a sentence is replaced by its words in that sentence's label.
- **Phone numbers** are read digit by digit in their groups (`copy: a11y.ownNumber`); masked numbers as "se terminant par 7 8 9" (`copy: a11y.maskedNumber`).
- **References and fingerprints** are read character by character only on request (the label gives "Référence" and the first 4 characters; the full value is selectable and copyable).
- **Dates and times** are spoken in full ("samedi 7 novembre à 18 heures"), never "07/11 18:00".

### 9.4 Text size, contrast, motion

- Text scales to 200% (3.3); the listed caps are the only exceptions.
- Contrast: 4.5:1 for all text, 3:1 for meaningful marks, in both themes, verified by the script (2.6).
- Reduce motion: honoured for the two signature motions, sheets, dialogs and typing dots (7.3).

### 9.5 Colour is never the only signal

| Meaning | Colour | Also shown by |
|---|---|---|
| Paid | `paid` icon, `primary` dot | "a payé", check icon, filled shape, Payé list |
| Late | `late` | "en retard", heavier ring, alert icon |
| Pending | `pending` | "en attente", dashed ring, clock icon |
| Beneficiary | `raffia` | 12 o'clock position, larger dot, "Bénéficiaire" text |
| Already served | `raffia` badge | check inside the badge, "A reçu au tour 2" |
| Selected segment, filter, tab | `primary` / tint | bold label, check icon on filter chips, `selected` state |
| Error field | `late` border | error text with icon |
| Daily check alert | `dangerTint` | shield-alert icon and the words "écart détecté" |

### 9.6 Other

- Touch targets 48 dp minimum (4.7). No action depends on a gesture alone: dragging a sheet has a close button; hold-to-record has tap-to-record; swipes are never required.
- Time limits: unconfirmed cards expire after 10 minutes (a security rule); the remaining time is shown in the last 2 minutes and "Préparer à nouveau" restores the card in one tap.
- Language: the root view's language is set (`lang="fr"` / `"en"` on the web), so screen readers use the right voice.

---

## 10. Low data and offline

Members use entry-level Android phones on patchy, metered data. The app is designed to be cheap to run and honest when offline.

### 10.1 Data

- **Fonts and icons are bundled**; nothing visual is fetched at runtime except chat media.
- **Media downloads automatically only on Wi-Fi** by default (spec 1.7; setting `copy: notifications.settings.mediaWifi`). On mobile data, images, videos and documents show a placeholder of the right shape with the file size and download on tap (`copy: chat.media.tapToDownload`). Voice notes are small and always download.
- Image placeholders show the 320 px thumbnail the sender's phone uploads with every image (D9), so a member on mobile data sees what the photo is for a few kilobytes and downloads the full image on tap. Without a thumbnail (older messages, failed upload) the placeholder is a `surfaceTint` block with an icon. Connection type comes from `expo-network` (D4).
- Uploads are compressed on the phone first (images 1600 px, about 80% JPEG; voice in AAC at a low bitrate).
- Lists are virtualised (FlashList) and paginated (Registre 50 entries per page, chat by `before=` cursor).
- The agent's launch briefing is built by the app from `GET /me/overview` and the copy templates (`copy: agent.greeting.*`); opening the app never costs an AI call.

### 10.2 Offline

- The last known data survives an offline restart on phones: the TanStack Query cache is persisted with `@react-native-async-storage/async-storage` and `@tanstack/query-async-storage-persister` (D4). It is never persisted on the web, never holds tokens or PINs, and is wiped at log-out. On the web an offline reload shows `copy: offline.bannerNever` until the connection returns.
- The last known state stays on screen with the offline banner `copy: offline.banner` ("Hors ligne, mis à jour à 14:32") under the header on every tab.
- Money and vote buttons read "Connexion requise" (spec 1.7) and are disabled; the ConfirmationCard keeps its lines so the member can still read what was prepared.
- Chat messages, including voice notes and attachments, are queued with a `clock` status and sent in order when the connection returns (spec 1.7).
- The agent composer is disabled offline with `copy: offline.agentComposer` as its placeholder: an agent conversation needs the server, and a queued request could act on stale figures.
- Reconnection: the banner disappears, `copy: a11y.connectionBack` is announced, queries refresh, the socket rejoins its rooms. Nothing pops up.

---

## 11. Brand assets

All assets are original SVGs in `assets/`, built only from palette values. No raster, no fonts embedded (the wordmark in the splash previews is set live by the app).

| File | What it is | How it is used |
|---|---|---|
| `ndop-band.svg` | One seamless 64 × 32 tile of the band: sawtooth edges (a nod to Ndop's borders), paired panel rules, a lozenge with a seed, and a ring of eight seeds whose top seed is raffia (the beneficiary at 12 o'clock). Remove the `accent` circle for the plain indigo-and-white version | The NdopBand component (5.27) tiles it with a `Pattern` |
| `ndop-band-strip.svg` | The tile repeated across 360 px | Preview only |
| `ring-mark.svg` | The 24 px RingMark glyph on lucide's grid: seven small seeds and the open beneficiary ring at the top | Njangi tab icon, agent avatar, sidebar brand row, favicon source |
| `app-icon.svg` | 1024 × 1024: ten cloud seeds on a faint track, the raffia beneficiary on top, on indigo | Store listing, web favicon and PWA icons |
| `app-icon-foreground.svg` | Android adaptive icon foreground (108 dp at 4×, motif inside the 66 dp safe circle); background colour `#1E2A5A` | `app.json` › `android.adaptiveIcon` |
| `app-icon-monochrome.svg` | Android 13+ themed icon; the beneficiary is an open ring so it reads without colour | `android.adaptiveIcon.monochromeImage` |
| `splash-icon.svg` | The ring alone, transparent | System splash (`expo-splash-screen`); background `#1E2A5A` light, `#141B3D` dark |
| `splash.svg`, `splash-dark.svg` | The in-app splash composition: ring, wordmark, the band across the lower part | Reference for the in-app splash screen |

**Splash sequence.** Android's system splash can only show a centred icon on a colour, so the experience has two steps: the system splash (`splash-icon.svg` on indigo) while the JavaScript loads, then the in-app splash (ring, "NjangiTrust" in Bricolage 700, the Ndop band), shown only for as long as fonts, tokens and the session take to load (no minimum duration), then the Njangi tab. The in-app splash is a screen drawn with tokens, so it is identical on the web.

**Wordmark.** "NjangiTrust" set in Bricolage Grotesque 700, `textPrimary`, never in capitals, never with effects. The lockup is the RingMark followed by the wordmark, 8 dp apart, the mark at the cap height.

---

## 12. Writing

### 12.1 Voice

- Plain, warm, serious. Short sentences, active voice, the verb first on buttons (spec 1.6). French uses "tu" everywhere, English uses "you".
- Sentence case in both languages, including titles and buttons.
- Errors say what happened and what to do, never apologise: "Paiement refusé par MTN. Vérifie ton solde, puis réessaie."
- No technical words: "Registre", not "ledger"; "Empreinte", not "hash"; "Caisse", not "account"; "Écritures" for postings in the entry detail.
- The vocabulary of spec 1.6 is used exactly: cotisation / contribution, tour / round, bénéficiaire / beneficiary, caisse générale / general fund, caisse de secours / solidarity fund, amende / fine, prêt / loan, enchère / bid, registre / records, relevé / statement, procès-verbal / minutes, numéro de paiement / payment number.

### 12.2 Copy files

- `packages/shared/src/i18n/ui.fr.ts` (`uiFr`, `as const`) is the source; `ui.en.ts` (`uiEn: UiCopyShape`) must have exactly the same keys, which `ui.types.ts` enforces at type-check time. 1 644 strings each.
- Keys are grouped in this order, each group under a comment: foundations (`common`, `time`, `a11y`, `errors`, `offline`, `emptyStates`); app shell (`nav`, `groupSwitcher`, `notifications`); access (`splash`, `welcome`, `signup`, `login`, `pinReset`, `appLock`); group setup (`createGroup`, `rules`, `invite`, `startCycle`); Njangi tab (`agent`, `notificationPrefill`); confirmation (`confirmation`, `pinSheet`, `infoCards`); Groupe tab (`chat`); Caisse tab (`caisse`, `ring`, `memberProfile`, `reliability`, `members`, `withdraw`, `solidarityRequest`); Votes (`votes`, `newProposal`); `loans`, `bidding`, `meetings`; Moi and settings (`moi`, `paymentNumber`, `statements`, `groupSettings`, `privacy`, `agentHistory`, `language`, `security`, `session`).
- Variables use i18next interpolation: `{{name}}`, `{{amount}}` (already formatted with `formatXAF`), `{{date}}` and `{{time}}` (already formatted for Douala), `{{count}}` for plurals, `{{operator}}`, `{{number}}` (already masked). Copy never formats an amount, a date or a number itself.
- Plurals use `_one` / `_other`. In French, 0 and 1 take `_one`, which is correct French ("0 membre a payé"); where a zero reads better as its own sentence, it has its own key (`caisse.tour.nobodyPaid`: "Personne n’a encore payé ce tour.").
- Enum-shaped keys use the server's enum values (`votes.types.RULE_CHANGE`, `caisse.ledger.types.PAYMENT_RECEIVED`, `notifications.categories.SECURITY`), so mapping is direct.
- Keys for the agent's tools use the tool names (`agent.activity.get_funds`, `agentHistory.tools.pay`).
- Set i18next's `interpolation.escapeValue` to `false` (React Native escapes nothing; the values never contain markup).

### 12.3 French details

- Typography as 3.4: no-break spaces before `: ; ? !` and inside « », typographic apostrophes, "1,5×".
- **Names never break a sentence.** French elision ("de Ivo" → "d’Ivo") and gender agreement ("servi" / "servie") would make templates wrong for some members. So templates never put "de" before `{{name}}` and never follow it with an agreeing adjective: "Paul a réinitialisé son code PIN" rather than "Le PIN de Paul a été réinitialisé", "A déjà reçu son tour" rather than "Déjà servi", "Présence" and "Absence excusée" rather than "Présent·e". The same applies to the reader: "Cette proposition te concerne" rather than "Tu es concerné".
- Server-written texts (ledger descriptions, notifications) follow the same rules; they live in `packages/shared/src/i18n/server/` (owned by the engineers).

---

## 13. Implementation notes for Phase B

### 13.1 Where things go (docs/TEAM.md)

| Path | Contents |
|---|---|
| `apps/mobile/src/theme/` | `palette.ts` (the nine tokens, light and dark, values identical to `tools/check-contrast.mjs`), `aliases.ts` (2.2, as `rgba` strings built from the palette), `typography.ts` (3.2), `spacing.ts`, `radii.ts`, `elevation.ts`, `motion.ts` (7.2), `breakpoints.ts` (8.1), `ThemeProvider.tsx` and `useTheme`, `useBreakpoint`, `useReduceMotion`, and a contrast test that recomputes every pair of 2.6 from these files so the theme and this document cannot drift |
| `apps/mobile/src/ui/` | One component per file (`AmountText.tsx`, `NjangiRing.tsx`, `ConfirmationCard.tsx`, `BottomSheet.tsx`, `PinPad.tsx`, ...) |
| `apps/mobile/src/screens/` | One folder per screen of SCREENS.md |
| `apps/mobile/app/` | Thin Expo Router routes, plus a dev-only `/dev/gallery` route showing every component in every state, both themes, both languages |
| `apps/mobile/assets/` | `fonts/` (four static TTF files, 3.1), `brand/` (icon and splash PNGs exported from `docs/design/assets/`) |

### 13.2 What I need in the app skeleton before building

1. **Root layout** (lead): `SafeAreaProvider`, the TanStack Query client, i18next initialised with `uiFr` / `uiEn` (`escapeValue: false`, language from `expo-localization` then the member's setting), font loading with `expo-splash-screen` held until fonts and the session are ready, and a slot where I mount `ThemeProvider`.
2. **Routes:** groups `(auth)` (welcome, sign-up, login, invitation, PIN reset) and `(app)` with a `(tabs)` layout I own, so the shell can switch between tab bar, rail and sidebar (8.1).
3. **app.json:** `userInterfaceStyle: "automatic"`, `android.softwareKeyboardLayoutMode: "resize"`, adaptive icon and splash pointing at `assets/brand/`, web output configured for Expo Router, `scheme` for invite and reset deep links.
4. **Data contracts** (engineers, `packages/shared/src/contracts`):
   - **PendingAction preview as structure, not text:** `{ type, level, status, expiresAt, lines: [{ kind, amount?, params }], total?, notes: [{ kind, params }], failureCode?, resultRef? }`, where `type`, `kind` and `failureCode` are the keys of `copy: confirmation.actions`, `confirmation.lines`, `confirmation.notes` and `confirmation.failed`. The app renders the words; the server owns the figures (spec 4.5).
   - **Round DTO with ring states** in rotation order (6.1) and `collected` / `target`.
   - **Overview DTO** with what the Njangi status header and chips need: my obligation for the round (amount, due date, status, pending operator), beneficiary name and payout time, whether I am the beneficiary, available / locked / hold-until, open votes I have not voted on, unread count, admin queues (loans to decide, PIN resets), latest reconciliation status.
   - **An agent activity event** (for example `agent.activity` with the tool name) alongside `agent.delta` and `agent.done`, to drive the AgentActivityLine (spec 1.5). Spec 2.8 lists only `delta` and `done`.
   - **Error codes** that match `copy: confirmation.failed.*` and the field errors.
   - **Notification deep links** as typed routes plus an optional agent prefill key from `copy: notificationPrefill`.
5. **Fonts:** the four static TTF files and their OFL licence in `apps/mobile/assets/fonts/` (D9).
6. **Icon and splash PNGs:** exported once from `docs/design/assets/` by the lead into `apps/mobile/assets/brand/` (D9).
7. **Offline packages** (D4): `expo-network`, `@react-native-async-storage/async-storage`, `@tanstack/query-async-storage-persister`, with the persister enabled on phones only and cleared at log-out.

---

## 14. Design decisions

Choices made where the spec is silent or ambiguous, each taken in the direction of spec 1.2 (calm, serious, trustworthy; warmth from names and money moments). For review with the owner.

| # | Decision | Why |
|---|---|---|
| DD-1 | `cloud` and `night` keep one value in both themes; the theme swaps which is the canvas. The seven other tokens get dark values (2.1). | They are the spec's two backgrounds, the poles of the palette. |
| DD-2 | Dark values: `indigo #AEBBF0`, `indigoInk #E8EBF6`, `line #313A66`, `paid #5DBB87`, `late #F08A7E`, `pending #C98A2E`; `raffia` unchanged. | Same hue families, lifted only as far as contrast on `night` requires. |
| DD-3 | Secondary text is `indigoInk` at 72%; no third text level. | No new hue; anything lighter would fail 4.5:1. |
| DD-4 | Raffia marks wear a 1.5 px indigo keyline in light mode; in dark mode the keyline is raffia. | Raffia is 2.08:1 on `cloud`; the keyline carries the 3:1 edge. |
| DD-5 | No green text and no coloured amounts. Success = green icon + ink words; direction = sign. | `paid` is 4.67:1, too thin on tinted rows; colour on money reads as judgement. |
| DD-6 | Disabled labels keep 4.5:1 contrast. | "Connexion requise" carries information. |
| DD-7 | No toasts; feedback in place (5.14). | Spec 1.2 allows two raised surfaces; toasts vanish before slow readers finish. |
| DD-8 | Bricolage is used for standalone amounts, screen titles, the group switcher label, sheet titles and the ring centre; "FCFA" one step smaller than its figure. | Keeps the figures dominant while staying inside spec 1.2's roles. |
| DD-9 | ProposalCard, information cards and grouped lists are bordered, not raised. | Only the ConfirmationCard and sheets float (spec 1.2). |
| DD-10 | Text scales to 200% everywhere except tab and rail labels (1.5×), the PIN pad digits (1.3×) and the ring centre, which moves below the ring at 1.3×. | Keeps navigation and the ring usable at large text without hiding information. |
| DD-11 | Ring: late = heavier ring (3 dp), pending = dashed `pending` ring (a sixth visual state), served = raffia badge with a check, segment mode for small rings with many members, nearest-dot tapping with previous / next in the profile for 16+ members. | Colour is never alone; the ring stays legible from 3 to 50 members. |
| DD-12 | The beneficiary dot is always raffia, whatever their own payment state. | The spec's beneficiary state; their payment is in the lists. |
| DD-13 | The agent writes without a bubble in the Njangi tab; in the group it has an outlined bubble, the RingMark avatar and "Njangi · Assistant". | Long answers read like a page; in the group it is quiet but unmistakable. |
| DD-14 | The Njangi tab's launch briefing is built by the app from the overview data and copy templates, not by the AI. | Free, instant, works on bad data, and can never misstate an amount. |
| DD-15 | Context chips send their text as a visible message. | The conversation stays an honest record of what the member asked. The server may route known chips straight to a tool. |
| DD-16 | The agent composer is disabled offline (chat messages still queue). | An agent request queued for later could act on stale figures. |
| DD-17 | Cancelled and expired cards collapse to one line in the history; retry always creates a new PendingAction. | Keeps the conversation clean; never re-confirms an old card. |
| DD-18 | RingMark, a custom glyph on lucide's grid, is the Njangi tab icon and the agent's avatar. | Lucide has no circle-of-people icon; the agent is named after the njangi. |
| DD-19 | French copy avoids "de {{name}}" and adjectives agreeing with a name or with the reader; "Paul a réinitialisé son code PIN" replaces "Le PIN de Paul a été réinitialisé". | Elision and gender would break templates for some members. |
| DD-20 | System splash shows the icon only; the in-app splash shows the ring, wordmark and band, for no longer than loading takes. | Android 12+ splash API can only show an icon. |
| DD-21 | Skeletons are static and appear after 300 ms; cached data always shows first. | No shimmer motion, no flashes on fast loads. |
| DD-22 | Radio and check controls are circles; reply quotes are tinted blocks without a coloured rail; bubbles have no tails. | Keeps the three-radius system and the calm, flat look. |
| DD-23 | Voice notes show a progress track, not a waveform. | Attachments store a duration, not amplitude data (spec 2.4). |
| DD-24 | Ledger rows show the cash movement at the operator: signed for cash entries, unsigned and secondary for non-cash entries, nothing for decisions. | "Every franc traceable" from the group's point of view. |
| DD-25 | Date and time pickers are built in-house as sheets. | No picker library is approved (D4). |
| DD-26 | Reliability has no colour, gauge or ranking. | It is a fact about payments, not a judgement of a person. |
| DD-27 | The group switcher stays in the content header at every width; the wide sidebar holds navigation and brand. | One place for the group on every device. |
| DD-28 | In bidding mode, 12 o'clock holds an empty raffia ring until the bids close. | Shows that the seat is still to be won without inventing a beneficiary. |
| DD-29 | A member's PIN reset can be confirmed by the admin of any of their groups; one confirmation is enough. When the person is the admin, two other active members of the group must each confirm (D8). | A member may have several admins; nobody can reset the admin alone. |
| DD-30 | Cards in the conversation take focus only if the member is not typing. | Prevents TalkBack from jumping away mid-message. |

---

## 15. Owner decisions on the design questions

All the questions this document raised were answered by the owner on 2026-11-02 and recorded in `docs/DECISIONS.md`.

| # | Question | Decision |
|---|---|---|
| Q-1 | Who confirms the admin's own PIN reset? | Two other active members of the group each confirm in the app; neither can do it alone (D8). Copy: `copy: pinReset.members.*`; flow in SCREENS S-05. |
| Q-2 | Connection type and a persisted cache for offline | Approved: `expo-network`, `@react-native-async-storage/async-storage`, `@tanstack/query-async-storage-persister`; cache persisted on phones only, never on the web, wiped at log-out (D4). See 10.1 and 10.2. |
| Q-3 | Fonts | The four static TTF files are committed with their OFL licence; no font package (D9). |
| Q-4 | Icon and splash PNGs | Exported once from the SVGs by the lead into `apps/mobile/assets/brand/` (D9). |
| Q-5 | Privacy notice text | Supplied by the owner, FR and EN, versioned, before Phase 9 (D9). |
| Q-6 | Statement verification address | `PUBLIC_BASE_URL` + `/verify`, shown without "https://" (D9). |
| Q-7 | Show the WARNING daily-check state? | Yes, calmly, with its explanation (D9; 5.13). |
| Q-8 | 320 px thumbnails for chat images | Yes: the phone uploads one with every image (D9; 5.23, 10.1). |

# NjangiTrust screens and flows

Every screen and flow of the app: purpose, how members get there, layout on a phone and on a wide web window, every state, interactions and the copy keys. It builds on spec 1.3, 1.4 and Part 4, and on [DESIGN_SYSTEM.md](DESIGN_SYSTEM.md) for components (cited as "DS 5.21"). Copy keys refer to `packages/shared/src/i18n/ui.fr.ts` / `ui.en.ts` and are written `copy: key.path`. Demo data is spec 5.5: Njangi des Collègues, round 4 of 10, Carine Fotso beneficiary.

## Contents

1. [Conventions](#1-conventions)
2. [Navigation map](#2-navigation-map)
3. [States that apply everywhere](#3-states-that-apply-everywhere)
4. [Access](#4-access): S-01 Splash · S-02 Welcome · S-03 Sign-up · S-04 Login · S-05 Forgot PIN · S-06 App lock
5. [Group setup](#5-group-setup): S-07 Create a group · S-08 Founding members and first cycle · S-09 Invitation
6. [Njangi tab](#6-njangi-tab): S-10
7. [Groupe tab](#7-groupe-tab): S-11
8. [Caisse tab](#8-caisse-tab): S-12 Tour · S-13 Registre · S-14 Entry detail · S-15 Caisse générale · S-16 Secours · S-17 Daily check
9. [Votes](#9-votes): S-18 Votes tab · S-19 Proposal detail · S-20 New proposal
10. [Loans, bidding, meetings](#10-loans-bidding-meetings): S-21 Loans · S-22 Loan queue · S-23 Bidding · S-24 Meetings · S-25 Minutes
11. [Sheets](#11-sheets): S-26 Group switcher · S-27 Withdraw · S-28 Members and mini-profile
12. [Moi and settings](#12-moi-and-settings): S-29 Moi · S-30 Payment number · S-31 Statements · S-32 Group settings · S-33 Notifications · S-34 Notification settings · S-35 Privacy · S-36 Assistant history · S-37 Language · S-38 Security and log out
13. [Notification deep links](#13-notification-deep-links)
14. [User journeys](#14-user-journeys): J-1 to J-10

---

## 1. Conventions

- Each screen has an id (S-01 to S-38) used in code (`apps/mobile/src/screens/<name>/`) and in reviews.
- **Phone** wireframes are drawn at 360 dp wide; **Wide** describes the `expanded` / `large` web layout (DS 8). `medium` follows the phone layout centred at 640 unless stated.
- "Agent equivalent" is what a member can say in the Njangi tab to reach the same thing (spec 1.4).
- Admin-only parts are **hidden** for members, never shown disabled, unless knowing they exist helps (stated per screen).
- Every money or vote action goes through a ConfirmationCard (DS 5.21): on screens it appears in a bottom sheet; in the Njangi tab it appears in the conversation.

---

## 2. Navigation map

```
Splash ─┬─ (no session) ── Welcome ─┬─ Créer une njangi ── Sign-up ── Create a group ── Founding members ── Start the cycle
        │                           ├─ J’ai une invitation ── Invitation ── Sign-up or Login ── joined
        │                           └─ J’ai déjà un compte ── Login ── (Forgot PIN)
        └─ (session) ── [App lock, phone] ── Njangi tab
App (5 tabs, header: group switcher + bell)
  Njangi ── cards and sheets inline
  Groupe ── media viewer, members, mini-profile, attach sheet
  Caisse ── Tour | Caisse | Secours | Registre ── breakdown sheet, entry detail, loans, bidding, solidarity form, check sheet
  Votes ── proposal detail, new proposal
  Moi ── payment number, statements, my groups, meetings, group settings (admin), notification settings,
         security, privacy, assistant history, language, log out
Header ── group switcher sheet (S-26) · Notifications (S-33)
```

Meetings (S-24) are reached from Moi › "Réunions", from the agenda notification, from the meeting system event in the chat, and from the group settings for the admin. Loans (S-21) from Caisse › Caisse générale and Moi › "Mon prêt".

---

## 3. States that apply everywhere

These rules hold on every screen; the screen tables below only list what is specific.

| State | Behaviour |
|---|---|
| Loading | The last known data shows at once (TanStack Query cache). Without cache: skeletons matching the layout after 300 ms (DS 5.16). |
| Load error, no cache | Empty state `copy: emptyStates.loadFailed` with "Réessayer". |
| Load error, with cache | Content stays; error banner with "Réessayer" (DS 5.12). |
| Offline | Banner `copy: offline.banner`; money and vote buttons read "Connexion requise" and are disabled; chat messages queue; the agent composer is disabled (DS 10.2). |
| Member who has left (LEFT or REMOVED) | The group stays in the switcher marked `copy: groupSwitcher.rowLeft`. Only statements and the data export remain (R12.4): every tab shows `copy: errors.leftMember` with a button to Moi › Relevés; the Njangi tab greets with `copy: agent.greeting.left` and offers only statement and export chips. |
| Waiting to become active (joined after a MEMBER_ADD vote) | Can read the chat, the ring, the records and votes (R12.1), cannot vote on proposals opened before joining (`copy: votes.card.yourVote.joinedAfter`), has no obligations. Njangi header `copy: agent.header.pendingActivation`; info banner `copy: chat.pendingActivationNote` in Groupe. |
| Withdrawals paused (daily check ALERT) | Every "Retirer" is replaced by `copy: withdraw.paused`; the check strip moves to the top of each Caisse segment (J-10). |
| Number-change or PIN-reset hold | Withdraw and loan disbursement buttons show `copy: withdraw.hold` with the end date (R13.5). |
| Admin-only | Hidden for members, unless the screen says otherwise. |

---

## 4. Access

### S-01 Splash

- **Purpose:** cover loading (fonts, tokens, session) with the brand, nothing more.
- **Layout:** system splash (`splash-icon.svg` on indigo), then the in-app splash: ring centred at 40% height, "NjangiTrust" in `screenTitle` below, the Ndop band (48 dp) across at 82% height (DS 11). Wide: same, centred, band full width.
- **States:** shown only as long as loading takes. If the session check fails offline, the app opens on the last known Njangi tab with the offline banner rather than blocking. Reduce motion has nothing to change: the splash does not move.
- **Accessibility:** one label `copy: splash.a11y`.

### S-02 Welcome

- **Purpose:** the two ways in (spec 1.4): create a njangi or join from an invitation; plus login for returning members.
- **Entry:** first launch, after log out, from an invite link opened without the app installed (web).

```
┌──────────────────────────────────┐
│                         English  │  language switch (text button)
│                                  │
│            ◌ ring mark (64)      │
│                                  │
│  Ta njangi, en toute clarté      │  screenTitle
│  Cotise par Mobile Money, suis   │  body, textSecondary
│  chaque franc dans le registre   │
│  et décide de tout par vote.     │
│                                  │
│  [      Créer une njangi       ] │  primary
│  [    J’ai une invitation      ] │  secondary
│        J’ai déjà un compte       │  text button
└──────────────────────────────────┘
```

- **Wide:** the same column (max 480) centred; the ring mark at 96.
- **"J’ai une invitation":** opens a small sheet explaining the link (`copy: welcome.invitationHelp.*`) with a field to paste the link (useful on the web or when WhatsApp opened the link in another browser). Invalid link: `copy: welcome.invitationHelp.invalid`.
- **Copy:** `copy: welcome.*`.

### S-03 Sign-up

- **Purpose:** name, login phone, payment number with operator, consent, 6-digit PIN (spec 1.4, 2.10).
- **Entry:** Welcome › "Créer une njangi"; Invitation › "Rejoindre" (phone prefilled and locked to the invited number).
- **Structure:** one question per step, a progress line `copy: common.stepOf` at the top, "Continuer" as the sticky primary button, back arrow to the previous step (values kept).

| Step | Content | Validation and errors |
|---|---|---|
| 1 Name | `copy: signup.name.*`, one text field | At least 2 letters (`errors.validation.nameTooShort`) |
| 2 Login phone | Phone field (DS 5.2) | `phoneInvalid`; number already registered → `signup.loginPhone.alreadyUsed` with a "Se connecter" button; from an invitation, a different number → `inviteMismatch` |
| 3 Payment number | Two choice rows: "Utiliser mon numéro de téléphone" (shows the number and its detected operator) or "Utiliser un autre numéro" (reveals a phone field). Operator as two choice rows MTN / Orange, prefilled by detection with `copy: signup.paymentNumber.detected` | Unknown operator must be chosen (`unknownOperator`) |
| 4 Consent | The plain summary list (`copy: signup.consent.items.*`), the data-abroad note, a link to the full notice, and the consent choice row | Continue disabled until checked; `copy: signup.consent.required` if tapped |
| 5 PIN | PIN pad, `copy: signup.pin.createTitle` / `createBody` / `createHelp` | Trivial PINs refused (`tooSimple`) |
| 6 Confirm PIN | PIN pad, `confirmTitle` | Mismatch → `mismatch`, back to step 5 cleared |
| Done | `copy: signup.done.*` with the member's name | Continues to Create a group or to the joined group |

- **States:** creating (`copy: signup.creating` on the button), network error on submit (stays on step 6 with the error banner; nothing is lost), offline (buttons "Connexion requise").
- **Wide:** the same steps in a 480 column; the progress line becomes "Étape 3 sur 6" above the title.
- **Security:** screenshots blocked on steps 5 and 6 (phone).

### S-04 Login

- **Purpose:** phone then PIN (spec 2.10).
- **Layout:** step 1 phone field + "Continuer"; step 2 `copy: login.pinTitle` with the masked phone (`copy: login.pinBody`, "Compte 6•• •• •4 56") and "Changer de numéro", PIN pad, "Code PIN oublié ?".
- **States:** wrong PIN with tries left (`copy: login.wrongPin_other`); locked for 15 minutes after 5 wrong PINs (`copy: login.locked` with the unlock time; the pad is disabled and "Code PIN oublié ?" is the primary next step); unknown phone (`unknownPhone` with "Créer un compte").
- **Wide:** centred 400 column; the PIN pad accepts the keyboard (DS 8.6).

### S-05 Forgot PIN and reset

Three parts (spec 2.10): the member asks, an admin confirms, the member sets a new PIN from a 30-minute link.

1. **Request** (from Login): `copy: pinReset.request.*`: phone field and "Demander un nouveau code". Sent state explains what happens next and the hold that will follow (`sent.holdNote`). Already pending: `alreadyPending`.
2. **Admin confirmation:** a Sécurité notification and a row in Group settings › "Demandes de nouveau code PIN" open a sheet: `copy: pinReset.admin.title` / `body` (confirm only after speaking to the person), "Je confirme, créer le lien" (a ConfirmationCard, L1) or "Je ne reconnais pas cette demande". Confirming shows the PIN reset link information card (DS 5.22) to send by WhatsApp or SMS. The request can be confirmed by the admin of any of the member's groups (DD-29).
   - **When the person is the admin (D8):** the request goes to every other active member of the group as a Sécurité notification. The sheet (`copy: pinReset.members.title`, `body`) asks for confirmation from members who spoke to the admin; it shows the progress `copy: pinReset.members.progress_one` ("1 confirmation sur 2"). The first confirmer sees `members.waiting`; the second confirmer receives the reset link card with `members.ready` and sends it. A member who already confirmed sees `members.alreadyConfirmed`. Either "Je ne reconnais pas cette demande" cancels the request and the admin is told. The admin's sent screen uses `copy: pinReset.request.sent.bodyAdmin`.
3. **New PIN** (from the link): `copy: pinReset.set.title`, PIN pad twice, then `copy: pinReset.set.done` with the date withdrawals resume. Expired or used link: `pinReset.set.expired` / `used` with a button back to the request.

- **After a reset:** the group sees `copy: chat.system.pinReset`; withdrawals wait `numberChangeHoldHours` (R13.5).

### S-06 App lock (phone only)

- **Purpose:** protect an open session with the phone's fingerprint or face (`expo-local-authentication`, D4). It never replaces the PIN for L2 actions.
- **Layout:** full-screen `canvas`, ring mark, `copy: appLock.title` / `body`, "Déverrouiller" (primary, triggers the system prompt), "Utiliser mon code PIN" (text button, opens the PIN pad).
- **Settings:** Moi › Sécurité › `copy: appLock.settings.toggle`, with "Verrouiller après" (tout de suite, 1 minute, 5 minutes). Hidden on the web and when no biometrics are enrolled (the row then shows `unavailable`).
- **States:** not recognised (`copy: appLock.failed`), cancelled by the member (stays on the lock screen).

---

## 5. Group setup

### S-07 Create a group

- **Purpose:** name, first payout date and time, frequency, rules prefilled with the defaults of spec 3.2 and editable, then invite the founding members (spec 1.4).
- **Entry:** end of sign-up; group switcher › "Créer une njangi"; Welcome for a logged-in member with no group (`copy: emptyStates.noGroup`).

| Step | Content |
|---|---|
| 1 Name | `copy: createGroup.name.*` |
| 2 Schedule | Date field and time field for the first payout (DS 5.2 date sheet), frequency as three choice rows (`copy: common.frequency.*`), the deadline note (`schedule.deadlineNote`, 24 h before) and a live preview of the first two rounds (`schedule.preview`, "Tour 1 : samedi 28 novembre à 18 h. Tour 2 : samedi 26 décembre à 18 h.") |
| 3 Money | Contribution and solidarity amounts (amount inputs with the allowed ranges from 3.2) |
| 4 Rules | A grouped list of every other parameter of 3.2 with its default value (`copy: rules.<param>.label` and `rules.values.*`); tapping a row opens a small sheet to edit it within its range (`copy: rules.<param>.help`). The intro says these become vote-only after creation (`createGroup.rules.body`). |
| 5 Summary | Every choice in a grouped list, the admin note (`summary.adminNote`) and "Créer le groupe" |
| Created | `copy: createGroup.created.*` with "Inviter des membres" (to S-08) |

- **Validation:** past date (`errors.validation.dateInPast`); out-of-range values show the range under the field.
- **Wide:** 480 column; on step 4 the list and the edit sheet (as a dialog) side by side are not needed: keep one column.
- **States:** creating, offline (Connexion requise), error on submit (stays on step 5 with the banner).

### S-08 Founding members and the first cycle

- **Purpose:** before the first cycle the admin invites founding members directly (R1.6), then starts the cycle once at least 3 members are active (R1.1).
- **Entry:** end of S-07; Group settings › Invitations; Njangi tab chips "Inviter un membre" / "Démarrer le cycle" (admin, before the first cycle).

```
┌──────────────────────────────────┐
│ ← Membres fondateurs             │
│ Avant le premier cycle, tu       │
│ invites directement…             │
│ ▓▓▓▓▓▓▓▓░░░░  2 membres sur 3    │  progress (copy: invite.founding.progress_other)
│                                  │
│ NT  Nkam Ticha (toi)       Admin │
│ CF  Carine Fotso   A rejoint     │
│ PM  Paul Mbarga                  │
│     Invitation envoyée, expire   │
│     jeudi à 14 h      Nouveau lien│
│                                  │
│ [ + Inviter un membre          ] │  secondary
│ [      Démarrer le cycle       ] │  primary, enabled at 3 active members
└──────────────────────────────────┘
```

- **Inviting:** a sheet with name and phone (`copy: invite.founding.nameLabel`, `phoneLabel`, `phoneHelp`) → ConfirmationCard "Créer une invitation" → the invite link information card (DS 5.22) with "Envoyer par WhatsApp". The phone number is used only for the invite and is never shown to other members; in this list the admin sees names only.
- **Statuses:** pending with expiry, expired (with "Nouveau lien"), joined (`copy: invite.founding.status*`).
- **Starting:** "Démarrer le cycle" opens a ConfirmationCard (`copy: confirmation.actions.startCycle`) with `copy: startCycle.body_other` and, if invitations are still pending, `startCycle.pendingInvites_other`. Disabled below 3 active members with `startCycle.needMore_other`. Done: the draw result `copy: startCycle.drawn` and the cycle-started system event; the ring appears in Caisse.
- **Members (non-admin) before the first cycle:** see the same list read-only, without phone hints or buttons.
- **Agent equivalent:** "Invite Hervé Kamga, 655 44 33 22" → `create_invite` card; "Démarre le cycle" → `start_cycle` card.

### S-09 Invitation (invitee)

- **Purpose:** opened from an invite link: group name, who invited, the group's current rules, then sign-up (spec 1.4, R1.5).
- **Entry:** the invite link (app if installed, otherwise the web app at the same URL).

```
┌──────────────────────────────────┐
│          ◌ ring thumbnail (64)   │
│ Nkam Ticha t’invite dans         │  screenTitle
│ Njangi des Collègues             │
│ 10 membres · 10 000 FCFA par     │  facts, secondary
│ tour, chaque mois                │
│ Prochain tour : samedi 28 nov.   │
│                                  │
│ Les règles du groupe             │  sectionTitle
│ ┌──────────────────────────────┐ │
│ │ Cotisation par tour  10 000  │ │  grouped list, read-only
│ │ Caisse de secours     1 000  │ │
│ │ Amende de retard      1 000  │ │
│ │ …                            │ │
│ └──────────────────────────────┘ │
│ En rejoignant, tu acceptes ces   │
│ règles. Elles ne changent que    │
│ par vote.                        │
│ [  Rejoindre Njangi des Coll…  ] │  primary
│        J’ai déjà un compte       │
└──────────────────────────────────┘
```

- **Flow:** "Rejoindre" → sign-up (S-03) with the phone locked to the invited number, or "J’ai déjà un compte" → login, then joined. After joining a group whose cycle has started, `copy: invite.landing.activeFromNextCycle` explains when obligations begin.
- **States:** expired (`invite.landing.expired`), already used (`used`), wrong phone (`wrongPhone`), invalid link (`invalid`), offline (cannot load: `emptyStates.loadFailed`). The rules list never shows anyone's phone number.
- **Wide:** 480 column centred; the rules list stays full.

---

## 6. Njangi tab

### S-10 Njangi tab (the agent)

- **Purpose:** the tab that opens at launch (spec 1.3). It must make the member's next action obvious within one glance, then let them do anything by talking, with every action confirmed on a server-drawn card.
- **Entry:** app launch; tab bar; notifications with an agent prefill (section 13); the group chat's "Je t’ai répondu en privé" link; Groupe › "Résumer".

**Phone layout**

```
┌──────────────────────────────────┐
│ Njangi des Collègues ⌄     [🔔2] │ header (DS 5.8)
├──────────────────────────────────┤
│ (ring 64)  Tour 4 sur 10       › │ status header: one button to Caisse › Tour
│            Bénéficiaire : Carine │
│            ◌ Ta cotisation :     │
│              à payer             │
├──────────────────────────────────┤
│            Aujourd’hui           │
│ ◌ Bonsoir Paul. Ta cotisation du │ app-built briefing (agent style)
│   tour 4 (11 000 FCFA) est à     │
│   payer avant demain à 18 h.     │
│   2 votes attendent ta voix.     │
│                 ┌──────────────┐ │
│                 │Je dois combien ?│ own message
│                 └──────────────┘ │
│ ◌ 11 000 FCFA pour le tour 4 :   │ agent reply, no bubble
│   10 000 de cotisation et 1 000  │
│   pour la caisse de secours,     │
│   avant demain à 18 h.           │
│ ┌──────────────────────────────┐ │
│ │ Payer ta cotisation          │ │ ConfirmationCard (DS 5.21)
│ │ Cotisation, tour 4   10 000  │ │
│ │ Caisse de secours     1 000  │ │
│ │ Total         11 000 FCFA    │ │
│ │ ⓘ Demande MTN sur 6•• •• •7 89│ │
│ │ [Annuler] [Payer 11 000 FCFA]│ │
│ └──────────────────────────────┘ │
├──────────────────────────────────┤
│ (Payer ma cotisation) (Qui n’a…) │ context chips, scroll horizontally
│ ┌ Écris à Njangi… ───────────┐ ➤ │ composer
├──────────────────────────────────┤
│ Njangi  Groupe  Caisse Votes  Moi│
└──────────────────────────────────┘
```

**Wide layout (large, ≥ 1280):** conversation column (max 720) with chips and composer at its bottom; on the right a 360 panel "Ce tour" (`copy: agent.panel.title`) with the large ring at 240, the three status lines and "À faire" (`agent.panel.todo`): the same context chips as a vertical list of rows, or `agent.panel.nothingToDo`. The 64 px header ring is hidden there because the panel shows the large one. At `expanded` (1024 to 1279) the status header stays above the conversation as on the phone.

**Status header.** Built from the overview DTO, never from AI text. The ring is the 64 dp size (DS 6). Three lines: line 1 `bodyStrong`, lines 2 and 3 `secondary`; line 3 has a 16 dp status icon. Tapping anywhere opens Caisse › Tour (`copy: agent.header.a11y`).

| Member's situation | Line 1 | Line 2 | Line 3 (icon) |
|---|---|---|---|
| Owes this round, before the deadline | `agent.header.round` "Tour 4 sur 10" | `beneficiary` "Bénéficiaire : Carine" | `contribution` + `status.toPay` "Ta cotisation : à payer" (`circle-dashed`) |
| Payment sent, waiting for the operator | same | same | `status.processing` "en attente de MTN" (`clock`, pending) |
| Paid | same | same | `status.paid` "payée" (`circle-check`, paid) |
| Late | same | same | `status.late` "en retard" (`circle-alert`, late) |
| Is the beneficiary, before payout | same | `beneficiaryYou` | `payoutLockedYou` "Retrait possible samedi à 18 h" (raffia keyline dot) |
| Is the beneficiary, payout open | same | `beneficiaryYou` | `payoutOpenYou` "Ton argent est disponible" (raffia dot) |
| Bidding open | same | `biddingOpen` "Enchères ouvertes jusqu’à vendredi 18 h" | contribution status |
| Before the first cycle | `notStarted` | `notStartedMembers_other` "4 membres, 3 minimum" | none |
| Waiting to become active | group name's round | `pendingActivation` | none |
| Has left | `left` | none | none |
| Withdrawals paused (any of the above) | unchanged | unchanged | `withdrawalsPaused` replaces line 3 (`shield-alert`, late) |

**Greetings.** The first message of each day is a briefing built by the app from the overview and the copy templates (DD-14), styled like an agent message. It costs no AI call and always matches the figures.

- **First run** (the member's first visit to this group): `copy: agent.greeting.firstRun` ("Bonjour Paul. Je suis Njangi, l’assistant de Njangi des Collègues. Je peux payer ta cotisation, te dire où en est le tour, préparer un vote ou résumer le groupe."), then `firstRunTrust` ("Je prépare, tu confirmes : rien ne bouge sans ton accord.") and `firstRunPrompt`, with the chips below.
- **Returning:** `greeting.morning` (before 12:00) or `greeting.evening` (from 18:00; plain `morning` "Bonjour" in between), then one sentence for the most important fact, in this priority: withdrawals paused (`withdrawalsPaused`), payout open (`payoutOpen`), late (`late`), owes (`owes`), beneficiary soon (`beneficiarySoon`), paid (`paid`); then at most one extra line: votes waiting (`votesWaiting_other`) or unread messages (`unread_other`).
- **Before the first cycle:** `notStartedAdmin` or `notStartedMember`. **Has left:** `left`.
- The briefing is not repeated if the member returns the same day; the conversation simply resumes where it was.

**Context chips.** At most four, chosen by the app from the overview in this priority (the first matching rules win), each sending its label as the member's message (DD-15):

| Situation | Chips (`copy: agent.chips.*`) |
|---|---|
| Withdrawals paused | `whyPaused`, then the usual ones |
| Payout open for me | `withdraw`, `payoutDetail` |
| Late | `payNow`, `whyFine` |
| Owes, before the deadline | `pay`, `howMuch`, `whoUnpaid` |
| Payment waiting for the operator | `whoUnpaid`, `fund` (no pay chip) |
| Beneficiary before payout | `whenPayout`, `payoutDetail` |
| Paid, not beneficiary | `myTurn`, `fund`, `openVotes` |
| Open votes I have not voted on | `openVotesCount_other` ("Voir les 2 votes ouverts") |
| 20+ unread in Groupe | `missed` ("Qu’est-ce que j’ai raté ?") |
| Number-change hold | `whenCanWithdraw` |
| Loan in progress | `nextInstallment` |
| Bidding open and eligible | `placeBid` |
| Meeting check-in window open | `checkIn` |
| Admin with loans to decide | `loansToDecide_other` |
| Admin before the first cycle | `inviteMember`, `startCycle` |
| Has left | `statement` |

**Conversation.**

- Member messages and agent replies as DS 5.24. A send shows the member's bubble at once; the typing dots appear, then the AgentActivityLine names each tool as it runs (`copy: agent.activity.<tool>`: "Je vérifie la caisse…"), then the reply streams in.
- **Cards:** when a tool prepares an action, the agent's one-sentence explanation streams first, then the ConfirmationCard appears under it, drawn from the PendingAction (DS 5.21). Information cards appear the same way (payment number, statement, export, invite link).
- **Result events:** when the member confirms and the operation finishes, a centred result event appears (`copy: agent.results.*`, for example "Paiement de 11 000 FCFA : réussi, réf. MP2611A9F2.") and the card turns to its done state. The agent then adds at most one next step ("Carine pourra retirer samedi à 18 h.").
- **History:** the last messages load first; scrolling up loads older ones (`copy: agent.loadOlder`) with date separators.

**Failures and limits.**

| Case | What the member sees |
|---|---|
| The agent could not finish (8 tool steps) | Agent message `copy: agent.errors.failed` ("Je n’ai pas pu terminer. Reformule ta demande, plus simplement.") |
| Message not sent (network) | The own bubble shows `circle-alert` and `copy: agent.errors.notSent` with "Réessayer" |
| Stream interrupted | The partial reply stays, then `copy: agent.errors.interrupted` with "Réessayer" |
| AI service down | `copy: agent.errors.unavailable`; chips still open the matching screens |
| Rate limit (30 messages in 10 minutes, spec 4.2) | `copy: agent.errors.rateLimited` with the time writing is possible again; the composer is disabled until then and shows the same time as its placeholder; chips that open screens keep working |
| A tool refuses (rule, permission) | The agent explains in plain words and offers the way forward (spec 4.7 rule 7), for example the proposal for a rule change |
| A card fails, expires or is cancelled | The card's own state (DS 5.21) plus the matching result event |

**"Je t’ai répondu en privé".** When a member writes `@njangi` in the group about their own situation (spec 4.4), the group shows the agent's quiet reply `copy: agent.group.privateReply` ("Je t’ai répondu en privé, Carine."), with an "Ouvrir" button for Carine only. The Njangi tab gets a dot badge; opening it shows Carine's group message quoted under `copy: agent.privateFromGroup.label` ("Depuis le groupe"), followed by the private answer.

**States.**

| State | Behaviour |
|---|---|
| First visit | Briefing with the first-run greeting and chips; no history |
| Offline | Banner; history and cards readable; composer disabled (`copy: offline.agentComposer`); card buttons "Connexion requise"; chips disabled except those that open screens |
| Left the group | Header `agent.header.left`; greeting `agent.greeting.left`; chip `statement`; the agent can still send statements and the data export |
| Before the first cycle | Header `notStarted`; admin chips `inviteMember`, `startCycle` |
| Several groups | The conversation belongs to the active group; switching group in the header switches conversation. "Combien je dois ce mois, toutes njangis confondues ?" is answered with the all-groups overview (spec 4.9) |
| Notification opened with a prefill | The prefill (section 13) appears as an agent message with the matching chips, for example `copy: notificationPrefill.reminderDue` ("Tu dois 11 000 FCFA pour le tour 4. Payer maintenant ?") with `pay` |

---

## 7. Groupe tab

### S-11 Groupe tab (chat)

- **Purpose:** the group's conversation: text, photos, videos, PDFs, voice notes, @mentions, system events and pinned announcements (spec 1.4, 1.5).
- **Entry:** tab bar; chat mention and new-message notifications; system events link back here from the agent.
- **Agent equivalent:** "Qu’est-ce que j’ai raté ?" (J-9).

```
┌──────────────────────────────────┐
│ Njangi des Collègues ⌄     [🔔2] │
├──────────────────────────────────┤
│ 📌 Réunion samedi 16 h chez …  › │ pinned announcement strip
│ ≡ 34 messages non lus   Résumer  │ summary banner (20+ unread)
├──────────────────────────────────┤
│           Hier                   │
│ CF Carine Fotso                  │
│    ┌─────────────────────┐       │
│    │ ▶ ──●────────  0:42 1×│     │ voice note
│    └─────────────────────┘       │
│  ✓ Paul Mbarga a payé la cotisa- │ system event, centred
│    tion du tour 4. · 18:10     › │
│ ◌ Njangi · Assistant             │
│    ┌─────────────────────┐       │ agent reply, outlined
│    │ 7 membres sur 10 ont │      │
│    │ payé le tour 4.      │      │
│    └─────────────────────┘       │
│ ───── 3 nouveaux messages ─────  │ unread divider
│                 ┌──────────────┐ │
│                 │ Merci Paul ! │ │ own message
│                 └──────────────┘ │
│ Carine écrit…                    │
│ [📎] ┌ Écris un message… ┐ [🎙]  │
└──────────────────────────────────┘
```

- **Wide (large):** chat column (max 720) + right panel 320: pinned announcements, next meeting (date, place, "Voir l’ordre du jour"), members with avatars (tap opens the mini-profile).
- **Interactions:** long-press (or right-click / the row's "Plus d’options" button on the web) on a message opens a small sheet: Répondre, Copier le texte, Supprimer pour tout le monde (own messages), Masquer (admin, with a reason, logged). Tapping a mention or an avatar opens the mini-profile. Tapping a linked system event opens the entry, vote or minutes. The tab opens at the first unread message with the unread divider, or at the bottom.
- **Résumer:** sends "Qu’est-ce que j’ai raté ?" to the Njangi tab and switches to it (J-9); the chat is marked read when the summary arrives.

| State | Behaviour |
|---|---|
| Empty | `copy: chat.empty` with the `@njangi` hint |
| Loading older | Spinner row at the top while scrolling up |
| Offline | Banner; new messages queue with `clock`; media not yet downloaded shows the thumbnail or placeholder |
| Message failed | `copy: chat.message.failed` under it; tap retries |
| Waiting to become active | Info banner `copy: chat.pendingActivationNote`; full read and write |
| Left the group | `copy: chat.leftReadOnly` instead of the feed |
| Muted | No pushes (settings); the tab still counts unread |

---

## 8. Caisse tab

The tab has a segmented control under the header: Tour, Caisse, Secours, Registre (DS 5.7). The last segment used is remembered per group.

### S-12 Caisse › Tour

- **Purpose:** where the round stands: the large ring, the beneficiary and payout date, who paid and who has not, the payout breakdown (spec 1.4).
- **Entry:** tab bar; Njangi status header; payment and payout notifications. **Agent equivalent:** "Qui n’a pas payé ?"

```
┌──────────────────────────────────┐
│ Njangi des Collègues ⌄     [🔔2] │
│ ( Tour )( Caisse )( Secours )( Registre ) │
│                                  │
│            ● ◉ ●                 │ ring 280: Carine (raffia) at 12
│         ●         ○              │
│        ●  70 000 FCFA  ○         │ centre: amountDisplay
│        ●  sur 100 000  ◎         │ ◎ = late (Joël)
│         ●         ●              │
│            ●   ●                 │
│                                  │
│ ◉ Carine reçoit samedi à 18 h  › │ beneficiary row → breakdown sheet
│   Paiement avant vendredi à 18 h │
│                                  │
│ À payer (3)                      │ sectionTitle (unpaid first when I owe)
│ JN Joël Ndi        11 000 FCFA   │
│                      en retard   │
│ PM Paul Mbarga (toi) 11 000 FCFA │
│ [      Payer 11 000 FCFA       ] │ primary, only when I owe
│ Payé (7)                         │
│ CF Carine Fotso    11 000 FCFA   │
│                    3 nov., à temps│
│ …                                │
│ 🛡 Vérification du jour : conforme,│ daily check strip (S-17)
│   06:00. Registre intact.      › │
└──────────────────────────────────┘
```

- **Order of the lists:** when the member owes, "À payer" comes first with their own row and the pay button; otherwise "Payé" comes first. Unpaid rows: late members first, then alphabetical; paid rows by payment time. Each row shows the amount owed or paid (contribution + solidarity) and the status word.
- **Beneficiary row:** raffia-keyline avatar, `copy: caisse.tour.beneficiary` / `beneficiaryYou` / `payoutOpen`, the deadline `caisse.tour.deadline`; tap opens the **payout breakdown sheet**: `copy: caisse.breakdown.*`: contributions received, Mobile Money fees, automatic deductions (fine, loan installment, bid, each a line), net for the beneficiary, already withdrawn, left to withdraw, locked until, pending contributions, and the three notes (fees, auto-settlement, late contributions). With E5's figures (round fully paid): contributions received 100 000, Mobile Money fees −910, automatic deductions −17 750 (loan installment 16 750, fine 1 000), net 81 340; the withdraw sheet then offers at most 80 840 after the 500 fee.
- **Ring:** large size, tap a dot for the mini-profile (S-28). The two motions play here when the ring is on screen (DS 6.7).
- **Previous rounds:** a text button `copy: caisse.tour.previousRounds` opens a round picker; past rounds show the same layout, read-only, with the ring closed in raffia when complete.
- **Bidding mode:** before the close, `copy: caisse.tour.biddingNote` and a link to S-23; the ring shows the empty seat (DD-28).
- **Wide (expanded+):** two columns: left (400, sticky) ring 320, beneficiary row, breakdown link and check strip; right: À payer and Payé lists.

| State | Behaviour |
|---|---|
| Before the first cycle | Ring with `copy: ring.center.notStarted`; `copy: caisse.tour.noCycle` (admin: `noCycleAdmin` with a button to S-08) |
| Nobody paid yet | Ring all outlines; `copy: caisse.tour.nobodyPaid` under "À payer" |
| All paid | Ring closed in raffia, centre "Tour complet"; `copy: caisse.tour.allPaid` replaces the À payer list |
| I paid | My row in Payé with `copy: caisse.tour.youPaid`; no pay button |
| My payment pending at the operator | My row shows `clock` and "en attente"; no pay button |
| Offline | Pay button "Connexion requise"; lists from cache |
| Withdrawals paused | Check strip in alert at the top; beneficiary row says withdrawals are paused |

### S-13 Caisse › Registre

- **Purpose:** every ledger entry, readable by every member (spec 1.4, 2.14): date, description, signed amount, short reference; filters; export.
- **Entry:** segment; system events; "Voir dans le registre" on done cards. **Agent equivalent:** "Montre-moi les paiements de Paul".

```
┌──────────────────────────────────┐
│ ( Tour )( Caisse )( Secours )(Registre)│
│ 🛡 Vérification du jour : conforme…│
│ Chaque franc du groupe, dans     │ intro, secondary
│ l’ordre. Rien ne peut être       │
│ modifié ni effacé.               │
│ (Tout)(Paiements)(Versements…)(Membre ⌄) │ filter chips, scroll
│                       Exporter ⤓ │
│ ⤓ Paiement reçu : Paul Mbarga,   │ LedgerRow (DS 5.19)
│   tour 4          +10 900 FCFA   │
│   5 nov., 14:32 · n° 412 · MP26… │
│ ⏰ Amende : Joël Ndi, tour 3      │
│                    1 000 FCFA    │ unsigned, secondary (no cash moved)
│   1 nov., 18:00 · n° 405         │
│ ⚖ Vote adopté : …               │ decision, no amount
└──────────────────────────────────┘
```

- **Filters:** type chips (`copy: caisse.ledger.filters.*`), a member picker (names only) and a period picker; active filters show as selected chips with "Retirer les filtres".
- **Export:** "Exporter" opens a sheet with CSV and JSON (`copy: caisse.ledger.exportCsv`, `exportJson`, `exportHelp`) → the ledger export information card (DS 5.22).
- **Wide:** master-detail: list left, entry detail right (S-14), with "Choisis une opération" as the empty detail.

| State | Behaviour |
|---|---|
| Empty group ledger | `copy: caisse.ledger.emptyAll` |
| Filters match nothing | `copy: caisse.ledger.empty` with "Retirer les filtres" |
| Paging | 50 entries per page, `copy: caisse.ledger.loadMore` at the end |
| Offline | Cached pages readable; export "Connexion requise" |

### S-14 Ledger entry detail

- **Purpose:** the full entry: postings, operator reference, fingerprint and previous fingerprint, links to the payment, vote or loan (spec 1.4, 1.5).
- **Entry:** a LedgerRow; system events; result events; links between entries (reversals).

```
┌──────────────────────────────────┐
│ ← Opération n° 412               │ screenTitle
│ Paiement reçu                    │
│ Paul Mbarga, tour 4              │
│                 +10 900 FCFA     │ amountLarge
│ ┌──────────────────────────────┐ │
│ │ Date        5 nov. 2026, 14:32│ │ grouped list
│ │ Membre          Paul Mbarga   │ │
│ │ Tour                       4  │ │
│ │ Référence opérateur MP2611A9F2│ │
│ │ Origine des frais  Barème…    │ │
│ └──────────────────────────────┘ │
│ Écritures                        │ sectionTitle
│ Argent chez l’opérateur  +10 900 │
│ Dû à Carine Fotso         −9 909 │
│ Caisse de secours           −991 │
│ Somme des écritures : 0          │
│ Empreinte                        │
│ 3f9a1c07 52be8d10 … (copier)     │ groups of 8, selectable
│ Empreinte précédente             │
│ 9e00c4d1 …                       │
│ Chaque opération est liée…       │ hashHelp
│ Lié à   Voir le paiement       › │
└──────────────────────────────────┘
```

- Accounts are named in words (`copy: caisse.entry.accounts.*`): "Argent chez l’opérateur", "Dû à Carine Fotso", "Dette de Joël Ndi", "Caisse générale", "Caisse de secours". Posting amounts use `sign: 'always'`.
- EVENT entries show `copy: caisse.entry.eventNoPostings` and, for a cycle start, the draw seed (`drawSeed`).
- Reversals link both ways (`related.reversedBy`, `related.reverses`).
- **Wide:** the right pane of S-13.

### S-15 Caisse › Caisse générale

- **Purpose:** the general fund's balance, what is available for loans, loans in progress (spec 1.4, R9).
- **Entry:** segment. **Agent equivalent:** "Combien il y a dans la caisse ?"
- **Layout:** `copy: caisse.fund.title`; balance in `amountLarge`; a grouped list: Disponible pour les prêts, Réservé aux membres (with `reservedHelp` under an `info` button); the sources and distribution notes (`sources`, `distribution` or `noDistribution`); my limit and "Demander un prêt" (to S-21); "Prêts en cours" as rows (name, amount, status, next installment); admin: `loansToDecide_other` row to S-22.
- **Wide:** balance and figures left, loans list right.
- **States:** no loans (`emptyLoans` + `emptyLoansCta`), not eligible (the reason from `copy: loans.notEligible.*` replaces the button), offline (button "Connexion requise").

### S-16 Caisse › Secours and the support request

- **Purpose:** the solidarity fund's balance, requests and their status, "Demander un soutien" (spec 1.4, R10).
- **Entry:** segment; solidarity notifications. **Agent equivalent:** "Combien dans la caisse de secours ?"
- **Layout:** `copy: caisse.solidarity.title`, balance (`amountLarge`), `perRound` and `carriesOver` notes, primary "Demander un soutien", "Demandes" list: recipient and event (`requestRow`), amount, status (`statuses.*`) with icon; open requests link to their vote (S-19).
- **Request form** (`copy: solidarityRequest.*`), a sheet: for me / for another member (member picker), event (five choice rows: Deuil, Naissance, Maladie, Mariage, Autre), amount (amount input, max the fund balance), optional note visible to the group, the vote note, "Préparer la demande" → ConfirmationCard `requestSolidarity` → the vote opens (24 h by default).
- **States:** fund off (`copy: caisse.solidarity.off` with a link to propose a rule change), fund empty (`solidarityRequest.fundEmpty`, button disabled), no requests (`caisse.solidarity.empty`).

### S-17 Daily check (strip and sheet)

- **Purpose:** show the daily reconciliation (spec 1.4: "Vérification du jour : conforme, 06:00. Registre intact.") and explain an alert.
- **Where:** bottom of Tour, top of Registre (DS 5.13); in alert, top of every segment and in the Njangi header. **Agent equivalent:** "La caisse est-elle à jour ?"
- **Sheet** (`copy: caisse.dailyCheck.sheet.*`): when it ran, a grouped list (balance at the operator, money according to the records, operations in progress, difference, chain of the records, fund rules) and a plain explanation: `okBody`; or for WARNING `warningBody`; or for ALERT `alertWhat`, `alertBody`, `alertPayments`, `alertNext`.
- **States:** OK, WARNING (shown calmly, D9), ALERT, not run yet, stale (DS 5.13). J-10 describes the member's experience of an alert.

---

## 9. Votes

### S-18 Votes tab

- **Purpose:** open proposals with progress and my vote state; closed proposals with result and effect (spec 1.4).
- **Entry:** tab bar; vote notifications; system events. **Agent equivalent:** "Quels votes sont ouverts ?"

```
┌──────────────────────────────────┐
│ Njangi des Collègues ⌄     [🔔2] │
│ Ouverts (2)              Proposer│ sectionTitle + text button
│ ┌──────────────────────────────┐ │
│ │ Changement de règle          │ │ ProposalCard (DS 5.20)
│ │ Amende de retard :           │ │
│ │ 1 000 → 1 500 FCFA           │ │
│ │ Proposé par Paul Mbarga ·    │ │
│ │ Clôture dans 2 jours         │ │
│ │ ██████████░░░░│░░░  5 oui sur │ │
│ │ 7 requis · 1 non             │ │
│ │ ○ Tu n’as pas encore voté    │ │
│ │ [   Oui   ]  [   Non   ]     │ │
│ └──────────────────────────────┘ │
│ ┌──────────────────────────────┐ │
│ │ Exclusion d’un membre 🔒 Vote secret│
│ │ Exclure …                    │ │
│ │ ███████░░░ 6 membres sur 9   │ │
│ │ ont voté                     │ │
│ │ Les totaux s’affichent à la  │ │
│ │ clôture.                     │ │
│ │ ✓ Tu as voté. Ton choix reste│ │
│ │ secret.                      │ │
│ └──────────────────────────────┘ │
│ Clos                             │
│ Ajouter Hervé Kamga  ✓ Adopté    │ compact rows for closed votes
│ 8 oui, 1 non · Invitation créée  │
└──────────────────────────────────┘
```

- **Order:** open proposals I have not voted on first (soonest closing first), then the ones I voted on; closed proposals as compact rows, newest first, with the result badge, tally and effect.
- **Voting:** "Oui" or "Non" opens a sheet with the ConfirmationCard "Voter oui" (lines: the proposal title, current and proposed value, the threshold; notes: `voteFinal`, and `voteSecret` for secret votes). Done shows "Voté" and the vote recorded event.
- **Wide:** list left, proposal detail right (S-19).
- **States:** no open votes (`copy: votes.emptyOpen`), no closed votes (`emptyClosed`), not eligible (reason line instead of buttons), offline (one "Connexion requise" button per card).

### S-19 Proposal detail

- **Purpose:** everything about one proposal: text, reason, threshold, votes so far, effect.
- **Layout:** the ProposalCard at full width, then sections: `copy: votes.detail.reason`, `details` (type-specific values: current → proposed, member concerned, swap, amount and event), eligible voters (`eligible_other`, and `excluded` for whoever does not vote), the threshold explanation (`copy: votes.threshold.*`, including `closesEarly` and `countsEligible`), opening and closing times, and:
  - **non-secret:** "Votes": member rows with "Oui", "Non" or `notYetVoted`;
  - **secret:** `copy: votes.detail.secretExplain` and the participation count only, until the close.
- Closed: result, final tally, effect, and `ledgerLink` to the EVENT entry.
- **Agent equivalent:** "Vote oui pour la proposition sur l’amende".

### S-20 New proposal

- **Purpose:** type, details and reason, with a preview of the threshold (spec 1.4).
- **Entry:** Votes › Proposer; Group settings › Proposer un changement (rule preselected); "Proposer" links in empty states. **Agent equivalent:** "Je propose de passer l’amende à 1 500".
- **Step 1, type:** choice rows with `copy: votes.types.*` and `newProposal.typeHelp.*`. ADMIN_LOAN is not offered (it comes from a loan request); SOLIDARITY_PAYOUT goes to the request form (S-16); EARLY_EXIT shows its own explanation and the alternative of leaving at cycle end.
- **Step 2, details (per type):** rule picker and new value with the current value and range (`newProposal.rule.*`); member name and phone for MEMBER_ADD (`memberAdd.*`, the phone never shown to others); member picker for removal and admin change; two member pickers for a swap (`rotation.*`); a fine picker for a waiver; an entry number and correction text for a records correction.
- **Step 3, reason:** text field (`newProposal.reason`, `reasonPlaceholder`, `reasonHelp`) and the live preview `copy: newProposal.preview` ("Il faudra 7 oui sur 10 membres (deux tiers).") with the window and the effect timing (`rule.effectNextRound` or `effectNextCycle`).
- **Confirm:** "Préparer la proposition" → ConfirmationCard `propose` → done → the vote opens and appears in S-18.
- **Errors:** out of range, same as current, a vote already open on this rule (R11.6), a member not eligible for a swap (already served).

---

## 10. Loans, bidding, meetings

### S-21 Loans

- **Purpose:** request form with an amount slider limited to the member's limit, 1 to 3 months, a live breakdown; my repayment schedule (spec 1.4, R7).
- **Entry:** Caisse générale › Demander un prêt; Moi › Mon prêt; loan notifications. **Agent equivalent:** "Je veux emprunter 30 000 sur 2 mois".

```
┌──────────────────────────────────┐
│ ← Demander un prêt               │
│ Ton plafond : 30 000 FCFA      ⓘ │
│ Montant                          │
│              30 000 FCFA         │ amount input
│ ○━━━━━━━━━━━━━━━━━━━━━━━━━━━━━●  │ slider, 1 000 steps
│ Durée  (1 mois)(2 mois)(3 mois)  │ choice chips (max loanMaxMonths)
│ Ce que tu rembourseras           │
│ Montant emprunté     30 000 FCFA │
│ Intérêts, 5 % sur 2 mois 3 000 FCFA│
│ Frais estimés           500 FCFA │
│ Total à rembourser   33 500 FCFA │ amountTotal
│ Échéancier                       │
│ Tour 4, vendredi 6 nov. 16 750   │
│ Tour 5, vendredi 4 déc. 16 750   │
│ [     Préparer la demande      ] │
│ L’admin décide sous 72 h.        │
└──────────────────────────────────┘
```

- Figures (interest, fee, total, schedule) come from `POST /loans/quote` and refresh as the amount or length changes (debounced 300 ms); the app never computes them.
- **My loan** (`copy: loans.mine.*`): status (`loans.status.*`), next installment, remaining, schedule rows paid / due, "Rembourser maintenant" (ConfirmationCard `repayLoan`), the early repayment and auto-settlement notes, the carry-over note.
- **States:** not eligible (reason from `loans.notEligible.*` instead of the form), waiting for decision, rejected (with `rejectedReason`), expired, approved and sending, overdue (`mine.overdue` in `textDanger`), admin's own request (`confirmation.notes.loanAdminVote`: goes to a vote).

### S-22 Admin loan queue

- **Purpose:** the admin approves or rejects loan requests with a reason; the card shows the member's reliability and debts (R7.4).
- **Entry:** loan request notification (admin); Caisse générale; Group settings; chip `loansToDecide_other`.
- **Layout:** one bordered block per request: name, amount and length, requested at, `expiresAt`, reliability (DS 5.26), debts or `noDebts`, contributions paid this cycle; "Approuver" (ConfirmationCard `approveLoan`) and "Refuser" (a sheet with the required reason, then `rejectLoan`).
- **States:** empty (`copy: loans.queue.empty`); the admin's own request appears with `ownLoan` and no buttons; offline.
- Members never see this screen.

### S-23 Bidding

- **Purpose:** shown only in bidding mode: sealed bid entry, my current bid, results after close (spec 1.4, R8).
- **Entry:** Caisse › Tour (bidding note); chip `placeBid`; round-open notification. **Agent equivalent:** "Je mise 4 000 pour le tour 6".
- **Layout before the close:** `copy: bidding.title`, the explanation (`explain`), closing time, minimum, number of bids so far (`bidsCount_other`, never amounts), my bid (`yourBid`, `yourBidAt`) or `noBid`, amount input, "Miser" or "Augmenter ma mise" → ConfirmationCard `placeBid` / `raiseBid` with `bidSealed`.
- **After the close:** results (`bidding.results.*`): the winner (or the draw), all bids with names and times, the tie note, the winner's debt note.
- **States:** not eligible (already served), last round (`lastRound`), raise lower than current (`mustBeHigher`), below minimum, offline.

### S-24 Meetings

- **Purpose:** next meeting, agenda, check-in during the meeting window, attendance (spec 1.4, R15).
- **Entry:** Moi › Réunions; meeting and agenda notifications; the meeting system event; Group settings (admin); chip `checkIn`. **Agent equivalent:** "Ajoute un point à l’ordre du jour".
- **Layout:** `copy: meetings.next` with date, place or link (selectable); "Ordre du jour" (`meetings.agenda.*`): automatic items first (`autoItems.*`: round status, unpaid names, open votes, installments, solidarity requests) marked `auto`, then members' items with `byMember`; "Ajouter un point" (ConfirmationCard `addAgendaItem`); during the window, the primary "Je suis là" (`meetings.checkIn.button`, ConfirmationCard `checkIn`), otherwise `checkIn.notOpen` / `closed` / `done`; before the start, "Envoyer une excuse" (reason sheet, `sendExcuse`).
- **Attendance** (`meetings.attendance.*`): sections Présents, Excusés, Absents, Non renseignés, with row statuses that do not depend on gender (`rowStatus.*`). The admin can mark each member (`markPresent`, `markAbsent`, ConfirmationCard `markAttendance`). The fine note shows when `meetingAbsenceFine` is above zero.
- **Admin:** "Planifier une réunion" (`meetings.form.*`: date, time, place or link → `scheduleMeeting`).
- **States:** no meeting (`none`, admin `noneAdmin`), agenda not ready (`agenda.pending`), past meetings list with their minutes.

### S-25 Minutes: draft and publish

- **Purpose:** the admin edits the agent's draft and publishes; everyone reads the published minutes (R15.4).
- **Admin, after the meeting:** "Tes notes" field (`meetings.minutes.notes`), "Préparer le brouillon avec Njangi" (L0, `generating`), then the draft in an editable multi-line field organised under the fixed sections (`minutes.sections.*`: date and place, present, excused, absent, items discussed, money received, vote results, next meeting) with `draftOnlyAdmin`. "Publier le procès-verbal" → ConfirmationCard `publishMinutes` with `publishNote`.
- **Everyone:** the published text, `published` date and `version`; earlier versions listed below with their correction reason.
- **Correction (admin):** "Publier une correction" → the text and a required `correctionReason` → a new version.
- **States:** not published yet (`notPublished` for members), offline (publish "Connexion requise").

---

## 11. Sheets

### S-26 Group switcher

- **Purpose:** move between groups, see where each stands, join or create another (spec 1.3).
- **Entry:** the header's group name, on every tab. **Agent equivalent:** "Passe à Njangi du quartier".

```
            ───
 Mes groupes                    ✕
 Tous mes groupes : 16 000 FCFA à payer
 ┌──────────────────────────────┐
 │ (◌) Njangi des Collègues   ✓ │  thumbnail ring 40, active check
 │     Tour 4 sur 10            │
 │     À payer : 11 000 FCFA    │
 ├──────────────────────────────┤
 │ (◌) Njangi du quartier       │
 │     Tour 2 sur 5 · À jour    │
 └──────────────────────────────┘
 Rejoindre avec une invitation  ›
 Créer une njangi               ›
```

- Rows: thumbnail ring (DS 6.2), group name (`bodyStrong`), `copy: groupSwitcher.rowRound`, and one status: `rowToPay`, `rowUpToDate`, `rowYourTurn` (with a raffia dot), `rowNotStarted` or `rowLeft`. The total across groups (`allGroups`) comes from the all-groups overview (spec 4.9), never added up by the app.
- Selecting a group switches every tab and the agent conversation, and closes the sheet.
- **Wide:** a popover under the header switcher (DS 8.4).

### S-27 Withdraw (payout) sheet

- **Purpose:** the beneficiary takes their money, all at once or in parts, to their own number (spec Product summary, R5). The Ndop band marks the moment (spec 1.2).
- **Entry:** Njangi chip `withdraw` or "Retire tout"; Moi › Disponible › Retirer; payout-open notification; Caisse › Tour beneficiary row (for the beneficiary).

```
┌──────────────────────────────────┐
│▓▒▓▒▓ Ndop band (32) ▓▒▓▒▓▒▓▒▓▒▓▒│  top edge of the sheet, clipped by the radius
│ Ton versement du tour 4        ✕ │  groupTitle
│ Disponible                       │
│            81 340 FCFA           │  amountDisplay
│ Comment ce montant est calculé › │  → breakdown (S-12)
│ Montant à retirer                │
│              80 840 FCFA         │  amount input: what Carine receives
│ (Tout retirer)                   │
│ Frais estimés            500 FCFA│
│ Pris sur ton solde    81 340 FCFA│  bodyStrong + amountTotal
│ Sur ton numéro MTN 6•• •• •3 21  │
│ Tu peux retirer en plusieurs     │
│ fois. Ce que tu laisses reste    │
│ réservé pour toi.                │
│ [            Continuer         ] │
└──────────────────────────────────┘
```

- "Tout retirer" fills the maximum (available minus the estimated fee, as E5: 81 340 available, 80 840 withdrawable). Validation: `withdraw.min`, `withdraw.max`.
- The amount typed is what the member receives; the estimated fee is taken from their balance on top (R4.3, R5.4), so the sheet and the card always show both figures and their sum, `copy: withdraw.fromBalance`.
- "Continuer" replaces the form with the ConfirmationCard `withdraw` inside the sheet (lines: `youReceive` 80 840, `feeEstimated` 500; total line `fromBalance` 81 340; note `withdrawalTo`; button "Retirer 80 840 FCFA"); processing `processing.withdrawal`; done "Retiré" with the reference. The band stays at the top through every state.
- **States:** hold (`withdraw.hold`), paused (`withdraw.paused`), a withdrawal already in progress (`inProgress`), nothing available (`nothing` + `nothingTurn`), locked until the payout time (`locked`), offline.
- **Wide:** a 520 dialog with the band along its top edge.

### S-28 Members and mini-profile

- **Purpose:** the member list and each member's public mini-profile: name, status this round, reliability; never a phone number (spec 1.2, 2.11).
- **Entry:** Group settings › Membres; Groupe wide panel; ring dots; avatars and mentions.
- **List** (`copy: members.*`): search, count, sorted in rotation order (`rotationOrder`) with each member's round (`position`), role badge, status (`leaving`, pending activation), and the `noPhones` note at the bottom.
- **Mini-profile:** DS 5.25. Previous / next in rotation order.
- **Admin view** adds role management entry points only through votes ("Proposer comme admin" opens S-20 with ADMIN_CHANGE); the admin sees no extra personal data.

---

## 12. Moi and settings

### S-29 Moi

- **Purpose:** my turn and date, my debts, my loan, my reliability, my payment number (masked) with "Changer", statements, my groups, language, notifications, privacy, assistant history, log out (spec 1.4).
- **Entry:** tab bar. **Agent equivalent:** "C’est quand mon tour ?"

```
┌──────────────────────────────────┐
│ Njangi des Collègues ⌄     [🔔2] │
│ PM  Paul Mbarga                  │ avatar 56 + name (groupTitle)
│ Ma situation dans Njangi des Co… │ sectionTitle
│ ┌──────────────────────────────┐ │
│ │ À payer   11 000 FCFA avant  │ │ → pay card in a sheet
│ │           demain à 18 h    › │ │
│ │ Disponible          0 FCFA   │ │ (Retirer when > 0)
│ │ Mon tour  Tour 7, sam. 30 janv│ │
│ │ Mes dettes      Aucune dette │ │
│ │ Mon prêt          Aucun prêt │ │
│ │ Ma fiabilité 92 % · 11 sur 12│ │
│ └──────────────────────────────┘ │
│ ┌──────────────────────────────┐ │
│ │ Numéro de paiement           │ │
│ │ MTN 6•• •• •7 89     Changer │ │
│ │ Relevés                    › │ │
│ │ Mes groupes                › │ │
│ │ Réunions                   › │ │
│ └──────────────────────────────┘ │
│ Réglages                         │
│ ┌──────────────────────────────┐ │
│ │ Langue            Français › │ │
│ │ Notifications              › │ │
│ │ Sécurité                   › │ │
│ │ Confidentialité            › │ │
│ │ Historique de l’assistant  › │ │
│ │ Réglages du groupe         › │ │ (admin: full; members: rules, read-only)
│ └──────────────────────────────┘ │
│ [         Se déconnecter       ] │ secondary
│ Version 1.0.0                    │
└──────────────────────────────────┘
```

- Rows use `copy: moi.*`; the payment number row shows the operator and `MaskedNumber` (the full number is one tap away in S-30). With several groups, `allGroupsTotal` appears above the situation list.
- **Wide:** two columns: situation and money on the left, the other lists on the right.
- **States:** beneficiary (`myTurnServed` or the turn with a raffia dot), hold (`holdUntil`), locked payout (`locked`), bidding mode (`myTurnBidding`), left the group (only Relevés, Confidentialité and Se déconnecter remain).

### S-30 Change payment number

- **Purpose:** the member changes their own payment number, confirmed with one tap and their PIN, with the 48-hour hold explained (R13; L2).
- **Entry:** Moi › Numéro de paiement › Changer; the payment number information card; **agent:** "Change mon numéro pour 677 12 34 56".
- **Layout:** current number in full (`formatOwnNumber`, visible only to its owner) with operator and "since"; "Nouveau numéro" phone field with operator detection and the MTN / Orange choice; the notes `holdWarning`, `allGroups`, `inProgress`, `notify` (`copy: paymentNumber.*`); "Continuer" → ConfirmationCard `changePaymentNumber` (lines: new number in full, operator; notes `numberHold`, `numberAllGroups`; `pinRequired`) → PIN sheet → done "Changé" with `paymentNumber.done`. Old numbers below (`history`, `historyHelp`).
- **States:** same number (`same`), invalid, PIN wrong or locked, offline, a withdrawal in progress (it keeps the old number, `inProgress`).

### S-31 Statements

- **Purpose:** list of statements and "Générer un relevé" for a month, a cycle or custom dates (spec 1.4, 2.14).
- **Entry:** Moi › Relevés; statement-ready notification; **agent:** "Envoie-moi mon relevé d’octobre".
- **Layout:** "Générer un relevé" (primary) → a sheet: period type (`statements.periods.*`), then month picker, cycle picker or two date fields → `generating` → the statement information card. The list: one row per statement (name, `rowMeta`), tap opens the PDF; the verification code and `verifyHelp` ("Une institution peut vérifier ce relevé sur njangitrust.cm/verify", without "https://", D9) in the row's detail. `contents` explains what is inside.
- **States:** empty (`statements.empty`), left member (`leftMember`, still fully available), invalid range, offline (list from cache, generate "Connexion requise").

### S-32 Group settings

- **Purpose:** read-only rules with "Proposer un changement"; members and roles; invitations for approved members; meetings; announcements. The admin never edits rules directly (spec 1.4).
- **Entry:** Moi › Réglages du groupe; admin notifications.
- **Everyone sees:** `copy: groupSettings.rules` with `rulesHelp`, `rulesVersion` and each rule's current value (the same rows as S-07 step 4, not editable), any open rule vote (`openRuleVote`), "Proposer un changement" (to S-20), the members list (S-28), and for members `memberViewNote`.
- **Admin also sees:** `adminLimits` at the top; Invitations (`inviteFounding` before the first cycle, `inviteApproved_other` after a passed MEMBER_ADD, otherwise `noInvites` and `inviteNeedsVote`); `loansQueue` (S-22); `pinResets` (S-05); Réunions (S-24); Annonces (`newAnnouncement` → text → ConfirmationCard `postAnnouncement`, `announcementNote`); before the first cycle, `startCycle`.

### S-33 Notifications

- **Purpose:** all notifications with read state (spec 1.4, 1.8).
- **Entry:** the header bell. **Agent equivalent:** "Quoi de neuf ?"
- **Layout:** "Tout marquer comme lu" (text button); rows grouped Aujourd’hui / Hier / Plus anciennes: category icon, title (`bodyStrong` when unread, with an 8 dp `primary` dot), body (2 lines), time. Tapping opens the deep link (section 13) and marks it read.
- **States:** empty (`copy: notifications.empty`), push off on the phone (an info banner with `settings.pushOff` and "Ouvrir les réglages").

### S-34 Notification settings

- **Purpose:** categories, quiet hours, chat mute, media on Wi-Fi (spec 1.7, 1.8).
- **Layout:** `copy: notifications.settings.*`: "Ce que tu reçois" with one switch row per category and its help (`categoryHelp.*`); Sécurité on and disabled with `securityLocked`; "Heures calmes" with two time fields (default 21:00 to 07:00) and `quietHoursHelp`; "Couper les messages du groupe" with `muteChatHelp`; "Médias sur Wi-Fi uniquement" with `mediaWifiHelp`.
- **Web:** `webNote` at the top; the media row still applies.
- **Agent equivalent:** "Coupe les messages du groupe".

### S-35 Privacy

- **Purpose:** consent, export my data, delete my account with its conditions (spec 1.4, Part 7).
- **Layout** (`copy: privacy.*`): "Mon consentement" with `consentValue` and `readPolicy`; `whatOthersSee`; "Exporter mes données" → `export.preparing` → a download information card; "Supprimer mon compte" with `delete.conditions` and `delete.what`; `screenshots` note (phone only).
- **Delete:** if conditions fail, `delete.blocked` names the group and offers `leaveInstead` (ConfirmationCard `announceLeave`). If they pass, the destructive button opens the ConfirmationCard `deleteAccount` (L2, PIN sheet), then `delete.done` and the app returns to Welcome.

### S-36 Assistant history

- **Purpose:** what the agent looked at, prepared or did for me; nobody else can see it (spec 4.10).
- **Layout:** `copy: agentHistory.help`, filter chips (`filters.*`), rows: tool label (`agentHistory.tools.<tool>`), status (`status.*`) with icon, time; actions link to their ledger entry or card result.
- **States:** empty (`agentHistory.empty`).

### S-37 Language

- Three choice rows: Langue du téléphone, Français, English (`copy: language.*`) and the note that Njangi answers in the chosen language. The change applies at once, everywhere. **Agent equivalent:** "Parle-moi en anglais".

### S-38 Security and log out

- **Security** (`copy: security.*`): "Changer mon code PIN" (current PIN, new PIN twice, `pinChanged`); app lock settings (S-06, phone only); "Se déconnecter partout" with its help → a confirmation sheet (`copy: session.logoutEverywhere.*`) → all refresh tokens revoked → Welcome.
- **Log out** (Moi): a confirmation sheet (`copy: session.logout.*`); on log-out the persisted query cache is wiped (D4) and the app returns to Welcome.

---

## 13. Notification deep links

Every push also exists in Notifications (spec 1.8). Tapping one opens the right group first (switching if needed), then the destination below. Where the destination is the Njangi tab, the prefill appears as an agent message with matching chips (no AI call).

| Trigger (spec 2.13) | Category | Opens | Agent prefill |
|---|---|---|---|
| Reminder before the deadline | Rappels | Njangi | `notificationPrefill.reminderDue` + chip `pay` |
| Reminder the day after (fine notice) | Rappels | Njangi | `reminderLate` + `payNow`, `whyFine` |
| Installment due | Rappels | Njangi | `installmentDue` + `pay` |
| Payment received (payer) | Argent | Njangi, at the result event | — |
| Payment received (beneficiary) | Argent | Caisse › Tour | — |
| Your turn in 3 days | Argent | Njangi | `yourTurnSoon` + `payoutDetail` |
| Payout available | Argent | Withdraw sheet (S-27) over Njangi | `payoutOpen` + `withdraw` |
| Withdrawal completed | Argent | Ledger entry (S-14) | — |
| Fine assessed | Argent | Njangi | `fineAssessed` + `payNow`, `whyFine` |
| Loan request (admin) | Argent | Loan queue (S-22) | — |
| Loan decision | Argent | Mon prêt (S-21) | `loanDecision` |
| Vote opened | Votes | Proposal detail (S-19) | — |
| Vote reminder (24 h before close) | Votes | Proposal detail | `voteReminder` (when opened from the agent) |
| Vote result | Votes | Proposal detail, closed | — |
| Solidarity request | Votes | Proposal detail | — |
| Chat mention | Groupe | Groupe, at the message | — |
| New chat messages (unless muted) | Groupe | Groupe, at the unread divider | `missed` when 20+ unread |
| Meeting scheduled, agenda ready | Groupe | Meetings (S-24) | — |
| Minutes published | Groupe | Minutes (S-25) | — |
| Statement ready | Argent | Statements (S-31), the new row | `statementReady` |
| Payment number changed | Sécurité | Payment number (S-30) | — |
| PIN reset (member: done; admin or members: confirm) | Sécurité | S-05 confirmation sheet or Security | — |
| Daily check alert | Sécurité | Daily check sheet (S-17) | — |
| Withdrawals resumed | Sécurité | Caisse › Tour | — |

Notifications for a group the member has left open Moi › Relevés.

---

## 14. User journeys

Each journey uses the demo data (spec 5.5) and names the screens, cards and events in order.

### J-1 First launch → create a group → invite founding members → start the cycle

1. **S-01** splash, then **S-02** Welcome. Nkam taps "Créer une njangi".
2. **S-03** sign-up: name "Nkam Ticha"; login phone; payment number "Utiliser mon numéro de téléphone" (MTN detected); consent; PIN twice. "Bienvenue, Nkam".
3. **S-07**: name "Njangi des Collègues"; first payout samedi 28 novembre à 18 h, chaque mois (preview shows rounds 1 and 2); 10 000 FCFA and 1 000 FCFA; rules reviewed with defaults; summary with the admin note; "Créer le groupe". "Njangi des Collègues est créée".
4. **S-08**: "Inviter un membre" → Carine Fotso and her number → card "Créer une invitation" → invite link card → "Envoyer par WhatsApp". Repeated for each founder; the list shows "Invitation envoyée, expire …" then "A rejoint le groupe" as people join (J-2). The progress reads "10 membres sur 3 minimum" and `invite.founding.ready`.
5. "Démarrer le cycle" → card "Démarrer le cycle 1" (`startCycle.body_other`) → "Démarré" → `startCycle.drawn` ("Ordre tiré au sort. Bénéficiaire du tour 1 : Brice Tchakounté.") and the system event "Cycle 1 démarré…" in Groupe; the cycle-started EVENT (with its draw seed) in the Registre.
6. The app lands on the **S-10** Njangi tab with the first-run greeting; the status header shows "Tour 1 sur 10".

### J-2 Joining from an invite link

1. Carine receives on WhatsApp: `invite.shareMessage` ("Nkam Ticha t’invite dans la njangi « Njangi des Collègues » sur NjangiTrust…"). She taps the link.
2. **S-09** Invitation: who invites, the group facts, the rules, `rulesNote`. "Rejoindre Njangi des Collègues".
3. **S-03** sign-up with her phone prefilled and locked to the invited number; payment number; consent; PIN.
4. "Tu as rejoint Njangi des Collègues." The Njangi tab greets her (first run). The group sees "Carine Fotso a rejoint le groupe." in the chat.
5. Variants: link expired (`landing.expired`, ask Nkam for a new link), already used, wrong number, joined after the cycle started (`activeFromNextCycle`: she reads everything, pays from the next cycle).

### J-3 Paying a contribution by talking to the agent

1. Paul opens the app: **S-10**. Status header "Tour 4 sur 10 · Bénéficiaire : Carine · Ta cotisation : à payer"; briefing `greeting.owes`; chips `pay`, `howMuch`, `whoUnpaid`.
2. Paul types "Je dois combien ?". The typing dots, then "Je regarde ta situation…" (`get_my_overview`), then: "Tu dois 11 000 FCFA pour le tour 4 (10 000 de cotisation et 1 000 pour la caisse de secours), avant vendredi à 18 h. Je prépare le paiement ?"
3. Paul: "Oui". "Je prépare la carte à confirmer…" (`pay`), then one sentence ("Touche Payer pour recevoir la demande MTN sur ton téléphone.") and the **ConfirmationCard** "Payer ta cotisation": Cotisation, tour 4 10 000; Caisse de secours 1 000; Total 11 000 FCFA; note "Tu recevras une demande MTN sur 6•• •• •7 89."; [Annuler] [Payer 11 000 FCFA].
4. Paul taps "Payer 11 000 FCFA". The app calls the confirm endpoint directly (spec 4.5). The card turns to **processing**: "En attente de ta validation MTN…" with the help text. The status header line 3 becomes "en attente de MTN".
5. Paul approves on his phone's MTN prompt. A few seconds later `pendingAction.updated` arrives: the card turns to **done** "Payé" with "Réf. MP2611A9F2" and "Voir dans le registre"; the **result event** "Paiement de 11 000 FCFA : réussi, réf. MP2611A9F2." appears; the agent adds one next step. Status header: "Ta cotisation : payée".
6. Elsewhere, at the same moment: in Caisse › Tour on Carine's phone, Paul's dot fills with the 600 ms pulse (DS 6.7); the Groupe tab shows "Paul Mbarga a payé la cotisation du tour 4."; Carine receives the "payment received" notification.
7. **Failure variants:** MTN refuses (`failed.insufficientBalance`: "Paiement refusé par MTN" / "Vérifie ton solde, puis réessaie." with "Réessayer", result event `paymentFailed`); no approval in time (`failed.operatorTimeout`); operator silent after 10 minutes (`pendingLate`: keep checking 24 h, do not pay again); provider down (`providerUnavailable`); card not confirmed within 10 minutes (`expired`); Paul taps "Annuler" (`cancelled`); offline (button "Connexion requise"); two rounds overdue (the card proposes the oldest, note `oldestFirst` with "Modifier").

### J-4 Paying from the Caisse tab

1. Paul opens Caisse › Tour (**S-12**). "À payer (3)" is first, with his row and [Payer 11 000 FCFA].
2. Tapping it opens a bottom sheet with the same **ConfirmationCard**, prepared by the same endpoint (origin UI).
3. Processing and done exactly as J-3 in the sheet. When done, the sheet shows "Payé"; closing it shows Paul's row moved to "Payé (8)" and his dot filled (with the pulse, since the ring is on screen). The Njangi tab receives the same result event, so both places tell the same story.

### J-5 A beneficiary withdraws at payout time

1. Saturday 18:00, payout opens (`payout.open`). Auto-settlement runs first (R5.3): Carine's loan installment (16 750) and her fine (1 000) are taken from her payable; the Registre shows two "Retenue automatique" entries.
2. Carine gets "Payout available": the notification opens the **S-27** withdraw sheet over the Njangi tab, which shows the briefing `greeting.payoutOpen` ("Ton versement du tour 4 est disponible : 81 340 FCFA.") with chips `withdraw`, `payoutDetail`.
3. The sheet: the Ndop band at the top, "Ton versement du tour 4", Disponible 81 340 FCFA; "Comment ce montant est calculé" opens the breakdown: Cotisations reçues 100 000, Frais Mobile Money −910, Retenues automatiques −17 750 (Remboursement de prêt, 1 sur 2: 16 750; Amende, tour 3: 1 000), Net pour toi 81 340, with the auto-settlement note.
4. "Tout retirer" fills 80 840 FCFA (81 340 minus the 500 estimated fee). "Continuer" → **ConfirmationCard** "Retirer ton argent": Tu reçois 80 840, Frais estimés 500, total "Pris sur ton solde" 81 340; note "Envoi sur ton numéro MTN 6•• •• •3 21." → "Retirer 80 840 FCFA".
5. Processing "Envoi vers ton numéro 6•• •• •3 21…", then done "Retiré" with the reference; result event `withdrawalSuccess`; the Registre entry "Retrait" with −81 340 at the operator.
6. By voice instead: "Retire tout" in the Njangi tab gives the same card inline (eval scenario 8).
7. Variants: partial withdrawal (the rest stays reserved, `partialNote`), number-change hold (`withdraw.hold`), withdrawals paused (J-10), a withdrawal already in progress, nothing available before the payout time (`withdraw.locked`).

### J-6 Requesting a loan

1. Mireille says "Je veux emprunter 50 000 sur 3 mois". "Je prépare une simulation de prêt…" (`get_loan_quote`). The agent: her limit is 30 000 FCFA; it offers 30 000 (eval scenario 14).
2. She answers "D’accord, 30 000 sur 2 mois". The card "Demander un prêt": Montant emprunté 30 000; Intérêts, 5 % sur 2 mois 3 000; Frais estimés 500; Total à rembourser 33 500; "2 remboursements de 16 750 FCFA"; note `loanAdmin` → "Demander 30 000 FCFA" → done "Demandé"; result event `loanRequested`.
3. On screens instead: Caisse › Caisse générale › "Demander un prêt" → **S-21** with the slider and live quote → "Préparer la demande" → the same card in a sheet.
4. Nkam (admin) receives "Loan request" → **S-22**: Mireille, 30 000 sur 2 mois, fiabilité, dettes, cotisations payées → "Approuver 30 000 FCFA" (card) or "Refuser" with a reason.
5. Approved: the disbursement runs (hold rules apply); Mireille gets "Loan decision" and the result event `loanDisbursed`; **S-21** "Mon prêt" shows the schedule; the Registre shows "Prêt versé".
6. Variants: not eligible (active loan, overdue debt, leaving, zero limit, fund empty: the reason from `loans.notEligible.*`), the admin's own request (goes to an ADMIN_LOAN vote, `loanAdminVote`), no decision within 72 h (`status.EXPIRED`).

### J-7 Voting, normal and secret

**Normal (RULE_CHANGE, fine 1 000 → 1 500, 5 yes of 7 needed).**

1. Brice opens **S-18**: the card "Amende de retard : 1 000 → 1 500 FCFA", "5 oui sur 7 requis · 1 non", "Tu n’as pas encore voté", [Oui] [Non].
2. "Oui" opens the card "Voter oui": Actuellement 1 000 FCFA, Proposé 1 500 FCFA, Seuil 7 oui sur 10; note `voteFinal` → "Voter oui" → done "Voté"; result event `voteRecorded`. The card now says "Tu as voté oui" and "6 oui sur 7 requis".
3. When the seventh yes arrives, the vote closes early (R11.3): system event "Vote adopté : Amende de retard : 1 000 → 1 500 FCFA. 7 oui, 1 non."; the closed card shows "Adopté" and "S’appliquera au tour 5"; at round 5, "Appliqué au tour 5" and the rule-applied event.
4. By voice: "Vote oui pour la proposition sur l’amende" gives the same card inline (eval scenario 12).

**Secret (MEMBER_REMOVE).**

1. The card shows the "Vote secret" badge and only participation: "6 membres sur 9 ont voté", "Les totaux s’affichent à la clôture."; the member concerned sees `excludedTarget` instead of buttons.
2. Voting opens "Voter non" with the note `voteSecret` ("Vote secret : personne ne connaîtra ton choix, même l’admin.") → done "Voté"; result event `voteRecordedSecret`; the card says "Tu as voté. Ton choix reste secret."
3. No screen, export or agent answer ever shows who voted what (asking the agent "Comment Paul a voté ?" gets the secret-vote explanation, eval scenario 13). At the close, the totals appear with the result.

### J-8 Changing the payment number

1. Carine says "Change mon numéro pour 677 12 34 56" (or Moi › Numéro de paiement › Changer, **S-30**).
2. The card "Changer ton numéro de paiement" with `pinRequired`: Nouveau numéro 677 12 34 56 (her own number, shown in full to her only), MTN; notes `numberHold` ("Retraits et prêts vers ce numéro possibles après 48 heures.") and `numberAllGroups`.
3. "Changer le numéro" opens the **PIN sheet**; she types her PIN; the card goes to processing then "Changé"; result event `numberChanged` with the date withdrawals are possible again.
4. Every group she belongs to sees "Carine Fotso a mis à jour son numéro de paiement." (no digits); each admin is notified; her withdraw buttons show `withdraw.hold` until the hold ends, then the hold-release notification arrives. Her payments are unaffected.
5. Variants: someone asks the agent to change another member's number (refused, eval scenario 21); wrong PIN; same number.

### J-9 "Qu’est-ce que j’ai raté ?"

1. Paul opens Groupe after a few days: banner "34 messages non lus · Résumer".
2. "Résumer" switches to the Njangi tab and sends "Qu’est-ce que j’ai raté ?". Activity line "Je lis les messages du groupe…" (`summarize_unread`).
3. The agent answers in 3 to 8 short lines (spec 4.9): decisions (the fine vote passed), money events (7 members paid round 4), questions addressed to Paul, and media by sender ("3 photos et 2 notes vocales de Carine"); voice notes are listed, not transcribed.
4. The chat is marked read; the Groupe badge clears. A chip offers the open vote or the meeting if relevant.

### J-10 A daily check fails (withdrawals paused)

1. At 06:00 the reconciliation finds a difference and moves to ALERT (spec 2.9, R5.5). Every member gets a Sécurité notification (ignores quiet hours) and the group sees "Retraits en pause : la vérification du jour a trouvé un écart. Les paiements restent possibles."
2. **Caisse:** the check strip becomes the alert block at the top of every segment: "Vérification du jour : écart détecté, 06:00. Retraits en pause." with "Voir le détail" → **S-17** sheet: the balance at the operator, the money according to the records, the difference, and `alertBody`, `alertPayments`, `alertNext` in plain words.
3. **Njangi:** the status header's line 3 reads "Retraits en pause pour le groupe"; the briefing leads with `greeting.withdrawalsPaused`; chip `whyPaused`.
4. **Carine, the beneficiary:** the withdraw sheet and every "Retirer" button show `withdraw.paused`; asking the agent "Retire tout" returns the explanation, never a card; any card already prepared fails with `failed.withdrawalsPaused`.
5. **Paying still works:** contributions and their cards are unaffected, and say nothing alarming.
6. When resolved: the strip returns to "conforme", the group sees "Retraits rétablis : la vérification est conforme.", members get the "withdrawals resumed" notification, and Carine's withdraw button returns.


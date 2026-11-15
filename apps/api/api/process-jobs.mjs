var __defProp = Object.defineProperty;
var __export = (target, all) => {
  for (var name in all)
    __defProp(target, name, { get: all[name], enumerable: true });
};

// src/vercel-cron.ts
import { timingSafeEqual as timingSafeEqual2 } from "node:crypto";

// ../../packages/shared/src/lang.ts
var LANGS = ["fr", "en"];
function interpolate(template, params = {}) {
  return template.replace(/\{\{\s*(\w+)\s*\}\}/g, (_match, key) => {
    const value = params[key];
    if (value === void 0) throw new Error(`Missing text parameter: ${key}`);
    return String(value);
  });
}
function bilingual(template, params = {}) {
  const forLang = (lang) => Object.fromEntries(
    Object.entries(params).map(([key, value]) => [
      key,
      typeof value === "object" ? value[lang] : value
    ])
  );
  return {
    fr: interpolate(template.fr, forLang("fr")),
    en: interpolate(template.en, forLang("en"))
  };
}

// ../../packages/shared/src/money.ts
var NNBSP = "\u202F";
var NBSP = "\xA0";
var MINUS = "\u2212";
function assertFcfa(amount) {
  if (!Number.isSafeInteger(amount)) {
    throw new RangeError(`Amounts are whole francs CFA; got ${amount}`);
  }
}
function group(digits, separator) {
  let out = "";
  for (let i = 0; i < digits.length; i++) {
    if (i > 0 && (digits.length - i) % 3 === 0) out += separator;
    out += digits[i];
  }
  return out;
}
function formatAmount(amount, lang, options = {}) {
  assertFcfa(amount);
  const sign = amount < 0 ? MINUS : amount > 0 && options.sign === "always" ? "+" : "";
  const digits = String(Math.abs(amount));
  return sign + group(digits, lang === "fr" ? NNBSP : ",");
}
function formatXAF(amount, lang, options = {}) {
  return `${formatAmount(amount, lang, options)}${NBSP}FCFA`;
}

// ../../packages/shared/src/phone.ts
var PHONE_PATTERN = /(?:\+?237[\s.-]?)?6(?:[\s.-]?\d){8}/g;
function normalizeCameroonPhone(input2) {
  let digits = input2.replace(/[\s.\-()]/g, "");
  if (digits.startsWith("+")) digits = digits.slice(1);
  else if (digits.startsWith("00")) digits = digits.slice(2);
  if (!/^\d+$/.test(digits)) return null;
  if (digits.length === 12 && digits.startsWith("237")) digits = digits.slice(3);
  if (!/^6\d{8}$/.test(digits)) return null;
  return `+237${digits}`;
}
var DECIMAL_DIGIT = /\p{Nd}/u;
function digitValue(digit) {
  const cp = digit.codePointAt(0) ?? 0;
  let start = cp;
  while (cp - start < 60 && DECIMAL_DIGIT.test(String.fromCodePoint(start - 1))) start--;
  return (cp - start) % 10;
}
function foldDigits(text) {
  let folded = "";
  const starts = [];
  const ends = [];
  for (let i = 0; i < text.length; ) {
    const char = String.fromCodePoint(text.codePointAt(i) ?? 0);
    const unit = char.normalize("NFKC").replace(/\p{Nd}/gu, (digit) => /[0-9]/.test(digit) ? digit : String(digitValue(digit)));
    for (let k = 0; k < unit.length; k++) {
      starts.push(i);
      ends.push(i + char.length);
    }
    folded += unit;
    i += char.length;
  }
  return { folded, starts, ends };
}
function findPhoneNumbers(text) {
  const found = [];
  for (const match of foldDigits(text).folded.matchAll(PHONE_PATTERN)) {
    const normalized = normalizeCameroonPhone(match[0]);
    if (normalized) found.push(normalized);
  }
  return found;
}
var FULLY_MASKED = "6\u2022\u2022 \u2022\u2022 \u2022\u2022 \u2022\u2022";
function maskPhonesInText(text, allowedE164) {
  const { folded, starts, ends } = foldDigits(text);
  let out = "";
  let copiedTo = 0;
  for (const match of folded.matchAll(PHONE_PATTERN)) {
    const normalized = normalizeCameroonPhone(match[0]);
    if (normalized && allowedE164.includes(normalized)) continue;
    const from = starts[match.index] ?? 0;
    const to = ends[match.index + match[0].length - 1] ?? from;
    out += text.slice(copiedTo, from) + FULLY_MASKED;
    copiedTo = to;
  }
  return out + text.slice(copiedTo);
}
var DIGIT_SEPARATORS = /(?<=\d)[^\p{L}\p{N}]{1,3}(?=\d)/gu;
var NATIONAL_MOBILE = /6\d{8}/;
var DAY = "(?:0?[1-9]|[12]\\d|3[01])";
var MONTH = "(?:0?[1-9]|1[0-2])";
var YEAR = "20(?:2[4-9]|3[0-5])";
var CLOCK = "(?:[01]\\d|2[0-3])[:hH][0-5]\\d";
var DATE_WITH_TIME = new RegExp(
  `(?:${DAY}[/.\\-]${MONTH}[/.\\-]${YEAR}|${YEAR}-(?:0[1-9]|1[0-2])-(?:0[1-9]|[12]\\d|3[01]))(?:[ T]+${CLOCK})?(?!\\d)`,
  "giu"
);
var DIGIT_CHAIN_BEFORE = /\d[^\p{L}\p{N},;]{0,3}$/u;
var NUMBER_START_BEFORE = /6\d{3,7}[^\p{L}\p{N}]{0,3}$/u;
var NUMBER_BODY_AFTER = /^[^\p{L}\p{N}]{0,3}\d(?:[^\p{L}\p{N}]{0,3}\d){7}/u;
function continuesNumber(before) {
  return DIGIT_CHAIN_BEFORE.test(before) || NUMBER_START_BEFORE.test(before.replace(DIGIT_SEPARATORS, ""));
}
function setAsideDates(text) {
  return text.replace(
    DATE_WITH_TIME,
    (match, offset) => continuesNumber(text.slice(0, offset)) || NUMBER_BODY_AFTER.test(text.slice(offset + match.length)) ? match : "x"
  );
}
function withoutDates(text) {
  return setAsideDates(text.replace(/\p{Cf}/gu, ""));
}
function looksLikePhoneNumber(text) {
  const cleaned = foldDigits(text).folded.replace(/\p{Cf}/gu, "");
  return NATIONAL_MOBILE.test(setAsideDates(cleaned).replace(DIGIT_SEPARATORS, ""));
}

// ../../packages/shared/src/time.ts
var DOUALA_OFFSET_MINUTES = 60;
function toDouala(instant) {
  const ms = (instant instanceof Date ? instant : new Date(instant)).getTime();
  if (Number.isNaN(ms)) throw new RangeError(`Invalid date: ${String(instant)}`);
  const local = new Date(ms + DOUALA_OFFSET_MINUTES * 6e4);
  return {
    year: local.getUTCFullYear(),
    month: local.getUTCMonth() + 1,
    day: local.getUTCDate(),
    weekday: local.getUTCDay(),
    hour: local.getUTCHours(),
    minute: local.getUTCMinutes()
  };
}
var WEEKDAYS = {
  fr: ["dimanche", "lundi", "mardi", "mercredi", "jeudi", "vendredi", "samedi"],
  en: ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"]
};
var MONTHS = {
  fr: [
    "janvier",
    "f\xE9vrier",
    "mars",
    "avril",
    "mai",
    "juin",
    "juillet",
    "ao\xFBt",
    "septembre",
    "octobre",
    "novembre",
    "d\xE9cembre"
  ],
  en: [
    "January",
    "February",
    "March",
    "April",
    "May",
    "June",
    "July",
    "August",
    "September",
    "October",
    "November",
    "December"
  ]
};
var pad = (n) => String(n).padStart(2, "0");
function twelveHour(hour) {
  return { h: hour % 12 === 0 ? 12 : hour % 12, suffix: hour < 12 ? "am" : "pm" };
}
function formatDateLong(instant, lang, options = {}) {
  const p = toDouala(instant);
  const year = options.withYear ? ` ${p.year}` : "";
  return `${WEEKDAYS[lang][p.weekday]} ${p.day} ${MONTHS[lang][p.month - 1]}${year}`;
}
function formatTimeSpoken(instant, lang) {
  const { hour, minute } = toDouala(instant);
  if (lang === "fr") return minute === 0 ? `${hour} h` : `${hour} h ${pad(minute)}`;
  const { h, suffix } = twelveHour(hour);
  return minute === 0 ? `${h} ${suffix}` : `${h}:${pad(minute)} ${suffix}`;
}
function formatDateTime(instant, lang, options = {}) {
  const joiner = lang === "fr" ? "\xE0" : "at";
  return `${formatDateLong(instant, lang, options)} ${joiner} ${formatTimeSpoken(instant, lang)}`;
}

// ../../packages/shared/src/contracts/auth.ts
import { z as z3 } from "zod";

// ../../packages/shared/src/contracts/common.ts
import { z } from "zod";
var FIELD_CODES = {
  INVALID_PHONE: "INVALID_PHONE",
  INVALID_PIN: "INVALID_PIN",
  NAME_CONTAINS_PHONE: "NAME_CONTAINS_PHONE",
  TEXT_CONTAINS_PHONE: "TEXT_CONTAINS_PHONE",
  INVALID_TEXT: "INVALID_TEXT"
};
var uuidSchema = z.string().uuid();
var languageSchema = z.enum(LANGS);
var phoneSchema = z.string().max(32).transform((value, ctx) => {
  const normalized = normalizeCameroonPhone(value);
  if (!normalized) {
    ctx.addIssue({ code: "custom", message: FIELD_CODES.INVALID_PHONE });
    return z.NEVER;
  }
  return normalized;
});
var pinSchema = z.string().regex(/^\d{6}$/, FIELD_CODES.INVALID_PIN);
var CONTROL_CHARS = /[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/;
function containsPhoneNumber(text) {
  const folded = text.normalize("NFKC");
  if (/[^\P{Nd}0-9]/u.test(folded)) return true;
  const scanned = withoutDates(folded);
  return findPhoneNumbers(scanned).length > 0 || looksLikePhoneNumber(scanned);
}
function textSchema(max) {
  return z.string().transform((v) => v.normalize("NFKC").trim()).pipe(z.string().min(1).max(max)).refine((v) => !CONTROL_CHARS.test(v), FIELD_CODES.INVALID_TEXT).refine((v) => !containsPhoneNumber(v), FIELD_CODES.TEXT_CONTAINS_PHONE);
}
function nameSchema(max = 60) {
  return z.string().transform((v) => v.normalize("NFKC").trim()).pipe(z.string().min(2).max(max)).refine((v) => !CONTROL_CHARS.test(v) && !/[\r\n\t]/.test(v), FIELD_CODES.INVALID_TEXT).refine(
    (v) => !containsPhoneNumber(v) && !/\p{Nd}{5,}/u.test(v),
    FIELD_CODES.NAME_CONTAINS_PHONE
  );
}
var instantSchema = z.string().datetime({ offset: true });
var bilingualSchema = z.strictObject({ fr: z.string(), en: z.string() });
var fcfaSchema = z.number().int().refine(Number.isSafeInteger);
var apiErrorSchema = z.strictObject({
  code: z.string(),
  messageFr: z.string(),
  messageEn: z.string(),
  details: z.record(z.string(), z.unknown()).optional()
});

// ../../packages/shared/src/contracts/me.ts
import { z as z2 } from "zod";
var operatorSchema = z2.enum(["MTN", "ORANGE", "UNKNOWN"]);
var payableOperatorSchema = z2.enum(["MTN", "ORANGE"]);
var ownPaymentNumberSchema = z2.strictObject({
  /** E.164, the member's own number. */
  number: z2.string(),
  /** `6•• •• •7 89` for compact display. */
  masked: z2.string(),
  operator: operatorSchema,
  activeFrom: instantSchema
});
var selfSchema = z2.strictObject({
  id: uuidSchema,
  name: z2.string(),
  /** The member's own login phone, E.164. */
  phone: z2.string(),
  language: languageSchema,
  consentVersion: z2.string(),
  consentAt: instantSchema,
  paymentNumber: ownPaymentNumberSchema.nullable(),
  createdAt: instantSchema
});
var updateMeRequestSchema = z2.strictObject({ name: nameSchema().optional(), language: languageSchema.optional() }).refine((v) => v.name !== void 0 || v.language !== void 0, "EMPTY_UPDATE");
var membershipRoleSchema = z2.enum(["ADMIN", "MEMBER"]);
var membershipStatusSchema = z2.enum(["INVITED", "ACTIVE", "LEAVING", "LEFT", "REMOVED"]);
var groupStatusSchema = z2.enum(["FORMING", "ACTIVE", "CLOSED"]);
var myGroupSchema = z2.strictObject({
  groupId: uuidSchema,
  name: z2.string(),
  status: groupStatusSchema,
  membershipId: uuidSchema,
  role: membershipRoleSchema,
  membershipStatus: membershipStatusSchema,
  memberCount: z2.number().int()
});
var myGroupsResponseSchema = z2.strictObject({ groups: z2.array(myGroupSchema) });
var devicePlatformSchema = z2.enum(["ANDROID", "IOS", "WEB"]);
var registerDeviceRequestSchema = z2.strictObject({
  platform: devicePlatformSchema,
  /** Expo push token; absent on web (D1). */
  expoPushToken: z2.string().regex(/^(ExponentPushToken|ExpoPushToken)\[[A-Za-z0-9_-]{10,200}\]$/).optional()
});
var deviceSchema = z2.strictObject({
  id: uuidSchema,
  platform: devicePlatformSchema,
  pushEnabled: z2.boolean(),
  lastSeenAt: instantSchema
});

// ../../packages/shared/src/contracts/auth.ts
var signupRequestSchema = z3.strictObject({
  name: nameSchema(),
  phone: phoneSchema,
  /** Defaults to the login phone. The operator is detected when omitted. */
  paymentNumber: z3.strictObject({ number: phoneSchema, operator: payableOperatorSchema.optional() }).optional(),
  consent: z3.literal(true),
  consentVersion: z3.string().min(1).max(20),
  pin: pinSchema,
  language: languageSchema.optional()
});
var loginRequestSchema = z3.strictObject({ phone: phoneSchema, pin: pinSchema });
var refreshTokenSchema = z3.string().min(40).max(200);
var refreshRequestSchema = z3.strictObject({ refreshToken: refreshTokenSchema.optional() });
var pinChangeRequestSchema = z3.strictObject({ currentPin: pinSchema, newPin: pinSchema });
var pinResetRequestSchema = z3.strictObject({ phone: phoneSchema });
var pinResetCompleteRequestSchema = z3.strictObject({
  phone: phoneSchema,
  newPin: pinSchema
});
var sessionSchema = z3.strictObject({
  accessToken: z3.string(),
  accessTokenExpiresAt: instantSchema,
  /** Mobile only. Web clients receive it as an httpOnly cookie. */
  refreshToken: z3.string().optional(),
  refreshTokenExpiresAt: instantSchema
});
var authResponseSchema = z3.strictObject({ user: selfSchema, session: sessionSchema });
var refreshResponseSchema = z3.strictObject({ session: sessionSchema });
var pinResetRequestedSchema = z3.strictObject({ status: z3.literal("REQUESTED") });
var pinResetLinkPreviewSchema = z3.strictObject({
  name: z3.string(),
  expiresAt: instantSchema
});
var pinResetRequestItemSchema = z3.strictObject({
  id: uuidSchema,
  memberName: z3.string(),
  membershipId: uuidSchema,
  requestedAt: instantSchema,
  expiresAt: instantSchema,
  confirmationsNeeded: z3.number().int(),
  confirmationsGiven: z3.number().int(),
  confirmedByMe: z3.boolean()
});
var pinResetRequestListSchema = z3.strictObject({
  requests: z3.array(pinResetRequestItemSchema)
});
var pinResetApprovalResultSchema = z3.strictObject({
  approved: z3.boolean(),
  link: z3.string().optional(),
  /** D14: usable only from this time, 24 hours after approval. */
  linkUsableFrom: instantSchema.optional(),
  linkExpiresAt: instantSchema.optional()
});

// src/lib/clock.ts
var systemTime = () => /* @__PURE__ */ new Date();
var source = systemTime;
var clock = {
  /** The current instant (UTC). */
  now() {
    return source();
  },
  /** Milliseconds since the epoch, for durations. */
  nowMs() {
    return source().getTime();
  }
};

// src/lib/prisma.ts
import { PrismaPg } from "@prisma/adapter-pg";

// generated/prisma/client.ts
import * as path from "node:path";
import { fileURLToPath } from "node:url";

// generated/prisma/internal/class.ts
import * as runtime from "@prisma/client/runtime/client";
var config = {
  "previewFeatures": [],
  "clientVersion": "7.10.1",
  "engineVersion": "d1b3f377ca835d73fd50954a5e22128b9ebdd6b8",
  "activeProvider": "postgresql",
  "inlineSchema": '// The agent\'s conversations and the confirmation protocol (spec 2.4, 4.2, 4.5, 4.10).\n\nenum AgentChannel {\n  PRIVATE\n  GROUP\n}\n\nmodel AgentConversation {\n  id             String       @id @default(uuid()) @db.Uuid\n  createdAt      DateTime     @default(now()) @db.Timestamptz(3)\n  updatedAt      DateTime     @updatedAt @db.Timestamptz(3)\n  userId         String       @db.Uuid\n  user           User         @relation(fields: [userId], references: [id], onDelete: Cascade)\n  /// The active group of the conversation; null only before the member joins a group.\n  groupId        String?      @db.Uuid\n  group          Group?       @relation(fields: [groupId], references: [id], onDelete: Restrict)\n  channel        AgentChannel\n  rollingSummary String?\n\n  messages AgentMessage[]\n\n  @@index([userId, channel])\n}\n\nenum AgentMessageRole {\n  user\n  assistant\n  tool\n}\n\nenum ToolCallStatus {\n  OK\n  REFUSED\n  INVALID\n  ERROR\n}\n\n/// Phone numbers are redacted from stored content and tool arguments (4.8 point 7).\nmodel AgentMessage {\n  id               String            @id @default(uuid()) @db.Uuid\n  createdAt        DateTime          @default(now()) @db.Timestamptz(3)\n  conversationId   String            @db.Uuid\n  conversation     AgentConversation @relation(fields: [conversationId], references: [id], onDelete: Cascade)\n  role             AgentMessageRole\n  content          String\n  toolName         String?\n  toolArgsRedacted Json?\n  toolStatus       ToolCallStatus?\n\n  @@index([conversationId, createdAt])\n}\n\nenum ActionLevel {\n  L1\n  L2\n}\n\nenum ActionOrigin {\n  AGENT\n  UI\n}\n\nenum PendingActionStatus {\n  PENDING\n  /// Confirmed and executing; stays here while a provider operation is in progress.\n  CONFIRMED\n  CANCELLED\n  EXPIRED\n  DONE\n  FAILED\n}\n\n/// Spec 4.5: every action that moves money or changes the group. The preview is built by the\n/// server; the app draws the confirmation card from it, never from the AI\'s text. Only the owner\n/// confirms, through the app (POST /v1/pending-actions/:id/confirm); the LLM has no path to it.\nmodel PendingAction {\n  id            String              @id @default(uuid()) @db.Uuid\n  createdAt     DateTime            @default(now()) @db.Timestamptz(3)\n  userId        String              @db.Uuid\n  user          User                @relation(fields: [userId], references: [id], onDelete: Cascade)\n  groupId       String?             @db.Uuid\n  group         Group?              @relation(fields: [groupId], references: [id], onDelete: Restrict)\n  type          String\n  /// Normalised by the handler; never a raw phone number, PIN or token.\n  args          Json\n  preview       Json\n  level         ActionLevel\n  status        PendingActionStatus @default(PENDING)\n  origin        ActionOrigin\n  expiresAt     DateTime            @db.Timestamptz(3)\n  confirmedAt   DateTime?           @db.Timestamptz(3)\n  completedAt   DateTime?           @db.Timestamptz(3)\n  /// The record the action produced (payment, invite, vote receipt, ...).\n  resultRef     String?\n  /// Short bilingual result shown on the card ("Pay\xE9, r\xE9f. MP2611\u2026").\n  resultSummary Json?\n  failureCode   String?\n  failureText   Json?\n\n  @@index([userId, status])\n  @@index([status, expiresAt])\n}\n\n// Audit log (spec 2.4, 2.10, R1.2): security and admin actions. Details are redacted before\n// they are written: no PIN, token or phone number ever reaches this table.\n\nmodel AuditLog {\n  id          String   @id @default(uuid()) @db.Uuid\n  createdAt   DateTime @default(now()) @db.Timestamptz(3)\n  actorUserId String?  @db.Uuid\n  actor       User?    @relation(fields: [actorUserId], references: [id], onDelete: SetNull)\n  groupId     String?  @db.Uuid\n  group       Group?   @relation(fields: [groupId], references: [id], onDelete: Restrict)\n  /// Stable dotted name: `auth.login.failed`, `invite.created`, `pin.reset.completed`, ...\n  action      String\n  /// The affected record, as `<Model>:<id>`.\n  target      String?\n  details     Json     @default("{}")\n  deviceId    String?  @db.Uuid\n  requestId   String?\n\n  @@index([actorUserId, createdAt])\n  @@index([groupId, createdAt])\n  @@index([action, createdAt])\n}\n\n// NjangiTrust database schema (spec 2.4 plus docs/DECISIONS.md D7), one file per domain:\n// base, identity, groups, money, ledger, governance, chat, meetings, notifications, agent, audit.\n//\n// Conventions\n// - Every table has a UUID `id` and `createdAt`. Times are stored in UTC (timestamptz).\n// - Money fields are Int: whole francs CFA, never decimals (CLAUDE.md rule 1).\n// - Rules that a constraint can enforce are enforced here or in hand-written SQL migrations\n//   (partial unique indexes, ledger immutability triggers, grants). See prisma/migrations.\n// - Create migrations with `pnpm db:migrate:create` and review the SQL: Prisma does not know the\n//   hand-written partial indexes and must never be allowed to drop them.\n\ngenerator client {\n  provider = "prisma-client"\n  output   = "../../generated/prisma"\n}\n\ndatasource db {\n  provider = "postgresql"\n}\n\nenum Language {\n  fr\n  en\n}\n\n/// R13.1. UNKNOWN only when the operator could not be detected; the member picks MTN or ORANGE.\nenum Operator {\n  MTN\n  ORANGE\n  UNKNOWN\n}\n\n/// Which client a session or device belongs to (D1: mobile keeps tokens in SecureStore, web in a cookie).\nenum ClientKind {\n  MOBILE\n  WEB\n}\n\n// Group chat and media (spec 2.4, 2.12, D7 UploadTicket, D9 thumbnails).\n\nenum MessageKind {\n  TEXT\n  IMAGE\n  VIDEO\n  DOCUMENT\n  VOICE\n  SYSTEM\n  AGENT\n}\n\nmodel Message {\n  id                 String      @id @default(uuid()) @db.Uuid\n  createdAt          DateTime    @default(now()) @db.Timestamptz(3)\n  groupId            String      @db.Uuid\n  group              Group       @relation(fields: [groupId], references: [id], onDelete: Restrict)\n  /// Null for SYSTEM and AGENT messages.\n  authorMembershipId String?     @db.Uuid\n  author             Membership? @relation(fields: [authorMembershipId], references: [id], onDelete: Restrict)\n  kind               MessageKind\n  /// A member\'s text as typed, or the agent\'s reply.\n  text               String?\n  /// SYSTEM events, written by the server in both languages: { fr, en }.\n  systemText         Json?\n  attachmentId       String?     @unique @db.Uuid\n  attachment         Attachment? @relation(fields: [attachmentId], references: [id], onDelete: SetNull)\n  replyToId          String?     @db.Uuid\n  replyTo            Message?    @relation("MessageReplies", fields: [replyToId], references: [id], onDelete: SetNull)\n  replies            Message[]   @relation("MessageReplies")\n  /// Mentioned membership IDs.\n  mentions           String[]    @db.Uuid\n  /// Pinned announcement posted by the admin (R1.2).\n  isAnnouncement     Boolean     @default(false)\n  deletedAt          DateTime?   @db.Timestamptz(3)\n  hiddenByAdminAt    DateTime?   @db.Timestamptz(3)\n\n  @@index([groupId, createdAt])\n}\n\nenum AttachmentKind {\n  IMAGE\n  VIDEO\n  DOCUMENT\n  VOICE\n}\n\nmodel Attachment {\n  id                   String         @id @default(uuid()) @db.Uuid\n  createdAt            DateTime       @default(now()) @db.Timestamptz(3)\n  groupId              String         @db.Uuid\n  group                Group          @relation(fields: [groupId], references: [id], onDelete: Restrict)\n  uploaderMembershipId String         @db.Uuid\n  uploader             Membership     @relation(fields: [uploaderMembershipId], references: [id], onDelete: Restrict)\n  kind                 AttachmentKind\n  /// The type detected from the file\'s bytes after upload, not the one the phone declared.\n  mime                 String\n  sizeBytes            Int\n  durationSec          Int?\n  width                Int?\n  height               Int?\n  storageKey           String         @unique\n  /// D9: 320 px preview of chat images.\n  thumbnailKey         String?        @unique\n  message              Message?\n\n  @@index([groupId, createdAt])\n}\n\n/// D7, spec 2.12: one presigned upload. The attachment exists only once the real file type has\n/// been checked after upload.\nmodel UploadTicket {\n  id           String         @id @default(uuid()) @db.Uuid\n  createdAt    DateTime       @default(now()) @db.Timestamptz(3)\n  userId       String         @db.Uuid\n  user         User           @relation(fields: [userId], references: [id], onDelete: Cascade)\n  groupId      String         @db.Uuid\n  group        Group          @relation(fields: [groupId], references: [id], onDelete: Restrict)\n  kind         AttachmentKind\n  declaredMime String\n  maxBytes     Int\n  storageKey   String         @unique\n  thumbnailKey String?        @unique\n  expiresAt    DateTime       @db.Timestamptz(3)\n  completedAt  DateTime?      @db.Timestamptz(3)\n  attachmentId String?        @unique @db.Uuid\n\n  @@index([userId, createdAt])\n}\n\n/// Durable, idempotent work items for serverless cron processing.\nmodel DeploymentJob {\n  id          String    @id @db.Uuid\n  name        String    @db.VarChar(200)\n  jobKey      String    @db.VarChar(200)\n  payload     Json      @db.JsonB\n  runAt       DateTime  @db.Timestamptz(6)\n  status      String    @default("PENDING") @db.VarChar(16)\n  attempts    Int       @default(0)\n  maxAttempts Int       @default(3)\n  leaseUntil  DateTime? @db.Timestamptz(6)\n  leaseToken  String?   @db.Uuid\n  lastError   String?   @db.VarChar(1000)\n  createdAt   DateTime  @default(now()) @db.Timestamptz(6)\n  updatedAt   DateTime  @updatedAt @db.Timestamptz(6)\n\n  @@unique([name, jobKey])\n  @@index([status, runAt, createdAt])\n  @@index([status, leaseUntil])\n}\n\n// Governance: proposals, votes and solidarity requests (spec 2.4, R10, R11).\n//\n// Secret ballots (R11.5): a secret vote writes a VoteReceipt (that the member voted) and increments\n// a counter on the Proposal in one database transaction. No Ballot row exists for a secret\n// proposal; a trigger refuses one (migration 20261102000100_database_protections).\n\nenum ProposalType {\n  RULE_CHANGE\n  MEMBER_ADD\n  MEMBER_REMOVE\n  ROTATION_CHANGE\n  ADMIN_CHANGE\n  EARLY_EXIT\n  ADMIN_LOAN\n  SOLIDARITY_PAYOUT\n  FINE_WAIVER\n  LEDGER_CORRECTION\n}\n\nenum ThresholdKind {\n  MAJORITY\n  TWO_THIRDS\n}\n\nenum ProposalStatus {\n  OPEN\n  PASSED\n  REJECTED\n  EXPIRED\n}\n\nmodel Proposal {\n  id                       String         @id @default(uuid()) @db.Uuid\n  createdAt                DateTime       @default(now()) @db.Timestamptz(3)\n  groupId                  String         @db.Uuid\n  group                    Group          @relation(fields: [groupId], references: [id], onDelete: Restrict)\n  type                     ProposalType\n  /// Type-specific, validated by zod. Never holds a phone number: MEMBER_ADD keeps a keyed hash.\n  payload                  Json\n  reason                   String?\n  proposerMembershipId     String         @db.Uuid\n  proposer                 Membership     @relation("ProposalProposer", fields: [proposerMembershipId], references: [id], onDelete: Restrict)\n  secret                   Boolean\n  thresholdKind            ThresholdKind\n  /// 3.1: active members when the proposal is created, minus the exclusions of its type.\n  eligibleMembershipIds    String[]       @db.Uuid\n  /// The member the proposal is about: removal target, new admin, leaver, fined member, borrowing\n  /// admin. One open proposal per type and subject (partial unique index in SQL).\n  subjectMembershipId      String?        @db.Uuid\n  subject                  Membership?    @relation("ProposalSubject", fields: [subjectMembershipId], references: [id], onDelete: Restrict)\n  /// ROTATION_CHANGE: members whose turn moves; each must vote yes (R11.1).\n  mustApproveMembershipIds String[]       @db.Uuid\n  /// votes.remind sent (24 h before the close).\n  remindedAt               DateTime?      @db.Timestamptz(3)\n  /// Counters; for secret proposals the only record of the choices (R11.5).\n  yesCount                 Int            @default(0)\n  noCount                  Int            @default(0)\n  opensAt                  DateTime       @db.Timestamptz(3)\n  closesAt                 DateTime       @db.Timestamptz(3)\n  status                   ProposalStatus @default(OPEN)\n  closedAt                 DateTime?      @db.Timestamptz(3)\n  appliedAt                DateTime?      @db.Timestamptz(3)\n  /// What the passed proposal did, in both languages ("Appliqu\xE9 au tour 5").\n  effect                   Json?\n\n  voteReceipts      VoteReceipt[]\n  ballots           Ballot[]\n  invites           Invite[]\n  ruleSets          RuleSet[]\n  loan              Loan?\n  solidarityRequest SolidarityRequest?\n\n  @@index([groupId, status])\n  @@index([status, closesAt])\n}\n\n/// R11.4, R11.5: records that a member voted, never what.\nmodel VoteReceipt {\n  id           String     @id @default(uuid()) @db.Uuid\n  createdAt    DateTime   @default(now()) @db.Timestamptz(3)\n  proposalId   String     @db.Uuid\n  proposal     Proposal   @relation(fields: [proposalId], references: [id], onDelete: Restrict)\n  membershipId String     @db.Uuid\n  membership   Membership @relation(fields: [membershipId], references: [id], onDelete: Restrict)\n  votedAt      DateTime   @default(now()) @db.Timestamptz(3)\n\n  @@unique([proposalId, membershipId])\n}\n\nenum VoteChoice {\n  YES\n  NO\n}\n\n/// Only for non-secret proposals.\nmodel Ballot {\n  id           String     @id @default(uuid()) @db.Uuid\n  createdAt    DateTime   @default(now()) @db.Timestamptz(3)\n  proposalId   String     @db.Uuid\n  proposal     Proposal   @relation(fields: [proposalId], references: [id], onDelete: Restrict)\n  membershipId String     @db.Uuid\n  membership   Membership @relation(fields: [membershipId], references: [id], onDelete: Restrict)\n  choice       VoteChoice\n  castAt       DateTime   @default(now()) @db.Timestamptz(3)\n\n  @@unique([proposalId, membershipId])\n}\n\nenum SolidarityEvent {\n  DEUIL\n  NAISSANCE\n  MALADIE\n  MARIAGE\n  AUTRE\n}\n\nenum SolidarityRequestStatus {\n  VOTING\n  APPROVED\n  REJECTED\n  PAID\n  FAILED\n}\n\n/// R10: a SOLIDARITY_PAYOUT vote; if passed, the money goes to the recipient\'s number.\nmodel SolidarityRequest {\n  id                    String                  @id @default(uuid()) @db.Uuid\n  createdAt             DateTime                @default(now()) @db.Timestamptz(3)\n  groupId               String                  @db.Uuid\n  group                 Group                   @relation(fields: [groupId], references: [id], onDelete: Restrict)\n  requesterMembershipId String                  @db.Uuid\n  requester             Membership              @relation("SolidarityRequester", fields: [requesterMembershipId], references: [id], onDelete: Restrict)\n  recipientMembershipId String                  @db.Uuid\n  recipient             Membership              @relation("SolidarityRecipient", fields: [recipientMembershipId], references: [id], onDelete: Restrict)\n  event                 SolidarityEvent\n  amount                Int\n  /// Optional, visible only to the group (R10.2).\n  note                  String?\n  proposalId            String?                 @unique @db.Uuid\n  proposal              Proposal?               @relation(fields: [proposalId], references: [id], onDelete: Restrict)\n  status                SolidarityRequestStatus @default(VOTING)\n  disbursementId        String?                 @unique @db.Uuid\n  disbursement          Disbursement?           @relation(fields: [disbursementId], references: [id], onDelete: Restrict)\n\n  @@index([groupId, status])\n}\n\n// Groups, memberships, invites and rule sets (spec 2.4, 2.10, R1, R11.7, R12).\n\nenum GroupStatus {\n  /// Before the first cycle: the admin invites founding members directly (R1.6).\n  FORMING\n  /// From the first cycle on: new members join only through a passed MEMBER_ADD (R12.1).\n  ACTIVE\n  CLOSED\n}\n\nmodel Group {\n  id              String      @id @default(uuid()) @db.Uuid\n  createdAt       DateTime    @default(now()) @db.Timestamptz(3)\n  updatedAt       DateTime    @updatedAt @db.Timestamptz(3)\n  name            String\n  status          GroupStatus @default(FORMING)\n  createdByUserId String      @db.Uuid\n  createdBy       User        @relation("GroupCreator", fields: [createdByUserId], references: [id], onDelete: Restrict)\n  /// Planned first payout, chosen at creation; the first cycle starts from it (R2.2).\n  firstPayoutAt   DateTime    @db.Timestamptz(3)\n  currentCycleId  String?     @unique @db.Uuid\n  currentCycle    Cycle?      @relation("GroupCurrentCycle", fields: [currentCycleId], references: [id], onDelete: Restrict)\n  /// Which provider account holds this group\'s money (2.5 invariant 6).\n  providerAccount String      @default("default")\n\n  memberships        Membership[]\n  invites            Invite[]\n  ruleSets           RuleSet[]\n  cycles             Cycle[]             @relation("GroupCycles")\n  rounds             Round[]\n  obligations        Obligation[]\n  paymentIntents     PaymentIntent[]\n  disbursements      Disbursement[]\n  loans              Loan[]\n  ledgerTransactions LedgerTransaction[]\n  proposals          Proposal[]\n  solidarityRequests SolidarityRequest[]\n  meetings           Meeting[]\n  messages           Message[]\n  attachments        Attachment[]\n  notifications      Notification[]\n  pendingActions     PendingAction[]\n  conversations      AgentConversation[]\n  auditLogs          AuditLog[]\n  uploadTickets      UploadTicket[]\n}\n\nenum MembershipRole {\n  ADMIN\n  MEMBER\n}\n\nenum MembershipStatus {\n  /// Joined through an invite after the first cycle: reads the chat and the ledger at once,\n  /// becomes ACTIVE (with obligations) at the start of `activeFromCycle` (R12.1).\n  INVITED\n  ACTIVE\n  /// Announced leaving at the end of the cycle; keeps every obligation and right until then (R12.2).\n  LEAVING\n  LEFT\n  REMOVED\n}\n\n/// One person in one group. R1.1: exactly one admin per group (partial unique index in SQL).\nmodel Membership {\n  id              String           @id @default(uuid()) @db.Uuid\n  createdAt       DateTime         @default(now()) @db.Timestamptz(3)\n  groupId         String           @db.Uuid\n  group           Group            @relation(fields: [groupId], references: [id], onDelete: Restrict)\n  userId          String           @db.Uuid\n  user            User             @relation(fields: [userId], references: [id], onDelete: Restrict)\n  role            MembershipRole   @default(MEMBER)\n  status          MembershipStatus\n  activeFromCycle Int?\n  leftAt          DateTime?        @db.Timestamptz(3)\n  chatLastReadAt  DateTime?        @db.Timestamptz(3)\n\n  invitesCreated      Invite[]            @relation("InviteCreatedBy")\n  obligations         Obligation[]        @relation("ObligationDebtor")\n  credits             Obligation[]        @relation("ObligationCreditor")\n  paymentIntents      PaymentIntent[]\n  disbursements       Disbursement[]\n  loans               Loan[]\n  bids                Bid[]\n  beneficiaryRounds   Round[]\n  statements          Statement[]\n  ledgerTransactions  LedgerTransaction[]\n  proposals           Proposal[]          @relation("ProposalProposer")\n  proposalsAbout      Proposal[]          @relation("ProposalSubject")\n  voteReceipts        VoteReceipt[]\n  ballots             Ballot[]\n  solidarityRequested SolidarityRequest[] @relation("SolidarityRequester")\n  solidarityReceived  SolidarityRequest[] @relation("SolidarityRecipient")\n  agendaItems         AgendaItem[]\n  attendances         Attendance[]\n  messages            Message[]\n  attachments         Attachment[]\n  pinResetApprovals   PinResetApproval[]\n\n  @@unique([groupId, userId])\n  @@index([userId, status])\n  @@index([groupId, status])\n}\n\n/// Spec 2.10: single use, 72 hours, tied to the invited phone. The phone is stored only as a keyed\n/// hash (HMAC) and the link token only as SHA-256, so neither can be read back from the database.\nmodel Invite {\n  id                    String     @id @default(uuid()) @db.Uuid\n  createdAt             DateTime   @default(now()) @db.Timestamptz(3)\n  groupId               String     @db.Uuid\n  group                 Group      @relation(fields: [groupId], references: [id], onDelete: Restrict)\n  /// The passed MEMBER_ADD; null for a founding member invited before the first cycle (R1.6).\n  proposalId            String?    @db.Uuid\n  proposal              Proposal?  @relation(fields: [proposalId], references: [id], onDelete: Restrict)\n  inviteeName           String\n  phoneHash             String\n  tokenHash             String     @unique\n  expiresAt             DateTime   @db.Timestamptz(3)\n  usedAt                DateTime?  @db.Timestamptz(3)\n  acceptedByUserId      String?    @db.Uuid\n  acceptedBy            User?      @relation("InviteAcceptedBy", fields: [acceptedByUserId], references: [id], onDelete: Restrict)\n  revokedAt             DateTime?  @db.Timestamptz(3)\n  createdByMembershipId String     @db.Uuid\n  createdBy             Membership @relation("InviteCreatedBy", fields: [createdByMembershipId], references: [id], onDelete: Restrict)\n\n  @@index([groupId, usedAt])\n  @@index([proposalId])\n}\n\n/// 3.2, R11: versioned rule sets. `params` is validated by @njangi/rules before every write.\nmodel RuleSet {\n  id                   String    @id @default(uuid()) @db.Uuid\n  createdAt            DateTime  @default(now()) @db.Timestamptz(3)\n  groupId              String    @db.Uuid\n  group                Group     @relation(fields: [groupId], references: [id], onDelete: Restrict)\n  version              Int\n  params               Json\n  effectiveFromRoundId String?   @db.Uuid\n  effectiveFromRound   Round?    @relation(fields: [effectiveFromRoundId], references: [id], onDelete: Restrict)\n  createdByProposalId  String?   @db.Uuid\n  createdByProposal    Proposal? @relation(fields: [createdByProposalId], references: [id], onDelete: Restrict)\n\n  @@unique([groupId, version])\n}\n\n// Identity: users, devices, payment numbers, sessions and PIN resets (spec 2.4, 2.10, R13, D7, D8).\n\nmodel User {\n  id             String    @id @default(uuid()) @db.Uuid\n  createdAt      DateTime  @default(now()) @db.Timestamptz(3)\n  updatedAt      DateTime  @updatedAt @db.Timestamptz(3)\n  name           String\n  /// E.164 `+2376XXXXXXXX`. Never leaves the server except to its owner (spec 2.11).\n  loginPhone     String    @unique\n  /// argon2id hash of the 6-digit PIN. Never selected outside the auth module.\n  pinHash        String\n  language       Language  @default(fr)\n  consentVersion String\n  consentAt      DateTime  @db.Timestamptz(3)\n  pinChangedAt   DateTime? @db.Timestamptz(3)\n  /// Spec 2.10, R13.5: withdrawals are held for numberChangeHoldHours after a PIN reset.\n  pinResetAt     DateTime? @db.Timestamptz(3)\n  /// Bumped by "log out everywhere", PIN change and PIN reset: every access token issued before\n  /// is refused at once, without waiting for its 15-minute expiry.\n  sessionEpoch   Int       @default(0)\n  /// Part 7: on deletion personal fields are anonymised; financial records stay.\n  deletedAt      DateTime? @db.Timestamptz(3)\n\n  devices           Device[]\n  paymentNumbers    PaymentNumber[]\n  refreshTokens     RefreshToken[]\n  pinResets         PinReset[]\n  memberships       Membership[]\n  createdGroups     Group[]             @relation("GroupCreator")\n  acceptedInvites   Invite[]            @relation("InviteAcceptedBy")\n  notifications     Notification[]\n  notificationPrefs NotificationPrefs?\n  pendingActions    PendingAction[]\n  conversations     AgentConversation[]\n  auditLogs         AuditLog[]\n  uploadTickets     UploadTicket[]\n}\n\nenum DevicePlatform {\n  ANDROID\n  IOS\n  WEB\n}\n\nmodel Device {\n  id              String         @id @default(uuid()) @db.Uuid\n  createdAt       DateTime       @default(now()) @db.Timestamptz(3)\n  userId          String         @db.Uuid\n  user            User           @relation(fields: [userId], references: [id], onDelete: Cascade)\n  platform        DevicePlatform\n  /// Expo push token. A token belongs to one device; re-registering moves it.\n  expoPushToken   String?        @unique\n  lastSeenAt      DateTime       @default(now()) @db.Timestamptz(3)\n  /// The login (refresh-token family) that registered the device; revoking it revokes the\n  /// device\'s push token too (privacy-guard L9).\n  sessionFamilyId String?        @db.Uuid\n  revokedAt       DateTime?      @db.Timestamptz(3)\n\n  refreshTokens RefreshToken[]\n  pushTickets   PushTicket[]\n\n  @@index([userId])\n  @@index([sessionFamilyId])\n}\n\n/// R13: one active payment number per user (partial unique index on userId WHERE activeTo IS\n/// NULL, in SQL); history kept for audit and visible only to the member (R13.6).\nmodel PaymentNumber {\n  id         String    @id @default(uuid()) @db.Uuid\n  createdAt  DateTime  @default(now()) @db.Timestamptz(3)\n  userId     String    @db.Uuid\n  user       User      @relation(fields: [userId], references: [id], onDelete: Restrict)\n  /// E.164 `+2376XXXXXXXX`.\n  number     String\n  operator   Operator\n  activeFrom DateTime  @db.Timestamptz(3)\n  activeTo   DateTime? @db.Timestamptz(3)\n\n  @@index([userId, activeFrom])\n}\n\nenum RefreshRevokedReason {\n  LOGOUT\n  LOGOUT_ALL\n  REUSE_DETECTED\n  PIN_CHANGED\n  PIN_RESET\n  ACCOUNT_DELETED\n}\n\n/// D7, spec 2.10: rotating refresh tokens, stored as an HMAC. Every rotation stays in the same\n/// family; presenting a used token revokes the whole family (reuse detection).\nmodel RefreshToken {\n  id                String                @id @default(uuid()) @db.Uuid\n  createdAt         DateTime              @default(now()) @db.Timestamptz(3)\n  userId            String                @db.Uuid\n  user              User                  @relation(fields: [userId], references: [id], onDelete: Cascade)\n  familyId          String                @db.Uuid\n  tokenHash         String                @unique\n  client            ClientKind\n  deviceId          String?               @db.Uuid\n  device            Device?               @relation(fields: [deviceId], references: [id], onDelete: SetNull)\n  expiresAt         DateTime              @db.Timestamptz(3)\n  usedAt            DateTime?             @db.Timestamptz(3)\n  replacedByTokenId String?               @db.Uuid\n  revokedAt         DateTime?             @db.Timestamptz(3)\n  revokedReason     RefreshRevokedReason?\n\n  @@index([userId, revokedAt])\n  @@index([familyId])\n}\n\nenum PinResetStatus {\n  REQUESTED\n  APPROVED\n  COMPLETED\n  EXPIRED\n  CANCELLED\n}\n\n/// Spec 2.10, D7, D8. A member asks; their group\'s admin confirms they know them (for an admin,\n/// two other active members confirm). Then a one-time link valid 30 minutes is created.\nmodel PinReset {\n  id                String             @id @default(uuid()) @db.Uuid\n  createdAt         DateTime           @default(now()) @db.Timestamptz(3)\n  userId            String             @db.Uuid\n  user              User               @relation(fields: [userId], references: [id], onDelete: Cascade)\n  status            PinResetStatus     @default(REQUESTED)\n  /// The request itself expires if nobody confirms it in time.\n  requestExpiresAt  DateTime           @db.Timestamptz(3)\n  /// The group whose confirmations unlocked the link.\n  approvedInGroupId String?            @db.Uuid\n  approvedAt        DateTime?          @db.Timestamptz(3)\n  /// SHA-256 of the one-time link token, set on approval.\n  tokenHash         String?            @unique\n  linkExpiresAt     DateTime?          @db.Timestamptz(3)\n  completedAt       DateTime?          @db.Timestamptz(3)\n  approvals         PinResetApproval[]\n\n  @@index([userId, status])\n}\n\n/// D8: one row per confirming member. Unique per member so nobody counts twice.\nmodel PinResetApproval {\n  id           String     @id @default(uuid()) @db.Uuid\n  createdAt    DateTime   @default(now()) @db.Timestamptz(3)\n  pinResetId   String     @db.Uuid\n  pinReset     PinReset   @relation(fields: [pinResetId], references: [id], onDelete: Cascade)\n  groupId      String     @db.Uuid\n  membershipId String     @db.Uuid\n  membership   Membership @relation(fields: [membershipId], references: [id], onDelete: Restrict)\n\n  @@unique([pinResetId, membershipId])\n  @@index([pinResetId, groupId])\n}\n\n// Ledger (spec 2.5, D6): double-entry, append-only, hash-chained. Owned by the money engineer\n// after this first version.\n//\n// Database protections (migration 20261102000100_database_protections):\n// - a trigger refuses UPDATE, DELETE and TRUNCATE on both tables for every role;\n// - njangi_app has no UPDATE, DELETE or TRUNCATE privilege on them;\n// - seq must be the group\'s previous seq + 1 (starting at 1) and prevHash the previous hash\n//   (or SHA-256("njangitrust:" + groupId) for seq 1);\n// - the postings of each transaction must sum to zero when the database transaction commits.\n\nenum LedgerTransactionType {\n  PAYMENT_RECEIVED\n  FINE_ASSESSED\n  BID_ASSESSED\n  AUTO_SETTLEMENT\n  WITHDRAWAL_COMPLETED\n  LOAN_DISBURSED\n  SOLIDARITY_DISBURSED\n  LEAVER_REFUND\n  FUND_DISTRIBUTION\n  /// Bidding mode: moves a round\'s pot to the winner\'s payable when the bid closes (R8.3).\n  POT_ASSIGNED\n  /// D15: corrects a bidding pot after a reversed payment.\n  POT_CORRECTION\n  /// D17: moves what a payable or the solidarity fund no longer holds into the recipient\'s\n  /// receivable, just before the REVERSAL of money already paid out.\n  CLAWBACK\n  /// D18.1: a disbursement sent to the provider moves amount + estimated fee from the payable (or\n  /// a fund) to `inflight:disbursement:<disbursementId>`; the provider\'s confirmation completes it.\n  DISBURSEMENT_SENT\n  /// D18.1: a failed disbursement returns its in-flight amount to where it came from.\n  DISBURSEMENT_RETURNED\n  REVERSAL\n  /// No postings: governance facts in the hash chain (draw seed, rule set, vote result, ...).\n  EVENT\n}\n\nmodel LedgerTransaction {\n  /// Part of the hashed content: the ledger service sets it before sealing.\n  id            String                @id @db.Uuid\n  createdAt     DateTime              @default(now()) @db.Timestamptz(3)\n  groupId       String                @db.Uuid\n  group         Group                 @relation(fields: [groupId], references: [id], onDelete: Restrict)\n  /// Gap-free per group, starting at 1.\n  seq           Int\n  type          LedgerTransactionType\n  occurredAt    DateTime              @db.Timestamptz(3)\n  roundId       String?               @db.Uuid\n  round         Round?                @relation(fields: [roundId], references: [id], onDelete: Restrict)\n  membershipId  String?               @db.Uuid\n  membership    Membership?           @relation(fields: [membershipId], references: [id], onDelete: Restrict)\n  refType       String?\n  refId         String?\n  descriptionFr String\n  descriptionEn String\n  /// Canonical-JSON-safe values only (integers, strings, booleans, null).\n  metadata      Json                  @default("{}")\n  prevHash      String\n  hash          String                @unique\n\n  postings LedgerPosting[]\n\n  @@unique([groupId, seq])\n  @@index([groupId, type])\n  @@index([membershipId])\n}\n\n/// Debit positive, credit negative; the postings of a transaction sum to zero.\nmodel LedgerPosting {\n  id            String            @id @default(uuid()) @db.Uuid\n  createdAt     DateTime          @default(now()) @db.Timestamptz(3)\n  transactionId String            @db.Uuid\n  transaction   LedgerTransaction @relation(fields: [transactionId], references: [id], onDelete: Restrict)\n  /// `cash:provider`, `payable:member:<id>`, `receivable:member:<id>`, `fund:general`,\n  /// `inflight:disbursement:<disbursementId>` (D18.1), ...\n  account       String\n  amount        Int\n\n  @@index([transactionId])\n  @@index([account])\n}\n\nenum ReconciliationStatus {\n  OK\n  WARNING\n  ALERT\n}\n\n/// Spec 2.9 reconciliation, 2.5 invariant 6. ALERT pauses withdrawals (R5.5).\nmodel ReconciliationRun {\n  id              String               @id @default(uuid()) @db.Uuid\n  createdAt       DateTime             @default(now()) @db.Timestamptz(3)\n  ranAt           DateTime             @db.Timestamptz(3)\n  providerAccount String               @default("default")\n  providerBalance Int\n  ledgerCash      Int\n  inFlight        Int\n  difference      Int\n  status          ReconciliationStatus\n  /// Problems found (invariant code and seq), no personal data.\n  details         Json                 @default("{}")\n\n  @@index([providerAccount, ranAt])\n}\n\n// Meetings, agendas, attendance and minutes (spec 2.4, R15).\n\nenum MeetingStatus {\n  SCHEDULED\n  HELD\n  CANCELLED\n}\n\nmodel Meeting {\n  id               String        @id @default(uuid()) @db.Uuid\n  createdAt        DateTime      @default(now()) @db.Timestamptz(3)\n  groupId          String        @db.Uuid\n  group            Group         @relation(fields: [groupId], references: [id], onDelete: Restrict)\n  scheduledAt      DateTime      @db.Timestamptz(3)\n  /// A place or a link.\n  place            String\n  status           MeetingStatus @default(SCHEDULED)\n  /// Generated 24 hours before (R15.2).\n  agenda           Json?\n  minutesDraft     String?\n  /// R15.4: published minutes are never edited; a correction is a new version with a reason.\n  minutesPublished String?\n  minutesVersion   Int           @default(0)\n  publishedAt      DateTime?     @db.Timestamptz(3)\n\n  agendaItems AgendaItem[]\n  attendances Attendance[]\n\n  @@index([groupId, scheduledAt])\n}\n\nenum AgendaItemSource {\n  AUTO\n  MEMBER\n}\n\nmodel AgendaItem {\n  id                 String           @id @default(uuid()) @db.Uuid\n  createdAt          DateTime         @default(now()) @db.Timestamptz(3)\n  meetingId          String           @db.Uuid\n  meeting            Meeting          @relation(fields: [meetingId], references: [id], onDelete: Restrict)\n  authorMembershipId String?          @db.Uuid\n  author             Membership?      @relation(fields: [authorMembershipId], references: [id], onDelete: Restrict)\n  text               String\n  source             AgendaItemSource\n\n  @@index([meetingId])\n}\n\nmodel Attendance {\n  id                   String     @id @default(uuid()) @db.Uuid\n  createdAt            DateTime   @default(now()) @db.Timestamptz(3)\n  meetingId            String     @db.Uuid\n  meeting              Meeting    @relation(fields: [meetingId], references: [id], onDelete: Restrict)\n  membershipId         String     @db.Uuid\n  membership           Membership @relation(fields: [membershipId], references: [id], onDelete: Restrict)\n  present              Boolean    @default(false)\n  /// R15.3, R6.3: an excuse counts only when sent before the start.\n  excused              Boolean    @default(false)\n  excuseReason         String?\n  checkedInAt          DateTime?  @db.Timestamptz(3)\n  /// The admin who marked it, when not a self check-in.\n  markedByMembershipId String?    @db.Uuid\n\n  @@unique([meetingId, membershipId])\n}\n\n// Money: cycles, rounds, obligations, payments, disbursements, loans, bids, statements\n// (spec 2.4, 2.6, R2 to R9, R14). Owned by the money engineer after this first version.\n// Every amount is an Int of whole FCFA. Calculations live in @njangi/rules, never here.\n\nenum RotationMode {\n  FIXED\n  BIDDING\n}\n\nmodel Cycle {\n  id             String       @id @default(uuid()) @db.Uuid\n  createdAt      DateTime     @default(now()) @db.Timestamptz(3)\n  groupId        String       @db.Uuid\n  group          Group        @relation("GroupCycles", fields: [groupId], references: [id], onDelete: Restrict)\n  currentOfGroup Group?       @relation("GroupCurrentCycle")\n  number         Int\n  mode           RotationMode\n  /// R2.2: round k pays out at firstPayoutAt + (k - 1) x frequency.\n  firstPayoutAt  DateTime     @db.Timestamptz(3)\n  /// R2.3: recorded with the order in an EVENT ledger entry.\n  drawSeed       String?\n  /// R2.3: ordered membership IDs.\n  rotation       String[]     @db.Uuid\n  startedAt      DateTime?    @db.Timestamptz(3)\n  closedAt       DateTime?    @db.Timestamptz(3)\n\n  rounds Round[]\n\n  @@unique([groupId, number])\n}\n\nenum RoundStatus {\n  /// Created with the cycle, not yet open for contributions.\n  SCHEDULED\n  OPEN\n  PAYOUT\n  CLOSED\n}\n\nmodel Round {\n  id                      String      @id @default(uuid()) @db.Uuid\n  createdAt               DateTime    @default(now()) @db.Timestamptz(3)\n  groupId                 String      @db.Uuid\n  group                   Group       @relation(fields: [groupId], references: [id], onDelete: Restrict)\n  cycleId                 String      @db.Uuid\n  cycle                   Cycle       @relation(fields: [cycleId], references: [id], onDelete: Restrict)\n  number                  Int\n  /// Null until the bid closes in bidding mode (R8.3).\n  beneficiaryMembershipId String?     @db.Uuid\n  beneficiary             Membership? @relation(fields: [beneficiaryMembershipId], references: [id], onDelete: Restrict)\n  dueAt                   DateTime    @db.Timestamptz(3)\n  payoutAt                DateTime    @db.Timestamptz(3)\n  status                  RoundStatus @default(SCHEDULED)\n  ruleSetVersion          Int\n\n  obligations        Obligation[]\n  bids               Bid[]\n  ledgerTransactions LedgerTransaction[]\n  ruleSetsEffective  RuleSet[]\n\n  @@unique([cycleId, number])\n  @@index([groupId, status])\n}\n\nenum ObligationKind {\n  CONTRIBUTION\n  SOLIDARITY\n  FINE\n  LOAN_INSTALLMENT\n  BID\n  SHORTFALL_SHARE\n  /// D15, D16: debt left when money already paid out is reversed.\n  CORRECTION\n}\n\nenum ObligationStatus {\n  DUE\n  PAID\n  SETTLED\n  CANCELLED\n}\n\nmodel Obligation {\n  id                   String           @id @default(uuid()) @db.Uuid\n  createdAt            DateTime         @default(now()) @db.Timestamptz(3)\n  groupId              String           @db.Uuid\n  group                Group            @relation(fields: [groupId], references: [id], onDelete: Restrict)\n  membershipId         String           @db.Uuid\n  membership           Membership       @relation("ObligationDebtor", fields: [membershipId], references: [id], onDelete: Restrict)\n  kind                 ObligationKind\n  roundId              String?          @db.Uuid\n  round                Round?           @relation(fields: [roundId], references: [id], onDelete: Restrict)\n  loanId               String?          @db.Uuid\n  loan                 Loan?            @relation(fields: [loanId], references: [id], onDelete: Restrict)\n  /// For CONTRIBUTION and SHORTFALL_SHARE: who receives the money (R3.4, R12.3).\n  creditorMembershipId String?          @db.Uuid\n  creditor             Membership?      @relation("ObligationCreditor", fields: [creditorMembershipId], references: [id], onDelete: Restrict)\n  amount               Int\n  dueAt                DateTime         @db.Timestamptz(3)\n  status               ObligationStatus @default(DUE)\n  paidAt               DateTime?        @db.Timestamptz(3)\n  /// R3.5: set when paid.\n  onTime               Boolean?\n\n  @@index([membershipId, status])\n  @@index([groupId, roundId, kind])\n  @@index([loanId])\n}\n\nenum PaymentStatus {\n  CREATED\n  PENDING\n  SUCCESSFUL\n  FAILED\n  EXPIRED\n}\n\nenum FeeSource {\n  PROVIDER\n  SCHEDULE\n}\n\n/// Spec 2.6: `id` is the externalRef sent to the provider, so every collection is idempotent.\nmodel PaymentIntent {\n  id            String        @id @default(uuid()) @db.Uuid\n  createdAt     DateTime      @default(now()) @db.Timestamptz(3)\n  updatedAt     DateTime      @updatedAt @db.Timestamptz(3)\n  groupId       String        @db.Uuid\n  group         Group         @relation(fields: [groupId], references: [id], onDelete: Restrict)\n  membershipId  String        @db.Uuid\n  membership    Membership    @relation(fields: [membershipId], references: [id], onDelete: Restrict)\n  obligationIds String[]      @db.Uuid\n  amount        Int\n  /// E.164 number used for this operation (R13.3: operations in progress keep the old number).\n  phoneSnapshot String\n  provider      String\n  providerRef   String?       @unique\n  status        PaymentStatus @default(CREATED)\n  fee           Int?\n  feeSource     FeeSource?\n  operator      Operator?\n  operatorRef   String?\n  settledAt     DateTime?     @db.Timestamptz(3)\n\n  @@index([membershipId, status])\n  @@index([status, createdAt])\n}\n\nenum DisbursementPurpose {\n  WITHDRAWAL\n  LOAN\n  SOLIDARITY\n}\n\nenum DisbursementStatus {\n  CREATED\n  PENDING\n  SUCCESSFUL\n  FAILED\n  EXPIRED\n}\n\n/// Spec 2.6. R5.4: one withdrawal in progress per member (partial unique index in SQL).\nmodel Disbursement {\n  id                String              @id @default(uuid()) @db.Uuid\n  createdAt         DateTime            @default(now()) @db.Timestamptz(3)\n  updatedAt         DateTime            @updatedAt @db.Timestamptz(3)\n  groupId           String              @db.Uuid\n  group             Group               @relation(fields: [groupId], references: [id], onDelete: Restrict)\n  membershipId      String              @db.Uuid\n  membership        Membership          @relation(fields: [membershipId], references: [id], onDelete: Restrict)\n  purpose           DisbursementPurpose\n  amount            Int\n  feeEstimated      Int\n  feeActual         Int?\n  phoneSnapshot     String\n  provider          String\n  providerRef       String?             @unique\n  status            DisbursementStatus  @default(CREATED)\n  settledAt         DateTime?           @db.Timestamptz(3)\n  loan              Loan?\n  solidarityRequest SolidarityRequest?\n\n  @@index([membershipId, status])\n  @@index([status, createdAt])\n}\n\nenum LoanStatus {\n  REQUESTED\n  APPROVED\n  REJECTED\n  DISBURSED\n  REPAID\n  OVERDUE\n  EXPIRED\n}\n\n/// R7. R7.1: one active loan per member (partial unique index in SQL).\nmodel Loan {\n  id                    String        @id @default(uuid()) @db.Uuid\n  createdAt             DateTime      @default(now()) @db.Timestamptz(3)\n  updatedAt             DateTime      @updatedAt @db.Timestamptz(3)\n  groupId               String        @db.Uuid\n  group                 Group         @relation(fields: [groupId], references: [id], onDelete: Restrict)\n  membershipId          String        @db.Uuid\n  membership            Membership    @relation(fields: [membershipId], references: [id], onDelete: Restrict)\n  principal             Int\n  months                Int\n  ratePermille          Int\n  interest              Int\n  feeEstimated          Int\n  totalDue              Int\n  status                LoanStatus    @default(REQUESTED)\n  decidedByMembershipId String?       @db.Uuid\n  decisionReason        String?\n  decidedAt             DateTime?     @db.Timestamptz(3)\n  /// R7.4: an admin\'s own request goes to an ADMIN_LOAN vote.\n  proposalId            String?       @unique @db.Uuid\n  proposal              Proposal?     @relation(fields: [proposalId], references: [id], onDelete: Restrict)\n  disbursementId        String?       @unique @db.Uuid\n  disbursement          Disbursement? @relation(fields: [disbursementId], references: [id], onDelete: Restrict)\n\n  obligations Obligation[]\n\n  @@index([groupId, status])\n}\n\n/// R8: one sealed bid per member per round, raised in place.\nmodel Bid {\n  id           String     @id @default(uuid()) @db.Uuid\n  createdAt    DateTime   @default(now()) @db.Timestamptz(3)\n  roundId      String     @db.Uuid\n  round        Round      @relation(fields: [roundId], references: [id], onDelete: Restrict)\n  membershipId String     @db.Uuid\n  membership   Membership @relation(fields: [membershipId], references: [id], onDelete: Restrict)\n  amount       Int\n  placedAt     DateTime   @db.Timestamptz(3)\n  /// When the current amount was reached; earlier wins a tie (R8.3, E6).\n  updatedAt    DateTime   @db.Timestamptz(3)\n\n  @@unique([roundId, membershipId])\n}\n\n/// Spec 2.14: verification code = first 12 hex of SHA-256(statement data + ledger head hash).\nmodel Statement {\n  id               String     @id @default(uuid()) @db.Uuid\n  createdAt        DateTime   @default(now()) @db.Timestamptz(3)\n  membershipId     String     @db.Uuid\n  membership       Membership @relation(fields: [membershipId], references: [id], onDelete: Restrict)\n  periodStart      DateTime   @db.Timestamptz(3)\n  periodEnd        DateTime   @db.Timestamptz(3)\n  language         Language\n  fileKey          String\n  verificationCode String     @unique\n  ledgerHeadHash   String\n\n  @@index([membershipId, periodStart])\n}\n\n// Notifications and preferences (spec 1.8, 2.13, D7 NotificationPrefs).\n\n/// Rappels, Argent, Votes, Groupe, S\xE9curit\xE9. SECURITY can never be turned off and ignores quiet hours.\nenum NotificationCategory {\n  REMINDERS\n  MONEY\n  VOTES\n  GROUP\n  SECURITY\n}\n\nenum PushStatus {\n  /// In-app only (web, no device, category muted or quiet hours).\n  NOT_SENT\n  QUEUED\n  SENT\n  DELIVERED\n  FAILED\n}\n\n/// Spec 2.13: the in-app notification is always written first, then pushed.\nmodel Notification {\n  id           String               @id @default(uuid()) @db.Uuid\n  createdAt    DateTime             @default(now()) @db.Timestamptz(3)\n  userId       String               @db.Uuid\n  user         User                 @relation(fields: [userId], references: [id], onDelete: Cascade)\n  groupId      String?              @db.Uuid\n  group        Group?               @relation(fields: [groupId], references: [id], onDelete: Restrict)\n  category     NotificationCategory\n  titleFr      String\n  titleEn      String\n  bodyFr       String\n  bodyEn       String\n  /// An app route such as `/caisse` or `/agent?context=pay`; never carries personal data.\n  deepLink     String?\n  readAt       DateTime?            @db.Timestamptz(3)\n  pushTicketId String?\n  pushStatus   PushStatus           @default(NOT_SENT)\n  pushTickets  PushTicket[]\n\n  @@index([userId, createdAt])\n  @@index([userId, readAt])\n}\n\nenum MediaAutoDownload {\n  WIFI_ONLY\n  ALWAYS\n  NEVER\n}\n\n/// D7: categories, quiet hours (Africa/Douala, minutes after midnight), chat mute, media setting.\n/// A CHECK constraint in SQL keeps SECURITY out of `mutedCategories`.\nmodel NotificationPrefs {\n  id                String                 @id @default(uuid()) @db.Uuid\n  createdAt         DateTime               @default(now()) @db.Timestamptz(3)\n  updatedAt         DateTime               @updatedAt @db.Timestamptz(3)\n  userId            String                 @unique @db.Uuid\n  user              User                   @relation(fields: [userId], references: [id], onDelete: Cascade)\n  mutedCategories   NotificationCategory[]\n  /// 21:00 by default.\n  quietStartMinute  Int                    @default(1260)\n  /// 07:00 by default.\n  quietEndMinute    Int                    @default(420)\n  /// Groups whose new chat messages don\'t notify (mentions still do).\n  mutedChatGroupIds String[]               @db.Uuid\n  mediaAutoDownload MediaAutoDownload      @default(WIFI_ONLY)\n}\n\nenum PushTicketStatus {\n  /// Accepted by the Expo push service; the receipt is checked later.\n  OK\n  ERROR\n  DELIVERED\n  FAILED\n}\n\n/// Spec 2.13: one Expo push ticket per notification and device, checked against its receipt.\nmodel PushTicket {\n  id             String           @id @default(uuid()) @db.Uuid\n  createdAt      DateTime         @default(now()) @db.Timestamptz(3)\n  notificationId String           @db.Uuid\n  notification   Notification     @relation(fields: [notificationId], references: [id], onDelete: Cascade)\n  deviceId       String           @db.Uuid\n  device         Device           @relation(fields: [deviceId], references: [id], onDelete: Cascade)\n  ticketId       String?          @unique\n  status         PushTicketStatus\n  /// Expo error code only (DeviceNotRegistered, MessageTooBig, ...), never the token.\n  error          String?\n  checkedAt      DateTime?        @db.Timestamptz(3)\n\n  @@index([status, createdAt])\n}\n\n/// Shared counters and temporary PIN lockouts for serverless API instances.\nmodel RateLimitRecord {\n  key          String    @id @db.VarChar(512)\n  consumed     Int       @default(0)\n  expiresAt    DateTime  @db.Timestamptz(6)\n  blockedUntil DateTime? @db.Timestamptz(6)\n  updatedAt    DateTime  @default(now()) @db.Timestamptz(6)\n\n  @@index([expiresAt])\n  @@index([blockedUntil])\n}\n',
  "runtimeDataModel": {
    "models": {},
    "enums": {},
    "types": {}
  },
  "parameterizationSchema": {
    "strings": [],
    "graph": ""
  }
};
config.runtimeDataModel = JSON.parse('{"models":{"AgentConversation":{"fields":[{"name":"id","kind":"scalar","type":"String"},{"name":"createdAt","kind":"scalar","type":"DateTime"},{"name":"updatedAt","kind":"scalar","type":"DateTime"},{"name":"userId","kind":"scalar","type":"String"},{"name":"user","kind":"object","type":"User","relationName":"AgentConversationToUser"},{"name":"groupId","kind":"scalar","type":"String"},{"name":"group","kind":"object","type":"Group","relationName":"AgentConversationToGroup"},{"name":"channel","kind":"enum","type":"AgentChannel"},{"name":"rollingSummary","kind":"scalar","type":"String"},{"name":"messages","kind":"object","type":"AgentMessage","relationName":"AgentConversationToAgentMessage"}],"dbName":null,"schema":null},"AgentMessage":{"fields":[{"name":"id","kind":"scalar","type":"String"},{"name":"createdAt","kind":"scalar","type":"DateTime"},{"name":"conversationId","kind":"scalar","type":"String"},{"name":"conversation","kind":"object","type":"AgentConversation","relationName":"AgentConversationToAgentMessage"},{"name":"role","kind":"enum","type":"AgentMessageRole"},{"name":"content","kind":"scalar","type":"String"},{"name":"toolName","kind":"scalar","type":"String"},{"name":"toolArgsRedacted","kind":"scalar","type":"Json"},{"name":"toolStatus","kind":"enum","type":"ToolCallStatus"}],"dbName":null,"schema":null},"PendingAction":{"fields":[{"name":"id","kind":"scalar","type":"String"},{"name":"createdAt","kind":"scalar","type":"DateTime"},{"name":"userId","kind":"scalar","type":"String"},{"name":"user","kind":"object","type":"User","relationName":"PendingActionToUser"},{"name":"groupId","kind":"scalar","type":"String"},{"name":"group","kind":"object","type":"Group","relationName":"GroupToPendingAction"},{"name":"type","kind":"scalar","type":"String"},{"name":"args","kind":"scalar","type":"Json"},{"name":"preview","kind":"scalar","type":"Json"},{"name":"level","kind":"enum","type":"ActionLevel"},{"name":"status","kind":"enum","type":"PendingActionStatus"},{"name":"origin","kind":"enum","type":"ActionOrigin"},{"name":"expiresAt","kind":"scalar","type":"DateTime"},{"name":"confirmedAt","kind":"scalar","type":"DateTime"},{"name":"completedAt","kind":"scalar","type":"DateTime"},{"name":"resultRef","kind":"scalar","type":"String"},{"name":"resultSummary","kind":"scalar","type":"Json"},{"name":"failureCode","kind":"scalar","type":"String"},{"name":"failureText","kind":"scalar","type":"Json"}],"dbName":null,"schema":null},"AuditLog":{"fields":[{"name":"id","kind":"scalar","type":"String"},{"name":"createdAt","kind":"scalar","type":"DateTime"},{"name":"actorUserId","kind":"scalar","type":"String"},{"name":"actor","kind":"object","type":"User","relationName":"AuditLogToUser"},{"name":"groupId","kind":"scalar","type":"String"},{"name":"group","kind":"object","type":"Group","relationName":"AuditLogToGroup"},{"name":"action","kind":"scalar","type":"String"},{"name":"target","kind":"scalar","type":"String"},{"name":"details","kind":"scalar","type":"Json"},{"name":"deviceId","kind":"scalar","type":"String"},{"name":"requestId","kind":"scalar","type":"String"}],"dbName":null,"schema":null},"Message":{"fields":[{"name":"id","kind":"scalar","type":"String"},{"name":"createdAt","kind":"scalar","type":"DateTime"},{"name":"groupId","kind":"scalar","type":"String"},{"name":"group","kind":"object","type":"Group","relationName":"GroupToMessage"},{"name":"authorMembershipId","kind":"scalar","type":"String"},{"name":"author","kind":"object","type":"Membership","relationName":"MembershipToMessage"},{"name":"kind","kind":"enum","type":"MessageKind"},{"name":"text","kind":"scalar","type":"String"},{"name":"systemText","kind":"scalar","type":"Json"},{"name":"attachmentId","kind":"scalar","type":"String"},{"name":"attachment","kind":"object","type":"Attachment","relationName":"AttachmentToMessage"},{"name":"replyToId","kind":"scalar","type":"String"},{"name":"replyTo","kind":"object","type":"Message","relationName":"MessageReplies"},{"name":"replies","kind":"object","type":"Message","relationName":"MessageReplies"},{"name":"mentions","kind":"scalar","type":"String"},{"name":"isAnnouncement","kind":"scalar","type":"Boolean"},{"name":"deletedAt","kind":"scalar","type":"DateTime"},{"name":"hiddenByAdminAt","kind":"scalar","type":"DateTime"}],"dbName":null,"schema":null},"Attachment":{"fields":[{"name":"id","kind":"scalar","type":"String"},{"name":"createdAt","kind":"scalar","type":"DateTime"},{"name":"groupId","kind":"scalar","type":"String"},{"name":"group","kind":"object","type":"Group","relationName":"AttachmentToGroup"},{"name":"uploaderMembershipId","kind":"scalar","type":"String"},{"name":"uploader","kind":"object","type":"Membership","relationName":"AttachmentToMembership"},{"name":"kind","kind":"enum","type":"AttachmentKind"},{"name":"mime","kind":"scalar","type":"String"},{"name":"sizeBytes","kind":"scalar","type":"Int"},{"name":"durationSec","kind":"scalar","type":"Int"},{"name":"width","kind":"scalar","type":"Int"},{"name":"height","kind":"scalar","type":"Int"},{"name":"storageKey","kind":"scalar","type":"String"},{"name":"thumbnailKey","kind":"scalar","type":"String"},{"name":"message","kind":"object","type":"Message","relationName":"AttachmentToMessage"}],"dbName":null,"schema":null},"UploadTicket":{"fields":[{"name":"id","kind":"scalar","type":"String"},{"name":"createdAt","kind":"scalar","type":"DateTime"},{"name":"userId","kind":"scalar","type":"String"},{"name":"user","kind":"object","type":"User","relationName":"UploadTicketToUser"},{"name":"groupId","kind":"scalar","type":"String"},{"name":"group","kind":"object","type":"Group","relationName":"GroupToUploadTicket"},{"name":"kind","kind":"enum","type":"AttachmentKind"},{"name":"declaredMime","kind":"scalar","type":"String"},{"name":"maxBytes","kind":"scalar","type":"Int"},{"name":"storageKey","kind":"scalar","type":"String"},{"name":"thumbnailKey","kind":"scalar","type":"String"},{"name":"expiresAt","kind":"scalar","type":"DateTime"},{"name":"completedAt","kind":"scalar","type":"DateTime"},{"name":"attachmentId","kind":"scalar","type":"String"}],"dbName":null,"schema":null},"DeploymentJob":{"fields":[{"name":"id","kind":"scalar","type":"String"},{"name":"name","kind":"scalar","type":"String"},{"name":"jobKey","kind":"scalar","type":"String"},{"name":"payload","kind":"scalar","type":"Json"},{"name":"runAt","kind":"scalar","type":"DateTime"},{"name":"status","kind":"scalar","type":"String"},{"name":"attempts","kind":"scalar","type":"Int"},{"name":"maxAttempts","kind":"scalar","type":"Int"},{"name":"leaseUntil","kind":"scalar","type":"DateTime"},{"name":"leaseToken","kind":"scalar","type":"String"},{"name":"lastError","kind":"scalar","type":"String"},{"name":"createdAt","kind":"scalar","type":"DateTime"},{"name":"updatedAt","kind":"scalar","type":"DateTime"}],"dbName":null,"schema":null},"Proposal":{"fields":[{"name":"id","kind":"scalar","type":"String"},{"name":"createdAt","kind":"scalar","type":"DateTime"},{"name":"groupId","kind":"scalar","type":"String"},{"name":"group","kind":"object","type":"Group","relationName":"GroupToProposal"},{"name":"type","kind":"enum","type":"ProposalType"},{"name":"payload","kind":"scalar","type":"Json"},{"name":"reason","kind":"scalar","type":"String"},{"name":"proposerMembershipId","kind":"scalar","type":"String"},{"name":"proposer","kind":"object","type":"Membership","relationName":"ProposalProposer"},{"name":"secret","kind":"scalar","type":"Boolean"},{"name":"thresholdKind","kind":"enum","type":"ThresholdKind"},{"name":"eligibleMembershipIds","kind":"scalar","type":"String"},{"name":"subjectMembershipId","kind":"scalar","type":"String"},{"name":"subject","kind":"object","type":"Membership","relationName":"ProposalSubject"},{"name":"mustApproveMembershipIds","kind":"scalar","type":"String"},{"name":"remindedAt","kind":"scalar","type":"DateTime"},{"name":"yesCount","kind":"scalar","type":"Int"},{"name":"noCount","kind":"scalar","type":"Int"},{"name":"opensAt","kind":"scalar","type":"DateTime"},{"name":"closesAt","kind":"scalar","type":"DateTime"},{"name":"status","kind":"enum","type":"ProposalStatus"},{"name":"closedAt","kind":"scalar","type":"DateTime"},{"name":"appliedAt","kind":"scalar","type":"DateTime"},{"name":"effect","kind":"scalar","type":"Json"},{"name":"voteReceipts","kind":"object","type":"VoteReceipt","relationName":"ProposalToVoteReceipt"},{"name":"ballots","kind":"object","type":"Ballot","relationName":"BallotToProposal"},{"name":"invites","kind":"object","type":"Invite","relationName":"InviteToProposal"},{"name":"ruleSets","kind":"object","type":"RuleSet","relationName":"ProposalToRuleSet"},{"name":"loan","kind":"object","type":"Loan","relationName":"LoanToProposal"},{"name":"solidarityRequest","kind":"object","type":"SolidarityRequest","relationName":"ProposalToSolidarityRequest"}],"dbName":null,"schema":null},"VoteReceipt":{"fields":[{"name":"id","kind":"scalar","type":"String"},{"name":"createdAt","kind":"scalar","type":"DateTime"},{"name":"proposalId","kind":"scalar","type":"String"},{"name":"proposal","kind":"object","type":"Proposal","relationName":"ProposalToVoteReceipt"},{"name":"membershipId","kind":"scalar","type":"String"},{"name":"membership","kind":"object","type":"Membership","relationName":"MembershipToVoteReceipt"},{"name":"votedAt","kind":"scalar","type":"DateTime"}],"dbName":null,"schema":null},"Ballot":{"fields":[{"name":"id","kind":"scalar","type":"String"},{"name":"createdAt","kind":"scalar","type":"DateTime"},{"name":"proposalId","kind":"scalar","type":"String"},{"name":"proposal","kind":"object","type":"Proposal","relationName":"BallotToProposal"},{"name":"membershipId","kind":"scalar","type":"String"},{"name":"membership","kind":"object","type":"Membership","relationName":"BallotToMembership"},{"name":"choice","kind":"enum","type":"VoteChoice"},{"name":"castAt","kind":"scalar","type":"DateTime"}],"dbName":null,"schema":null},"SolidarityRequest":{"fields":[{"name":"id","kind":"scalar","type":"String"},{"name":"createdAt","kind":"scalar","type":"DateTime"},{"name":"groupId","kind":"scalar","type":"String"},{"name":"group","kind":"object","type":"Group","relationName":"GroupToSolidarityRequest"},{"name":"requesterMembershipId","kind":"scalar","type":"String"},{"name":"requester","kind":"object","type":"Membership","relationName":"SolidarityRequester"},{"name":"recipientMembershipId","kind":"scalar","type":"String"},{"name":"recipient","kind":"object","type":"Membership","relationName":"SolidarityRecipient"},{"name":"event","kind":"enum","type":"SolidarityEvent"},{"name":"amount","kind":"scalar","type":"Int"},{"name":"note","kind":"scalar","type":"String"},{"name":"proposalId","kind":"scalar","type":"String"},{"name":"proposal","kind":"object","type":"Proposal","relationName":"ProposalToSolidarityRequest"},{"name":"status","kind":"enum","type":"SolidarityRequestStatus"},{"name":"disbursementId","kind":"scalar","type":"String"},{"name":"disbursement","kind":"object","type":"Disbursement","relationName":"DisbursementToSolidarityRequest"}],"dbName":null,"schema":null},"Group":{"fields":[{"name":"id","kind":"scalar","type":"String"},{"name":"createdAt","kind":"scalar","type":"DateTime"},{"name":"updatedAt","kind":"scalar","type":"DateTime"},{"name":"name","kind":"scalar","type":"String"},{"name":"status","kind":"enum","type":"GroupStatus"},{"name":"createdByUserId","kind":"scalar","type":"String"},{"name":"createdBy","kind":"object","type":"User","relationName":"GroupCreator"},{"name":"firstPayoutAt","kind":"scalar","type":"DateTime"},{"name":"currentCycleId","kind":"scalar","type":"String"},{"name":"currentCycle","kind":"object","type":"Cycle","relationName":"GroupCurrentCycle"},{"name":"providerAccount","kind":"scalar","type":"String"},{"name":"memberships","kind":"object","type":"Membership","relationName":"GroupToMembership"},{"name":"invites","kind":"object","type":"Invite","relationName":"GroupToInvite"},{"name":"ruleSets","kind":"object","type":"RuleSet","relationName":"GroupToRuleSet"},{"name":"cycles","kind":"object","type":"Cycle","relationName":"GroupCycles"},{"name":"rounds","kind":"object","type":"Round","relationName":"GroupToRound"},{"name":"obligations","kind":"object","type":"Obligation","relationName":"GroupToObligation"},{"name":"paymentIntents","kind":"object","type":"PaymentIntent","relationName":"GroupToPaymentIntent"},{"name":"disbursements","kind":"object","type":"Disbursement","relationName":"DisbursementToGroup"},{"name":"loans","kind":"object","type":"Loan","relationName":"GroupToLoan"},{"name":"ledgerTransactions","kind":"object","type":"LedgerTransaction","relationName":"GroupToLedgerTransaction"},{"name":"proposals","kind":"object","type":"Proposal","relationName":"GroupToProposal"},{"name":"solidarityRequests","kind":"object","type":"SolidarityRequest","relationName":"GroupToSolidarityRequest"},{"name":"meetings","kind":"object","type":"Meeting","relationName":"GroupToMeeting"},{"name":"messages","kind":"object","type":"Message","relationName":"GroupToMessage"},{"name":"attachments","kind":"object","type":"Attachment","relationName":"AttachmentToGroup"},{"name":"notifications","kind":"object","type":"Notification","relationName":"GroupToNotification"},{"name":"pendingActions","kind":"object","type":"PendingAction","relationName":"GroupToPendingAction"},{"name":"conversations","kind":"object","type":"AgentConversation","relationName":"AgentConversationToGroup"},{"name":"auditLogs","kind":"object","type":"AuditLog","relationName":"AuditLogToGroup"},{"name":"uploadTickets","kind":"object","type":"UploadTicket","relationName":"GroupToUploadTicket"}],"dbName":null,"schema":null},"Membership":{"fields":[{"name":"id","kind":"scalar","type":"String"},{"name":"createdAt","kind":"scalar","type":"DateTime"},{"name":"groupId","kind":"scalar","type":"String"},{"name":"group","kind":"object","type":"Group","relationName":"GroupToMembership"},{"name":"userId","kind":"scalar","type":"String"},{"name":"user","kind":"object","type":"User","relationName":"MembershipToUser"},{"name":"role","kind":"enum","type":"MembershipRole"},{"name":"status","kind":"enum","type":"MembershipStatus"},{"name":"activeFromCycle","kind":"scalar","type":"Int"},{"name":"leftAt","kind":"scalar","type":"DateTime"},{"name":"chatLastReadAt","kind":"scalar","type":"DateTime"},{"name":"invitesCreated","kind":"object","type":"Invite","relationName":"InviteCreatedBy"},{"name":"obligations","kind":"object","type":"Obligation","relationName":"ObligationDebtor"},{"name":"credits","kind":"object","type":"Obligation","relationName":"ObligationCreditor"},{"name":"paymentIntents","kind":"object","type":"PaymentIntent","relationName":"MembershipToPaymentIntent"},{"name":"disbursements","kind":"object","type":"Disbursement","relationName":"DisbursementToMembership"},{"name":"loans","kind":"object","type":"Loan","relationName":"LoanToMembership"},{"name":"bids","kind":"object","type":"Bid","relationName":"BidToMembership"},{"name":"beneficiaryRounds","kind":"object","type":"Round","relationName":"MembershipToRound"},{"name":"statements","kind":"object","type":"Statement","relationName":"MembershipToStatement"},{"name":"ledgerTransactions","kind":"object","type":"LedgerTransaction","relationName":"LedgerTransactionToMembership"},{"name":"proposals","kind":"object","type":"Proposal","relationName":"ProposalProposer"},{"name":"proposalsAbout","kind":"object","type":"Proposal","relationName":"ProposalSubject"},{"name":"voteReceipts","kind":"object","type":"VoteReceipt","relationName":"MembershipToVoteReceipt"},{"name":"ballots","kind":"object","type":"Ballot","relationName":"BallotToMembership"},{"name":"solidarityRequested","kind":"object","type":"SolidarityRequest","relationName":"SolidarityRequester"},{"name":"solidarityReceived","kind":"object","type":"SolidarityRequest","relationName":"SolidarityRecipient"},{"name":"agendaItems","kind":"object","type":"AgendaItem","relationName":"AgendaItemToMembership"},{"name":"attendances","kind":"object","type":"Attendance","relationName":"AttendanceToMembership"},{"name":"messages","kind":"object","type":"Message","relationName":"MembershipToMessage"},{"name":"attachments","kind":"object","type":"Attachment","relationName":"AttachmentToMembership"},{"name":"pinResetApprovals","kind":"object","type":"PinResetApproval","relationName":"MembershipToPinResetApproval"}],"dbName":null,"schema":null},"Invite":{"fields":[{"name":"id","kind":"scalar","type":"String"},{"name":"createdAt","kind":"scalar","type":"DateTime"},{"name":"groupId","kind":"scalar","type":"String"},{"name":"group","kind":"object","type":"Group","relationName":"GroupToInvite"},{"name":"proposalId","kind":"scalar","type":"String"},{"name":"proposal","kind":"object","type":"Proposal","relationName":"InviteToProposal"},{"name":"inviteeName","kind":"scalar","type":"String"},{"name":"phoneHash","kind":"scalar","type":"String"},{"name":"tokenHash","kind":"scalar","type":"String"},{"name":"expiresAt","kind":"scalar","type":"DateTime"},{"name":"usedAt","kind":"scalar","type":"DateTime"},{"name":"acceptedByUserId","kind":"scalar","type":"String"},{"name":"acceptedBy","kind":"object","type":"User","relationName":"InviteAcceptedBy"},{"name":"revokedAt","kind":"scalar","type":"DateTime"},{"name":"createdByMembershipId","kind":"scalar","type":"String"},{"name":"createdBy","kind":"object","type":"Membership","relationName":"InviteCreatedBy"}],"dbName":null,"schema":null},"RuleSet":{"fields":[{"name":"id","kind":"scalar","type":"String"},{"name":"createdAt","kind":"scalar","type":"DateTime"},{"name":"groupId","kind":"scalar","type":"String"},{"name":"group","kind":"object","type":"Group","relationName":"GroupToRuleSet"},{"name":"version","kind":"scalar","type":"Int"},{"name":"params","kind":"scalar","type":"Json"},{"name":"effectiveFromRoundId","kind":"scalar","type":"String"},{"name":"effectiveFromRound","kind":"object","type":"Round","relationName":"RoundToRuleSet"},{"name":"createdByProposalId","kind":"scalar","type":"String"},{"name":"createdByProposal","kind":"object","type":"Proposal","relationName":"ProposalToRuleSet"}],"dbName":null,"schema":null},"User":{"fields":[{"name":"id","kind":"scalar","type":"String"},{"name":"createdAt","kind":"scalar","type":"DateTime"},{"name":"updatedAt","kind":"scalar","type":"DateTime"},{"name":"name","kind":"scalar","type":"String"},{"name":"loginPhone","kind":"scalar","type":"String"},{"name":"pinHash","kind":"scalar","type":"String"},{"name":"language","kind":"enum","type":"Language"},{"name":"consentVersion","kind":"scalar","type":"String"},{"name":"consentAt","kind":"scalar","type":"DateTime"},{"name":"pinChangedAt","kind":"scalar","type":"DateTime"},{"name":"pinResetAt","kind":"scalar","type":"DateTime"},{"name":"sessionEpoch","kind":"scalar","type":"Int"},{"name":"deletedAt","kind":"scalar","type":"DateTime"},{"name":"devices","kind":"object","type":"Device","relationName":"DeviceToUser"},{"name":"paymentNumbers","kind":"object","type":"PaymentNumber","relationName":"PaymentNumberToUser"},{"name":"refreshTokens","kind":"object","type":"RefreshToken","relationName":"RefreshTokenToUser"},{"name":"pinResets","kind":"object","type":"PinReset","relationName":"PinResetToUser"},{"name":"memberships","kind":"object","type":"Membership","relationName":"MembershipToUser"},{"name":"createdGroups","kind":"object","type":"Group","relationName":"GroupCreator"},{"name":"acceptedInvites","kind":"object","type":"Invite","relationName":"InviteAcceptedBy"},{"name":"notifications","kind":"object","type":"Notification","relationName":"NotificationToUser"},{"name":"notificationPrefs","kind":"object","type":"NotificationPrefs","relationName":"NotificationPrefsToUser"},{"name":"pendingActions","kind":"object","type":"PendingAction","relationName":"PendingActionToUser"},{"name":"conversations","kind":"object","type":"AgentConversation","relationName":"AgentConversationToUser"},{"name":"auditLogs","kind":"object","type":"AuditLog","relationName":"AuditLogToUser"},{"name":"uploadTickets","kind":"object","type":"UploadTicket","relationName":"UploadTicketToUser"}],"dbName":null,"schema":null},"Device":{"fields":[{"name":"id","kind":"scalar","type":"String"},{"name":"createdAt","kind":"scalar","type":"DateTime"},{"name":"userId","kind":"scalar","type":"String"},{"name":"user","kind":"object","type":"User","relationName":"DeviceToUser"},{"name":"platform","kind":"enum","type":"DevicePlatform"},{"name":"expoPushToken","kind":"scalar","type":"String"},{"name":"lastSeenAt","kind":"scalar","type":"DateTime"},{"name":"sessionFamilyId","kind":"scalar","type":"String"},{"name":"revokedAt","kind":"scalar","type":"DateTime"},{"name":"refreshTokens","kind":"object","type":"RefreshToken","relationName":"DeviceToRefreshToken"},{"name":"pushTickets","kind":"object","type":"PushTicket","relationName":"DeviceToPushTicket"}],"dbName":null,"schema":null},"PaymentNumber":{"fields":[{"name":"id","kind":"scalar","type":"String"},{"name":"createdAt","kind":"scalar","type":"DateTime"},{"name":"userId","kind":"scalar","type":"String"},{"name":"user","kind":"object","type":"User","relationName":"PaymentNumberToUser"},{"name":"number","kind":"scalar","type":"String"},{"name":"operator","kind":"enum","type":"Operator"},{"name":"activeFrom","kind":"scalar","type":"DateTime"},{"name":"activeTo","kind":"scalar","type":"DateTime"}],"dbName":null,"schema":null},"RefreshToken":{"fields":[{"name":"id","kind":"scalar","type":"String"},{"name":"createdAt","kind":"scalar","type":"DateTime"},{"name":"userId","kind":"scalar","type":"String"},{"name":"user","kind":"object","type":"User","relationName":"RefreshTokenToUser"},{"name":"familyId","kind":"scalar","type":"String"},{"name":"tokenHash","kind":"scalar","type":"String"},{"name":"client","kind":"enum","type":"ClientKind"},{"name":"deviceId","kind":"scalar","type":"String"},{"name":"device","kind":"object","type":"Device","relationName":"DeviceToRefreshToken"},{"name":"expiresAt","kind":"scalar","type":"DateTime"},{"name":"usedAt","kind":"scalar","type":"DateTime"},{"name":"replacedByTokenId","kind":"scalar","type":"String"},{"name":"revokedAt","kind":"scalar","type":"DateTime"},{"name":"revokedReason","kind":"enum","type":"RefreshRevokedReason"}],"dbName":null,"schema":null},"PinReset":{"fields":[{"name":"id","kind":"scalar","type":"String"},{"name":"createdAt","kind":"scalar","type":"DateTime"},{"name":"userId","kind":"scalar","type":"String"},{"name":"user","kind":"object","type":"User","relationName":"PinResetToUser"},{"name":"status","kind":"enum","type":"PinResetStatus"},{"name":"requestExpiresAt","kind":"scalar","type":"DateTime"},{"name":"approvedInGroupId","kind":"scalar","type":"String"},{"name":"approvedAt","kind":"scalar","type":"DateTime"},{"name":"tokenHash","kind":"scalar","type":"String"},{"name":"linkExpiresAt","kind":"scalar","type":"DateTime"},{"name":"completedAt","kind":"scalar","type":"DateTime"},{"name":"approvals","kind":"object","type":"PinResetApproval","relationName":"PinResetToPinResetApproval"}],"dbName":null,"schema":null},"PinResetApproval":{"fields":[{"name":"id","kind":"scalar","type":"String"},{"name":"createdAt","kind":"scalar","type":"DateTime"},{"name":"pinResetId","kind":"scalar","type":"String"},{"name":"pinReset","kind":"object","type":"PinReset","relationName":"PinResetToPinResetApproval"},{"name":"groupId","kind":"scalar","type":"String"},{"name":"membershipId","kind":"scalar","type":"String"},{"name":"membership","kind":"object","type":"Membership","relationName":"MembershipToPinResetApproval"}],"dbName":null,"schema":null},"LedgerTransaction":{"fields":[{"name":"id","kind":"scalar","type":"String"},{"name":"createdAt","kind":"scalar","type":"DateTime"},{"name":"groupId","kind":"scalar","type":"String"},{"name":"group","kind":"object","type":"Group","relationName":"GroupToLedgerTransaction"},{"name":"seq","kind":"scalar","type":"Int"},{"name":"type","kind":"enum","type":"LedgerTransactionType"},{"name":"occurredAt","kind":"scalar","type":"DateTime"},{"name":"roundId","kind":"scalar","type":"String"},{"name":"round","kind":"object","type":"Round","relationName":"LedgerTransactionToRound"},{"name":"membershipId","kind":"scalar","type":"String"},{"name":"membership","kind":"object","type":"Membership","relationName":"LedgerTransactionToMembership"},{"name":"refType","kind":"scalar","type":"String"},{"name":"refId","kind":"scalar","type":"String"},{"name":"descriptionFr","kind":"scalar","type":"String"},{"name":"descriptionEn","kind":"scalar","type":"String"},{"name":"metadata","kind":"scalar","type":"Json"},{"name":"prevHash","kind":"scalar","type":"String"},{"name":"hash","kind":"scalar","type":"String"},{"name":"postings","kind":"object","type":"LedgerPosting","relationName":"LedgerPostingToLedgerTransaction"}],"dbName":null,"schema":null},"LedgerPosting":{"fields":[{"name":"id","kind":"scalar","type":"String"},{"name":"createdAt","kind":"scalar","type":"DateTime"},{"name":"transactionId","kind":"scalar","type":"String"},{"name":"transaction","kind":"object","type":"LedgerTransaction","relationName":"LedgerPostingToLedgerTransaction"},{"name":"account","kind":"scalar","type":"String"},{"name":"amount","kind":"scalar","type":"Int"}],"dbName":null,"schema":null},"ReconciliationRun":{"fields":[{"name":"id","kind":"scalar","type":"String"},{"name":"createdAt","kind":"scalar","type":"DateTime"},{"name":"ranAt","kind":"scalar","type":"DateTime"},{"name":"providerAccount","kind":"scalar","type":"String"},{"name":"providerBalance","kind":"scalar","type":"Int"},{"name":"ledgerCash","kind":"scalar","type":"Int"},{"name":"inFlight","kind":"scalar","type":"Int"},{"name":"difference","kind":"scalar","type":"Int"},{"name":"status","kind":"enum","type":"ReconciliationStatus"},{"name":"details","kind":"scalar","type":"Json"}],"dbName":null,"schema":null},"Meeting":{"fields":[{"name":"id","kind":"scalar","type":"String"},{"name":"createdAt","kind":"scalar","type":"DateTime"},{"name":"groupId","kind":"scalar","type":"String"},{"name":"group","kind":"object","type":"Group","relationName":"GroupToMeeting"},{"name":"scheduledAt","kind":"scalar","type":"DateTime"},{"name":"place","kind":"scalar","type":"String"},{"name":"status","kind":"enum","type":"MeetingStatus"},{"name":"agenda","kind":"scalar","type":"Json"},{"name":"minutesDraft","kind":"scalar","type":"String"},{"name":"minutesPublished","kind":"scalar","type":"String"},{"name":"minutesVersion","kind":"scalar","type":"Int"},{"name":"publishedAt","kind":"scalar","type":"DateTime"},{"name":"agendaItems","kind":"object","type":"AgendaItem","relationName":"AgendaItemToMeeting"},{"name":"attendances","kind":"object","type":"Attendance","relationName":"AttendanceToMeeting"}],"dbName":null,"schema":null},"AgendaItem":{"fields":[{"name":"id","kind":"scalar","type":"String"},{"name":"createdAt","kind":"scalar","type":"DateTime"},{"name":"meetingId","kind":"scalar","type":"String"},{"name":"meeting","kind":"object","type":"Meeting","relationName":"AgendaItemToMeeting"},{"name":"authorMembershipId","kind":"scalar","type":"String"},{"name":"author","kind":"object","type":"Membership","relationName":"AgendaItemToMembership"},{"name":"text","kind":"scalar","type":"String"},{"name":"source","kind":"enum","type":"AgendaItemSource"}],"dbName":null,"schema":null},"Attendance":{"fields":[{"name":"id","kind":"scalar","type":"String"},{"name":"createdAt","kind":"scalar","type":"DateTime"},{"name":"meetingId","kind":"scalar","type":"String"},{"name":"meeting","kind":"object","type":"Meeting","relationName":"AttendanceToMeeting"},{"name":"membershipId","kind":"scalar","type":"String"},{"name":"membership","kind":"object","type":"Membership","relationName":"AttendanceToMembership"},{"name":"present","kind":"scalar","type":"Boolean"},{"name":"excused","kind":"scalar","type":"Boolean"},{"name":"excuseReason","kind":"scalar","type":"String"},{"name":"checkedInAt","kind":"scalar","type":"DateTime"},{"name":"markedByMembershipId","kind":"scalar","type":"String"}],"dbName":null,"schema":null},"Cycle":{"fields":[{"name":"id","kind":"scalar","type":"String"},{"name":"createdAt","kind":"scalar","type":"DateTime"},{"name":"groupId","kind":"scalar","type":"String"},{"name":"group","kind":"object","type":"Group","relationName":"GroupCycles"},{"name":"currentOfGroup","kind":"object","type":"Group","relationName":"GroupCurrentCycle"},{"name":"number","kind":"scalar","type":"Int"},{"name":"mode","kind":"enum","type":"RotationMode"},{"name":"firstPayoutAt","kind":"scalar","type":"DateTime"},{"name":"drawSeed","kind":"scalar","type":"String"},{"name":"rotation","kind":"scalar","type":"String"},{"name":"startedAt","kind":"scalar","type":"DateTime"},{"name":"closedAt","kind":"scalar","type":"DateTime"},{"name":"rounds","kind":"object","type":"Round","relationName":"CycleToRound"}],"dbName":null,"schema":null},"Round":{"fields":[{"name":"id","kind":"scalar","type":"String"},{"name":"createdAt","kind":"scalar","type":"DateTime"},{"name":"groupId","kind":"scalar","type":"String"},{"name":"group","kind":"object","type":"Group","relationName":"GroupToRound"},{"name":"cycleId","kind":"scalar","type":"String"},{"name":"cycle","kind":"object","type":"Cycle","relationName":"CycleToRound"},{"name":"number","kind":"scalar","type":"Int"},{"name":"beneficiaryMembershipId","kind":"scalar","type":"String"},{"name":"beneficiary","kind":"object","type":"Membership","relationName":"MembershipToRound"},{"name":"dueAt","kind":"scalar","type":"DateTime"},{"name":"payoutAt","kind":"scalar","type":"DateTime"},{"name":"status","kind":"enum","type":"RoundStatus"},{"name":"ruleSetVersion","kind":"scalar","type":"Int"},{"name":"obligations","kind":"object","type":"Obligation","relationName":"ObligationToRound"},{"name":"bids","kind":"object","type":"Bid","relationName":"BidToRound"},{"name":"ledgerTransactions","kind":"object","type":"LedgerTransaction","relationName":"LedgerTransactionToRound"},{"name":"ruleSetsEffective","kind":"object","type":"RuleSet","relationName":"RoundToRuleSet"}],"dbName":null,"schema":null},"Obligation":{"fields":[{"name":"id","kind":"scalar","type":"String"},{"name":"createdAt","kind":"scalar","type":"DateTime"},{"name":"groupId","kind":"scalar","type":"String"},{"name":"group","kind":"object","type":"Group","relationName":"GroupToObligation"},{"name":"membershipId","kind":"scalar","type":"String"},{"name":"membership","kind":"object","type":"Membership","relationName":"ObligationDebtor"},{"name":"kind","kind":"enum","type":"ObligationKind"},{"name":"roundId","kind":"scalar","type":"String"},{"name":"round","kind":"object","type":"Round","relationName":"ObligationToRound"},{"name":"loanId","kind":"scalar","type":"String"},{"name":"loan","kind":"object","type":"Loan","relationName":"LoanToObligation"},{"name":"creditorMembershipId","kind":"scalar","type":"String"},{"name":"creditor","kind":"object","type":"Membership","relationName":"ObligationCreditor"},{"name":"amount","kind":"scalar","type":"Int"},{"name":"dueAt","kind":"scalar","type":"DateTime"},{"name":"status","kind":"enum","type":"ObligationStatus"},{"name":"paidAt","kind":"scalar","type":"DateTime"},{"name":"onTime","kind":"scalar","type":"Boolean"}],"dbName":null,"schema":null},"PaymentIntent":{"fields":[{"name":"id","kind":"scalar","type":"String"},{"name":"createdAt","kind":"scalar","type":"DateTime"},{"name":"updatedAt","kind":"scalar","type":"DateTime"},{"name":"groupId","kind":"scalar","type":"String"},{"name":"group","kind":"object","type":"Group","relationName":"GroupToPaymentIntent"},{"name":"membershipId","kind":"scalar","type":"String"},{"name":"membership","kind":"object","type":"Membership","relationName":"MembershipToPaymentIntent"},{"name":"obligationIds","kind":"scalar","type":"String"},{"name":"amount","kind":"scalar","type":"Int"},{"name":"phoneSnapshot","kind":"scalar","type":"String"},{"name":"provider","kind":"scalar","type":"String"},{"name":"providerRef","kind":"scalar","type":"String"},{"name":"status","kind":"enum","type":"PaymentStatus"},{"name":"fee","kind":"scalar","type":"Int"},{"name":"feeSource","kind":"enum","type":"FeeSource"},{"name":"operator","kind":"enum","type":"Operator"},{"name":"operatorRef","kind":"scalar","type":"String"},{"name":"settledAt","kind":"scalar","type":"DateTime"}],"dbName":null,"schema":null},"Disbursement":{"fields":[{"name":"id","kind":"scalar","type":"String"},{"name":"createdAt","kind":"scalar","type":"DateTime"},{"name":"updatedAt","kind":"scalar","type":"DateTime"},{"name":"groupId","kind":"scalar","type":"String"},{"name":"group","kind":"object","type":"Group","relationName":"DisbursementToGroup"},{"name":"membershipId","kind":"scalar","type":"String"},{"name":"membership","kind":"object","type":"Membership","relationName":"DisbursementToMembership"},{"name":"purpose","kind":"enum","type":"DisbursementPurpose"},{"name":"amount","kind":"scalar","type":"Int"},{"name":"feeEstimated","kind":"scalar","type":"Int"},{"name":"feeActual","kind":"scalar","type":"Int"},{"name":"phoneSnapshot","kind":"scalar","type":"String"},{"name":"provider","kind":"scalar","type":"String"},{"name":"providerRef","kind":"scalar","type":"String"},{"name":"status","kind":"enum","type":"DisbursementStatus"},{"name":"settledAt","kind":"scalar","type":"DateTime"},{"name":"loan","kind":"object","type":"Loan","relationName":"DisbursementToLoan"},{"name":"solidarityRequest","kind":"object","type":"SolidarityRequest","relationName":"DisbursementToSolidarityRequest"}],"dbName":null,"schema":null},"Loan":{"fields":[{"name":"id","kind":"scalar","type":"String"},{"name":"createdAt","kind":"scalar","type":"DateTime"},{"name":"updatedAt","kind":"scalar","type":"DateTime"},{"name":"groupId","kind":"scalar","type":"String"},{"name":"group","kind":"object","type":"Group","relationName":"GroupToLoan"},{"name":"membershipId","kind":"scalar","type":"String"},{"name":"membership","kind":"object","type":"Membership","relationName":"LoanToMembership"},{"name":"principal","kind":"scalar","type":"Int"},{"name":"months","kind":"scalar","type":"Int"},{"name":"ratePermille","kind":"scalar","type":"Int"},{"name":"interest","kind":"scalar","type":"Int"},{"name":"feeEstimated","kind":"scalar","type":"Int"},{"name":"totalDue","kind":"scalar","type":"Int"},{"name":"status","kind":"enum","type":"LoanStatus"},{"name":"decidedByMembershipId","kind":"scalar","type":"String"},{"name":"decisionReason","kind":"scalar","type":"String"},{"name":"decidedAt","kind":"scalar","type":"DateTime"},{"name":"proposalId","kind":"scalar","type":"String"},{"name":"proposal","kind":"object","type":"Proposal","relationName":"LoanToProposal"},{"name":"disbursementId","kind":"scalar","type":"String"},{"name":"disbursement","kind":"object","type":"Disbursement","relationName":"DisbursementToLoan"},{"name":"obligations","kind":"object","type":"Obligation","relationName":"LoanToObligation"}],"dbName":null,"schema":null},"Bid":{"fields":[{"name":"id","kind":"scalar","type":"String"},{"name":"createdAt","kind":"scalar","type":"DateTime"},{"name":"roundId","kind":"scalar","type":"String"},{"name":"round","kind":"object","type":"Round","relationName":"BidToRound"},{"name":"membershipId","kind":"scalar","type":"String"},{"name":"membership","kind":"object","type":"Membership","relationName":"BidToMembership"},{"name":"amount","kind":"scalar","type":"Int"},{"name":"placedAt","kind":"scalar","type":"DateTime"},{"name":"updatedAt","kind":"scalar","type":"DateTime"}],"dbName":null,"schema":null},"Statement":{"fields":[{"name":"id","kind":"scalar","type":"String"},{"name":"createdAt","kind":"scalar","type":"DateTime"},{"name":"membershipId","kind":"scalar","type":"String"},{"name":"membership","kind":"object","type":"Membership","relationName":"MembershipToStatement"},{"name":"periodStart","kind":"scalar","type":"DateTime"},{"name":"periodEnd","kind":"scalar","type":"DateTime"},{"name":"language","kind":"enum","type":"Language"},{"name":"fileKey","kind":"scalar","type":"String"},{"name":"verificationCode","kind":"scalar","type":"String"},{"name":"ledgerHeadHash","kind":"scalar","type":"String"}],"dbName":null,"schema":null},"Notification":{"fields":[{"name":"id","kind":"scalar","type":"String"},{"name":"createdAt","kind":"scalar","type":"DateTime"},{"name":"userId","kind":"scalar","type":"String"},{"name":"user","kind":"object","type":"User","relationName":"NotificationToUser"},{"name":"groupId","kind":"scalar","type":"String"},{"name":"group","kind":"object","type":"Group","relationName":"GroupToNotification"},{"name":"category","kind":"enum","type":"NotificationCategory"},{"name":"titleFr","kind":"scalar","type":"String"},{"name":"titleEn","kind":"scalar","type":"String"},{"name":"bodyFr","kind":"scalar","type":"String"},{"name":"bodyEn","kind":"scalar","type":"String"},{"name":"deepLink","kind":"scalar","type":"String"},{"name":"readAt","kind":"scalar","type":"DateTime"},{"name":"pushTicketId","kind":"scalar","type":"String"},{"name":"pushStatus","kind":"enum","type":"PushStatus"},{"name":"pushTickets","kind":"object","type":"PushTicket","relationName":"NotificationToPushTicket"}],"dbName":null,"schema":null},"NotificationPrefs":{"fields":[{"name":"id","kind":"scalar","type":"String"},{"name":"createdAt","kind":"scalar","type":"DateTime"},{"name":"updatedAt","kind":"scalar","type":"DateTime"},{"name":"userId","kind":"scalar","type":"String"},{"name":"user","kind":"object","type":"User","relationName":"NotificationPrefsToUser"},{"name":"mutedCategories","kind":"enum","type":"NotificationCategory"},{"name":"quietStartMinute","kind":"scalar","type":"Int"},{"name":"quietEndMinute","kind":"scalar","type":"Int"},{"name":"mutedChatGroupIds","kind":"scalar","type":"String"},{"name":"mediaAutoDownload","kind":"enum","type":"MediaAutoDownload"}],"dbName":null,"schema":null},"PushTicket":{"fields":[{"name":"id","kind":"scalar","type":"String"},{"name":"createdAt","kind":"scalar","type":"DateTime"},{"name":"notificationId","kind":"scalar","type":"String"},{"name":"notification","kind":"object","type":"Notification","relationName":"NotificationToPushTicket"},{"name":"deviceId","kind":"scalar","type":"String"},{"name":"device","kind":"object","type":"Device","relationName":"DeviceToPushTicket"},{"name":"ticketId","kind":"scalar","type":"String"},{"name":"status","kind":"enum","type":"PushTicketStatus"},{"name":"error","kind":"scalar","type":"String"},{"name":"checkedAt","kind":"scalar","type":"DateTime"}],"dbName":null,"schema":null},"RateLimitRecord":{"fields":[{"name":"key","kind":"scalar","type":"String"},{"name":"consumed","kind":"scalar","type":"Int"},{"name":"expiresAt","kind":"scalar","type":"DateTime"},{"name":"blockedUntil","kind":"scalar","type":"DateTime"},{"name":"updatedAt","kind":"scalar","type":"DateTime"}],"dbName":null,"schema":null}},"enums":{},"types":{}}');
config.parameterizationSchema = {
  strings: JSON.parse('["where","orderBy","cursor","user","device","refreshTokens","createdBy","group","currentOfGroup","cycle","proposer","subject","proposal","membership","voteReceipts","ballots","invites","effectiveFromRound","createdByProposal","ruleSets","loan","requester","recipient","disbursement","solidarityRequest","round","creditor","obligations","_count","acceptedBy","invitesCreated","credits","paymentIntents","disbursements","loans","bids","beneficiaryRounds","statements","transaction","postings","ledgerTransactions","proposals","proposalsAbout","solidarityRequested","solidarityReceived","agendaItems","meeting","attendances","author","uploader","message","attachment","replyTo","replies","messages","attachments","approvals","pinReset","pinResetApprovals","beneficiary","ruleSetsEffective","rounds","currentCycle","memberships","cycles","solidarityRequests","meetings","notifications","pendingActions","conversations","actor","auditLogs","uploadTickets","pushTickets","notification","devices","paymentNumbers","pinResets","createdGroups","acceptedInvites","notificationPrefs","conversation","AgentConversation.findUnique","AgentConversation.findUniqueOrThrow","AgentConversation.findFirst","AgentConversation.findFirstOrThrow","AgentConversation.findMany","data","AgentConversation.createOne","AgentConversation.createMany","AgentConversation.createManyAndReturn","AgentConversation.updateOne","AgentConversation.updateMany","AgentConversation.updateManyAndReturn","create","update","AgentConversation.upsertOne","AgentConversation.deleteOne","AgentConversation.deleteMany","having","_min","_max","AgentConversation.groupBy","AgentConversation.aggregate","AgentMessage.findUnique","AgentMessage.findUniqueOrThrow","AgentMessage.findFirst","AgentMessage.findFirstOrThrow","AgentMessage.findMany","AgentMessage.createOne","AgentMessage.createMany","AgentMessage.createManyAndReturn","AgentMessage.updateOne","AgentMessage.updateMany","AgentMessage.updateManyAndReturn","AgentMessage.upsertOne","AgentMessage.deleteOne","AgentMessage.deleteMany","AgentMessage.groupBy","AgentMessage.aggregate","PendingAction.findUnique","PendingAction.findUniqueOrThrow","PendingAction.findFirst","PendingAction.findFirstOrThrow","PendingAction.findMany","PendingAction.createOne","PendingAction.createMany","PendingAction.createManyAndReturn","PendingAction.updateOne","PendingAction.updateMany","PendingAction.updateManyAndReturn","PendingAction.upsertOne","PendingAction.deleteOne","PendingAction.deleteMany","PendingAction.groupBy","PendingAction.aggregate","AuditLog.findUnique","AuditLog.findUniqueOrThrow","AuditLog.findFirst","AuditLog.findFirstOrThrow","AuditLog.findMany","AuditLog.createOne","AuditLog.createMany","AuditLog.createManyAndReturn","AuditLog.updateOne","AuditLog.updateMany","AuditLog.updateManyAndReturn","AuditLog.upsertOne","AuditLog.deleteOne","AuditLog.deleteMany","AuditLog.groupBy","AuditLog.aggregate","Message.findUnique","Message.findUniqueOrThrow","Message.findFirst","Message.findFirstOrThrow","Message.findMany","Message.createOne","Message.createMany","Message.createManyAndReturn","Message.updateOne","Message.updateMany","Message.updateManyAndReturn","Message.upsertOne","Message.deleteOne","Message.deleteMany","Message.groupBy","Message.aggregate","Attachment.findUnique","Attachment.findUniqueOrThrow","Attachment.findFirst","Attachment.findFirstOrThrow","Attachment.findMany","Attachment.createOne","Attachment.createMany","Attachment.createManyAndReturn","Attachment.updateOne","Attachment.updateMany","Attachment.updateManyAndReturn","Attachment.upsertOne","Attachment.deleteOne","Attachment.deleteMany","_avg","_sum","Attachment.groupBy","Attachment.aggregate","UploadTicket.findUnique","UploadTicket.findUniqueOrThrow","UploadTicket.findFirst","UploadTicket.findFirstOrThrow","UploadTicket.findMany","UploadTicket.createOne","UploadTicket.createMany","UploadTicket.createManyAndReturn","UploadTicket.updateOne","UploadTicket.updateMany","UploadTicket.updateManyAndReturn","UploadTicket.upsertOne","UploadTicket.deleteOne","UploadTicket.deleteMany","UploadTicket.groupBy","UploadTicket.aggregate","DeploymentJob.findUnique","DeploymentJob.findUniqueOrThrow","DeploymentJob.findFirst","DeploymentJob.findFirstOrThrow","DeploymentJob.findMany","DeploymentJob.createOne","DeploymentJob.createMany","DeploymentJob.createManyAndReturn","DeploymentJob.updateOne","DeploymentJob.updateMany","DeploymentJob.updateManyAndReturn","DeploymentJob.upsertOne","DeploymentJob.deleteOne","DeploymentJob.deleteMany","DeploymentJob.groupBy","DeploymentJob.aggregate","Proposal.findUnique","Proposal.findUniqueOrThrow","Proposal.findFirst","Proposal.findFirstOrThrow","Proposal.findMany","Proposal.createOne","Proposal.createMany","Proposal.createManyAndReturn","Proposal.updateOne","Proposal.updateMany","Proposal.updateManyAndReturn","Proposal.upsertOne","Proposal.deleteOne","Proposal.deleteMany","Proposal.groupBy","Proposal.aggregate","VoteReceipt.findUnique","VoteReceipt.findUniqueOrThrow","VoteReceipt.findFirst","VoteReceipt.findFirstOrThrow","VoteReceipt.findMany","VoteReceipt.createOne","VoteReceipt.createMany","VoteReceipt.createManyAndReturn","VoteReceipt.updateOne","VoteReceipt.updateMany","VoteReceipt.updateManyAndReturn","VoteReceipt.upsertOne","VoteReceipt.deleteOne","VoteReceipt.deleteMany","VoteReceipt.groupBy","VoteReceipt.aggregate","Ballot.findUnique","Ballot.findUniqueOrThrow","Ballot.findFirst","Ballot.findFirstOrThrow","Ballot.findMany","Ballot.createOne","Ballot.createMany","Ballot.createManyAndReturn","Ballot.updateOne","Ballot.updateMany","Ballot.updateManyAndReturn","Ballot.upsertOne","Ballot.deleteOne","Ballot.deleteMany","Ballot.groupBy","Ballot.aggregate","SolidarityRequest.findUnique","SolidarityRequest.findUniqueOrThrow","SolidarityRequest.findFirst","SolidarityRequest.findFirstOrThrow","SolidarityRequest.findMany","SolidarityRequest.createOne","SolidarityRequest.createMany","SolidarityRequest.createManyAndReturn","SolidarityRequest.updateOne","SolidarityRequest.updateMany","SolidarityRequest.updateManyAndReturn","SolidarityRequest.upsertOne","SolidarityRequest.deleteOne","SolidarityRequest.deleteMany","SolidarityRequest.groupBy","SolidarityRequest.aggregate","Group.findUnique","Group.findUniqueOrThrow","Group.findFirst","Group.findFirstOrThrow","Group.findMany","Group.createOne","Group.createMany","Group.createManyAndReturn","Group.updateOne","Group.updateMany","Group.updateManyAndReturn","Group.upsertOne","Group.deleteOne","Group.deleteMany","Group.groupBy","Group.aggregate","Membership.findUnique","Membership.findUniqueOrThrow","Membership.findFirst","Membership.findFirstOrThrow","Membership.findMany","Membership.createOne","Membership.createMany","Membership.createManyAndReturn","Membership.updateOne","Membership.updateMany","Membership.updateManyAndReturn","Membership.upsertOne","Membership.deleteOne","Membership.deleteMany","Membership.groupBy","Membership.aggregate","Invite.findUnique","Invite.findUniqueOrThrow","Invite.findFirst","Invite.findFirstOrThrow","Invite.findMany","Invite.createOne","Invite.createMany","Invite.createManyAndReturn","Invite.updateOne","Invite.updateMany","Invite.updateManyAndReturn","Invite.upsertOne","Invite.deleteOne","Invite.deleteMany","Invite.groupBy","Invite.aggregate","RuleSet.findUnique","RuleSet.findUniqueOrThrow","RuleSet.findFirst","RuleSet.findFirstOrThrow","RuleSet.findMany","RuleSet.createOne","RuleSet.createMany","RuleSet.createManyAndReturn","RuleSet.updateOne","RuleSet.updateMany","RuleSet.updateManyAndReturn","RuleSet.upsertOne","RuleSet.deleteOne","RuleSet.deleteMany","RuleSet.groupBy","RuleSet.aggregate","User.findUnique","User.findUniqueOrThrow","User.findFirst","User.findFirstOrThrow","User.findMany","User.createOne","User.createMany","User.createManyAndReturn","User.updateOne","User.updateMany","User.updateManyAndReturn","User.upsertOne","User.deleteOne","User.deleteMany","User.groupBy","User.aggregate","Device.findUnique","Device.findUniqueOrThrow","Device.findFirst","Device.findFirstOrThrow","Device.findMany","Device.createOne","Device.createMany","Device.createManyAndReturn","Device.updateOne","Device.updateMany","Device.updateManyAndReturn","Device.upsertOne","Device.deleteOne","Device.deleteMany","Device.groupBy","Device.aggregate","PaymentNumber.findUnique","PaymentNumber.findUniqueOrThrow","PaymentNumber.findFirst","PaymentNumber.findFirstOrThrow","PaymentNumber.findMany","PaymentNumber.createOne","PaymentNumber.createMany","PaymentNumber.createManyAndReturn","PaymentNumber.updateOne","PaymentNumber.updateMany","PaymentNumber.updateManyAndReturn","PaymentNumber.upsertOne","PaymentNumber.deleteOne","PaymentNumber.deleteMany","PaymentNumber.groupBy","PaymentNumber.aggregate","RefreshToken.findUnique","RefreshToken.findUniqueOrThrow","RefreshToken.findFirst","RefreshToken.findFirstOrThrow","RefreshToken.findMany","RefreshToken.createOne","RefreshToken.createMany","RefreshToken.createManyAndReturn","RefreshToken.updateOne","RefreshToken.updateMany","RefreshToken.updateManyAndReturn","RefreshToken.upsertOne","RefreshToken.deleteOne","RefreshToken.deleteMany","RefreshToken.groupBy","RefreshToken.aggregate","PinReset.findUnique","PinReset.findUniqueOrThrow","PinReset.findFirst","PinReset.findFirstOrThrow","PinReset.findMany","PinReset.createOne","PinReset.createMany","PinReset.createManyAndReturn","PinReset.updateOne","PinReset.updateMany","PinReset.updateManyAndReturn","PinReset.upsertOne","PinReset.deleteOne","PinReset.deleteMany","PinReset.groupBy","PinReset.aggregate","PinResetApproval.findUnique","PinResetApproval.findUniqueOrThrow","PinResetApproval.findFirst","PinResetApproval.findFirstOrThrow","PinResetApproval.findMany","PinResetApproval.createOne","PinResetApproval.createMany","PinResetApproval.createManyAndReturn","PinResetApproval.updateOne","PinResetApproval.updateMany","PinResetApproval.updateManyAndReturn","PinResetApproval.upsertOne","PinResetApproval.deleteOne","PinResetApproval.deleteMany","PinResetApproval.groupBy","PinResetApproval.aggregate","LedgerTransaction.findUnique","LedgerTransaction.findUniqueOrThrow","LedgerTransaction.findFirst","LedgerTransaction.findFirstOrThrow","LedgerTransaction.findMany","LedgerTransaction.createOne","LedgerTransaction.createMany","LedgerTransaction.createManyAndReturn","LedgerTransaction.updateOne","LedgerTransaction.updateMany","LedgerTransaction.updateManyAndReturn","LedgerTransaction.upsertOne","LedgerTransaction.deleteOne","LedgerTransaction.deleteMany","LedgerTransaction.groupBy","LedgerTransaction.aggregate","LedgerPosting.findUnique","LedgerPosting.findUniqueOrThrow","LedgerPosting.findFirst","LedgerPosting.findFirstOrThrow","LedgerPosting.findMany","LedgerPosting.createOne","LedgerPosting.createMany","LedgerPosting.createManyAndReturn","LedgerPosting.updateOne","LedgerPosting.updateMany","LedgerPosting.updateManyAndReturn","LedgerPosting.upsertOne","LedgerPosting.deleteOne","LedgerPosting.deleteMany","LedgerPosting.groupBy","LedgerPosting.aggregate","ReconciliationRun.findUnique","ReconciliationRun.findUniqueOrThrow","ReconciliationRun.findFirst","ReconciliationRun.findFirstOrThrow","ReconciliationRun.findMany","ReconciliationRun.createOne","ReconciliationRun.createMany","ReconciliationRun.createManyAndReturn","ReconciliationRun.updateOne","ReconciliationRun.updateMany","ReconciliationRun.updateManyAndReturn","ReconciliationRun.upsertOne","ReconciliationRun.deleteOne","ReconciliationRun.deleteMany","ReconciliationRun.groupBy","ReconciliationRun.aggregate","Meeting.findUnique","Meeting.findUniqueOrThrow","Meeting.findFirst","Meeting.findFirstOrThrow","Meeting.findMany","Meeting.createOne","Meeting.createMany","Meeting.createManyAndReturn","Meeting.updateOne","Meeting.updateMany","Meeting.updateManyAndReturn","Meeting.upsertOne","Meeting.deleteOne","Meeting.deleteMany","Meeting.groupBy","Meeting.aggregate","AgendaItem.findUnique","AgendaItem.findUniqueOrThrow","AgendaItem.findFirst","AgendaItem.findFirstOrThrow","AgendaItem.findMany","AgendaItem.createOne","AgendaItem.createMany","AgendaItem.createManyAndReturn","AgendaItem.updateOne","AgendaItem.updateMany","AgendaItem.updateManyAndReturn","AgendaItem.upsertOne","AgendaItem.deleteOne","AgendaItem.deleteMany","AgendaItem.groupBy","AgendaItem.aggregate","Attendance.findUnique","Attendance.findUniqueOrThrow","Attendance.findFirst","Attendance.findFirstOrThrow","Attendance.findMany","Attendance.createOne","Attendance.createMany","Attendance.createManyAndReturn","Attendance.updateOne","Attendance.updateMany","Attendance.updateManyAndReturn","Attendance.upsertOne","Attendance.deleteOne","Attendance.deleteMany","Attendance.groupBy","Attendance.aggregate","Cycle.findUnique","Cycle.findUniqueOrThrow","Cycle.findFirst","Cycle.findFirstOrThrow","Cycle.findMany","Cycle.createOne","Cycle.createMany","Cycle.createManyAndReturn","Cycle.updateOne","Cycle.updateMany","Cycle.updateManyAndReturn","Cycle.upsertOne","Cycle.deleteOne","Cycle.deleteMany","Cycle.groupBy","Cycle.aggregate","Round.findUnique","Round.findUniqueOrThrow","Round.findFirst","Round.findFirstOrThrow","Round.findMany","Round.createOne","Round.createMany","Round.createManyAndReturn","Round.updateOne","Round.updateMany","Round.updateManyAndReturn","Round.upsertOne","Round.deleteOne","Round.deleteMany","Round.groupBy","Round.aggregate","Obligation.findUnique","Obligation.findUniqueOrThrow","Obligation.findFirst","Obligation.findFirstOrThrow","Obligation.findMany","Obligation.createOne","Obligation.createMany","Obligation.createManyAndReturn","Obligation.updateOne","Obligation.updateMany","Obligation.updateManyAndReturn","Obligation.upsertOne","Obligation.deleteOne","Obligation.deleteMany","Obligation.groupBy","Obligation.aggregate","PaymentIntent.findUnique","PaymentIntent.findUniqueOrThrow","PaymentIntent.findFirst","PaymentIntent.findFirstOrThrow","PaymentIntent.findMany","PaymentIntent.createOne","PaymentIntent.createMany","PaymentIntent.createManyAndReturn","PaymentIntent.updateOne","PaymentIntent.updateMany","PaymentIntent.updateManyAndReturn","PaymentIntent.upsertOne","PaymentIntent.deleteOne","PaymentIntent.deleteMany","PaymentIntent.groupBy","PaymentIntent.aggregate","Disbursement.findUnique","Disbursement.findUniqueOrThrow","Disbursement.findFirst","Disbursement.findFirstOrThrow","Disbursement.findMany","Disbursement.createOne","Disbursement.createMany","Disbursement.createManyAndReturn","Disbursement.updateOne","Disbursement.updateMany","Disbursement.updateManyAndReturn","Disbursement.upsertOne","Disbursement.deleteOne","Disbursement.deleteMany","Disbursement.groupBy","Disbursement.aggregate","Loan.findUnique","Loan.findUniqueOrThrow","Loan.findFirst","Loan.findFirstOrThrow","Loan.findMany","Loan.createOne","Loan.createMany","Loan.createManyAndReturn","Loan.updateOne","Loan.updateMany","Loan.updateManyAndReturn","Loan.upsertOne","Loan.deleteOne","Loan.deleteMany","Loan.groupBy","Loan.aggregate","Bid.findUnique","Bid.findUniqueOrThrow","Bid.findFirst","Bid.findFirstOrThrow","Bid.findMany","Bid.createOne","Bid.createMany","Bid.createManyAndReturn","Bid.updateOne","Bid.updateMany","Bid.updateManyAndReturn","Bid.upsertOne","Bid.deleteOne","Bid.deleteMany","Bid.groupBy","Bid.aggregate","Statement.findUnique","Statement.findUniqueOrThrow","Statement.findFirst","Statement.findFirstOrThrow","Statement.findMany","Statement.createOne","Statement.createMany","Statement.createManyAndReturn","Statement.updateOne","Statement.updateMany","Statement.updateManyAndReturn","Statement.upsertOne","Statement.deleteOne","Statement.deleteMany","Statement.groupBy","Statement.aggregate","Notification.findUnique","Notification.findUniqueOrThrow","Notification.findFirst","Notification.findFirstOrThrow","Notification.findMany","Notification.createOne","Notification.createMany","Notification.createManyAndReturn","Notification.updateOne","Notification.updateMany","Notification.updateManyAndReturn","Notification.upsertOne","Notification.deleteOne","Notification.deleteMany","Notification.groupBy","Notification.aggregate","NotificationPrefs.findUnique","NotificationPrefs.findUniqueOrThrow","NotificationPrefs.findFirst","NotificationPrefs.findFirstOrThrow","NotificationPrefs.findMany","NotificationPrefs.createOne","NotificationPrefs.createMany","NotificationPrefs.createManyAndReturn","NotificationPrefs.updateOne","NotificationPrefs.updateMany","NotificationPrefs.updateManyAndReturn","NotificationPrefs.upsertOne","NotificationPrefs.deleteOne","NotificationPrefs.deleteMany","NotificationPrefs.groupBy","NotificationPrefs.aggregate","PushTicket.findUnique","PushTicket.findUniqueOrThrow","PushTicket.findFirst","PushTicket.findFirstOrThrow","PushTicket.findMany","PushTicket.createOne","PushTicket.createMany","PushTicket.createManyAndReturn","PushTicket.updateOne","PushTicket.updateMany","PushTicket.updateManyAndReturn","PushTicket.upsertOne","PushTicket.deleteOne","PushTicket.deleteMany","PushTicket.groupBy","PushTicket.aggregate","RateLimitRecord.findUnique","RateLimitRecord.findUniqueOrThrow","RateLimitRecord.findFirst","RateLimitRecord.findFirstOrThrow","RateLimitRecord.findMany","RateLimitRecord.createOne","RateLimitRecord.createMany","RateLimitRecord.createManyAndReturn","RateLimitRecord.updateOne","RateLimitRecord.updateMany","RateLimitRecord.updateManyAndReturn","RateLimitRecord.upsertOne","RateLimitRecord.deleteOne","RateLimitRecord.deleteMany","RateLimitRecord.groupBy","RateLimitRecord.aggregate","AND","OR","NOT","key","consumed","expiresAt","blockedUntil","updatedAt","equals","in","notIn","lt","lte","gt","gte","not","contains","startsWith","endsWith","id","createdAt","notificationId","deviceId","ticketId","PushTicketStatus","status","error","checkedAt","userId","mutedCategories","quietStartMinute","quietEndMinute","mutedChatGroupIds","MediaAutoDownload","mediaAutoDownload","has","hasEvery","hasSome","NotificationCategory","groupId","category","titleFr","titleEn","bodyFr","bodyEn","deepLink","readAt","pushTicketId","PushStatus","pushStatus","membershipId","periodStart","periodEnd","Language","language","fileKey","verificationCode","ledgerHeadHash","roundId","amount","placedAt","principal","months","ratePermille","interest","feeEstimated","totalDue","LoanStatus","decidedByMembershipId","decisionReason","decidedAt","proposalId","disbursementId","DisbursementPurpose","purpose","feeActual","phoneSnapshot","provider","providerRef","DisbursementStatus","settledAt","obligationIds","PaymentStatus","fee","FeeSource","feeSource","Operator","operator","operatorRef","ObligationKind","kind","loanId","creditorMembershipId","dueAt","ObligationStatus","paidAt","onTime","cycleId","number","beneficiaryMembershipId","payoutAt","RoundStatus","ruleSetVersion","RotationMode","mode","firstPayoutAt","drawSeed","rotation","startedAt","closedAt","meetingId","present","excused","excuseReason","checkedInAt","markedByMembershipId","authorMembershipId","text","AgendaItemSource","source","scheduledAt","place","MeetingStatus","agenda","minutesDraft","minutesPublished","minutesVersion","publishedAt","string_contains","string_starts_with","string_ends_with","array_starts_with","array_ends_with","array_contains","ranAt","providerAccount","providerBalance","ledgerCash","inFlight","difference","ReconciliationStatus","details","transactionId","account","seq","LedgerTransactionType","type","occurredAt","refType","refId","descriptionFr","descriptionEn","metadata","prevHash","hash","pinResetId","PinResetStatus","requestExpiresAt","approvedInGroupId","approvedAt","tokenHash","linkExpiresAt","completedAt","familyId","ClientKind","client","usedAt","replacedByTokenId","revokedAt","RefreshRevokedReason","revokedReason","activeFrom","activeTo","DevicePlatform","platform","expoPushToken","lastSeenAt","sessionFamilyId","name","loginPhone","pinHash","consentVersion","consentAt","pinChangedAt","pinResetAt","sessionEpoch","deletedAt","every","some","none","version","params","effectiveFromRoundId","createdByProposalId","inviteeName","phoneHash","acceptedByUserId","createdByMembershipId","MembershipRole","role","MembershipStatus","activeFromCycle","leftAt","chatLastReadAt","GroupStatus","createdByUserId","currentCycleId","requesterMembershipId","recipientMembershipId","SolidarityEvent","event","note","SolidarityRequestStatus","VoteChoice","choice","castAt","votedAt","ProposalType","payload","reason","proposerMembershipId","secret","ThresholdKind","thresholdKind","eligibleMembershipIds","subjectMembershipId","mustApproveMembershipIds","remindedAt","yesCount","noCount","opensAt","closesAt","ProposalStatus","appliedAt","effect","jobKey","runAt","attempts","maxAttempts","leaseUntil","leaseToken","lastError","name_jobKey","AttachmentKind","declaredMime","maxBytes","storageKey","thumbnailKey","attachmentId","uploaderMembershipId","mime","sizeBytes","durationSec","width","height","MessageKind","systemText","replyToId","mentions","isAnnouncement","hiddenByAdminAt","actorUserId","action","target","requestId","args","preview","ActionLevel","level","PendingActionStatus","ActionOrigin","origin","confirmedAt","resultRef","resultSummary","failureCode","failureText","conversationId","AgentMessageRole","content","toolName","toolArgsRedacted","ToolCallStatus","toolStatus","AgentChannel","channel","rollingSummary","groupId_number","groupId_userId","pinResetId_membershipId","meetingId_membershipId","groupId_seq","roundId_membershipId","groupId_version","proposalId_membershipId","cycleId_number","is","isNot","connectOrCreate","upsert","createMany","set","disconnect","delete","connect","updateMany","deleteMany","push","increment","decrement","multiply","divide"]'),
  graph: "9Br5AoAFDQMAAPMJACAHAADVCwAgNgAA2AsAINoFAADWCwAw2wUAANIBABDcBQAA1gsAMOEFQADgCQAh7QUBAAAAAe4FQADgCQAh9gUBAMEKACGBBgEAkwsAIfcHAADXC_cHIvgHAQCUCwAhAQAAAAEAIA4DAADzCQAgBQAA4woAIEkAAOALACDaBQAAuQwAMNsFAAADABDcBQAAuQwAMO0FAQDBCgAh7gVAAOAJACH2BQEAwQoAIYIHQADhCQAhiAcAALoMiAciiQcBAJQLACGKB0AA4AkAIYsHAQCTCwAhBgMAANoMACAFAACwFgAgSQAAjRcAIIIHAAC7DAAgiQcAALsMACCLBwAAuwwAIA4DAADzCQAgBQAA4woAIEkAAOALACDaBQAAuQwAMNsFAAADABDcBQAAuQwAMO0FAQAAAAHuBUAA4AkAIfYFAQDBCgAhggdAAOEJACGIBwAAugyIByKJBwEAAAABigdAAOAJACGLBwEAkwsAIQMAAAADACABAAAEADACAAAFACARAwAA8wkAIAQAALgMACDaBQAAtQwAMNsFAAAHABDcBQAAtQwAMN8FQADgCQAh7QUBAMEKACHuBUAA4AkAIfAFAQCTCwAh9gUBAMEKACH6BgEA3gkAIf0GAQDBCgAh_wYAALYM_wYigAdAAOEJACGBBwEAkwsAIYIHQADhCQAhhAcAALcMhAcjBwMAANoMACAEAAChFwAg8AUAALsMACCABwAAuwwAIIEHAAC7DAAgggcAALsMACCEBwAAuwwAIBEDAADzCQAgBAAAuAwAINoFAAC1DAAw2wUAAAcAENwFAAC1DAAw3wVAAOAJACHtBQEAAAAB7gVAAOAJACHwBQEAkwsAIfYFAQDBCgAh-gYBAAAAAf0GAQDBCgAh_wYAALYM_wYigAdAAOEJACGBBwEAkwsAIYIHQADhCQAhhAcAALcMhAcjAwAAAAcAIAEAAAgAMAIAAAkAIAEAAAADACANBAAAtAwAIEoAALMMACDaBQAAsQwAMNsFAAAMABDcBQAAsQwAMO0FAQDBCgAh7gVAAOAJACHvBQEAwQoAIfAFAQDBCgAh8QUBAJQLACHzBQAAsgzzBSL0BQEAlAsAIfUFQADhCQAhBQQAAKEXACBKAACgFwAg8QUAALsMACD0BQAAuwwAIPUFAAC7DAAgDQQAALQMACBKAACzDAAg2gUAALEMADDbBQAADAAQ3AUAALEMADDtBQEAAAAB7gVAAOAJACHvBQEAwQoAIfAFAQDBCgAh8QUBAAAAAfMFAACyDPMFIvQFAQCUCwAh9QVAAOEJACEDAAAADAAgAQAADQAwAgAADgAgIgYAAPMJACAQAADnCgAgEwAAvgsAIBsAAMELACAgAADCCwAgIQAAwwsAICIAAMQLACAoAADFCwAgKQAAxgsAIDYAAMkLACA3AADKCwAgPQAAwAsAID4AAL0LACA_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_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_gcAAJQMACADAAAAVgAgAQAAVwAwAgAAWAAgAwAAABUAIAEAABYAMAIAABcAIA0NAAD0CwAg2gUAAJMMADDbBQAAWwAQ3AUAAJMMADDtBQEAwQoAIe4FQADgCQAhjAYBAMEKACGNBkAA4AkAIY4GQADgCQAhkAYAAOAKkAYikQYBAN4JACGSBgEA3gkAIZMGAQDeCQAhAQ0AAJUXACANDQAA9AsAINoFAACTDAAw2wUAAFsAENwFAACTDAAw7QUBAAAAAe4FQADgCQAhjAYBAMEKACGNBkAA4AkAIY4GQADgCQAhkAYAAOAKkAYikQYBAN4JACGSBgEAAAABkwYBAN4JACEDAAAAWwAgAQAAXAAwAgAAXQAgFgcAANILACANAAD6CwAgGQAAkQwAICcAAJIMACDaBQAAjwwAMNsFAABfABDcBQAAjwwAMO0FAQDBCgAh7gVAAOAJACGBBgEAwQoAIYwGAQCTCwAhlAYBAJMLACHqBgIA3wkAIewGAACQDOwGIu0GQADgCQAh7gYBAJQLACHvBgEAlAsAIfAGAQDeCQAh8QYBAN4JACHyBgAAwwoAIPMGAQDeCQAh9AYBAN4JACEIBwAAixcAIA0AAJUXACAZAACeFwAgJwAAnxcAIIwGAAC7DAAglAYAALsMACDuBgAAuwwAIO8GAAC7DAAgFwcAANILACANAAD6CwAgGQAAkQwAICcAAJIMACDaBQAAjwwAMNsFAABfABDcBQAAjwwAMO0FAQAAAAHuBUAA4AkAIYEGAQDBCgAhjAYBAJMLACGUBgEAkwsAIeoGAgDfCQAh7AYAAJAM7AYi7QZAAOAJACHuBgEAlAsAIe8GAQCUCwAh8AYBAN4JACHxBgEA3gkAIfIGAADDCgAg8wYBAN4JACH0BgEAAAAB_QcAAI4MACADAAAAXwAgAQAAYAAwAgAAYQAgAQAAABUAIAEAAAAZACAJJgAAjQwAINoFAACMDAAw2wUAAGUAENwFAACMDAAw7QUBAMEKACHuBUAA4AkAIZUGAgDfCQAh6AYBAMEKACHpBgEA3gkAIQEmAACdFwAgCSYAAI0MACDaBQAAjAwAMNsFAABlABDcBQAAjAwAMO0FAQAAAAHuBUAA4AkAIZUGAgDfCQAh6AYBAMEKACHpBgEA3gkAIQMAAABlACABAABmADACAABnACABAAAAZQAgDwcAAIsXACAKAACVFwAgCwAAlRcAIA4AAJIXACAPAACTFwAgEAAAtBYAIBMAAP0WACAUAACbFwAgGAAAnBcAIMcGAAC7DAAgtQcAALsMACC7BwAAuwwAIL0HAAC7DAAgwwcAALsMACDEBwAAuwwAICEHAADSCwAgCgAA9AsAIAsAAPoLACAOAADvCwAgDwAA8AsAIBAAAOcKACATAAC-CwAgFAAAigwAIBgAAIsMACDaBQAAhgwAMNsFAAAfABDcBQAAhgwAMO0FAQAAAAHuBUAA4AkAIfMFAACJDMMHIoEGAQDBCgAhxwZAAOEJACHsBgAAhwy0ByK0BwAAwwoAILUHAQCUCwAhtgcBAMEKACG3ByAA-QsAIbkHAACIDLkHIroHAADtCQAguwcBAJMLACG8BwAA7QkAIL0HQADhCQAhvgcCAN8JACG_BwIA3wkAIcAHQADgCQAhwQdAAOAJACHDB0AA4QkAIcQHAAC4CwAgAwAAAB8AIAEAAGoAMAIAAGsAIAMAAAAfACABAABqADACAABrACADAAAAIgAgAQAAIwAwAgAAJAAgAwAAACYAIAEAACcAMAIAACgAIAgHAACLFwAgDAAAmRcAIBUAAJUXACAWAACVFwAgFwAAmhcAIKEGAAC7DAAgogYAALsMACCtBwAAuwwAIBMHAADSCwAgDAAAhAwAIBUAAPQLACAWAAD0CwAgFwAAhQwAINoFAACBDAAw2wUAADcAENwFAACBDAAw7QUBAAAAAe4FQADgCQAh8wUAAIMMrwcigQYBAMEKACGVBgIA3wkAIaEGAQAAAAGiBgEAAAABqQcBAMEKACGqBwEAwQoAIawHAACCDKwHIq0HAQCUCwAhAwAAADcAIAEAAHAAMAIAAHEAIAMAAAA3ACABAABwADACAABxACALLgAA_gsAIDAAAPoLACDaBQAA_wsAMNsFAAB0ABDcBQAA_wsAMO0FAQDBCgAh7gVAAOAJACHIBgEAwQoAIc4GAQCTCwAhzwYBAN4JACHRBgAAgAzRBiIDLgAAmBcAIDAAAJUXACDOBgAAuwwAIAsuAAD-CwAgMAAA-gsAINoFAAD_CwAw2wUAAHQAENwFAAD_CwAw7QUBAAAAAe4FQADgCQAhyAYBAMEKACHOBgEAkwsAIc8GAQDeCQAh0QYAAIAM0QYiAwAAAHQAIAEAAHUAMAIAAHYAIAMAAAB0ACABAAB1ADACAAB2ACAODQAA9AsAIC4AAP4LACDaBQAA_QsAMNsFAAB5ABDcBQAA_QsAMO0FAQDBCgAh7gVAAOAJACGMBgEAwQoAIcgGAQDBCgAhyQYgAPkLACHKBiAA-QsAIcsGAQCUCwAhzAZAAOEJACHNBgEAkwsAIQUNAACVFwAgLgAAmBcAIMsGAAC7DAAgzAYAALsMACDNBgAAuwwAIA8NAAD0CwAgLgAA_gsAINoFAAD9CwAw2wUAAHkAENwFAAD9CwAw7QUBAAAAAe4FQADgCQAhjAYBAMEKACHIBgEAwQoAIckGIAD5CwAhygYgAPkLACHLBgEAlAsAIcwGQADhCQAhzQYBAJMLACH8BwAA_AsAIAMAAAB5ACABAAB6ADACAAB7ACABAAAAdAAgAQAAAHkAIAEAAAAZACADAAAAeQAgAQAAegAwAgAAewAgFQcAANILACAwAAD6CwAgMwAA-wsAIDQAAPYLACA1AADJCwAg2gUAAPcLADDbBQAAgQEAENwFAAD3CwAw7QUBAMEKACHuBUAA4AkAIYEGAQDBCgAhtAYAAPgL2gcizgYBAJMLACHPBgEAlAsAIZQHQADhCQAh0gcBAJMLACHaBwAAuAsAINsHAQCTCwAh3AcAAO0JACDdByAA-QsAId4HQADhCQAhDAcAAIsXACAwAACVFwAgMwAAlxcAIDQAAJYXACA1AACIFwAgzgYAALsMACDPBgAAuwwAIJQHAAC7DAAg0gcAALsMACDaBwAAuwwAINsHAAC7DAAg3gcAALsMACAVBwAA0gsAIDAAAPoLACAzAAD7CwAgNAAA9gsAIDUAAMkLACDaBQAA9wsAMNsFAACBAQAQ3AUAAPcLADDtBQEAAAAB7gVAAOAJACGBBgEAwQoAIbQGAAD4C9oHIs4GAQCTCwAhzwYBAJQLACGUB0AA4QkAIdIHAQAAAAHaBwAAuAsAINsHAQCTCwAh3AcAAO0JACDdByAA-QsAId4HQADhCQAhAwAAAIEBACABAACCAQAwAgAAgwEAIAEAAAAZACASBwAA0gsAIDEAAPQLACAyAAD2CwAg2gUAAPULADDbBQAAhgEAENwFAAD1CwAw7QUBAMEKACHuBUAA4AkAIYEGAQDBCgAhtAYAANELzgci0AcBAN4JACHRBwEAlAsAIdMHAQDBCgAh1AcBAN4JACHVBwIA3wkAIdYHAgDsCwAh1wcCAOwLACHYBwIA7AsAIQEAAACGAQAgAQAAAIEBACABAAAAgQEAIAMAAACBAQAgAQAAggEAMAIAAIMBACABAAAAgQEAIAcHAACLFwAgMQAAlRcAIDIAAJYXACDRBwAAuwwAINYHAAC7DAAg1wcAALsMACDYBwAAuwwAIBIHAADSCwAgMQAA9AsAIDIAAPYLACDaBQAA9QsAMNsFAACGAQAQ3AUAAPULADDtBQEAAAAB7gVAAOAJACGBBgEAwQoAIbQGAADRC84HItAHAQAAAAHRBwEAAAAB0wcBAMEKACHUBwEA3gkAIdUHAgDfCQAh1gcCAOwLACHXBwIA7AsAIdgHAgDsCwAhAwAAAIYBACABAACMAQAwAgAAjQEAIAoNAAD0CwAgOQAA8wsAINoFAADyCwAw2wUAAI8BABDcBQAA8gsAMO0FAQDBCgAh7gVAAOAJACGBBgEAwQoAIYwGAQDBCgAh9QYBAMEKACECDQAAlRcAIDkAAJQXACALDQAA9AsAIDkAAPMLACDaBQAA8gsAMNsFAACPAQAQ3AUAAPILADDtBQEAAAAB7gVAAOAJACGBBgEAwQoAIYwGAQDBCgAh9QYBAMEKACH7BwAA8QsAIAMAAACPAQAgAQAAkAEAMAIAAJEBACADAAAAjwEAIAEAAJABADACAACRAQAgAQAAAI8BACABAAAAGwAgAQAAADsAIAEAAAA7ACABAAAATAAgAQAAADQAIAEAAAAxACABAAAAVgAgAQAAABUAIAEAAABbACABAAAAXwAgAQAAAB8AIAEAAAAfACABAAAAIgAgAQAAACYAIAEAAAA3ACABAAAANwAgAQAAAHQAIAEAAAB5ACABAAAAgQEAIAEAAACGAQAgAQAAAI8BACADAAAAOwAgAQAAPAAwAgAAPQAgAwAAAFYAIAEAAFcAMAIAAFgAIAMAAABfACABAABgADACAABhACADAAAAKwAgAQAALAAwAgAALQAgAQAAADsAIAEAAABWACABAAAAXwAgAQAAACsAIAEAAAAVACAaAwAA2gwAIAcAAIsXACAOAACSFwAgDwAAkxcAIBsAAIAXACAeAAC0FgAgHwAAgBcAICAAAIEXACAhAACCFwAgIgAAgxcAICMAAJAXACAkAAD_FgAgJQAAkRcAICgAAIQXACApAACFFwAgKgAAhRcAICsAAIYXACAsAACGFwAgLQAAjhcAIC8AAI8XACA2AACIFwAgNwAAiRcAIDoAAIoXACCjBwAAuwwAIKQHAAC7DAAgpQcAALsMACAkAwAA8wkAIAcAANILACAOAADvCwAgDwAA8AsAIBsAAMELACAeAADnCgAgHwAAwQsAICAAAMILACAhAADDCwAgIgAAxAsAICMAAO0LACAkAADACwAgJQAA7gsAICgAAMULACApAADGCwAgKgAAxgsAICsAAMcLACAsAADHCwAgLQAA4wsAIC8AAOQLACA2AADJCwAgNwAAygsAIDoAAM0LACDaBQAA6QsAMNsFAAAZABDcBQAA6QsAMO0FAQAAAAHuBUAA4AkAIfMFAADrC6MHIvYFAQDBCgAhgQYBAMEKACGhBwAA6guhByKjBwIA7AsAIaQHQADhCQAhpQdAAOEJACH6BwAA6AsAIAMAAAAZACABAACzAQAwAgAAtAEAIAMAAAAbACABAAAcADACAAAdACADAAAAKwAgAQAALAAwAgAALQAgBgcAAIsXACAIAACLFwAgPQAA_xYAIMQGAAC7DAAgxgYAALsMACDHBgAAuwwAIBEHAADSCwAgCAAA1QsAID0AAMALACDaBQAA5gsAMNsFAAASABDcBQAA5gsAMO0FAQAAAAHuBUAA4AkAIYEGAQDBCgAhvAYCAN8JACHCBgAA5wvCBiLDBkAA4AkAIcQGAQCUCwAhxQYAAO0JACDGBkAA4QkAIccGQADhCQAh-QcAAOULACADAAAAEgAgAQAAuAEAMAIAALkBACADAAAAFQAgAQAAFgAwAgAAFwAgAwAAADsAIAEAADwAMAIAAD0AIAMAAABMACABAABNADACAABOACADAAAANAAgAQAAUAAwAgAAUQAgAwAAADEAIAEAAFMAMAIAAFQAIAMAAABfACABAABgADACAABhACADAAAAHwAgAQAAagAwAgAAawAgAwAAADcAIAEAAHAAMAIAAHEAIBEHAADSCwAgLQAA4wsAIC8AAOQLACDaBQAA4QsAMNsFAADDAQAQ3AUAAOELADDtBQEAwQoAIe4FQADgCQAh8wUAAOIL1QYigQYBAMEKACHSBkAA4AkAIdMGAQDeCQAh1QYAALgLACDWBgEAlAsAIdcGAQCUCwAh2AYCAN8JACHZBkAA4QkAIQcHAACLFwAgLQAAjhcAIC8AAI8XACDVBgAAuwwAINYGAAC7DAAg1wYAALsMACDZBgAAuwwAIBEHAADSCwAgLQAA4wsAIC8AAOQLACDaBQAA4QsAMNsFAADDAQAQ3AUAAOELADDtBQEAAAAB7gVAAOAJACHzBQAA4gvVBiKBBgEAwQoAIdIGQADgCQAh0wYBAN4JACHVBgAAuAsAINYGAQCUCwAh1wYBAJQLACHYBgIA3wkAIdkGQADhCQAhAwAAAMMBACABAADEAQAwAgAAxQEAIAMAAACBAQAgAQAAggEAMAIAAIMBACADAAAAhgEAIAEAAIwBADACAACNAQAgEwMAAPMJACAHAADVCwAgSQAA4AsAINoFAADdCwAw2wUAAMkBABDcBQAA3QsAMO0FAQDBCgAh7gVAAOAJACH2BQEAwQoAIYEGAQCTCwAhggYAAN4LgQYigwYBAN4JACGEBgEA3gkAIYUGAQDeCQAhhgYBAN4JACGHBgEAlAsAIYgGQADhCQAhiQYBAJQLACGLBgAA3wuLBiIHAwAA2gwAIAcAAIsXACBJAACNFwAggQYAALsMACCHBgAAuwwAIIgGAAC7DAAgiQYAALsMACATAwAA8wkAIAcAANULACBJAADgCwAg2gUAAN0LADDbBQAAyQEAENwFAADdCwAw7QUBAAAAAe4FQADgCQAh9gUBAMEKACGBBgEAkwsAIYIGAADeC4EGIoMGAQDeCQAhhAYBAN4JACGFBgEA3gkAIYYGAQDeCQAhhwYBAJQLACGIBkAA4QkAIYkGAQCUCwAhiwYAAN8LiwYiAwAAAMkBACABAADKAQAwAgAAywEAIBYDAADzCQAgBwAA1QsAINoFAADZCwAw2wUAAM0BABDcBQAA2QsAMN8FQADgCQAh7QUBAMEKACHuBUAA4AkAIfMFAADbC-gHIvYFAQDBCgAhgQYBAJMLACHsBgEA3gkAIfwGQADhCQAh4wcAAMMKACDkBwAAwwoAIOYHAADaC-YHIukHAADcC-kHIuoHQADhCQAh6wcBAJQLACHsBwAAuAsAIO0HAQCUCwAh7gcAALgLACAJAwAA2gwAIAcAAIsXACCBBgAAuwwAIPwGAAC7DAAg6gcAALsMACDrBwAAuwwAIOwHAAC7DAAg7QcAALsMACDuBwAAuwwAIBYDAADzCQAgBwAA1QsAINoFAADZCwAw2wUAAM0BABDcBQAA2QsAMN8FQADgCQAh7QUBAAAAAe4FQADgCQAh8wUAANsL6Aci9gUBAMEKACGBBgEAkwsAIewGAQDeCQAh_AZAAOEJACHjBwAAwwoAIOQHAADDCgAg5gcAANoL5gci6QcAANwL6Qci6gdAAOEJACHrBwEAlAsAIewHAAC4CwAg7QcBAJQLACHuBwAAuAsAIAMAAADNAQAgAQAAzgEAMAIAAM8BACABAAAAEAAgDQMAAPMJACAHAADVCwAgNgAA2AsAINoFAADWCwAw2wUAANIBABDcBQAA1gsAMOEFQADgCQAh7QUBAMEKACHuBUAA4AkAIfYFAQDBCgAhgQYBAJMLACH3BwAA1wv3ByL4BwEAlAsAIQUDAADaDAAgBwAAixcAIDYAAIwXACCBBgAAuwwAIPgHAAC7DAAgAwAAANIBACABAADTAQAwAgAAAQAgDgcAANULACBGAADUCwAg2gUAANMLADDbBQAA1QEAENwFAADTCwAw7QUBAMEKACHuBUAA4AkAIfAFAQCTCwAhgQYBAJMLACHnBgAAwwoAIN8HAQCTCwAh4AcBAN4JACHhBwEAlAsAIeIHAQCUCwAhBwcAAIsXACBGAADaDAAg8AUAALsMACCBBgAAuwwAIN8HAAC7DAAg4QcAALsMACDiBwAAuwwAIA4HAADVCwAgRgAA1AsAINoFAADTCwAw2wUAANUBABDcBQAA0wsAMO0FAQAAAAHuBUAA4AkAIfAFAQCTCwAhgQYBAJMLACHnBgAAwwoAIN8HAQCTCwAh4AcBAN4JACHhBwEAlAsAIeIHAQCUCwAhAwAAANUBACABAADWAQAwAgAA1wEAIAEAAABIACABAAAAEAAgEQMAAPMJACAHAADSCwAg2gUAANALADDbBQAA2wEAENwFAADQCwAw3wVAAOAJACHtBQEAwQoAIe4FQADgCQAh9gUBAMEKACGBBgEAwQoAIbQGAADRC84HIvwGQADhCQAhzgcBAN4JACHPBwIA3wkAIdAHAQDeCQAh0QcBAJQLACHSBwEAkwsAIQUDAADaDAAgBwAAixcAIPwGAAC7DAAg0QcAALsMACDSBwAAuwwAIBEDAADzCQAgBwAA0gsAINoFAADQCwAw2wUAANsBABDcBQAA0AsAMN8FQADgCQAh7QUBAAAAAe4FQADgCQAh9gUBAMEKACGBBgEAwQoAIbQGAADRC84HIvwGQADhCQAhzgcBAN4JACHPBwIA3wkAIdAHAQAAAAHRBwEAAAAB0gcBAAAAAQMAAADbAQAgAQAA3AEAMAIAAN0BACABAAAAGQAgAQAAABsAIAEAAAArACABAAAAEgAgAQAAABUAIAEAAAA7ACABAAAATAAgAQAAADQAIAEAAAAxACABAAAAXwAgAQAAAB8AIAEAAAA3ACABAAAAwwEAIAEAAACBAQAgAQAAAIYBACABAAAAyQEAIAEAAADNAQAgAQAAANIBACABAAAA1QEAIAEAAADbAQAgAwAAAAwAIAEAAA0AMAIAAA4AIAEAAAAMACABAAAABwAgAQAAAAwAIAsDAADzCQAg2gUAAM4LADDbBQAA9wEAENwFAADOCwAw7QUBAMEKACHuBUAA4AkAIfYFAQDBCgAhsQYAAM8LsQYivAYBAN4JACGFB0AA4AkAIYYHQADhCQAhAgMAANoMACCGBwAAuwwAIAsDAADzCQAg2gUAAM4LADDbBQAA9wEAENwFAADOCwAw7QUBAAAAAe4FQADgCQAh9gUBAMEKACGxBgAAzwuxBiK8BgEA3gkAIYUHQADgCQAhhgdAAOEJACEDAAAA9wEAIAEAAPgBADACAAD5AQAgAwAAAAcAIAEAAAgAMAIAAAkAIA8DAADzCQAgOAAAzQsAINoFAADLCwAw2wUAAPwBABDcBQAAywsAMO0FAQDBCgAh7gVAAOAJACHzBQAAzAv3BiL2BQEAwQoAIfcGQADgCQAh-AYBAJMLACH5BkAA4QkAIfoGAQCUCwAh-wZAAOEJACH8BkAA4QkAIQcDAADaDAAgOAAAihcAIPgGAAC7DAAg-QYAALsMACD6BgAAuwwAIPsGAAC7DAAg_AYAALsMACAPAwAA8wkAIDgAAM0LACDaBQAAywsAMNsFAAD8AQAQ3AUAAMsLADDtBQEAAAAB7gVAAOAJACHzBQAAzAv3BiL2BQEAwQoAIfcGQADgCQAh-AYBAJMLACH5BkAA4QkAIfoGAQAAAAH7BkAA4QkAIfwGQADhCQAhAwAAAPwBACABAAD9AQAwAgAA_gEAIAMAAAAZACABAACzAQAwAgAAtAEAIBcGAADaDAAgEAAAtBYAIBMAAP0WACAbAACAFwAgIAAAgRcAICEAAIIXACAiAACDFwAgKAAAhBcAICkAAIUXACA2AACIFwAgNwAAiRcAID0AAP8WACA-AAD8FgAgPwAAshYAIEAAAP4WACBBAACGFwAgQgAAhxcAIEMAALUWACBEAAC3FgAgRQAAuBYAIEcAALkWACBIAAC6FgAgqAcAALsMACAiBgAA8wkAIBAAAOcKACATAAC-CwAgGwAAwQsAICAAAMILACAhAADDCwAgIgAAxAsAICgAAMULACApAADGCwAgNgAAyQsAIDcAAMoLACA9AADACwAgPgAAvQsAID8AAOUKACBAAAC_CwAgQQAAxwsAIEIAAMgLACBDAADoCgAgRAAA6goAIEUAAOsKACBHAADsCgAgSAAA7QoAINoFAAC7CwAw2wUAABAAENwFAAC7CwAw4QVAAOAJACHtBQEAAAAB7gVAAOAJACHzBQAAvAunByLDBkAA4AkAIeEGAQDeCQAhjAcBAN4JACGnBwEAwQoAIagHAQAAAAEDAAAAEAAgAQAAgQIAMAIAAIICACADAAAAGwAgAQAAHAAwAgAAHQAgAwAAAMkBACABAADKAQAwAgAAywEAIA0DAADzCQAg2gUAAPEJADDbBQAAhgIAENwFAADxCQAw4QVAAOAJACHtBQEAwQoAIe4FQADgCQAh9gUBAMEKACH3BQAA7AkAIPgFAgDfCQAh-QUCAN8JACH6BQAA7QkAIPwFAADyCfwFIgEAAACGAgAgAwAAAM0BACABAADOAQAwAgAAzwEAIAMAAADSAQAgAQAA0wEAMAIAAAEAIAMAAADVAQAgAQAA1gEAMAIAANcBACADAAAA2wEAIAEAANwBADACAADdAQAgAQAAAAMAIAEAAAD3AQAgAQAAAAcAIAEAAAD8AQAgAQAAABkAIAEAAAAQACABAAAAGwAgAQAAAMkBACABAAAAzQEAIAEAAADSAQAgAQAAANUBACABAAAA2wEAIAEAAAAQACAMUQAAugsAINoFAAC2CwAw2wUAAJkCABDcBQAAtgsAMO0FAQDBCgAh7gVAAOAJACGhBwAAtwvxByLvBwEAwQoAIfEHAQDeCQAh8gcBAJQLACHzBwAAuAsAIPUHAAC5C_UHIwRRAAD7FgAg8gcAALsMACDzBwAAuwwAIPUHAAC7DAAgDFEAALoLACDaBQAAtgsAMNsFAACZAgAQ3AUAALYLADDtBQEAAAAB7gVAAOAJACGhBwAAtwvxByLvBwEAwQoAIfEHAQDeCQAh8gcBAJQLACHzBwAAuAsAIPUHAAC5C_UHIwMAAACZAgAgAQAAmgIAMAIAAJsCACABAAAAmQIAIAEAAAABACADAAAA0gEAIAEAANMBADACAAABACADAAAA0gEAIAEAANMBADACAAABACADAAAA0gEAIAEAANMBADACAAABACAKAwAApA8AIAcAALgVACA2AAClDwAg4QVAAAAAAe0FAQAAAAHuBUAAAAAB9gUBAAAAAYEGAQAAAAH3BwAAAPcHAvgHAQAAAAEBVwAAogIAIAfhBUAAAAAB7QUBAAAAAe4FQAAAAAH2BQEAAAABgQYBAAAAAfcHAAAA9wcC-AcBAAAAAQFXAACkAgAwAVcAAKQCADABAAAAEAAgCgMAAJMPACAHAAC2FQAgNgAAlA8AIOEFQADDDAAh7QUBAMEMACHuBUAAwwwAIfYFAQDBDAAhgQYBAMgMACH3BwAAkQ_3ByL4BwEAyAwAIQIAAAABACBXAACoAgAgB-EFQADDDAAh7QUBAMEMACHuBUAAwwwAIfYFAQDBDAAhgQYBAMgMACH3BwAAkQ_3ByL4BwEAyAwAIQIAAADSAQAgVwAAqgIAIAIAAADSAQAgVwAAqgIAIAEAAAAQACADAAAAAQAgXgAAogIAIF8AAKgCACABAAAAAQAgAQAAANIBACAFHAAA-BYAIGQAAPoWACBlAAD5FgAggQYAALsMACD4BwAAuwwAIAraBQAAsgsAMNsFAACyAgAQ3AUAALILADDhBUAA0QkAIe0FAQDjCQAh7gVAANEJACH2BQEA4wkAIYEGAQD1CQAh9wcAALML9wci-AcBAOQJACEDAAAA0gEAIAEAALECADBjAACyAgAgAwAAANIBACABAADTAQAwAgAAAQAgAQAAAJsCACABAAAAmwIAIAMAAACZAgAgAQAAmgIAMAIAAJsCACADAAAAmQIAIAEAAJoCADACAACbAgAgAwAAAJkCACABAACaAgAwAgAAmwIAIAlRAAD3FgAg7QUBAAAAAe4FQAAAAAGhBwAAAPEHAu8HAQAAAAHxBwEAAAAB8gcBAAAAAfMHgAAAAAH1BwAAAPUHAwFXAAC6AgAgCO0FAQAAAAHuBUAAAAABoQcAAADxBwLvBwEAAAAB8QcBAAAAAfIHAQAAAAHzB4AAAAAB9QcAAAD1BwMBVwAAvAIAMAFXAAC8AgAwCVEAAPYWACDtBQEAwQwAIe4FQADDDAAhoQcAAJ8P8Qci7wcBAMEMACHxBwEAwQwAIfIHAQDIDAAh8weAAAAAAfUHAACgD_UHIwIAAACbAgAgVwAAvwIAIAjtBQEAwQwAIe4FQADDDAAhoQcAAJ8P8Qci7wcBAMEMACHxBwEAwQwAIfIHAQDIDAAh8weAAAAAAfUHAACgD_UHIwIAAACZAgAgVwAAwQIAIAIAAACZAgAgVwAAwQIAIAMAAACbAgAgXgAAugIAIF8AAL8CACABAAAAmwIAIAEAAACZAgAgBhwAAPMWACBkAAD1FgAgZQAA9BYAIPIHAAC7DAAg8wcAALsMACD1BwAAuwwAIAvaBQAAqwsAMNsFAADIAgAQ3AUAAKsLADDtBQEA4wkAIe4FQADRCQAhoQcAAKwL8Qci7wcBAOMJACHxBwEAzwkAIfIHAQDkCQAh8wcAALYKACD1BwAArQv1ByMDAAAAmQIAIAEAAMcCADBjAADIAgAgAwAAAJkCACABAACaAgAwAgAAmwIAIAEAAADPAQAgAQAAAM8BACADAAAAzQEAIAEAAM4BADACAADPAQAgAwAAAM0BACABAADOAQAwAgAAzwEAIAMAAADNAQAgAQAAzgEAMAIAAM8BACATAwAAtg8AIAcAAMMVACDfBUAAAAAB7QUBAAAAAe4FQAAAAAHzBQAAAOgHAvYFAQAAAAGBBgEAAAAB7AYBAAAAAfwGQAAAAAHjB4AAAAAB5AeAAAAAAeYHAAAA5gcC6QcAAADpBwLqB0AAAAAB6wcBAAAAAewHgAAAAAHtBwEAAAAB7geAAAAAAQFXAADQAgAgEd8FQAAAAAHtBQEAAAAB7gVAAAAAAfMFAAAA6AcC9gUBAAAAAYEGAQAAAAHsBgEAAAAB_AZAAAAAAeMHgAAAAAHkB4AAAAAB5gcAAADmBwLpBwAAAOkHAuoHQAAAAAHrBwEAAAAB7AeAAAAAAe0HAQAAAAHuB4AAAAABAVcAANICADABVwAA0gIAMAEAAAAQACATAwAAtA8AIAcAAMEVACDfBUAAwwwAIe0FAQDBDAAh7gVAAMMMACHzBQAAsQ_oByL2BQEAwQwAIYEGAQDIDAAh7AYBAMEMACH8BkAAxAwAIeMHgAAAAAHkB4AAAAAB5gcAALAP5gci6QcAALIP6Qci6gdAAMQMACHrBwEAyAwAIewHgAAAAAHtBwEAyAwAIe4HgAAAAAECAAAAzwEAIFcAANYCACAR3wVAAMMMACHtBQEAwQwAIe4FQADDDAAh8wUAALEP6Aci9gUBAMEMACGBBgEAyAwAIewGAQDBDAAh_AZAAMQMACHjB4AAAAAB5AeAAAAAAeYHAACwD-YHIukHAACyD-kHIuoHQADEDAAh6wcBAMgMACHsB4AAAAAB7QcBAMgMACHuB4AAAAABAgAAAM0BACBXAADYAgAgAgAAAM0BACBXAADYAgAgAQAAABAAIAMAAADPAQAgXgAA0AIAIF8AANYCACABAAAAzwEAIAEAAADNAQAgChwAAPAWACBkAADyFgAgZQAA8RYAIIEGAAC7DAAg_AYAALsMACDqBwAAuwwAIOsHAAC7DAAg7AcAALsMACDtBwAAuwwAIO4HAAC7DAAgFNoFAAChCwAw2wUAAOACABDcBQAAoQsAMN8FQADRCQAh7QUBAOMJACHuBUAA0QkAIfMFAACjC-gHIvYFAQDjCQAhgQYBAPUJACHsBgEAzwkAIfwGQADSCQAh4wcAALwKACDkBwAAvAoAIOYHAACiC-YHIukHAACkC-kHIuoHQADSCQAh6wcBAOQJACHsBwAAtgoAIO0HAQDkCQAh7gcAALYKACADAAAAzQEAIAEAAN8CADBjAADgAgAgAwAAAM0BACABAADOAQAwAgAAzwEAIAEAAADXAQAgAQAAANcBACADAAAA1QEAIAEAANYBADACAADXAQAgAwAAANUBACABAADWAQAwAgAA1wEAIAMAAADVAQAgAQAA1gEAMAIAANcBACALBwAArRUAIEYAAIYPACDtBQEAAAAB7gVAAAAAAfAFAQAAAAGBBgEAAAAB5waAAAAAAd8HAQAAAAHgBwEAAAAB4QcBAAAAAeIHAQAAAAEBVwAA6AIAIAntBQEAAAAB7gVAAAAAAfAFAQAAAAGBBgEAAAAB5waAAAAAAd8HAQAAAAHgBwEAAAAB4QcBAAAAAeIHAQAAAAEBVwAA6gIAMAFXAADqAgAwAQAAAEgAIAEAAAAQACALBwAAqxUAIEYAAIQPACDtBQEAwQwAIe4FQADDDAAh8AUBAMgMACGBBgEAyAwAIecGgAAAAAHfBwEAyAwAIeAHAQDBDAAh4QcBAMgMACHiBwEAyAwAIQIAAADXAQAgVwAA7wIAIAntBQEAwQwAIe4FQADDDAAh8AUBAMgMACGBBgEAyAwAIecGgAAAAAHfBwEAyAwAIeAHAQDBDAAh4QcBAMgMACHiBwEAyAwAIQIAAADVAQAgVwAA8QIAIAIAAADVAQAgVwAA8QIAIAEAAABIACABAAAAEAAgAwAAANcBACBeAADoAgAgXwAA7wIAIAEAAADXAQAgAQAAANUBACAIHAAA7RYAIGQAAO8WACBlAADuFgAg8AUAALsMACCBBgAAuwwAIN8HAAC7DAAg4QcAALsMACDiBwAAuwwAIAzaBQAAoAsAMNsFAAD6AgAQ3AUAAKALADDtBQEA4wkAIe4FQADRCQAh8AUBAPUJACGBBgEA9QkAIecGAAC8CgAg3wcBAPUJACHgBwEAzwkAIeEHAQDkCQAh4gcBAOQJACEDAAAA1QEAIAEAAPkCADBjAAD6AgAgAwAAANUBACABAADWAQAwAgAA1wEAIAEAAACDAQAgAQAAAIMBACADAAAAgQEAIAEAAIIBADACAACDAQAgAwAAAIEBACABAACCAQAwAgAAgwEAIAMAAACBAQAgAQAAggEAMAIAAIMBACASBwAA6g8AIDAAAOsPACAzAADsDwAgNAAA7g8AIDUAAO0PACDtBQEAAAAB7gVAAAAAAYEGAQAAAAG0BgAAANoHAs4GAQAAAAHPBgEAAAABlAdAAAAAAdIHAQAAAAHaB4AAAAAB2wcBAAAAAdwHAADpDwAg3QcgAAAAAd4HQAAAAAEBVwAAggMAIA3tBQEAAAAB7gVAAAAAAYEGAQAAAAG0BgAAANoHAs4GAQAAAAHPBgEAAAABlAdAAAAAAdIHAQAAAAHaB4AAAAAB2wcBAAAAAdwHAADpDwAg3QcgAAAAAd4HQAAAAAEBVwAAhAMAMAFXAACEAwAwAQAAABkAIAEAAACGAQAgAQAAAIEBACASBwAA2A8AIDAAANkPACAzAADnDwAgNAAA2g8AIDUAANsPACDtBQEAwQwAIe4FQADDDAAhgQYBAMEMACG0BgAA1Q_aByLOBgEAyAwAIc8GAQDIDAAhlAdAAMQMACHSBwEAyAwAIdoHgAAAAAHbBwEAyAwAIdwHAADWDwAg3QcgANcPACHeB0AAxAwAIQIAAACDAQAgVwAAigMAIA3tBQEAwQwAIe4FQADDDAAhgQYBAMEMACG0BgAA1Q_aByLOBgEAyAwAIc8GAQDIDAAhlAdAAMQMACHSBwEAyAwAIdoHgAAAAAHbBwEAyAwAIdwHAADWDwAg3QcgANcPACHeB0AAxAwAIQIAAACBAQAgVwAAjAMAIAIAAACBAQAgVwAAjAMAIAEAAAAZACABAAAAhgEAIAEAAACBAQAgAwAAAIMBACBeAACCAwAgXwAAigMAIAEAAACDAQAgAQAAAIEBACAKHAAA6hYAIGQAAOwWACBlAADrFgAgzgYAALsMACDPBgAAuwwAIJQHAAC7DAAg0gcAALsMACDaBwAAuwwAINsHAAC7DAAg3gcAALsMACAQ2gUAAJwLADDbBQAAlgMAENwFAACcCwAw7QUBAOMJACHuBUAA0QkAIYEGAQDjCQAhtAYAAJ0L2gcizgYBAPUJACHPBgEA5AkAIZQHQADSCQAh0gcBAPUJACHaBwAAtgoAINsHAQD1CQAh3AcAAO0JACDdByAArQoAId4HQADSCQAhAwAAAIEBACABAACVAwAwYwAAlgMAIAMAAACBAQAgAQAAggEAMAIAAIMBACABAAAAjQEAIAEAAACNAQAgAwAAAIYBACABAACMAQAwAgAAjQEAIAMAAACGAQAgAQAAjAEAMAIAAI0BACADAAAAhgEAIAEAAIwBADACAACNAQAgDwcAAL0SACAxAADwDwAgMgAA8Q8AIO0FAQAAAAHuBUAAAAABgQYBAAAAAbQGAAAAzgcC0AcBAAAAAdEHAQAAAAHTBwEAAAAB1AcBAAAAAdUHAgAAAAHWBwIAAAAB1wcCAAAAAdgHAgAAAAEBVwAAngMAIAztBQEAAAAB7gVAAAAAAYEGAQAAAAG0BgAAAM4HAtAHAQAAAAHRBwEAAAAB0wcBAAAAAdQHAQAAAAHVBwIAAAAB1gcCAAAAAdcHAgAAAAHYBwIAAAABAVcAAKADADABVwAAoAMAMA8HAAC7EgAgMQAAzg8AIDIAAM8PACDtBQEAwQwAIe4FQADDDAAhgQYBAMEMACG0BgAA9A7OByLQBwEAwQwAIdEHAQDIDAAh0wcBAMEMACHUBwEAwQwAIdUHAgDCDAAh1gcCAK4NACHXBwIArg0AIdgHAgCuDQAhAgAAAI0BACBXAACjAwAgDO0FAQDBDAAh7gVAAMMMACGBBgEAwQwAIbQGAAD0Ds4HItAHAQDBDAAh0QcBAMgMACHTBwEAwQwAIdQHAQDBDAAh1QcCAMIMACHWBwIArg0AIdcHAgCuDQAh2AcCAK4NACECAAAAhgEAIFcAAKUDACACAAAAhgEAIFcAAKUDACADAAAAjQEAIF4AAJ4DACBfAACjAwAgAQAAAI0BACABAAAAhgEAIAkcAADlFgAgZAAA6BYAIGUAAOcWACC2AQAA5hYAILcBAADpFgAg0QcAALsMACDWBwAAuwwAINcHAAC7DAAg2AcAALsMACAP2gUAAJsLADDbBQAArAMAENwFAACbCwAw7QUBAOMJACHuBUAA0QkAIYEGAQDjCQAhtAYAAJgLzgci0AcBAM8JACHRBwEA5AkAIdMHAQDjCQAh1AcBAM8JACHVBwIA0AkAIdYHAgCICgAh1wcCAIgKACHYBwIAiAoAIQMAAACGAQAgAQAAqwMAMGMAAKwDACADAAAAhgEAIAEAAIwBADACAACNAQAgAQAAAN0BACABAAAA3QEAIAMAAADbAQAgAQAA3AEAMAIAAN0BACADAAAA2wEAIAEAANwBADACAADdAQAgAwAAANsBACABAADcAQAwAgAA3QEAIA4DAAD4DgAgBwAAohUAIN8FQAAAAAHtBQEAAAAB7gVAAAAAAfYFAQAAAAGBBgEAAAABtAYAAADOBwL8BkAAAAABzgcBAAAAAc8HAgAAAAHQBwEAAAAB0QcBAAAAAdIHAQAAAAEBVwAAtAMAIAzfBUAAAAAB7QUBAAAAAe4FQAAAAAH2BQEAAAABgQYBAAAAAbQGAAAAzgcC_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_BwIAAAABwAdAAAAAAcEHQAAAAAHDB0AAAAABxAeAAAAAAQFXAADjAwAgFe0FAQAAAAHuBUAAAAAB8wUAAADDBwKBBgEAAAABxwZAAAAAAewGAAAAtAcCtAeAAAAAAbUHAQAAAAG2BwEAAAABtwcgAAAAAbkHAAAAuQcCugcAAJQRACC7BwEAAAABvAcAAJURACC9B0AAAAABvgcCAAAAAb8HAgAAAAHAB0AAAAABwQdAAAAAAcMHQAAAAAHEB4AAAAABAVcAAOUDADABVwAA5QMAMAEAAAAZACAeBwAAjRMAIAoAAMcQACALAADIEAAgDgAAyRAAIA8AAMoQACAQAADLEAAgEwAAzBAAIBQAAM0QACAYAADOEAAg7QUBAMEMACHuBUAAwwwAIfMFAADFEMMHIoEGAQDBDAAhxwZAAMQMACHsBgAAwRC0ByK0B4AAAAABtQcBAMgMACG2BwEAwQwAIbcHIADXDwAhuQcAAMIQuQciugcAAMMQACC7BwEAyAwAIbwHAADEEAAgvQdAAMQMACG-BwIAwgwAIb8HAgDCDAAhwAdAAMMMACHBB0AAwwwAIcMHQADEDAAhxAeAAAAAAQIAAABrACBXAADpAwAgFe0FAQDBDAAh7gVAAMMMACHzBQAAxRDDByKBBgEAwQwAIccGQADEDAAh7AYAAMEQtAcitAeAAAAAAbUHAQDIDAAhtgcBAMEMACG3ByAA1w8AIbkHAADCELkHIroHAADDEAAguwcBAMgMACG8BwAAxBAAIL0HQADEDAAhvgcCAMIMACG_BwIAwgwAIcAHQADDDAAhwQdAAMMMACHDB0AAxAwAIcQHgAAAAAECAAAAHwAgVwAA6wMAIAIAAAAfACBXAADrAwAgAQAAABkAIAMAAABrACBeAADjAwAgXwAA6QMAIAEAAABrACABAAAAHwAgCxwAANYWACBkAADZFgAgZQAA2BYAILYBAADXFgAgtwEAANoWACDHBgAAuwwAILUHAAC7DAAguwcAALsMACC9BwAAuwwAIMMHAAC7DAAgxAcAALsMACAY2gUAAIcLADDbBQAA8wMAENwFAACHCwAw7QUBAOMJACHuBUAA0QkAIfMFAACKC8MHIoEGAQDjCQAhxwZAANIJACHsBgAAiAu0ByK0BwAAvAoAILUHAQDkCQAhtgcBAOMJACG3ByAArQoAIbkHAACJC7kHIroHAADtCQAguwcBAPUJACG8BwAA7QkAIL0HQADSCQAhvgcCANAJACG_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-woAMO0FAQDjCQAh7gVAANEJACHzBQAA_QqvByKBBgEA4wkAIZUGAgDQCQAhoQYBAPUJACGiBgEA9QkAIakHAQDjCQAhqgcBAOMJACGsBwAA_AqsByKtBwEA5AkAIQMAAAA3ACABAAC4BAAwYwAAuQQAIAMAAAA3ACABAABwADACAABxACABAAAAggIAIAEAAACCAgAgAwAAABAAIAEAAIECADACAACCAgAgAwAAABAAIAEAAIECADACAACCAgAgAwAAABAAIAEAAIECADACAACCAgAgHwYAAI0UACAQAACPFAAgEwAAkBQAIBsAAJMUACAgAACUFAAgIQAAlRQAICIAAJYUACAoAACXFAAgKQAAmBQAIDYAAJsUACA3AACcFAAgPQAAkhQAID4AAOgVACA_AACOFAAgQAAAkRQAIEEAAJkUACBCAACaFAAgQwAAnRQAIEQAAJ4UACBFAACfFAAgRwAAoBQAIEgAAKEUACDhBUAAAAAB7QUBAAAAAe4FQAAAAAHzBQAAAKcHAsMGQAAAAAHhBgEAAAABjAcBAAAAAacHAQAAAAGoBwEAAAABAVcAAMEEACAJ4QVAAAAAAe0FAQAAAAHuBUAAAAAB8wUAAACnBwLDBkAAAAAB4QYBAAAAAYwHAQAAAAGnBwEAAAABqAcBAAAAAQFXAADDBAAwAVcAAMMEADABAAAAEgAgHwYAANUOACAQAADXDgAgEwAA2A4AIBsAANsOACAgAADcDgAgIQAA3Q4AICIAAN4OACAoAADfDgAgKQAA4A4AIDYAAOMOACA3AADkDgAgPQAA2g4AID4AAOYVACA_AADWDgAgQAAA2Q4AIEEAAOEOACBCAADiDgAgQwAA5Q4AIEQAAOYOACBFAADnDgAgRwAA6A4AIEgAAOkOACDhBUAAwwwAIe0FAQDBDAAh7gVAAMMMACHzBQAA1A6nByLDBkAAwwwAIeEGAQDBDAAhjAcBAMEMACGnBwEAwQwAIagHAQDIDAAhAgAAAIICACBXAADHBAAgCeEFQADDDAAh7QUBAMEMACHuBUAAwwwAIfMFAADUDqcHIsMGQADDDAAh4QYBAMEMACGMBwEAwQwAIacHAQDBDAAhqAcBAMgMACECAAAAEAAgVwAAyQQAIAIAAAAQACBXAADJBAAgAQAAABIAIAMAAACCAgAgXgAAwQQAIF8AAMcEACABAAAAggIAIAEAAAAQACAEHAAAyBYAIGQAAMoWACBlAADJFgAgqAcAALsMACAM2gUAAPcKADDbBQAA0QQAENwFAAD3CgAw4QVAANEJACHtBQEA4wkAIe4FQADRCQAh8wUAAPgKpwciwwZAANEJACHhBgEAzwkAIYwHAQDPCQAhpwcBAOMJACGoBwEA9QkAIQMAAAAQACABAADQBAAwYwAA0QQAIAMAAAAQACABAACBAgAwAgAAggIAIAEAAAC0AQAgAQAAALQBACADAAAAGQAgAQAAswEAMAIAALQBACADAAAAGQAgAQAAswEAMAIAALQBACADAAAAGQAgAQAAswEAMAIAALQBACAgAwAA9xMAIAcAAPMVACAOAACEFAAgDwAAhRQAIBsAAPkTACAeAAD4EwAgHwAA-hMAICAAAPsTACAhAAD8EwAgIgAA_RMAICMAAP4TACAkAAD_EwAgJQAAgBQAICgAAIEUACApAACCFAAgKgAAgxQAICsAAIYUACAsAACHFAAgLQAAiBQAIC8AAIkUACA2AACKFAAgNwAAixQAIDoAAIwUACDtBQEAAAAB7gVAAAAAAfMFAAAAowcC9gUBAAAAAYEGAQAAAAGhBwAAAKEHAqMHAgAAAAGkB0AAAAABpQdAAAAAAQFXAADZBAAgCe0FAQAAAAHuBUAAAAAB8wUAAACjBwL2BQEAAAABgQYBAAAAAaEHAAAAoQcCowcCAAAAAaQHQAAAAAGlB0AAAAABAVcAANsEADABVwAA2wQAMCADAACPEgAgBwAA8RUAIA4AAJwSACAPAACdEgAgGwAAkRIAIB4AAJASACAfAACSEgAgIAAAkxIAICEAAJQSACAiAACVEgAgIwAAlhIAICQAAJcSACAlAACYEgAgKAAAmRIAICkAAJoSACAqAACbEgAgKwAAnhIAICwAAJ8SACAtAACgEgAgLwAAoRIAIDYAAKISACA3AACjEgAgOgAApBIAIO0FAQDBDAAh7gVAAMMMACHzBQAAjRKjByL2BQEAwQwAIYEGAQDBDAAhoQcAAIwSoQciowcCAK4NACGkB0AAxAwAIaUHQADEDAAhAgAAALQBACBXAADeBAAgCe0FAQDBDAAh7gVAAMMMACHzBQAAjRKjByL2BQEAwQwAIYEGAQDBDAAhoQcAAIwSoQciowcCAK4NACGkB0AAxAwAIaUHQADEDAAhAgAAABkAIFcAAOAEACACAAAAGQAgVwAA4AQAIAMAAAC0AQAgXgAA2QQAIF8AAN4EACABAAAAtAEAIAEAAAAZACAIHAAAwxYAIGQAAMYWACBlAADFFgAgtgEAAMQWACC3AQAAxxYAIKMHAAC7DAAgpAcAALsMACClBwAAuwwAIAzaBQAA8AoAMNsFAADnBAAQ3AUAAPAKADDtBQEA4wkAIe4FQADRCQAh8wUAAPIKowci9gUBAOMJACGBBgEA4wkAIaEHAADxCqEHIqMHAgCICgAhpAdAANIJACGlB0AA0gkAIQMAAAAZACABAADmBAAwYwAA5wQAIAMAAAAZACABAACzAQAwAgAAtAEAIAEAAAAdACABAAAAHQAgAwAAABsAIAEAABwAMAIAAB0AIAMAAAAbACABAAAcADACAAAdACADAAAAGwAgAQAAHAAwAgAAHQAgEAYAAPUQACAHAADzEAAgDAAAgRIAIB0AAPQQACDfBUAAAAAB7QUBAAAAAe4FQAAAAAGBBgEAAAABoQYBAAAAAfoGAQAAAAGAB0AAAAABggdAAAAAAZwHAQAAAAGdBwEAAAABngcBAAAAAZ8HAQAAAAEBVwAA7wQAIAzfBUAAAAAB7QUBAAAAAe4FQAAAAAGBBgEAAAABoQYBAAAAAfoGAQAAAAGAB0AAAAABggdAAAAAAZwHAQAAAAGdBwEAAAABngcBAAAAAZ8HAQAAAAEBVwAA8QQAMAFXAADxBAAwAQAAAB8AIAEAAABIACAQBgAA8RAAIAcAAO8QACAMAAD_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_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-QEAIAEAAAD5AQAgAwAAAPcBACABAAD4AQAwAgAA-QEAIAMAAAD3AQAgAQAA-AEAMAIAAPkBACADAAAA9wEAIAEAAPgBADACAAD5AQAgCAMAAOYUACDtBQEAAAAB7gVAAAAAAfYFAQAAAAGxBgAAALEGArwGAQAAAAGFB0AAAAABhgdAAAAAAQFXAADRBQAgB-0FAQAAAAHuBUAAAAAB9gUBAAAAAbEGAAAAsQYCvAYBAAAAAYUHQAAAAAGGB0AAAAABAVcAANMFADABVwAA0wUAMAgDAADlFAAg7QUBAMEMACHuBUAAwwwAIfYFAQDBDAAhsQYAAOQUsQYivAYBAMEMACGFB0AAwwwAIYYHQADEDAAhAgAAAPkBACBXAADWBQAgB-0FAQDBDAAh7gVAAMMMACH2BQEAwQwAIbEGAADkFLEGIrwGAQDBDAAhhQdAAMMMACGGB0AAxAwAIQIAAAD3AQAgVwAA2AUAIAIAAAD3AQAgVwAA2AUAIAMAAAD5AQAgXgAA0QUAIF8AANYFACABAAAA-QEAIAEAAAD3AQAgBBwAAOEUACBkAADjFAAgZQAA4hQAIIYHAAC7DAAgCtoFAADWCgAw2wUAAN8FABDcBQAA1goAMO0FAQDjCQAh7gVAANEJACH2BQEA4wkAIbEGAADXCrEGIrwGAQDPCQAhhQdAANEJACGGB0AA0gkAIQMAAAD3AQAgAQAA3gUAMGMAAN8FACADAAAA9wEAIAEAAPgBADACAAD5AQAgAQAAAAkAIAEAAAAJACADAAAABwAgAQAACAAwAgAACQAgAwAAAAcAIAEAAAgAMAIAAAkAIAMAAAAHACABAAAIADACAAAJACAOAwAA3xQAIAQAAOAUACDfBUAAAAAB7QUBAAAAAe4FQAAAAAHwBQEAAAAB9gUBAAAAAfoGAQAAAAH9BgEAAAAB_wYAAAD_BgKAB0AAAAABgQcBAAAAAYIHQAAAAAGEBwAAAIQHAwFXAADnBQAgDN8FQAAAAAHtBQEAAAAB7gVAAAAAAfAFAQAAAAH2BQEAAAAB-gYBAAAAAf0GAQAAAAH_BgAAAP8GAoAHQAAAAAGBBwEAAAABggdAAAAAAYQHAAAAhAcDAVcAAOkFADABVwAA6QUAMAEAAAADACAOAwAA3RQAIAQAAN4UACDfBUAAwwwAIe0FAQDBDAAh7gVAAMMMACHwBQEAyAwAIfYFAQDBDAAh-gYBAMEMACH9BgEAwQwAIf8GAADbFP8GIoAHQADEDAAhgQcBAMgMACGCB0AAxAwAIYQHAADcFIQHIwIAAAAJACBXAADtBQAgDN8FQADDDAAh7QUBAMEMACHuBUAAwwwAIfAFAQDIDAAh9gUBAMEMACH6BgEAwQwAIf0GAQDBDAAh_wYAANsU_wYigAdAAMQMACGBBwEAyAwAIYIHQADEDAAhhAcAANwUhAcjAgAAAAcAIFcAAO8FACACAAAABwAgVwAA7wUAIAEAAAADACADAAAACQAgXgAA5wUAIF8AAO0FACABAAAACQAgAQAAAAcAIAgcAADYFAAgZAAA2hQAIGUAANkUACDwBQAAuwwAIIAHAAC7DAAggQcAALsMACCCBwAAuwwAIIQHAAC7DAAgD9oFAADPCgAw2wUAAPcFABDcBQAAzwoAMN8FQADRCQAh7QUBAOMJACHuBUAA0QkAIfAFAQD1CQAh9gUBAOMJACH6BgEAzwkAIf0GAQDjCQAh_wYAANAK_wYigAdAANIJACGBBwEA9QkAIYIHQADSCQAhhAcAANEKhAcjAwAAAAcAIAEAAPYFADBjAAD3BQAgAwAAAAcAIAEAAAgAMAIAAAkAIAEAAAD-AQAgAQAAAP4BACADAAAA_AEAIAEAAP0BADACAAD-AQAgAwAAAPwBACABAAD9AQAwAgAA_gEAIAMAAAD8AQAgAQAA_QEAMAIAAP4BACAMAwAA1hQAIDgAANcUACDtBQEAAAAB7gVAAAAAAfMFAAAA9wYC9gUBAAAAAfcGQAAAAAH4BgEAAAAB-QZAAAAAAfoGAQAAAAH7BkAAAAAB_AZAAAAAAQFXAAD_BQAgCu0FAQAAAAHuBUAAAAAB8wUAAAD3BgL2BQEAAAAB9wZAAAAAAfgGAQAAAAH5BkAAAAAB-gYBAAAAAfsGQAAAAAH8BkAAAAABAVcAAIEGADABVwAAgQYAMAwDAADLFAAgOAAAzBQAIO0FAQDBDAAh7gVAAMMMACHzBQAAyhT3BiL2BQEAwQwAIfcGQADDDAAh-AYBAMgMACH5BkAAxAwAIfoGAQDIDAAh-wZAAMQMACH8BkAAxAwAIQIAAAD-AQAgVwAAhAYAIArtBQEAwQwAIe4FQADDDAAh8wUAAMoU9wYi9gUBAMEMACH3BkAAwwwAIfgGAQDIDAAh-QZAAMQMACH6BgEAyAwAIfsGQADEDAAh_AZAAMQMACECAAAA_AEAIFcAAIYGACACAAAA_AEAIFcAAIYGACADAAAA_gEAIF4AAP8FACBfAACEBgAgAQAAAP4BACABAAAA_AEAIAgcAADHFAAgZAAAyRQAIGUAAMgUACD4BgAAuwwAIPkGAAC7DAAg-gYAALsMACD7BgAAuwwAIPwGAAC7DAAgDdoFAADLCgAw2wUAAI0GABDcBQAAywoAMO0FAQDjCQAh7gVAANEJACHzBQAAzAr3BiL2BQEA4wkAIfcGQADRCQAh-AYBAPUJACH5BkAA0gkAIfoGAQDkCQAh-wZAANIJACH8BkAA0gkAIQMAAAD8AQAgAQAAjAYAMGMAAI0GACADAAAA_AEAIAEAAP0BADACAAD-AQAgAQAAAJEBACABAAAAkQEAIAMAAACPAQAgAQAAkAEAMAIAAJEBACADAAAAjwEAIAEAAJABADACAACRAQAgAwAAAI8BACABAACQAQAwAgAAkQEAIAcNAADGFAAgOQAAshIAIO0FAQAAAAHuBUAAAAABgQYBAAAAAYwGAQAAAAH1BgEAAAABAVcAAJUGACAF7QUBAAAAAe4FQAAAAAGBBgEAAAABjAYBAAAAAfUGAQAAAAEBVwAAlwYAMAFXAACXBgAwBw0AAMUUACA5AACwEgAg7QUBAMEMACHuBUAAwwwAIYEGAQDBDAAhjAYBAMEMACH1BgEAwQwAIQIAAACRAQAgVwAAmgYAIAXtBQEAwQwAIe4FQADDDAAhgQYBAMEMACGMBgEAwQwAIfUGAQDBDAAhAgAAAI8BACBXAACcBgAgAgAAAI8BACBXAACcBgAgAwAAAJEBACBeAACVBgAgXwAAmgYAIAEAAACRAQAgAQAAAI8BACADHAAAwhQAIGQAAMQUACBlAADDFAAgCNoFAADKCgAw2wUAAKMGABDcBQAAygoAMO0FAQDjCQAh7gVAANEJACGBBgEA4wkAIYwGAQDjCQAh9QYBAOMJACEDAAAAjwEAIAEAAKIGADBjAACjBgAgAwAAAI8BACABAACQAQAwAgAAkQEAIAEAAABhACABAAAAYQAgAwAAAF8AIAEAAGAAMAIAAGEAIAMAAABfACABAABgADACAABhACADAAAAXwAgAQAAYAAwAgAAYQAgEwcAAJoOACANAACbDgAgGQAAqBEAICcAAJwOACDtBQEAAAAB7gVAAAAAAYEGAQAAAAGMBgEAAAABlAYBAAAAAeoGAgAAAAHsBgAAAOwGAu0GQAAAAAHuBgEAAAAB7wYBAAAAAfAGAQAAAAHxBgEAAAAB8gaAAAAAAfMGAQAAAAH0BgEAAAABAVcAAKsGACAP7QUBAAAAAe4FQAAAAAGBBgEAAAABjAYBAAAAAZQGAQAAAAHqBgIAAAAB7AYAAADsBgLtBkAAAAAB7gYBAAAAAe8GAQAAAAHwBgEAAAAB8QYBAAAAAfIGgAAAAAHzBgEAAAAB9AYBAAAAAQFXAACtBgAwAVcAAK0GADABAAAAFQAgAQAAABkAIBMHAACKDgAgDQAAiw4AIBkAAKYRACAnAACMDgAg7QUBAMEMACHuBUAAwwwAIYEGAQDBDAAhjAYBAMgMACGUBgEAyAwAIeoGAgDCDAAh7AYAAIgO7AYi7QZAAMMMACHuBgEAyAwAIe8GAQDIDAAh8AYBAMEMACHxBgEAwQwAIfIGgAAAAAHzBgEAwQwAIfQGAQDBDAAhAgAAAGEAIFcAALIGACAP7QUBAMEMACHuBUAAwwwAIYEGAQDBDAAhjAYBAMgMACGUBgEAyAwAIeoGAgDCDAAh7AYAAIgO7AYi7QZAAMMMACHuBgEAyAwAIe8GAQDIDAAh8AYBAMEMACHxBgEAwQwAIfIGgAAAAAHzBgEAwQwAIfQGAQDBDAAhAgAAAF8AIFcAALQGACACAAAAXwAgVwAAtAYAIAEAAAAVACABAAAAGQAgAwAAAGEAIF4AAKsGACBfAACyBgAgAQAAAGEAIAEAAABfACAJHAAAvRQAIGQAAMAUACBlAAC_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_CAAwYwAAwAgAIAMAAAAxACABAABTADACAABUACABAAAAWAAgAQAAAFgAIAMAAABWACABAABXADACAABYACADAAAAVgAgAQAAVwAwAgAAWAAgAwAAAFYAIAEAAFcAMAIAAFgAIAkNAACADQAgGQAA_wwAIOEFQAAAAAHtBQEAAAAB7gVAAAAAAYwGAQAAAAGUBgEAAAABlQYCAAAAAZYGQAAAAAEBVwAAyAgAIAfhBUAAAAAB7QUBAAAAAe4FQAAAAAGMBgEAAAABlAYBAAAAAZUGAgAAAAGWBkAAAAABAVcAAMoIADABVwAAyggAMAkNAAD-DAAgGQAA_QwAIOEFQADDDAAh7QUBAMEMACHuBUAAwwwAIYwGAQDBDAAhlAYBAMEMACGVBgIAwgwAIZYGQADDDAAhAgAAAFgAIFcAAM0IACAH4QVAAMMMACHtBQEAwQwAIe4FQADDDAAhjAYBAMEMACGUBgEAwQwAIZUGAgDCDAAhlgZAAMMMACECAAAAVgAgVwAAzwgAIAIAAABWACBXAADPCAAgAwAAAFgAIF4AAMgIACBfAADNCAAgAQAAAFgAIAEAAABWACAFHAAA-AwAIGQAAPsMACBlAAD6DAAgtgEAAPkMACC3AQAA_AwAIAraBQAAgQoAMNsFAADWCAAQ3AUAAIEKADDhBUAA0QkAIe0FAQDjCQAh7gVAANEJACGMBgEA4wkAIZQGAQDjCQAhlQYCANAJACGWBkAA0QkAIQMAAABWACABAADVCAAwYwAA1ggAIAMAAABWACABAABXADACAABYACABAAAAXQAgAQAAAF0AIAMAAABbACABAABcADACAABdACADAAAAWwAgAQAAXAAwAgAAXQAgAwAAAFsAIAEAAFwAMAIAAF0AIAoNAAD3DAAg7QUBAAAAAe4FQAAAAAGMBgEAAAABjQZAAAAAAY4GQAAAAAGQBgAAAJAGApEGAQAAAAGSBgEAAAABkwYBAAAAAQFXAADeCAAgCe0FAQAAAAHuBUAAAAABjAYBAAAAAY0GQAAAAAGOBkAAAAABkAYAAACQBgKRBgEAAAABkgYBAAAAAZMGAQAAAAEBVwAA4AgAMAFXAADgCAAwCg0AAPYMACDtBQEAwQwAIe4FQADDDAAhjAYBAMEMACGNBkAAwwwAIY4GQADDDAAhkAYAAPUMkAYikQYBAMEMACGSBgEAwQwAIZMGAQDBDAAhAgAAAF0AIFcAAOMIACAJ7QUBAMEMACHuBUAAwwwAIYwGAQDBDAAhjQZAAMMMACGOBkAAwwwAIZAGAAD1DJAGIpEGAQDBDAAhkgYBAMEMACGTBgEAwQwAIQIAAABbACBXAADlCAAgAgAAAFsAIFcAAOUIACADAAAAXQAgXgAA3ggAIF8AAOMIACABAAAAXQAgAQAAAFsAIAMcAADyDAAgZAAA9AwAIGUAAPMMACAM2gUAAP0JADDbBQAA7AgAENwFAAD9CQAw7QUBAOMJACHuBUAA0QkAIYwGAQDjCQAhjQZAANEJACGOBkAA0QkAIZAGAAD-CZAGIpEGAQDPCQAhkgYBAM8JACGTBgEAzwkAIQMAAABbACABAADrCAAwYwAA7AgAIAMAAABbACABAABcADACAABdACABAAAAywEAIAEAAADLAQAgAwAAAMkBACABAADKAQAwAgAAywEAIAMAAADJAQAgAQAAygEAMAIAAMsBACADAAAAyQEAIAEAAMoBADACAADLAQAgEAMAAO8MACAHAADwDAAgSQAA8QwAIO0FAQAAAAHuBUAAAAAB9gUBAAAAAYEGAQAAAAGCBgAAAIEGAoMGAQAAAAGEBgEAAAABhQYBAAAAAYYGAQAAAAGHBgEAAAABiAZAAAAAAYkGAQAAAAGLBgAAAIsGAgFXAAD0CAAgDe0FAQAAAAHuBUAAAAAB9gUBAAAAAYEGAQAAAAGCBgAAAIEGAoMGAQAAAAGEBgEAAAABhQYBAAAAAYYGAQAAAAGHBgEAAAABiAZAAAAAAYkGAQAAAAGLBgAAAIsGAgFXAAD2CAAwAVcAAPYIADABAAAAEAAgEAMAAOAMACAHAADhDAAgSQAA4gwAIO0FAQDBDAAh7gVAAMMMACH2BQEAwQwAIYEGAQDIDAAhggYAAN4MgQYigwYBAMEMACGEBgEAwQwAIYUGAQDBDAAhhgYBAMEMACGHBgEAyAwAIYgGQADEDAAhiQYBAMgMACGLBgAA3wyLBiICAAAAywEAIFcAAPoIACAN7QUBAMEMACHuBUAAwwwAIfYFAQDBDAAhgQYBAMgMACGCBgAA3gyBBiKDBgEAwQwAIYQGAQDBDAAhhQYBAMEMACGGBgEAwQwAIYcGAQDIDAAhiAZAAMQMACGJBgEAyAwAIYsGAADfDIsGIgIAAADJAQAgVwAA_AgAIAIAAADJAQAgVwAA_AgAIAEAAAAQACADAAAAywEAIF4AAPQIACBfAAD6CAAgAQAAAMsBACABAAAAyQEAIAccAADbDAAgZAAA3QwAIGUAANwMACCBBgAAuwwAIIcGAAC7DAAgiAYAALsMACCJBgAAuwwAIBDaBQAA9AkAMNsFAACECQAQ3AUAAPQJADDtBQEA4wkAIe4FQADRCQAh9gUBAOMJACGBBgEA9QkAIYIGAAD2CYEGIoMGAQDPCQAhhAYBAM8JACGFBgEAzwkAIYYGAQDPCQAhhwYBAOQJACGIBkAA0gkAIYkGAQDkCQAhiwYAAPcJiwYiAwAAAMkBACABAACDCQAwYwAAhAkAIAMAAADJAQAgAQAAygEAMAIAAMsBACANAwAA8wkAINoFAADxCQAw2wUAAIYCABDcBQAA8QkAMOEFQADgCQAh7QUBAAAAAe4FQADgCQAh9gUBAAAAAfcFAADsCQAg-AUCAN8JACH5BQIA3wkAIfoFAADtCQAg_AUAAPIJ_AUiAQAAAIcJACABAAAAhwkAIAEDAADaDAAgAwAAAIYCACABAACKCQAwAgAAhwkAIAMAAACGAgAgAQAAigkAMAIAAIcJACADAAAAhgIAIAEAAIoJADACAACHCQAgCgMAANkMACDhBUAAAAAB7QUBAAAAAe4FQAAAAAH2BQEAAAAB9wUAANcMACD4BQIAAAAB-QUCAAAAAfoFAADYDAAg_AUAAAD8BQIBVwAAjgkAIAnhBUAAAAAB7QUBAAAAAe4FQAAAAAH2BQEAAAAB9wUAANcMACD4BQIAAAAB-QUCAAAAAfoFAADYDAAg_AUAAAD8BQIBVwAAkAkAMAFXAACQCQAwCgMAANYMACDhBUAAwwwAIe0FAQDBDAAh7gVAAMMMACH2BQEAwQwAIfcFAADTDAAg-AUCAMIMACH5BQIAwgwAIfoFAADUDAAg_AUAANUM_AUiAgAAAIcJACBXAACTCQAgCeEFQADDDAAh7QUBAMEMACHuBUAAwwwAIfYFAQDBDAAh9wUAANMMACD4BQIAwgwAIfkFAgDCDAAh-gUAANQMACD8BQAA1Qz8BSICAAAAhgIAIFcAAJUJACACAAAAhgIAIFcAAJUJACADAAAAhwkAIF4AAI4JACBfAACTCQAgAQAAAIcJACABAAAAhgIAIAUcAADODAAgZAAA0QwAIGUAANAMACC2AQAAzwwAILcBAADSDAAgDNoFAADrCQAw2wUAAJwJABDcBQAA6wkAMOEFQADRCQAh7QUBAOMJACHuBUAA0QkAIfYFAQDjCQAh9wUAAOwJACD4BQIA0AkAIfkFAgDQCQAh-gUAAO0JACD8BQAA7gn8BSIDAAAAhgIAIAEAAJsJADBjAACcCQAgAwAAAIYCACABAACKCQAwAgAAhwkAIAEAAAAOACABAAAADgAgAwAAAAwAIAEAAA0AMAIAAA4AIAMAAAAMACABAAANADACAAAOACADAAAADAAgAQAADQAwAgAADgAgCgQAAM0MACBKAADMDAAg7QUBAAAAAe4FQAAAAAHvBQEAAAAB8AUBAAAAAfEFAQAAAAHzBQAAAPMFAvQFAQAAAAH1BUAAAAABAVcAAKQJACAI7QUBAAAAAe4FQAAAAAHvBQEAAAAB8AUBAAAAAfEFAQAAAAHzBQAAAPMFAvQFAQAAAAH1BUAAAAABAVcAAKYJADABVwAApgkAMAoEAADLDAAgSgAAygwAIO0FAQDBDAAh7gVAAMMMACHvBQEAwQwAIfAFAQDBDAAh8QUBAMgMACHzBQAAyQzzBSL0BQEAyAwAIfUFQADEDAAhAgAAAA4AIFcAAKkJACAI7QUBAMEMACHuBUAAwwwAIe8FAQDBDAAh8AUBAMEMACHxBQEAyAwAIfMFAADJDPMFIvQFAQDIDAAh9QVAAMQMACECAAAADAAgVwAAqwkAIAIAAAAMACBXAACrCQAgAwAAAA4AIF4AAKQJACBfAACpCQAgAQAAAA4AIAEAAAAMACAGHAAAxQwAIGQAAMcMACBlAADGDAAg8QUAALsMACD0BQAAuwwAIPUFAAC7DAAgC9oFAADiCQAw2wUAALIJABDcBQAA4gkAMO0FAQDjCQAh7gVAANEJACHvBQEA4wkAIfAFAQDjCQAh8QUBAOQJACHzBQAA5QnzBSL0BQEA5AkAIfUFQADSCQAhAwAAAAwAIAEAALEJADBjAACyCQAgAwAAAAwAIAEAAA0AMAIAAA4AIAjaBQAA3QkAMNsFAAC4CQAQ3AUAAN0JADDdBQEAAAAB3gUCAN8JACHfBUAA4AkAIeAFQADhCQAh4QVAAOAJACEBAAAAtQkAIAEAAAC1CQAgCNoFAADdCQAw2wUAALgJABDcBQAA3QkAMN0FAQDeCQAh3gUCAN8JACHfBUAA4AkAIeAFQADhCQAh4QVAAOAJACEB4AUAALsMACADAAAAuAkAIAEAALkJADACAAC1CQAgAwAAALgJACABAAC5CQAwAgAAtQkAIAMAAAC4CQAgAQAAuQkAMAIAALUJACAF3QUBAAAAAd4FAgAAAAHfBUAAAAAB4AVAAAAAAeEFQAAAAAEBVwAAvQkAIAXdBQEAAAAB3gUCAAAAAd8FQAAAAAHgBUAAAAAB4QVAAAAAAQFXAAC_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_4FAAAAgQYI_wUAAACBBggE4gUBAAAABf0FAQAAAAH-BQEAAAAE_wUBAAAABAccAADXCQAgZAAA8AkAIGUAAPAJACDiBQAAAPwFAuMFAAAA_AUI5AUAAAD8BQjpBQAA7wn8BSIHHAAA1wkAIGQAAPAJACBlAADwCQAg4gUAAAD8BQLjBQAAAPwFCOQFAAAA_AUI6QUAAO8J_AUiBOIFAAAA_AUC4wUAAAD8BQjkBQAAAPwFCOkFAADwCfwFIg0DAADzCQAg2gUAAPEJADDbBQAAhgIAENwFAADxCQAw4QVAAOAJACHtBQEAwQoAIe4FQADgCQAh9gUBAMEKACH3BQAA7AkAIPgFAgDfCQAh-QUCAN8JACH6BQAA7QkAIPwFAADyCfwFIgTiBQAAAPwFAuMFAAAA_AUI5AUAAAD8BQjpBQAA8An8BSIfBQAA4woAID8AAOUKACBDAADoCgAgRAAA6goAIEUAAOsKACBHAADsCgAgSAAA7QoAIEsAAOEKACBMAADiCgAgTQAA5AoAIE4AAOYKACBPAADnCgAgUAAA6QoAINoFAADfCgAw2wUAAEgAENwFAADfCgAw4QVAAOAJACHtBQEAwQoAIe4FQADgCQAhkAYAAOAKkAYijAcBAN4JACGNBwEA3gkAIY4HAQDeCQAhjwcBAN4JACGQB0AA4AkAIZEHQADhCQAhkgdAAOEJACGTBwIA3wkAIZQHQADhCQAhgggAAEgAIIMIAABIACAQ2gUAAPQJADDbBQAAhAkAENwFAAD0CQAw7QUBAOMJACHuBUAA0QkAIfYFAQDjCQAhgQYBAPUJACGCBgAA9gmBBiKDBgEAzwkAIYQGAQDPCQAhhQYBAM8JACGGBgEAzwkAIYcGAQDkCQAhiAZAANIJACGJBgEA5AkAIYsGAAD3CYsGIgscAADUCQAgZAAA6QkAIGUAAOkJACDiBQEAAAAB4wUBAAAABeQFAQAAAAXlBQEAAAAB5gUBAAAAAecFAQAAAAHoBQEAAAAB6QUBAPwJACEHHAAA1wkAIGQAAPsJACBlAAD7CQAg4gUAAACBBgLjBQAAAIEGCOQFAAAAgQYI6QUAAPoJgQYiBxwAANcJACBkAAD5CQAgZQAA-QkAIOIFAAAAiwYC4wUAAACLBgjkBQAAAIsGCOkFAAD4CYsGIgccAADXCQAgZAAA-QkAIGUAAPkJACDiBQAAAIsGAuMFAAAAiwYI5AUAAACLBgjpBQAA-AmLBiIE4gUAAACLBgLjBQAAAIsGCOQFAAAAiwYI6QUAAPkJiwYiBxwAANcJACBkAAD7CQAgZQAA-wkAIOIFAAAAgQYC4wUAAACBBgjkBQAAAIEGCOkFAAD6CYEGIgTiBQAAAIEGAuMFAAAAgQYI5AUAAACBBgjpBQAA-wmBBiILHAAA1AkAIGQAAOkJACBlAADpCQAg4gUBAAAAAeMFAQAAAAXkBQEAAAAF5QUBAAAAAeYFAQAAAAHnBQEAAAAB6AUBAAAAAekFAQD8CQAhDNoFAAD9CQAw2wUAAOwIABDcBQAA_QkAMO0FAQDjCQAh7gVAANEJACGMBgEA4wkAIY0GQADRCQAhjgZAANEJACGQBgAA_gmQBiKRBgEAzwkAIZIGAQDPCQAhkwYBAM8JACEHHAAA1wkAIGQAAIAKACBlAACACgAg4gUAAACQBgLjBQAAAJAGCOQFAAAAkAYI6QUAAP8JkAYiBxwAANcJACBkAACACgAgZQAAgAoAIOIFAAAAkAYC4wUAAACQBgjkBQAAAJAGCOkFAAD_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_CgAgZQAAvwoAIOIFAAAA5wYC4wUAAADnBgjkBQAAAOcGCOkFAAC-CucGIg8cAADXCQAgZAAAvQoAIGUAAL0KACDiBYAAAAAB5QWAAAAAAeYFgAAAAAHnBYAAAAAB6AWAAAAAAekFgAAAAAHaBgEAAAAB2wYBAAAAAdwGAQAAAAHdBoAAAAAB3gaAAAAAAd8GgAAAAAEM4gWAAAAAAeUFgAAAAAHmBYAAAAAB5wWAAAAAAegFgAAAAAHpBYAAAAAB2gYBAAAAAdsGAQAAAAHcBgEAAAAB3QaAAAAAAd4GgAAAAAHfBoAAAAABBxwAANcJACBkAAC_CgAgZQAAvwoAIOIFAAAA5wYC4wUAAADnBgjkBQAAAOcGCOkFAAC-CucGIgTiBQAAAOcGAuMFAAAA5wYI5AUAAADnBgjpBQAAvwrnBiIN2gUAAMAKADDbBQAA2QYAENwFAADACgAw7QUBAMEKACHuBUAA4AkAIfMFAADCCucGIuAGQADgCQAh4QYBAN4JACHiBgIA3wkAIeMGAgDfCQAh5AYCAN8JACHlBgIA3wkAIecGAADDCgAgCOIFAQAAAAHjBQEAAAAE5AUBAAAABOUFAQAAAAHmBQEAAAAB5wUBAAAAAegFAQAAAAHpBQEAxAoAIQTiBQAAAOcGAuMFAAAA5wYI5AUAAADnBgjpBQAAvwrnBiIM4gWAAAAAAeUFgAAAAAHmBYAAAAAB5wWAAAAAAegFgAAAAAHpBYAAAAAB2gYBAAAAAdsGAQAAAAHcBgEAAAAB3QaAAAAAAd4GgAAAAAHfBoAAAAABCOIFAQAAAAHjBQEAAAAE5AUBAAAABOUFAQAAAAHmBQEAAAAB5wUBAAAAAegFAQAAAAHpBQEAxAoAIQjaBQAAxQoAMNsFAADTBgAQ3AUAAMUKADDtBQEA4wkAIe4FQADRCQAhlQYCANAJACHoBgEA4wkAIekGAQDPCQAhEtoFAADGCgAw2wUAAL0GABDcBQAAxgoAMO0FAQDjCQAh7gVAANEJACGBBgEA4wkAIYwGAQD1CQAhlAYBAPUJACHqBgIA0AkAIewGAADHCuwGIu0GQADRCQAh7gYBAOQJACHvBgEA5AkAIfAGAQDPCQAh8QYBAM8JACHyBgAAvAoAIPMGAQDPCQAh9AYBAM8JACEHHAAA1wkAIGQAAMkKACBlAADJCgAg4gUAAADsBgLjBQAAAOwGCOQFAAAA7AYI6QUAAMgK7AYiBxwAANcJACBkAADJCgAgZQAAyQoAIOIFAAAA7AYC4wUAAADsBgjkBQAAAOwGCOkFAADICuwGIgTiBQAAAOwGAuMFAAAA7AYI5AUAAADsBgjpBQAAyQrsBiII2gUAAMoKADDbBQAAowYAENwFAADKCgAw7QUBAOMJACHuBUAA0QkAIYEGAQDjCQAhjAYBAOMJACH1BgEA4wkAIQ3aBQAAywoAMNsFAACNBgAQ3AUAAMsKADDtBQEA4wkAIe4FQADRCQAh8wUAAMwK9wYi9gUBAOMJACH3BkAA0QkAIfgGAQD1CQAh-QZAANIJACH6BgEA5AkAIfsGQADSCQAh_AZAANIJACEHHAAA1wkAIGQAAM4KACBlAADOCgAg4gUAAAD3BgLjBQAAAPcGCOQFAAAA9wYI6QUAAM0K9wYiBxwAANcJACBkAADOCgAgZQAAzgoAIOIFAAAA9wYC4wUAAAD3BgjkBQAAAPcGCOkFAADNCvcGIgTiBQAAAPcGAuMFAAAA9wYI5AUAAAD3BgjpBQAAzgr3BiIP2gUAAM8KADDbBQAA9wUAENwFAADPCgAw3wVAANEJACHtBQEA4wkAIe4FQADRCQAh8AUBAPUJACH2BQEA4wkAIfoGAQDPCQAh_QYBAOMJACH_BgAA0Ar_BiKAB0AA0gkAIYEHAQD1CQAhggdAANIJACGEBwAA0QqEByMHHAAA1wkAIGQAANUKACBlAADVCgAg4gUAAAD_BgLjBQAAAP8GCOQFAAAA_wYI6QUAANQK_wYiBxwAANQJACBkAADTCgAgZQAA0woAIOIFAAAAhAcD4wUAAACEBwnkBQAAAIQHCekFAADSCoQHIwccAADUCQAgZAAA0woAIGUAANMKACDiBQAAAIQHA-MFAAAAhAcJ5AUAAACEBwnpBQAA0gqEByME4gUAAACEBwPjBQAAAIQHCeQFAAAAhAcJ6QUAANMKhAcjBxwAANcJACBkAADVCgAgZQAA1QoAIOIFAAAA_wYC4wUAAAD_BgjkBQAAAP8GCOkFAADUCv8GIgTiBQAAAP8GAuMFAAAA_wYI5AUAAAD_BgjpBQAA1Qr_BiIK2gUAANYKADDbBQAA3wUAENwFAADWCgAw7QUBAOMJACHuBUAA0QkAIfYFAQDjCQAhsQYAANcKsQYivAYBAM8JACGFB0AA0QkAIYYHQADSCQAhBxwAANcJACBkAADZCgAgZQAA2QoAIOIFAAAAsQYC4wUAAACxBgjkBQAAALEGCOkFAADYCrEGIgccAADXCQAgZAAA2QoAIGUAANkKACDiBQAAALEGAuMFAAAAsQYI5AUAAACxBgjpBQAA2AqxBiIE4gUAAACxBgLjBQAAALEGCOQFAAAAsQYI6QUAANkKsQYiC9oFAADaCgAw2wUAAMkFABDcBQAA2goAMO0FAQDjCQAh7gVAANEJACH2BQEA4wkAIYIHQADSCQAhiAcAANsKiAciiQcBAOQJACGKB0AA0QkAIYsHAQD1CQAhBxwAANcJACBkAADdCgAgZQAA3QoAIOIFAAAAiAcC4wUAAACIBwjkBQAAAIgHCOkFAADcCogHIgccAADXCQAgZAAA3QoAIGUAAN0KACDiBQAAAIgHAuMFAAAAiAcI5AUAAACIBwjpBQAA3AqIByIE4gUAAACIBwLjBQAAAIgHCOQFAAAAiAcI6QUAAN0KiAciENoFAADeCgAw2wUAALMFABDcBQAA3goAMOEFQADRCQAh7QUBAOMJACHuBUAA0QkAIZAGAAD-CZAGIowHAQDPCQAhjQcBAM8JACGOBwEAzwkAIY8HAQDPCQAhkAdAANEJACGRB0AA0gkAIZIHQADSCQAhkwcCANAJACGUB0AA0gkAIR0FAADjCgAgPwAA5QoAIEMAAOgKACBEAADqCgAgRQAA6woAIEcAAOwKACBIAADtCgAgSwAA4QoAIEwAAOIKACBNAADkCgAgTgAA5goAIE8AAOcKACBQAADpCgAg2gUAAN8KADDbBQAASAAQ3AUAAN8KADDhBUAA4AkAIe0FAQDBCgAh7gVAAOAJACGQBgAA4AqQBiKMBwEA3gkAIY0HAQDeCQAhjgcBAN4JACGPBwEA3gkAIZAHQADgCQAhkQdAAOEJACGSB0AA4QkAIZMHAgDfCQAhlAdAAOEJACEE4gUAAACQBgLjBQAAAJAGCOQFAAAAkAYI6QUAAIAKkAYiA5UHAAADACCWBwAAAwAglwcAAAMAIAOVBwAA9wEAIJYHAAD3AQAglwcAAPcBACADlQcAAAcAIJYHAAAHACCXBwAABwAgA5UHAAD8AQAglgcAAPwBACCXBwAA_AEAIAOVBwAAGQAglgcAABkAIJcHAAAZACADlQcAABAAIJYHAAAQACCXBwAAEAAgA5UHAAAbACCWBwAAGwAglwcAABsAIAOVBwAAyQEAIJYHAADJAQAglwcAAMkBACAPAwAA8wkAINoFAADxCQAw2wUAAIYCABDcBQAA8QkAMOEFQADgCQAh7QUBAMEKACHuBUAA4AkAIfYFAQDBCgAh9wUAAOwJACD4BQIA3wkAIfkFAgDfCQAh-gUAAO0JACD8BQAA8gn8BSKCCAAAhgIAIIMIAACGAgAgA5UHAADNAQAglgcAAM0BACCXBwAAzQEAIAOVBwAA0gEAIJYHAADSAQAglwcAANIBACADlQcAANUBACCWBwAA1QEAIJcHAADVAQAgA5UHAADbAQAglgcAANsBACCXBwAA2wEAIAraBQAA7goAMNsFAACbBQAQ3AUAAO4KADDtBQEA4wkAIe4FQADRCQAhgQYBAOMJACGYBwIA0AkAIZkHAAC8CgAgmgcBAPUJACGbBwEA9QkAIQ_aBQAA7woAMNsFAACBBQAQ3AUAAO8KADDfBUAA0QkAIe0FAQDjCQAh7gVAANEJACGBBgEA4wkAIaEGAQD1CQAh-gYBAM8JACGAB0AA0gkAIYIHQADSCQAhnAcBAM8JACGdBwEAzwkAIZ4HAQD1CQAhnwcBAOMJACEM2gUAAPAKADDbBQAA5wQAENwFAADwCgAw7QUBAOMJACHuBUAA0QkAIfMFAADyCqMHIvYFAQDjCQAhgQYBAOMJACGhBwAA8QqhByKjBwIAiAoAIaQHQADSCQAhpQdAANIJACEHHAAA1wkAIGQAAPYKACBlAAD2CgAg4gUAAAChBwLjBQAAAKEHCOQFAAAAoQcI6QUAAPUKoQciBxwAANcJACBkAAD0CgAgZQAA9AoAIOIFAAAAowcC4wUAAACjBwjkBQAAAKMHCOkFAADzCqMHIgccAADXCQAgZAAA9AoAIGUAAPQKACDiBQAAAKMHAuMFAAAAowcI5AUAAACjBwjpBQAA8wqjByIE4gUAAACjBwLjBQAAAKMHCOQFAAAAowcI6QUAAPQKowciBxwAANcJACBkAAD2CgAgZQAA9goAIOIFAAAAoQcC4wUAAAChBwjkBQAAAKEHCOkFAAD1CqEHIgTiBQAAAKEHAuMFAAAAoQcI5AUAAAChBwjpBQAA9gqhByIM2gUAAPcKADDbBQAA0QQAENwFAAD3CgAw4QVAANEJACHtBQEA4wkAIe4FQADRCQAh8wUAAPgKpwciwwZAANEJACHhBgEAzwkAIYwHAQDPCQAhpwcBAOMJACGoBwEA9QkAIQccAADXCQAgZAAA-goAIGUAAPoKACDiBQAAAKcHAuMFAAAApwcI5AUAAACnBwjpBQAA-QqnByIHHAAA1wkAIGQAAPoKACBlAAD6CgAg4gUAAACnBwLjBQAAAKcHCOQFAAAApwcI6QUAAPkKpwciBOIFAAAApwcC4wUAAACnBwjkBQAAAKcHCOkFAAD6CqcHIg7aBQAA-woAMNsFAAC5BAAQ3AUAAPsKADDtBQEA4wkAIe4FQADRCQAh8wUAAP0KrwcigQYBAOMJACGVBgIA0AkAIaEGAQD1CQAhogYBAPUJACGpBwEA4wkAIaoHAQDjCQAhrAcAAPwKrAcirQcBAOQJACEHHAAA1wkAIGQAAIELACBlAACBCwAg4gUAAACsBwLjBQAAAKwHCOQFAAAArAcI6QUAAIALrAciBxwAANcJACBkAAD_CgAgZQAA_woAIOIFAAAArwcC4wUAAACvBwjkBQAAAK8HCOkFAAD-Cq8HIgccAADXCQAgZAAA_woAIGUAAP8KACDiBQAAAK8HAuMFAAAArwcI5AUAAACvBwjpBQAA_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_aBQAAlwsAMNsFAADCAwAQ3AUAAJcLADDfBUAA0QkAIe0FAQDjCQAh7gVAANEJACH2BQEA4wkAIYEGAQDjCQAhtAYAAJgLzgci_AZAANIJACHOBwEAzwkAIc8HAgDQCQAh0AcBAM8JACHRBwEA5AkAIdIHAQD1CQAhBxwAANcJACBkAACaCwAgZQAAmgsAIOIFAAAAzgcC4wUAAADOBwjkBQAAAM4HCOkFAACZC84HIgccAADXCQAgZAAAmgsAIGUAAJoLACDiBQAAAM4HAuMFAAAAzgcI5AUAAADOBwjpBQAAmQvOByIE4gUAAADOBwLjBQAAAM4HCOQFAAAAzgcI6QUAAJoLzgciD9oFAACbCwAw2wUAAKwDABDcBQAAmwsAMO0FAQDjCQAh7gVAANEJACGBBgEA4wkAIbQGAACYC84HItAHAQDPCQAh0QcBAOQJACHTBwEA4wkAIdQHAQDPCQAh1QcCANAJACHWBwIAiAoAIdcHAgCICgAh2AcCAIgKACEQ2gUAAJwLADDbBQAAlgMAENwFAACcCwAw7QUBAOMJACHuBUAA0QkAIYEGAQDjCQAhtAYAAJ0L2gcizgYBAPUJACHPBgEA5AkAIZQHQADSCQAh0gcBAPUJACHaBwAAtgoAINsHAQD1CQAh3AcAAO0JACDdByAArQoAId4HQADSCQAhBxwAANcJACBkAACfCwAgZQAAnwsAIOIFAAAA2gcC4wUAAADaBwjkBQAAANoHCOkFAACeC9oHIgccAADXCQAgZAAAnwsAIGUAAJ8LACDiBQAAANoHAuMFAAAA2gcI5AUAAADaBwjpBQAAngvaByIE4gUAAADaBwLjBQAAANoHCOQFAAAA2gcI6QUAAJ8L2gciDNoFAACgCwAw2wUAAPoCABDcBQAAoAsAMO0FAQDjCQAh7gVAANEJACHwBQEA9QkAIYEGAQD1CQAh5wYAALwKACDfBwEA9QkAIeAHAQDPCQAh4QcBAOQJACHiBwEA5AkAIRTaBQAAoQsAMNsFAADgAgAQ3AUAAKELADDfBUAA0QkAIe0FAQDjCQAh7gVAANEJACHzBQAAowvoByL2BQEA4wkAIYEGAQD1CQAh7AYBAM8JACH8BkAA0gkAIeMHAAC8CgAg5AcAALwKACDmBwAAogvmByLpBwAApAvpByLqB0AA0gkAIesHAQDkCQAh7AcAALYKACDtBwEA5AkAIe4HAAC2CgAgBxwAANcJACBkAACqCwAgZQAAqgsAIOIFAAAA5gcC4wUAAADmBwjkBQAAAOYHCOkFAACpC-YHIgccAADXCQAgZAAAqAsAIGUAAKgLACDiBQAAAOgHAuMFAAAA6AcI5AUAAADoBwjpBQAApwvoByIHHAAA1wkAIGQAAKYLACBlAACmCwAg4gUAAADpBwLjBQAAAOkHCOQFAAAA6QcI6QUAAKUL6QciBxwAANcJACBkAACmCwAgZQAApgsAIOIFAAAA6QcC4wUAAADpBwjkBQAAAOkHCOkFAAClC-kHIgTiBQAAAOkHAuMFAAAA6QcI5AUAAADpBwjpBQAApgvpByIHHAAA1wkAIGQAAKgLACBlAACoCwAg4gUAAADoBwLjBQAAAOgHCOQFAAAA6AcI6QUAAKcL6AciBOIFAAAA6AcC4wUAAADoBwjkBQAAAOgHCOkFAACoC-gHIgccAADXCQAgZAAAqgsAIGUAAKoLACDiBQAAAOYHAuMFAAAA5gcI5AUAAADmBwjpBQAAqQvmByIE4gUAAADmBwLjBQAAAOYHCOQFAAAA5gcI6QUAAKoL5gciC9oFAACrCwAw2wUAAMgCABDcBQAAqwsAMO0FAQDjCQAh7gVAANEJACGhBwAArAvxByLvBwEA4wkAIfEHAQDPCQAh8gcBAOQJACHzBwAAtgoAIPUHAACtC_UHIwccAADXCQAgZAAAsQsAIGUAALELACDiBQAAAPEHAuMFAAAA8QcI5AUAAADxBwjpBQAAsAvxByIHHAAA1AkAIGQAAK8LACBlAACvCwAg4gUAAAD1BwPjBQAAAPUHCeQFAAAA9QcJ6QUAAK4L9QcjBxwAANQJACBkAACvCwAgZQAArwsAIOIFAAAA9QcD4wUAAAD1BwnkBQAAAPUHCekFAACuC_UHIwTiBQAAAPUHA-MFAAAA9QcJ5AUAAAD1BwnpBQAArwv1ByMHHAAA1wkAIGQAALELACBlAACxCwAg4gUAAADxBwLjBQAAAPEHCOQFAAAA8QcI6QUAALAL8QciBOIFAAAA8QcC4wUAAADxBwjkBQAAAPEHCOkFAACxC_EHIgraBQAAsgsAMNsFAACyAgAQ3AUAALILADDhBUAA0QkAIe0FAQDjCQAh7gVAANEJACH2BQEA4wkAIYEGAQD1CQAh9wcAALML9wci-AcBAOQJACEHHAAA1wkAIGQAALULACBlAAC1CwAg4gUAAAD3BwLjBQAAAPcHCOQFAAAA9wcI6QUAALQL9wciBxwAANcJACBkAAC1CwAgZQAAtQsAIOIFAAAA9wcC4wUAAAD3BwjkBQAAAPcHCOkFAAC0C_cHIgTiBQAAAPcHAuMFAAAA9wcI5AUAAAD3BwjpBQAAtQv3ByIMUQAAugsAINoFAAC2CwAw2wUAAJkCABDcBQAAtgsAMO0FAQDBCgAh7gVAAOAJACGhBwAAtwvxByLvBwEAwQoAIfEHAQDeCQAh8gcBAJQLACHzBwAAuAsAIPUHAAC5C_UHIwTiBQAAAPEHAuMFAAAA8QcI5AUAAADxBwjpBQAAsQvxByIM4gWAAAAAAeUFgAAAAAHmBYAAAAAB5wWAAAAAAegFgAAAAAHpBYAAAAAB2gYBAAAAAdsGAQAAAAHcBgEAAAAB3QaAAAAAAd4GgAAAAAHfBoAAAAABBOIFAAAA9QcD4wUAAAD1BwnkBQAAAPUHCekFAACvC_UHIw8DAADzCQAgBwAA1QsAIDYAANgLACDaBQAA1gsAMNsFAADSAQAQ3AUAANYLADDhBUAA4AkAIe0FAQDBCgAh7gVAAOAJACH2BQEAwQoAIYEGAQCTCwAh9wcAANcL9wci-AcBAJQLACGCCAAA0gEAIIMIAADSAQAgIgYAAPMJACAQAADnCgAgEwAAvgsAIBsAAMELACAgAADCCwAgIQAAwwsAICIAAMQLACAoAADFCwAgKQAAxgsAIDYAAMkLACA3AADKCwAgPQAAwAsAID4AAL0LACA_AADlCgAgQAAAvwsAIEEAAMcLACBCAADICwAgQwAA6AoAIEQAAOoKACBFAADrCgAgRwAA7AoAIEgAAO0KACDaBQAAuwsAMNsFAAAQABDcBQAAuwsAMOEFQADgCQAh7QUBAMEKACHuBUAA4AkAIfMFAAC8C6cHIsMGQADgCQAh4QYBAN4JACGMBwEA3gkAIacHAQDBCgAhqAcBAJMLACEE4gUAAACnBwLjBQAAAKcHCOQFAAAApwcI6QUAAPoKpwciEgcAANILACAIAADVCwAgPQAAwAsAINoFAADmCwAw2wUAABIAENwFAADmCwAw7QUBAMEKACHuBUAA4AkAIYEGAQDBCgAhvAYCAN8JACHCBgAA5wvCBiLDBkAA4AkAIcQGAQCUCwAhxQYAAO0JACDGBkAA4QkAIccGQADhCQAhgggAABIAIIMIAAASACADlQcAACsAIJYHAAArACCXBwAAKwAgA5UHAAASACCWBwAAEgAglwcAABIAIAOVBwAAFQAglgcAABUAIJcHAAAVACADlQcAADsAIJYHAAA7ACCXBwAAOwAgA5UHAABMACCWBwAATAAglwcAAEwAIAOVBwAANAAglgcAADQAIJcHAAA0ACADlQcAADEAIJYHAAAxACCXBwAAMQAgA5UHAABfACCWBwAAXwAglwcAAF8AIAOVBwAAHwAglgcAAB8AIJcHAAAfACADlQcAADcAIJYHAAA3ACCXBwAANwAgA5UHAADDAQAglgcAAMMBACCXBwAAwwEAIAOVBwAAgQEAIJYHAACBAQAglwcAAIEBACADlQcAAIYBACCWBwAAhgEAIJcHAACGAQAgDwMAAPMJACA4AADNCwAg2gUAAMsLADDbBQAA_AEAENwFAADLCwAw7QUBAMEKACHuBUAA4AkAIfMFAADMC_cGIvYFAQDBCgAh9wZAAOAJACH4BgEAkwsAIfkGQADhCQAh-gYBAJQLACH7BkAA4QkAIfwGQADhCQAhBOIFAAAA9wYC4wUAAAD3BgjkBQAAAPcGCOkFAADOCvcGIgOVBwAAjwEAIJYHAACPAQAglwcAAI8BACALAwAA8wkAINoFAADOCwAw2wUAAPcBABDcBQAAzgsAMO0FAQDBCgAh7gVAAOAJACH2BQEAwQoAIbEGAADPC7EGIrwGAQDeCQAhhQdAAOAJACGGB0AA4QkAIQTiBQAAALEGAuMFAAAAsQYI5AUAAACxBgjpBQAA2QqxBiIRAwAA8wkAIAcAANILACDaBQAA0AsAMNsFAADbAQAQ3AUAANALADDfBUAA4AkAIe0FAQDBCgAh7gVAAOAJACH2BQEAwQoAIYEGAQDBCgAhtAYAANELzgci_AZAAOEJACHOBwEA3gkAIc8HAgDfCQAh0AcBAN4JACHRBwEAlAsAIdIHAQCTCwAhBOIFAAAAzgcC4wUAAADOBwjkBQAAAM4HCOkFAACaC84HIiQGAADzCQAgEAAA5woAIBMAAL4LACAbAADBCwAgIAAAwgsAICEAAMMLACAiAADECwAgKAAAxQsAICkAAMYLACA2AADJCwAgNwAAygsAID0AAMALACA-AAC9CwAgPwAA5QoAIEAAAL8LACBBAADHCwAgQgAAyAsAIEMAAOgKACBEAADqCgAgRQAA6woAIEcAAOwKACBIAADtCgAg2gUAALsLADDbBQAAEAAQ3AUAALsLADDhBUAA4AkAIe0FAQDBCgAh7gVAAOAJACHzBQAAvAunByLDBkAA4AkAIeEGAQDeCQAhjAcBAN4JACGnBwEAwQoAIagHAQCTCwAhgggAABAAIIMIAAAQACAOBwAA1QsAIEYAANQLACDaBQAA0wsAMNsFAADVAQAQ3AUAANMLADDtBQEAwQoAIe4FQADgCQAh8AUBAJMLACGBBgEAkwsAIecGAADDCgAg3wcBAJMLACHgBwEA3gkAIeEHAQCUCwAh4gcBAJQLACEfBQAA4woAID8AAOUKACBDAADoCgAgRAAA6goAIEUAAOsKACBHAADsCgAgSAAA7QoAIEsAAOEKACBMAADiCgAgTQAA5AoAIE4AAOYKACBPAADnCgAgUAAA6QoAINoFAADfCgAw2wUAAEgAENwFAADfCgAw4QVAAOAJACHtBQEAwQoAIe4FQADgCQAhkAYAAOAKkAYijAcBAN4JACGNBwEA3gkAIY4HAQDeCQAhjwcBAN4JACGQB0AA4AkAIZEHQADhCQAhkgdAAOEJACGTBwIA3wkAIZQHQADhCQAhgggAAEgAIIMIAABIACAkBgAA8wkAIBAAAOcKACATAAC-CwAgGwAAwQsAICAAAMILACAhAADDCwAgIgAAxAsAICgAAMULACApAADGCwAgNgAAyQsAIDcAAMoLACA9AADACwAgPgAAvQsAID8AAOUKACBAAAC_CwAgQQAAxwsAIEIAAMgLACBDAADoCgAgRAAA6goAIEUAAOsKACBHAADsCgAgSAAA7QoAINoFAAC7CwAw2wUAABAAENwFAAC7CwAw4QVAAOAJACHtBQEAwQoAIe4FQADgCQAh8wUAALwLpwciwwZAAOAJACHhBgEA3gkAIYwHAQDeCQAhpwcBAMEKACGoBwEAkwsAIYIIAAAQACCDCAAAEAAgDQMAAPMJACAHAADVCwAgNgAA2AsAINoFAADWCwAw2wUAANIBABDcBQAA1gsAMOEFQADgCQAh7QUBAMEKACHuBUAA4AkAIfYFAQDBCgAhgQYBAJMLACH3BwAA1wv3ByL4BwEAlAsAIQTiBQAAAPcHAuMFAAAA9wcI5AUAAAD3BwjpBQAAtQv3ByIDlQcAAJkCACCWBwAAmQIAIJcHAACZAgAgFgMAAPMJACAHAADVCwAg2gUAANkLADDbBQAAzQEAENwFAADZCwAw3wVAAOAJACHtBQEAwQoAIe4FQADgCQAh8wUAANsL6Aci9gUBAMEKACGBBgEAkwsAIewGAQDeCQAh_AZAAOEJACHjBwAAwwoAIOQHAADDCgAg5gcAANoL5gci6QcAANwL6Qci6gdAAOEJACHrBwEAlAsAIewHAAC4CwAg7QcBAJQLACHuBwAAuAsAIATiBQAAAOYHAuMFAAAA5gcI5AUAAADmBwjpBQAAqgvmByIE4gUAAADoBwLjBQAAAOgHCOQFAAAA6AcI6QUAAKgL6AciBOIFAAAA6QcC4wUAAADpBwjkBQAAAOkHCOkFAACmC-kHIhMDAADzCQAgBwAA1QsAIEkAAOALACDaBQAA3QsAMNsFAADJAQAQ3AUAAN0LADDtBQEAwQoAIe4FQADgCQAh9gUBAMEKACGBBgEAkwsAIYIGAADeC4EGIoMGAQDeCQAhhAYBAN4JACGFBgEA3gkAIYYGAQDeCQAhhwYBAJQLACGIBkAA4QkAIYkGAQCUCwAhiwYAAN8LiwYiBOIFAAAAgQYC4wUAAACBBgjkBQAAAIEGCOkFAAD7CYEGIgTiBQAAAIsGAuMFAAAAiwYI5AUAAACLBgjpBQAA-QmLBiIDlQcAAAwAIJYHAAAMACCXBwAADAAgEQcAANILACAtAADjCwAgLwAA5AsAINoFAADhCwAw2wUAAMMBABDcBQAA4QsAMO0FAQDBCgAh7gVAAOAJACHzBQAA4gvVBiKBBgEAwQoAIdIGQADgCQAh0wYBAN4JACHVBgAAuAsAINYGAQCUCwAh1wYBAJQLACHYBgIA3wkAIdkGQADhCQAhBOIFAAAA1QYC4wUAAADVBgjkBQAAANUGCOkFAAC5CtUGIgOVBwAAdAAglgcAAHQAIJcHAAB0ACADlQcAAHkAIJYHAAB5ACCXBwAAeQAgAoEGAQAAAAG8BgIAAAABEAcAANILACAIAADVCwAgPQAAwAsAINoFAADmCwAw2wUAABIAENwFAADmCwAw7QUBAMEKACHuBUAA4AkAIYEGAQDBCgAhvAYCAN8JACHCBgAA5wvCBiLDBkAA4AkAIcQGAQCUCwAhxQYAAO0JACDGBkAA4QkAIccGQADhCQAhBOIFAAAAwgYC4wUAAADCBgjkBQAAAMIGCOkFAACrCsIGIgL2BQEAAAABgQYBAAAAASMDAADzCQAgBwAA0gsAIA4AAO8LACAPAADwCwAgGwAAwQsAIB4AAOcKACAfAADBCwAgIAAAwgsAICEAAMMLACAiAADECwAgIwAA7QsAICQAAMALACAlAADuCwAgKAAAxQsAICkAAMYLACAqAADGCwAgKwAAxwsAICwAAMcLACAtAADjCwAgLwAA5AsAIDYAAMkLACA3AADKCwAgOgAAzQsAINoFAADpCwAw2wUAABkAENwFAADpCwAw7QUBAMEKACHuBUAA4AkAIfMFAADrC6MHIvYFAQDBCgAhgQYBAMEKACGhBwAA6guhByKjBwIA7AsAIaQHQADhCQAhpQdAAOEJACEE4gUAAAChBwLjBQAAAKEHCOQFAAAAoQcI6QUAAPYKoQciBOIFAAAAowcC4wUAAACjBwjkBQAAAKMHCOkFAAD0CqMHIgjiBQIAAAAB4wUCAAAABeQFAgAAAAXlBQIAAAAB5gUCAAAAAecFAgAAAAHoBQIAAAAB6QUCANQJACEDlQcAAFYAIJYHAABWACCXBwAAVgAgA5UHAABbACCWBwAAWwAglwcAAFsAIAOVBwAAIgAglgcAACIAIJcHAAAiACADlQcAACYAIJYHAAAmACCXBwAAJgAgAowGAQAAAAH1BgEAAAABCg0AAPQLACA5AADzCwAg2gUAAPILADDbBQAAjwEAENwFAADyCwAw7QUBAMEKACHuBUAA4AkAIYEGAQDBCgAhjAYBAMEKACH1BgEAwQoAIREDAADzCQAgOAAAzQsAINoFAADLCwAw2wUAAPwBABDcBQAAywsAMO0FAQDBCgAh7gVAAOAJACHzBQAAzAv3BiL2BQEAwQoAIfcGQADgCQAh-AYBAJMLACH5BkAA4QkAIfoGAQCUCwAh-wZAAOEJACH8BkAA4QkAIYIIAAD8AQAggwgAAPwBACAlAwAA8wkAIAcAANILACAOAADvCwAgDwAA8AsAIBsAAMELACAeAADnCgAgHwAAwQsAICAAAMILACAhAADDCwAgIgAAxAsAICMAAO0LACAkAADACwAgJQAA7gsAICgAAMULACApAADGCwAgKgAAxgsAICsAAMcLACAsAADHCwAgLQAA4wsAIC8AAOQLACA2AADJCwAgNwAAygsAIDoAAM0LACDaBQAA6QsAMNsFAAAZABDcBQAA6QsAMO0FAQDBCgAh7gVAAOAJACHzBQAA6wujByL2BQEAwQoAIYEGAQDBCgAhoQcAAOoLoQciowcCAOwLACGkB0AA4QkAIaUHQADhCQAhgggAABkAIIMIAAAZACASBwAA0gsAIDEAAPQLACAyAAD2CwAg2gUAAPULADDbBQAAhgEAENwFAAD1CwAw7QUBAMEKACHuBUAA4AkAIYEGAQDBCgAhtAYAANELzgci0AcBAN4JACHRBwEAlAsAIdMHAQDBCgAh1AcBAN4JACHVBwIA3wkAIdYHAgDsCwAh1wcCAOwLACHYBwIA7AsAIRcHAADSCwAgMAAA-gsAIDMAAPsLACA0AAD2CwAgNQAAyQsAINoFAAD3CwAw2wUAAIEBABDcBQAA9wsAMO0FAQDBCgAh7gVAAOAJACGBBgEAwQoAIbQGAAD4C9oHIs4GAQCTCwAhzwYBAJQLACGUB0AA4QkAIdIHAQCTCwAh2gcAALgLACDbBwEAkwsAIdwHAADtCQAg3QcgAPkLACHeB0AA4QkAIYIIAACBAQAggwgAAIEBACAVBwAA0gsAIDAAAPoLACAzAAD7CwAgNAAA9gsAIDUAAMkLACDaBQAA9wsAMNsFAACBAQAQ3AUAAPcLADDtBQEAwQoAIe4FQADgCQAhgQYBAMEKACG0BgAA-AvaByLOBgEAkwsAIc8GAQCUCwAhlAdAAOEJACHSBwEAkwsAIdoHAAC4CwAg2wcBAJMLACHcBwAA7QkAIN0HIAD5CwAh3gdAAOEJACEE4gUAAADaBwLjBQAAANoHCOQFAAAA2gcI6QUAAJ8L2gciAuIFIAAAAAHpBSAArwoAISUDAADzCQAgBwAA0gsAIA4AAO8LACAPAADwCwAgGwAAwQsAIB4AAOcKACAfAADBCwAgIAAAwgsAICEAAMMLACAiAADECwAgIwAA7QsAICQAAMALACAlAADuCwAgKAAAxQsAICkAAMYLACAqAADGCwAgKwAAxwsAICwAAMcLACAtAADjCwAgLwAA5AsAIDYAAMkLACA3AADKCwAgOgAAzQsAINoFAADpCwAw2wUAABkAENwFAADpCwAw7QUBAMEKACHuBUAA4AkAIfMFAADrC6MHIvYFAQDBCgAhgQYBAMEKACGhBwAA6guhByKjBwIA7AsAIaQHQADhCQAhpQdAAOEJACGCCAAAGQAggwgAABkAIBQHAADSCwAgMQAA9AsAIDIAAPYLACDaBQAA9QsAMNsFAACGAQAQ3AUAAPULADDtBQEAwQoAIe4FQADgCQAhgQYBAMEKACG0BgAA0QvOByLQBwEA3gkAIdEHAQCUCwAh0wcBAMEKACHUBwEA3gkAIdUHAgDfCQAh1gcCAOwLACHXBwIA7AsAIdgHAgDsCwAhgggAAIYBACCDCAAAhgEAIAKMBgEAAAAByAYBAAAAAQ4NAAD0CwAgLgAA_gsAINoFAAD9CwAw2wUAAHkAENwFAAD9CwAw7QUBAMEKACHuBUAA4AkAIYwGAQDBCgAhyAYBAMEKACHJBiAA-QsAIcoGIAD5CwAhywYBAJQLACHMBkAA4QkAIc0GAQCTCwAhEwcAANILACAtAADjCwAgLwAA5AsAINoFAADhCwAw2wUAAMMBABDcBQAA4QsAMO0FAQDBCgAh7gVAAOAJACHzBQAA4gvVBiKBBgEAwQoAIdIGQADgCQAh0wYBAN4JACHVBgAAuAsAINYGAQCUCwAh1wYBAJQLACHYBgIA3wkAIdkGQADhCQAhgggAAMMBACCDCAAAwwEAIAsuAAD-CwAgMAAA-gsAINoFAAD_CwAw2wUAAHQAENwFAAD_CwAw7QUBAMEKACHuBUAA4AkAIcgGAQDBCgAhzgYBAJMLACHPBgEA3gkAIdEGAACADNEGIgTiBQAAANEGAuMFAAAA0QYI5AUAAADRBgjpBQAAswrRBiITBwAA0gsAIAwAAIQMACAVAAD0CwAgFgAA9AsAIBcAAIUMACDaBQAAgQwAMNsFAAA3ABDcBQAAgQwAMO0FAQDBCgAh7gVAAOAJACHzBQAAgwyvByKBBgEAwQoAIZUGAgDfCQAhoQYBAJMLACGiBgEAkwsAIakHAQDBCgAhqgcBAMEKACGsBwAAggysByKtBwEAlAsAIQTiBQAAAKwHAuMFAAAArAcI5AUAAACsBwjpBQAAgQusByIE4gUAAACvBwLjBQAAAK8HCOQFAAAArwcI6QUAAP8KrwciIwcAANILACAKAAD0CwAgCwAA-gsAIA4AAO8LACAPAADwCwAgEAAA5woAIBMAAL4LACAUAACKDAAgGAAAiwwAINoFAACGDAAw2wUAAB8AENwFAACGDAAw7QUBAMEKACHuBUAA4AkAIfMFAACJDMMHIoEGAQDBCgAhxwZAAOEJACHsBgAAhwy0ByK0BwAAwwoAILUHAQCUCwAhtgcBAMEKACG3ByAA-QsAIbkHAACIDLkHIroHAADtCQAguwcBAJMLACG8BwAA7QkAIL0HQADhCQAhvgcCAN8JACG_BwIA3wkAIcAHQADgCQAhwQdAAOAJACHDB0AA4QkAIcQHAAC4CwAggggAAB8AIIMIAAAfACAXBwAA0gsAIA0AAPQLACAUAACKDAAgGAAAiwwAINoFAACZDAAw2wUAADQAENwFAACZDAAw4QVAAOAJACHtBQEAwQoAIe4FQADgCQAh8wUAAJsMqgYigQYBAMEKACGMBgEAwQoAIZUGAgDfCQAhmwYCAN8JACGkBgAAmgykBiKlBgIA7AsAIaYGAQDeCQAhpwYBAN4JACGoBgEAlAsAIaoGQADhCQAhgggAADQAIIMIAAA0ACAhBwAA0gsAIAoAAPQLACALAAD6CwAgDgAA7wsAIA8AAPALACAQAADnCgAgEwAAvgsAIBQAAIoMACAYAACLDAAg2gUAAIYMADDbBQAAHwAQ3AUAAIYMADDtBQEAwQoAIe4FQADgCQAh8wUAAIkMwwcigQYBAMEKACHHBkAA4QkAIewGAACHDLQHIrQHAADDCgAgtQcBAJQLACG2BwEAwQoAIbcHIAD5CwAhuQcAAIgMuQciugcAAO0JACC7BwEAkwsAIbwHAADtCQAgvQdAAOEJACG-BwIA3wkAIb8HAgDfCQAhwAdAAOAJACHBB0AA4AkAIcMHQADhCQAhxAcAALgLACAE4gUAAAC0BwLjBQAAALQHCOQFAAAAtAcI6QUAAJALtAciBOIFAAAAuQcC4wUAAAC5BwjkBQAAALkHCOkFAACOC7kHIgTiBQAAAMMHAuMFAAAAwwcI5AUAAADDBwjpBQAAjAvDByIbBwAA0gsAIAwAAIQMACANAAD0CwAgFwAAhQwAIBsAAMELACDaBQAAlwwAMNsFAAAxABDcBQAAlwwAMOEFQADgCQAh7QUBAMEKACHuBUAA4AkAIfMFAACYDJ4GIoEGAQDBCgAhjAYBAMEKACGXBgIA3wkAIZgGAgDfCQAhmQYCAN8JACGaBgIA3wkAIZsGAgDfCQAhnAYCAN8JACGeBgEAkwsAIZ8GAQCUCwAhoAZAAOEJACGhBgEAkwsAIaIGAQCTCwAhgggAADEAIIMIAAAxACAVBwAA0gsAIAwAAIQMACAVAAD0CwAgFgAA9AsAIBcAAIUMACDaBQAAgQwAMNsFAAA3ABDcBQAAgQwAMO0FAQDBCgAh7gVAAOAJACHzBQAAgwyvByKBBgEAwQoAIZUGAgDfCQAhoQYBAJMLACGiBgEAkwsAIakHAQDBCgAhqgcBAMEKACGsBwAAggysByKtBwEAlAsAIYIIAAA3ACCDCAAANwAgCSYAAI0MACDaBQAAjAwAMNsFAABlABDcBQAAjAwAMO0FAQDBCgAh7gVAAOAJACGVBgIA3wkAIegGAQDBCgAh6QYBAN4JACEYBwAA0gsAIA0AAPoLACAZAACRDAAgJwAAkgwAINoFAACPDAAw2wUAAF8AENwFAACPDAAw7QUBAMEKACHuBUAA4AkAIYEGAQDBCgAhjAYBAJMLACGUBgEAkwsAIeoGAgDfCQAh7AYAAJAM7AYi7QZAAOAJACHuBgEAlAsAIe8GAQCUCwAh8AYBAN4JACHxBgEA3gkAIfIGAADDCgAg8wYBAN4JACH0BgEA3gkAIYIIAABfACCDCAAAXwAgAoEGAQAAAAHqBgIAAAABFgcAANILACANAAD6CwAgGQAAkQwAICcAAJIMACDaBQAAjwwAMNsFAABfABDcBQAAjwwAMO0FAQDBCgAh7gVAAOAJACGBBgEAwQoAIYwGAQCTCwAhlAYBAJMLACHqBgIA3wkAIewGAACQDOwGIu0GQADgCQAh7gYBAJQLACHvBgEAlAsAIfAGAQDeCQAh8QYBAN4JACHyBgAAwwoAIPMGAQDeCQAh9AYBAN4JACEE4gUAAADsBgLjBQAAAOwGCOQFAAAA7AYI6QUAAMkK7AYiFgcAANILACAJAACwDAAgGwAAwQsAICMAAO0LACAoAADFCwAgOwAA-gsAIDwAAL4LACDaBQAArgwAMNsFAAAVABDcBQAArgwAMO0FAQDBCgAh7gVAAOAJACHzBQAArwzABiKBBgEAwQoAIbcGQADgCQAhuwYBAMEKACG8BgIA3wkAIb0GAQCTCwAhvgZAAOAJACHABgIA3wkAIYIIAAAVACCDCAAAFQAgA5UHAABlACCWBwAAZQAglwcAAGUAIA0NAAD0CwAg2gUAAJMMADDbBQAAWwAQ3AUAAJMMADDtBQEAwQoAIe4FQADgCQAhjAYBAMEKACGNBkAA4AkAIY4GQADgCQAhkAYAAOAKkAYikQYBAN4JACGSBgEA3gkAIZMGAQDeCQAhAowGAQAAAAGUBgEAAAABDA0AAPQLACAZAACWDAAg2gUAAJUMADDbBQAAVgAQ3AUAAJUMADDhBUAA4AkAIe0FAQDBCgAh7gVAAOAJACGMBgEAwQoAIZQGAQDBCgAhlQYCAN8JACGWBkAA4AkAIRYHAADSCwAgCQAAsAwAIBsAAMELACAjAADtCwAgKAAAxQsAIDsAAPoLACA8AAC-CwAg2gUAAK4MADDbBQAAFQAQ3AUAAK4MADDtBQEAwQoAIe4FQADgCQAh8wUAAK8MwAYigQYBAMEKACG3BkAA4AkAIbsGAQDBCgAhvAYCAN8JACG9BgEAkwsAIb4GQADgCQAhwAYCAN8JACGCCAAAFQAggwgAABUAIBkHAADSCwAgDAAAhAwAIA0AAPQLACAXAACFDAAgGwAAwQsAINoFAACXDAAw2wUAADEAENwFAACXDAAw4QVAAOAJACHtBQEAwQoAIe4FQADgCQAh8wUAAJgMngYigQYBAMEKACGMBgEAwQoAIZcGAgDfCQAhmAYCAN8JACGZBgIA3wkAIZoGAgDfCQAhmwYCAN8JACGcBgIA3wkAIZ4GAQCTCwAhnwYBAJQLACGgBkAA4QkAIaEGAQCTCwAhogYBAJMLACEE4gUAAACeBgLjBQAAAJ4GCOQFAAAAngYI6QUAAIUKngYiFQcAANILACANAAD0CwAgFAAAigwAIBgAAIsMACDaBQAAmQwAMNsFAAA0ABDcBQAAmQwAMOEFQADgCQAh7QUBAMEKACHuBUAA4AkAIfMFAACbDKoGIoEGAQDBCgAhjAYBAMEKACGVBgIA3wkAIZsGAgDfCQAhpAYAAJoMpAYipQYCAOwLACGmBgEA3gkAIacGAQDeCQAhqAYBAJQLACGqBkAA4QkAIQTiBQAAAKQGAuMFAAAApAYI5AUAAACkBgjpBQAAjwqkBiIE4gUAAACqBgLjBQAAAKoGCOQFAAAAqgYI6QUAAIsKqgYiFQcAANILACANAAD0CwAg2gUAAJwMADDbBQAATAAQ3AUAAJwMADDhBUAA4AkAIe0FAQDBCgAh7gVAAOAJACHzBQAAnQytBiKBBgEAwQoAIYwGAQDBCgAhlQYCAN8JACGmBgEA3gkAIacGAQDeCQAhqAYBAJQLACGqBkAA4QkAIasGAADtCQAgrQYCAOwLACGvBgAAngyvBiOxBgAAnwyxBiOyBgEAlAsAIQTiBQAAAK0GAuMFAAAArQYI5AUAAACtBgjpBQAAmQqtBiIE4gUAAACvBgPjBQAAAK8GCeQFAAAArwYJ6QUAAJcKrwYjBOIFAAAAsQYD4wUAAACxBgnkBQAAALEGCekFAACVCrEGIxUHAADSCwAgDQAA9AsAIBQAAIoMACAZAACRDAAgGgAA-gsAINoFAACgDAAw2wUAADsAENwFAACgDAAw7QUBAMEKACHuBUAA4AkAIfMFAACiDLkGIoEGAQDBCgAhjAYBAMEKACGUBgEAkwsAIZUGAgDfCQAhtAYAAKEMtAYitQYBAJMLACG2BgEAkwsAIbcGQADgCQAhuQZAAOEJACG6BiAAowwAIQTiBQAAALQGAuMFAAAAtAYI5AUAAAC0BgjpBQAAowq0BiIE4gUAAAC5BgLjBQAAALkGCOQFAAAAuQYI6QUAAKEKuQYiAuIFIAAAAAHpBSAAnwoAIQKBBgEAAAABmAcCAAAAAQ0HAADSCwAgEQAAkQwAIBIAAIQMACDaBQAApQwAMNsFAAArABDcBQAApQwAMO0FAQDBCgAh7gVAAOAJACGBBgEAwQoAIZgHAgDfCQAhmQcAAMMKACCaBwEAkwsAIZsHAQCTCwAhAowGAQAAAAGhBgEAAAABCwwAAKkMACANAAD0CwAg2gUAAKcMADDbBQAAJgAQ3AUAAKcMADDtBQEAwQoAIe4FQADgCQAhjAYBAMEKACGhBgEAwQoAIbAHAACoDLAHIrEHQADgCQAhBOIFAAAAsAcC4wUAAACwBwjkBQAAALAHCOkFAACFC7AHIiMHAADSCwAgCgAA9AsAIAsAAPoLACAOAADvCwAgDwAA8AsAIBAAAOcKACATAAC-CwAgFAAAigwAIBgAAIsMACDaBQAAhgwAMNsFAAAfABDcBQAAhgwAMO0FAQDBCgAh7gVAAOAJACHzBQAAiQzDByKBBgEAwQoAIccGQADhCQAh7AYAAIcMtAcitAcAAMMKACC1BwEAlAsAIbYHAQDBCgAhtwcgAPkLACG5BwAAiAy5ByK6BwAA7QkAILsHAQCTCwAhvAcAAO0JACC9B0AA4QkAIb4HAgDfCQAhvwcCAN8JACHAB0AA4AkAIcEHQADgCQAhwwdAAOEJACHEBwAAuAsAIIIIAAAfACCDCAAAHwAgAowGAQAAAAGhBgEAAAABCgwAAKkMACANAAD0CwAg2gUAAKsMADDbBQAAIgAQ3AUAAKsMADDtBQEAwQoAIe4FQADgCQAhjAYBAMEKACGhBgEAwQoAIbIHQADgCQAhEwYAAPQLACAHAADSCwAgDAAAhAwAIB0AANQLACDaBQAArAwAMNsFAAAbABDcBQAArAwAMN8FQADgCQAh7QUBAMEKACHuBUAA4AkAIYEGAQDBCgAhoQYBAJMLACH6BgEA3gkAIYAHQADhCQAhggdAAOEJACGcBwEA3gkAIZ0HAQDeCQAhngcBAJMLACGfBwEAwQoAIQK7BgEAAAABvAYCAAAAARQHAADSCwAgCQAAsAwAIBsAAMELACAjAADtCwAgKAAAxQsAIDsAAPoLACA8AAC-CwAg2gUAAK4MADDbBQAAFQAQ3AUAAK4MADDtBQEAwQoAIe4FQADgCQAh8wUAAK8MwAYigQYBAMEKACG3BkAA4AkAIbsGAQDBCgAhvAYCAN8JACG9BgEAkwsAIb4GQADgCQAhwAYCAN8JACEE4gUAAADABgLjBQAAAMAGCOQFAAAAwAYI6QUAAKcKwAYiEgcAANILACAIAADVCwAgPQAAwAsAINoFAADmCwAw2wUAABIAENwFAADmCwAw7QUBAMEKACHuBUAA4AkAIYEGAQDBCgAhvAYCAN8JACHCBgAA5wvCBiLDBkAA4AkAIcQGAQCUCwAhxQYAAO0JACDGBkAA4QkAIccGQADhCQAhgggAABIAIIMIAAASACANBAAAtAwAIEoAALMMACDaBQAAsQwAMNsFAAAMABDcBQAAsQwAMO0FAQDBCgAh7gVAAOAJACHvBQEAwQoAIfAFAQDBCgAh8QUBAJQLACHzBQAAsgzzBSL0BQEAlAsAIfUFQADhCQAhBOIFAAAA8wUC4wUAAADzBQjkBQAAAPMFCOkFAADnCfMFIhUDAADzCQAgBwAA1QsAIEkAAOALACDaBQAA3QsAMNsFAADJAQAQ3AUAAN0LADDtBQEAwQoAIe4FQADgCQAh9gUBAMEKACGBBgEAkwsAIYIGAADeC4EGIoMGAQDeCQAhhAYBAN4JACGFBgEA3gkAIYYGAQDeCQAhhwYBAJQLACGIBkAA4QkAIYkGAQCUCwAhiwYAAN8LiwYigggAAMkBACCDCAAAyQEAIBADAADzCQAgBQAA4woAIEkAAOALACDaBQAAuQwAMNsFAAADABDcBQAAuQwAMO0FAQDBCgAh7gVAAOAJACH2BQEAwQoAIYIHQADhCQAhiAcAALoMiAciiQcBAJQLACGKB0AA4AkAIYsHAQCTCwAhgggAAAMAIIMIAAADACARAwAA8wkAIAQAALgMACDaBQAAtQwAMNsFAAAHABDcBQAAtQwAMN8FQADgCQAh7QUBAMEKACHuBUAA4AkAIfAFAQCTCwAh9gUBAMEKACH6BgEA3gkAIf0GAQDBCgAh_wYAALYM_wYigAdAAOEJACGBBwEAkwsAIYIHQADhCQAhhAcAALcMhAcjBOIFAAAA_wYC4wUAAAD_BgjkBQAAAP8GCOkFAADVCv8GIgTiBQAAAIQHA-MFAAAAhAcJ5AUAAACEBwnpBQAA0wqEByMQAwAA8wkAIAUAAOMKACBJAADgCwAg2gUAALkMADDbBQAAAwAQ3AUAALkMADDtBQEAwQoAIe4FQADgCQAh9gUBAMEKACGCB0AA4QkAIYgHAAC6DIgHIokHAQCUCwAhigdAAOAJACGLBwEAkwsAIYIIAAADACCDCAAAAwAgDgMAAPMJACAFAADjCgAgSQAA4AsAINoFAAC5DAAw2wUAAAMAENwFAAC5DAAw7QUBAMEKACHuBUAA4AkAIfYFAQDBCgAhggdAAOEJACGIBwAAugyIByKJBwEAlAsAIYoHQADgCQAhiwcBAJMLACEE4gUAAACIBwLjBQAAAIgHCOQFAAAAiAcI6QUAAN0KiAciAAAAAAAAAYcIAQAAAAEFhwgCAAAAAY4IAgAAAAGPCAIAAAABkAgCAAAAAZEIAgAAAAEBhwhAAAAAAQGHCEAAAAABAAAAAYcIAQAAAAEBhwgAAADzBQIFXgAA7RoAIF8AAPMaACCECAAA7hoAIIUIAADyGgAgiggAAMsBACAFXgAA6xoAIF8AAPAaACCECAAA7BoAIIUIAADvGgAgiggAAAUAIANeAADtGgAghAgAAO4aACCKCAAAywEAIANeAADrGgAghAgAAOwaACCKCAAABQAgAAAAAAAChwgAAACBBgiNCAAAAIEGAgKHCAEAAAAEjQgBAAAABQGHCAAAAPwFAgVeAADmGgAgXwAA6RoAIIQIAADnGgAghQgAAOgaACCKCAAAngUAIAGHCAAAAIEGCAGHCAEAAAAEA14AAOYaACCECAAA5xoAIIoIAACeBQAgEAUAALAWACA_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fMFAAAAuQYCgQYBAAAAAYwGAQAAAAGUBgEAAAABlQYCAAAAAbQGAAAAtAYCtgYBAAAAAbcGQAAAAAG5BkAAAAABugYgAAAAAQNeAACxGgAghAgAALIaACCKCAAAggIAIANeAACvGgAghAgAALAaACCKCAAAtAEAIANeAACtGgAghAgAAK4aACCKCAAAFwAgA14AAKsaACCECAAArBoAIIoIAAC0AQAgA14AAKkaACCECAAAqhoAIIoIAACCAgAgA14AAKcaACCECAAAqBoAIIoIAAC0AQAgA14AAKUaACCECAAAphoAIIoIAABrACADXgAAoxoAIIQIAACkGgAgiggAAFEAIAReAACMDQAwhAgAAI0NADCGCAAAjw0AIIoIAACQDQAwAAAAAAABhwgAAACkBgIFhwgCAAAAAY4IAgAAAAGPCAIAAAABkAgCAAAAAZEIAgAAAAEBhwgAAACqBgIFXgAAhxoAIF8AAKEaACCECAAAiBoAIIUIAACgGgAgiggAAIICACAFXgAAhRoAIF8AAJ4aACCECAAAhhoAIIUIAACdGgAgiggAALQBACAHXgAAww0AIF8AAMYNACCECAAAxA0AIIUIAADFDQAgiAgAADEAIIkIAAAxACCKCAAAVAAgB14AALQNACBfAAC3DQAghAgAALUNACCFCAAAtg0AIIgIAAA3ACCJCAAANwAgiggAAHEAIA4HAAC_DQAgDAAAwg0AIBUAAMANACAWAADBDQAg7QUBAAAAAe4FQAAAAAHzBQAAAK8HAoEGAQAAAAGVBgIAAAABoQYBAAAAAakHAQAAAAGqBwEAAAABrAcAAACsBwKtBwEAAAABAgAAAHEAIF4AALQNACADAAAANwAgXgAAtA0AIF8AALgNACAQAAAANwAgBwAAuw0AIAwAAL4NACAVAAC8DQAgFgAAvQ0AIFcAALgNACDtBQEAwQwAIe4FQADDDAAh8wUAALoNrwcigQYBAMEMACGVBgIAwgwAIaEGAQDIDAAhqQcBAMEMACGqBwEAwQwAIawHAAC5DawHIq0HAQDIDAAhDgcAALsNACAMAAC-DQAgFQAAvA0AIBYAAL0NACDtBQEAwQwAIe4FQADDDAAh8wUAALoNrwcigQYBAMEMACGVBgIAwgwAIaEGAQDIDAAhqQcBAMEMACGqBwEAwQwAIawHAAC5DawHIq0HAQDIDAAhAYcIAAAArAcCAYcIAAAArwcCBV4AAI8aACBfAACbGgAghAgAAJAaACCFCAAAmhoAIIoIAACCAgAgBV4AAI0aACBfAACYGgAghAgAAI4aACCFCAAAlxoAIIoIAAC0AQAgBV4AAIsaACBfAACVGgAghAgAAIwaACCFCAAAlBoAIIoIAAC0AQAgB14AAIkaACBfAACSGgAghAgAAIoaACCFCAAAkRoAIIgIAAAfACCJCAAAHwAgiggAAGsAIANeAACPGgAghAgAAJAaACCKCAAAggIAIANeAACNGgAghAgAAI4aACCKCAAAtAEAIANeAACLGgAghAgAAIwaACCKCAAAtAEAIANeAACJGgAghAgAAIoaACCKCAAAawAgFAcAAKMNACAMAAClDQAgDQAApA0AIBsAAKcNACDhBUAAAAAB7QUBAAAAAe4FQAAAAAHzBQAAAJ4GAoEGAQAAAAGMBgEAAAABlwYCAAAAAZgGAgAAAAGZBgIAAAABmgYCAAAAAZsGAgAAAAGcBgIAAAABngYBAAAAAZ8GAQAAAAGgBkAAAAABoQYBAAAAAQIAAABUACBeAADDDQAgAwAAADEAIF4AAMMNACBfAADHDQAgFgAAADEAIAcAAIcNACAMAACJDQAgDQAAiA0AIBsAAIsNACBXAADHDQAg4QVAAMMMACHtBQEAwQwAIe4FQADDDAAh8wUAAIYNngYigQYBAMEMACGMBgEAwQwAIZcGAgDCDAAhmAYCAMIMACGZBgIAwgwAIZoGAgDCDAAhmwYCAMIMACGcBgIAwgwAIZ4GAQDIDAAhnwYBAMgMACGgBkAAxAwAIaEGAQDIDAAhFAcAAIcNACAMAACJDQAgDQAAiA0AIBsAAIsNACDhBUAAwwwAIe0FAQDBDAAh7gVAAMMMACHzBQAAhg2eBiKBBgEAwQwAIYwGAQDBDAAhlwYCAMIMACGYBgIAwgwAIZkGAgDCDAAhmgYCAMIMACGbBgIAwgwAIZwGAgDCDAAhngYBAMgMACGfBgEAyAwAIaAGQADEDAAhoQYBAMgMACEDXgAAhxoAIIQIAACIGgAgiggAAIICACADXgAAhRoAIIQIAACGGgAgiggAALQBACADXgAAww0AIIQIAADEDQAgiggAAFQAIANeAAC0DQAghAgAALUNACCKCAAAcQAgAAAAAAAChwgBAAAABI0IAQAAAAUBhwgAAACtBgIBhwgAAACvBgMBhwgAAACxBgMFXgAA_RkAIF8AAIMaACCECAAA_hkAIIUIAACCGgAgiggAAIICACAFXgAA-xkAIF8AAIAaACCECAAA_BkAIIUIAAD_GQAgiggAALQBACABhwgBAAAABANeAAD9GQAghAgAAP4ZACCKCAAAggIAIANeAAD7GQAghAgAAPwZACCKCAAAtAEAIAAAAAAAB14AAPYZACBfAAD5GQAghAgAAPcZACCFCAAA-BkAIIgIAAAxACCJCAAAMQAgiggAAFQAIANeAAD2GQAghAgAAPcZACCKCAAAVAAgAAAAAAABhwgAAADABgIFXgAA0hkAIF8AAPQZACCECAAA0xkAIIUIAADzGQAgiggAAIICACAFXgAA0BkAIF8AAPEZACCECAAA0RkAIIUIAADwGQAgiggAALkBACAHXgAAzhkAIF8AAO4ZACCECAAAzxkAIIUIAADtGQAgiAgAABkAIIkIAAAZACCKCAAAtAEAIAteAACpDgAwXwAArQ4AMIQIAACqDgAwhQgAAKsOADCGCAAArA4AIIcIAACQDQAwiAgAAJANADCJCAAAkA0AMIoIAACQDQAwiwgAAK4OADCMCAAAkw0AMAteAACdDgAwXwAAog4AMIQIAACeDgAwhQgAAJ8OADCGCAAAoA4AIIcIAAChDgAwiAgAAKEOADCJCAAAoQ4AMIoIAAChDgAwiwgAAKMOADCMCAAApA4AMAteAAD-DQAwXwAAgw4AMIQIAAD_DQAwhQgAAIAOADCGCAAAgQ4AIIcIAACCDgAwiAgAAIIOADCJCAAAgg4AMIoIAACCDgAwiwgAAIQOADCMCAAAhQ4AMAteAADuDQAwXwAA8w0AMIQIAADvDQAwhQgAAPANADCGCAAA8Q0AIIcIAADyDQAwiAgAAPINADCJCAAA8g0AMIoIAADyDQAwiwgAAPQNADCMCAAA9Q0AMAgHAAD8DQAgEgAA_Q0AIO0FAQAAAAHuBUAAAAABgQYBAAAAAZgHAgAAAAGZB4AAAAABmwcBAAAAAQIAAAAtACBeAAD7DQAgAwAAAC0AIF4AAPsNACBfAAD4DQAgAVcAAOwZADAOBwAA0gsAIBEAAJEMACASAACEDAAg2gUAAKUMADDbBQAAKwAQ3AUAAKUMADDtBQEAAAAB7gVAAOAJACGBBgEAwQoAIZgHAgDfCQAhmQcAAMMKACCaBwEAkwsAIZsHAQCTCwAh_wcAAKQMACACAAAALQAgVwAA-A0AIAIAAAD2DQAgVwAA9w0AIAraBQAA9Q0AMNsFAAD2DQAQ3AUAAPUNADDtBQEAwQoAIe4FQADgCQAhgQYBAMEKACGYBwIA3wkAIZkHAADDCgAgmgcBAJMLACGbBwEAkwsAIQraBQAA9Q0AMNsFAAD2DQAQ3AUAAPUNADDtBQEAwQoAIe4FQADgCQAhgQYBAMEKACGYBwIA3wkAIZkHAADDCgAgmgcBAJMLACGbBwEAkwsAIQbtBQEAwQwAIe4FQADDDAAhgQYBAMEMACGYBwIAwgwAIZkHgAAAAAGbBwEAyAwAIQgHAAD5DQAgEgAA-g0AIO0FAQDBDAAh7gVAAMMMACGBBgEAwQwAIZgHAgDCDAAhmQeAAAAAAZsHAQDIDAAhBV4AAOQZACBfAADqGQAghAgAAOUZACCFCAAA6RkAIIoIAACCAgAgB14AAOIZACBfAADnGQAghAgAAOMZACCFCAAA5hkAIIgIAAAfACCJCAAAHwAgiggAAGsAIAgHAAD8DQAgEgAA_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_g0AMIQIAAD_DQAwhggAAIEOACCKCAAAgg4AMAReAADuDQAwhAgAAO8NADCGCAAA8Q0AIIoIAADyDQAwAAAAAAABhwgAAADCBgIChwgBAAAABI0IAQAAAAUFXgAA_BcAIF8AAMwZACCECAAA_RcAIIUIAADLGQAgiggAAIICACAHXgAAzw4AIF8AANIOACCECAAA0A4AIIUIAADRDgAgiAgAABAAIIkIAAAQACCKCAAAggIAIAteAADDDgAwXwAAyA4AMIQIAADEDgAwhQgAAMUOADCGCAAAxg4AIIcIAADHDgAwiAgAAMcOADCJCAAAxw4AMIoIAADHDgAwiwgAAMkOADCMCAAAyg4AMA8HAACyDgAgGwAAtQ4AICMAALYOACAoAAC3DgAgOwAAtA4AIDwAALgOACDtBQEAAAAB7gVAAAAAAfMFAAAAwAYCgQYBAAAAAbcGQAAAAAG8BgIAAAABvQYBAAAAAb4GQAAAAAHABgIAAAABAgAAABcAIF4AAM4OACADAAAAFwAgXgAAzg4AIF8AAM0OACABVwAAyhkAMBUHAADSCwAgCQAAsAwAIBsAAMELACAjAADtCwAgKAAAxQsAIDsAAPoLACA8AAC-CwAg2gUAAK4MADDbBQAAFQAQ3AUAAK4MADDtBQEAAAAB7gVAAOAJACHzBQAArwzABiKBBgEAwQoAIbcGQADgCQAhuwYBAMEKACG8BgIA3wkAIb0GAQCTCwAhvgZAAOAJACHABgIA3wkAIYEIAACtDAAgAgAAABcAIFcAAM0OACACAAAAyw4AIFcAAMwOACAN2gUAAMoOADDbBQAAyw4AENwFAADKDgAw7QUBAMEKACHuBUAA4AkAIfMFAACvDMAGIoEGAQDBCgAhtwZAAOAJACG7BgEAwQoAIbwGAgDfCQAhvQYBAJMLACG-BkAA4AkAIcAGAgDfCQAhDdoFAADKDgAw2wUAAMsOABDcBQAAyg4AMO0FAQDBCgAh7gVAAOAJACHzBQAArwzABiKBBgEAwQoAIbcGQADgCQAhuwYBAMEKACG8BgIA3wkAIb0GAQCTCwAhvgZAAOAJACHABgIA3wkAIQntBQEAwQwAIe4FQADDDAAh8wUAAOYNwAYigQYBAMEMACG3BkAAwwwAIbwGAgDCDAAhvQYBAMgMACG-BkAAwwwAIcAGAgDCDAAhDwcAAOcNACAbAADqDQAgIwAA6w0AICgAAOwNACA7AADpDQAgPAAA7Q0AIO0FAQDBDAAh7gVAAMMMACHzBQAA5g3ABiKBBgEAwQwAIbcGQADDDAAhvAYCAMIMACG9BgEAyAwAIb4GQADDDAAhwAYCAMIMACEPBwAAsg4AIBsAALUOACAjAAC2DgAgKAAAtw4AIDsAALQOACA8AAC4DgAg7QUBAAAAAe4FQAAAAAHzBQAAAMAGAoEGAQAAAAG3BkAAAAABvAYCAAAAAb0GAQAAAAG-BkAAAAABwAYCAAAAAR0GAACNFAAgEAAAjxQAIBMAAJAUACAbAACTFAAgIAAAlBQAICEAAJUUACAiAACWFAAgKAAAlxQAICkAAJgUACA2AACbFAAgNwAAnBQAID0AAJIUACA_AACOFAAgQAAAkRQAIEEAAJkUACBCAACaFAAgQwAAnRQAIEQAAJ4UACBFAACfFAAgRwAAoBQAIEgAAKEUACDhBUAAAAAB7QUBAAAAAe4FQAAAAAHzBQAAAKcHAsMGQAAAAAHhBgEAAAABjAcBAAAAAacHAQAAAAECAAAAggIAIF4AAM8OACADAAAAEAAgXgAAzw4AIF8AANMOACAfAAAAEAAgBgAA1Q4AIBAAANcOACATAADYDgAgGwAA2w4AICAAANwOACAhAADdDgAgIgAA3g4AICgAAN8OACApAADgDgAgNgAA4w4AIDcAAOQOACA9AADaDgAgPwAA1g4AIEAAANkOACBBAADhDgAgQgAA4g4AIEMAAOUOACBEAADmDgAgRQAA5w4AIEcAAOgOACBIAADpDgAgVwAA0w4AIOEFQADDDAAh7QUBAMEMACHuBUAAwwwAIfMFAADUDqcHIsMGQADDDAAh4QYBAMEMACGMBwEAwQwAIacHAQDBDAAhHQYAANUOACAQAADXDgAgEwAA2A4AIBsAANsOACAgAADcDgAgIQAA3Q4AICIAAN4OACAoAADfDgAgKQAA4A4AIDYAAOMOACA3AADkDgAgPQAA2g4AID8AANYOACBAAADZDgAgQQAA4Q4AIEIAAOIOACBDAADlDgAgRAAA5g4AIEUAAOcOACBHAADoDgAgSAAA6Q4AIOEFQADDDAAh7QUBAMEMACHuBUAAwwwAIfMFAADUDqcHIsMGQADDDAAh4QYBAMEMACGMBwEAwQwAIacHAQDBDAAhAYcIAAAApwcCBV4AAP4XACBfAADIGQAghAgAAP8XACCFCAAAxxkAIIoIAACeBQAgC14AAIISADBfAACHEgAwhAgAAIMSADCFCAAAhBIAMIYIAACFEgAghwgAAIYSADCICAAAhhIAMIkIAACGEgAwiggAAIYSADCLCAAAiBIAMIwIAACJEgAwC14AAPcRADBfAAD7EQAwhAgAAPgRADCFCAAA-REAMIYIAAD6EQAghwgAAOgQADCICAAA6BAAMIkIAADoEAAwiggAAOgQADCLCAAA_BEAMIwIAADrEAAwC14AAO4RADBfAADyEQAwhAgAAO8RADCFCAAA8BEAMIYIAADxEQAghwgAAPINADCICAAA8g0AMIkIAADyDQAwiggAAPINADCLCAAA8xEAMIwIAAD1DQAwC14AAN8RADBfAADkEQAwhAgAAOARADCFCAAA4REAMIYIAADiEQAghwgAAOMRADCICAAA4xEAMIkIAADjEQAwiggAAOMRADCLCAAA5REAMIwIAADmEQAwC14AANYRADBfAADaEQAwhAgAANcRADCFCAAA2BEAMIYIAADZEQAghwgAAMcOADCICAAAxw4AMIkIAADHDgAwiggAAMcOADCLCAAA2xEAMIwIAADKDgAwC14AAM0RADBfAADREQAwhAgAAM4RADCFCAAAzxEAMIYIAADQEQAghwgAAJANADCICAAAkA0AMIkIAACQDQAwiggAAJANADCLCAAA0hEAMIwIAACTDQAwC14AAMERADBfAADGEQAwhAgAAMIRADCFCAAAwxEAMIYIAADEEQAghwgAAMURADCICAAAxREAMIkIAADFEQAwiggAAMURADCLCAAAxxEAMIwIAADIEQAwC14AALURADBfAAC6EQAwhAgAALYRADCFCAAAtxEAMIYIAAC4EQAghwgAALkRADCICAAAuREAMIkIAAC5EQAwiggAALkRADCLCAAAuxEAMIwIAAC8EQAwC14AAKkRADBfAACuEQAwhAgAAKoRADCFCAAAqxEAMIYIAACsEQAghwgAAK0RADCICAAArREAMIkIAACtEQAwiggAAK0RADCLCAAArxEAMIwIAACwEQAwC14AAJ4RADBfAACiEQAwhAgAAJ8RADCFCAAAoBEAMIYIAAChEQAghwgAAIIOADCICAAAgg4AMIkIAACCDgAwiggAAIIOADCLCAAAoxEAMIwIAACFDgAwC14AALcQADBfAAC8EAAwhAgAALgQADCFCAAAuRAAMIYIAAC6EAAghwgAALsQADCICAAAuxAAMIkIAAC7EAAwiggAALsQADCLCAAAvRAAMIwIAAC-EAAwC14AAKkQADBfAACuEAAwhAgAAKoQADCFCAAAqxAAMIYIAACsEAAghwgAAK0QADCICAAArRAAMIkIAACtEAAwiggAAK0QADCLCAAArxAAMIwIAACwEAAwC14AAPsPADBfAACAEAAwhAgAAPwPADCFCAAA_Q8AMIYIAAD-DwAghwgAAP8PADCICAAA_w8AMIkIAAD_DwAwiggAAP8PADCLCAAAgRAAMIwIAACCEAAwC14AAPIPADBfAAD2DwAwhAgAAPMPADCFCAAA9A8AMIYIAAD1DwAghwgAAOAPADCICAAA4A8AMIkIAADgDwAwiggAAOAPADCLCAAA9w8AMIwIAADjDwAwC14AAMMPADBfAADIDwAwhAgAAMQPADCFCAAAxQ8AMIYIAADGDwAghwgAAMcPADCICAAAxw8AMIkIAADHDwAwiggAAMcPADCLCAAAyQ8AMIwIAADKDwAwC14AALcPADBfAAC8DwAwhAgAALgPADCFCAAAuQ8AMIYIAAC6DwAghwgAALsPADCICAAAuw8AMIkIAAC7DwAwiggAALsPADCLCAAAvQ8AMIwIAAC-DwAwC14AAKYPADBfAACrDwAwhAgAAKcPADCFCAAAqA8AMIYIAACpDwAghwgAAKoPADCICAAAqg8AMIkIAACqDwAwiggAAKoPADCLCAAArA8AMIwIAACtDwAwC14AAIcPADBfAACMDwAwhAgAAIgPADCFCAAAiQ8AMIYIAACKDwAghwgAAIsPADCICAAAiw8AMIkIAACLDwAwiggAAIsPADCLCAAAjQ8AMIwIAACODwAwC14AAPkOADBfAAD-DgAwhAgAAPoOADCFCAAA-w4AMIYIAAD8DgAghwgAAP0OADCICAAA_Q4AMIkIAAD9DgAwiggAAP0OADCLCAAA_w4AMIwIAACADwAwC14AAOoOADBfAADvDgAwhAgAAOsOADCFCAAA7A4AMIYIAADtDgAghwgAAO4OADCICAAA7g4AMIkIAADuDgAwiggAAO4OADCLCAAA8A4AMIwIAADxDgAwDAMAAPgOACDfBUAAAAAB7QUBAAAAAe4FQAAAAAH2BQEAAAABtAYAAADOBwL8BkAAAAABzgcBAAAAAc8HAgAAAAHQBwEAAAAB0QcBAAAAAdIHAQAAAAECAAAA3QEAIF4AAPcOACADAAAA3QEAIF4AAPcOACBfAAD1DgAgAVcAAMYZADARAwAA8wkAIAcAANILACDaBQAA0AsAMNsFAADbAQAQ3AUAANALADDfBUAA4AkAIe0FAQAAAAHuBUAA4AkAIfYFAQDBCgAhgQYBAMEKACG0BgAA0QvOByL8BkAA4QkAIc4HAQDeCQAhzwcCAN8JACHQBwEAAAAB0QcBAAAAAdIHAQAAAAECAAAA3QEAIFcAAPUOACACAAAA8g4AIFcAAPMOACAP2gUAAPEOADDbBQAA8g4AENwFAADxDgAw3wVAAOAJACHtBQEAwQoAIe4FQADgCQAh9gUBAMEKACGBBgEAwQoAIbQGAADRC84HIvwGQADhCQAhzgcBAN4JACHPBwIA3wkAIdAHAQDeCQAh0QcBAJQLACHSBwEAkwsAIQ_aBQAA8Q4AMNsFAADyDgAQ3AUAAPEOADDfBUAA4AkAIe0FAQDBCgAh7gVAAOAJACH2BQEAwQoAIYEGAQDBCgAhtAYAANELzgci_AZAAOEJACHOBwEA3gkAIc8HAgDfCQAh0AcBAN4JACHRBwEAlAsAIdIHAQCTCwAhC98FQADDDAAh7QUBAMEMACHuBUAAwwwAIfYFAQDBDAAhtAYAAPQOzgci_AZAAMQMACHOBwEAwQwAIc8HAgDCDAAh0AcBAMEMACHRBwEAyAwAIdIHAQDIDAAhAYcIAAAAzgcCDAMAAPYOACDfBUAAwwwAIe0FAQDBDAAh7gVAAMMMACH2BQEAwQwAIbQGAAD0Ds4HIvwGQADEDAAhzgcBAMEMACHPBwIAwgwAIdAHAQDBDAAh0QcBAMgMACHSBwEAyAwAIQVeAADBGQAgXwAAxBkAIIQIAADCGQAghQgAAMMZACCKCAAAngUAIAwDAAD4DgAg3wVAAAAAAe0FAQAAAAHuBUAAAAAB9gUBAAAAAbQGAAAAzgcC_AZAAAAAAc4HAQAAAAHPBwIAAAAB0AcBAAAAAdEHAQAAAAHSBwEAAAABA14AAMEZACCECAAAwhkAIIoIAACeBQAgCUYAAIYPACDtBQEAAAAB7gVAAAAAAfAFAQAAAAHnBoAAAAAB3wcBAAAAAeAHAQAAAAHhBwEAAAAB4gcBAAAAAQIAAADXAQAgXgAAhQ8AIAMAAADXAQAgXgAAhQ8AIF8AAIMPACABVwAAwBkAMA4HAADVCwAgRgAA1AsAINoFAADTCwAw2wUAANUBABDcBQAA0wsAMO0FAQAAAAHuBUAA4AkAIfAFAQCTCwAhgQYBAJMLACHnBgAAwwoAIN8HAQCTCwAh4AcBAN4JACHhBwEAlAsAIeIHAQCUCwAhAgAAANcBACBXAACDDwAgAgAAAIEPACBXAACCDwAgDNoFAACADwAw2wUAAIEPABDcBQAAgA8AMO0FAQDBCgAh7gVAAOAJACHwBQEAkwsAIYEGAQCTCwAh5wYAAMMKACDfBwEAkwsAIeAHAQDeCQAh4QcBAJQLACHiBwEAlAsAIQzaBQAAgA8AMNsFAACBDwAQ3AUAAIAPADDtBQEAwQoAIe4FQADgCQAh8AUBAJMLACGBBgEAkwsAIecGAADDCgAg3wcBAJMLACHgBwEA3gkAIeEHAQCUCwAh4gcBAJQLACEI7QUBAMEMACHuBUAAwwwAIfAFAQDIDAAh5waAAAAAAd8HAQDIDAAh4AcBAMEMACHhBwEAyAwAIeIHAQDIDAAhCUYAAIQPACDtBQEAwQwAIe4FQADDDAAh8AUBAMgMACHnBoAAAAAB3wcBAMgMACHgBwEAwQwAIeEHAQDIDAAh4gcBAMgMACEHXgAAuxkAIF8AAL4ZACCECAAAvBkAIIUIAAC9GQAgiAgAAEgAIIkIAABIACCKCAAAngUAIAlGAACGDwAg7QUBAAAAAe4FQAAAAAHwBQEAAAAB5waAAAAAAd8HAQAAAAHgBwEAAAAB4QcBAAAAAeIHAQAAAAEDXgAAuxkAIIQIAAC8GQAgiggAAJ4FACAIAwAApA8AIDYAAKUPACDhBUAAAAAB7QUBAAAAAe4FQAAAAAH2BQEAAAAB9wcAAAD3BwL4BwEAAAABAgAAAAEAIF4AAKMPACADAAAAAQAgXgAAow8AIF8AAJIPACABVwAAuhkAMA0DAADzCQAgBwAA1QsAIDYAANgLACDaBQAA1gsAMNsFAADSAQAQ3AUAANYLADDhBUAA4AkAIe0FAQAAAAHuBUAA4AkAIfYFAQDBCgAhgQYBAJMLACH3BwAA1wv3ByL4BwEAlAsAIQIAAAABACBXAACSDwAgAgAAAI8PACBXAACQDwAgCtoFAACODwAw2wUAAI8PABDcBQAAjg8AMOEFQADgCQAh7QUBAMEKACHuBUAA4AkAIfYFAQDBCgAhgQYBAJMLACH3BwAA1wv3ByL4BwEAlAsAIQraBQAAjg8AMNsFAACPDwAQ3AUAAI4PADDhBUAA4AkAIe0FAQDBCgAh7gVAAOAJACH2BQEAwQoAIYEGAQCTCwAh9wcAANcL9wci-AcBAJQLACEG4QVAAMMMACHtBQEAwQwAIe4FQADDDAAh9gUBAMEMACH3BwAAkQ_3ByL4BwEAyAwAIQGHCAAAAPcHAggDAACTDwAgNgAAlA8AIOEFQADDDAAh7QUBAMEMACHuBUAAwwwAIfYFAQDBDAAh9wcAAJEP9wci-AcBAMgMACEFXgAAtBkAIF8AALgZACCECAAAtRkAIIUIAAC3GQAgiggAAJ4FACALXgAAlQ8AMF8AAJoPADCECAAAlg8AMIUIAACXDwAwhggAAJgPACCHCAAAmQ8AMIgIAACZDwAwiQgAAJkPADCKCAAAmQ8AMIsIAACbDwAwjAgAAJwPADAH7QUBAAAAAe4FQAAAAAGhBwAAAPEHAvEHAQAAAAHyBwEAAAAB8weAAAAAAfUHAAAA9QcDAgAAAJsCACBeAACiDwAgAwAAAJsCACBeAACiDwAgXwAAoQ8AIAFXAAC2GQAwDFEAALoLACDaBQAAtgsAMNsFAACZAgAQ3AUAALYLADDtBQEAAAAB7gVAAOAJACGhBwAAtwvxByLvBwEAwQoAIfEHAQDeCQAh8gcBAJQLACHzBwAAuAsAIPUHAAC5C_UHIwIAAACbAgAgVwAAoQ8AIAIAAACdDwAgVwAAng8AIAvaBQAAnA8AMNsFAACdDwAQ3AUAAJwPADDtBQEAwQoAIe4FQADgCQAhoQcAALcL8Qci7wcBAMEKACHxBwEA3gkAIfIHAQCUCwAh8wcAALgLACD1BwAAuQv1ByML2gUAAJwPADDbBQAAnQ8AENwFAACcDwAw7QUBAMEKACHuBUAA4AkAIaEHAAC3C_EHIu8HAQDBCgAh8QcBAN4JACHyBwEAlAsAIfMHAAC4CwAg9QcAALkL9QcjB-0FAQDBDAAh7gVAAMMMACGhBwAAnw_xByLxBwEAwQwAIfIHAQDIDAAh8weAAAAAAfUHAACgD_UHIwGHCAAAAPEHAgGHCAAAAPUHAwftBQEAwQwAIe4FQADDDAAhoQcAAJ8P8Qci8QcBAMEMACHyBwEAyAwAIfMHgAAAAAH1BwAAoA_1ByMH7QUBAAAAAe4FQAAAAAGhBwAAAPEHAvEHAQAAAAHyBwEAAAAB8weAAAAAAfUHAAAA9QcDCAMAAKQPACA2AAClDwAg4QVAAAAAAe0FAQAAAAHuBUAAAAAB9gUBAAAAAfcHAAAA9wcC-AcBAAAAAQNeAAC0GQAghAgAALUZACCKCAAAngUAIAReAACVDwAwhAgAAJYPADCGCAAAmA8AIIoIAACZDwAwEQMAALYPACDfBUAAAAAB7QUBAAAAAe4FQAAAAAHzBQAAAOgHAvYFAQAAAAHsBgEAAAAB_AZAAAAAAeMHgAAAAAHkB4AAAAAB5gcAAADmBwLpBwAAAOkHAuoHQAAAAAHrBwEAAAAB7AeAAAAAAe0HAQAAAAHuB4AAAAABAgAAAM8BACBeAAC1DwAgAwAAAM8BACBeAAC1DwAgXwAAsw8AIAFXAACzGQAwFgMAAPMJACAHAADVCwAg2gUAANkLADDbBQAAzQEAENwFAADZCwAw3wVAAOAJACHtBQEAAAAB7gVAAOAJACHzBQAA2wvoByL2BQEAwQoAIYEGAQCTCwAh7AYBAN4JACH8BkAA4QkAIeMHAADDCgAg5AcAAMMKACDmBwAA2gvmByLpBwAA3AvpByLqB0AA4QkAIesHAQCUCwAh7AcAALgLACDtBwEAlAsAIe4HAAC4CwAgAgAAAM8BACBXAACzDwAgAgAAAK4PACBXAACvDwAgFNoFAACtDwAw2wUAAK4PABDcBQAArQ8AMN8FQADgCQAh7QUBAMEKACHuBUAA4AkAIfMFAADbC-gHIvYFAQDBCgAhgQYBAJMLACHsBgEA3gkAIfwGQADhCQAh4wcAAMMKACDkBwAAwwoAIOYHAADaC-YHIukHAADcC-kHIuoHQADhCQAh6wcBAJQLACHsBwAAuAsAIO0HAQCUCwAh7gcAALgLACAU2gUAAK0PADDbBQAArg8AENwFAACtDwAw3wVAAOAJACHtBQEAwQoAIe4FQADgCQAh8wUAANsL6Aci9gUBAMEKACGBBgEAkwsAIewGAQDeCQAh_AZAAOEJACHjBwAAwwoAIOQHAADDCgAg5gcAANoL5gci6QcAANwL6Qci6gdAAOEJACHrBwEAlAsAIewHAAC4CwAg7QcBAJQLACHuBwAAuAsAIBDfBUAAwwwAIe0FAQDBDAAh7gVAAMMMACHzBQAAsQ_oByL2BQEAwQwAIewGAQDBDAAh_AZAAMQMACHjB4AAAAAB5AeAAAAAAeYHAACwD-YHIukHAACyD-kHIuoHQADEDAAh6wcBAMgMACHsB4AAAAAB7QcBAMgMACHuB4AAAAABAYcIAAAA5gcCAYcIAAAA6AcCAYcIAAAA6QcCEQMAALQPACDfBUAAwwwAIe0FAQDBDAAh7gVAAMMMACHzBQAAsQ_oByL2BQEAwQwAIewGAQDBDAAh_AZAAMQMACHjB4AAAAAB5AeAAAAAAeYHAACwD-YHIukHAACyD-kHIuoHQADEDAAh6wcBAMgMACHsB4AAAAAB7QcBAMgMACHuB4AAAAABBV4AAK4ZACBfAACxGQAghAgAAK8ZACCFCAAAsBkAIIoIAACeBQAgEQMAALYPACDfBUAAAAAB7QUBAAAAAe4FQAAAAAHzBQAAAOgHAvYFAQAAAAHsBgEAAAAB_AZAAAAAAeMHgAAAAAHkB4AAAAAB5gcAAADmBwLpBwAAAOkHAuoHQAAAAAHrBwEAAAAB7AeAAAAAAe0HAQAAAAHuB4AAAAABA14AAK4ZACCECAAArxkAIIoIAACeBQAgDgMAAO8MACBJAADxDAAg7QUBAAAAAe4FQAAAAAH2BQEAAAABggYAAACBBgKDBgEAAAABhAYBAAAAAYUGAQAAAAGGBgEAAAABhwYBAAAAAYgGQAAAAAGJBgEAAAABiwYAAACLBgICAAAAywEAIF4AAMIPACADAAAAywEAIF4AAMIPACBfAADBDwAgAVcAAK0ZADATAwAA8wkAIAcAANULACBJAADgCwAg2gUAAN0LADDbBQAAyQEAENwFAADdCwAw7QUBAAAAAe4FQADgCQAh9gUBAMEKACGBBgEAkwsAIYIGAADeC4EGIoMGAQDeCQAhhAYBAN4JACGFBgEA3gkAIYYGAQDeCQAhhwYBAJQLACGIBkAA4QkAIYkGAQCUCwAhiwYAAN8LiwYiAgAAAMsBACBXAADBDwAgAgAAAL8PACBXAADADwAgENoFAAC-DwAw2wUAAL8PABDcBQAAvg8AMO0FAQDBCgAh7gVAAOAJACH2BQEAwQoAIYEGAQCTCwAhggYAAN4LgQYigwYBAN4JACGEBgEA3gkAIYUGAQDeCQAhhgYBAN4JACGHBgEAlAsAIYgGQADhCQAhiQYBAJQLACGLBgAA3wuLBiIQ2gUAAL4PADDbBQAAvw8AENwFAAC-DwAw7QUBAMEKACHuBUAA4AkAIfYFAQDBCgAhgQYBAJMLACGCBgAA3guBBiKDBgEA3gkAIYQGAQDeCQAhhQYBAN4JACGGBgEA3gkAIYcGAQCUCwAhiAZAAOEJACGJBgEAlAsAIYsGAADfC4sGIgztBQEAwQwAIe4FQADDDAAh9gUBAMEMACGCBgAA3gyBBiKDBgEAwQwAIYQGAQDBDAAhhQYBAMEMACGGBgEAwQwAIYcGAQDIDAAhiAZAAMQMACGJBgEAyAwAIYsGAADfDIsGIg4DAADgDAAgSQAA4gwAIO0FAQDBDAAh7gVAAMMMACH2BQEAwQwAIYIGAADeDIEGIoMGAQDBDAAhhAYBAMEMACGFBgEAwQwAIYYGAQDBDAAhhwYBAMgMACGIBkAAxAwAIYkGAQDIDAAhiwYAAN8MiwYiDgMAAO8MACBJAADxDAAg7QUBAAAAAe4FQAAAAAH2BQEAAAABggYAAACBBgKDBgEAAAABhAYBAAAAAYUGAQAAAAGGBgEAAAABhwYBAAAAAYgGQAAAAAGJBgEAAAABiwYAAACLBgINMQAA8A8AIDIAAPEPACDtBQEAAAAB7gVAAAAAAbQGAAAAzgcC0AcBAAAAAdEHAQAAAAHTBwEAAAAB1AcBAAAAAdUHAgAAAAHWBwIAAAAB1wcCAAAAAdgHAgAAAAECAAAAjQEAIF4AAO8PACADAAAAjQEAIF4AAO8PACBfAADNDwAgAVcAAKwZADASBwAA0gsAIDEAAPQLACAyAAD2CwAg2gUAAPULADDbBQAAhgEAENwFAAD1CwAw7QUBAAAAAe4FQADgCQAhgQYBAMEKACG0BgAA0QvOByLQBwEAAAAB0QcBAAAAAdMHAQDBCgAh1AcBAN4JACHVBwIA3wkAIdYHAgDsCwAh1wcCAOwLACHYBwIA7AsAIQIAAACNAQAgVwAAzQ8AIAIAAADLDwAgVwAAzA8AIA_aBQAAyg8AMNsFAADLDwAQ3AUAAMoPADDtBQEAwQoAIe4FQADgCQAhgQYBAMEKACG0BgAA0QvOByLQBwEA3gkAIdEHAQCUCwAh0wcBAMEKACHUBwEA3gkAIdUHAgDfCQAh1gcCAOwLACHXBwIA7AsAIdgHAgDsCwAhD9oFAADKDwAw2wUAAMsPABDcBQAAyg8AMO0FAQDBCgAh7gVAAOAJACGBBgEAwQoAIbQGAADRC84HItAHAQDeCQAh0QcBAJQLACHTBwEAwQoAIdQHAQDeCQAh1QcCAN8JACHWBwIA7AsAIdcHAgDsCwAh2AcCAOwLACEL7QUBAMEMACHuBUAAwwwAIbQGAAD0Ds4HItAHAQDBDAAh0QcBAMgMACHTBwEAwQwAIdQHAQDBDAAh1QcCAMIMACHWBwIArg0AIdcHAgCuDQAh2AcCAK4NACENMQAAzg8AIDIAAM8PACDtBQEAwQwAIe4FQADDDAAhtAYAAPQOzgci0AcBAMEMACHRBwEAyAwAIdMHAQDBDAAh1AcBAMEMACHVBwIAwgwAIdYHAgCuDQAh1wcCAK4NACHYBwIArg0AIQVeAACSGQAgXwAAqhkAIIQIAACTGQAghQgAAKkZACCKCAAAtAEAIAdeAADQDwAgXwAA0w8AIIQIAADRDwAghQgAANIPACCICAAAgQEAIIkIAACBAQAgiggAAIMBACAQBwAA6g8AIDAAAOsPACA0AADuDwAgNQAA7Q8AIO0FAQAAAAHuBUAAAAABgQYBAAAAAbQGAAAA2gcCzgYBAAAAAc8GAQAAAAGUB0AAAAAB2geAAAAAAdsHAQAAAAHcBwAA6Q8AIN0HIAAAAAHeB0AAAAABAgAAAIMBACBeAADQDwAgAwAAAIEBACBeAADQDwAgXwAA1A8AIBIAAACBAQAgBwAA2A8AIDAAANkPACA0AADaDwAgNQAA2w8AIFcAANQPACDtBQEAwQwAIe4FQADDDAAhgQYBAMEMACG0BgAA1Q_aByLOBgEAyAwAIc8GAQDIDAAhlAdAAMQMACHaB4AAAAAB2wcBAMgMACHcBwAA1g8AIN0HIADXDwAh3gdAAMQMACEQBwAA2A8AIDAAANkPACA0AADaDwAgNQAA2w8AIO0FAQDBDAAh7gVAAMMMACGBBgEAwQwAIbQGAADVD9oHIs4GAQDIDAAhzwYBAMgMACGUB0AAxAwAIdoHgAAAAAHbBwEAyAwAIdwHAADWDwAg3QcgANcPACHeB0AAxAwAIQGHCAAAANoHAgKHCAEAAAAEjQgBAAAABQGHCCAAAAABBV4AAJoZACBfAACnGQAghAgAAJsZACCFCAAAphkAIIoIAACCAgAgB14AAJgZACBfAACkGQAghAgAAJkZACCFCAAAoxkAIIgIAAAZACCJCAAAGQAgiggAALQBACAHXgAAlBkAIF8AAKEZACCECAAAlRkAIIUIAACgGQAgiAgAAIEBACCJCAAAgQEAIIoIAACDAQAgC14AANwPADBfAADhDwAwhAgAAN0PADCFCAAA3g8AMIYIAADfDwAghwgAAOAPADCICAAA4A8AMIkIAADgDwAwiggAAOAPADCLCAAA4g8AMIwIAADjDwAwEAcAAOoPACAwAADrDwAgMwAA7A8AIDUAAO0PACDtBQEAAAAB7gVAAAAAAYEGAQAAAAG0BgAAANoHAs4GAQAAAAHPBgEAAAABlAdAAAAAAdIHAQAAAAHaB4AAAAAB3AcAAOkPACDdByAAAAAB3gdAAAAAAQIAAACDAQAgXgAA6A8AIAMAAACDAQAgXgAA6A8AIF8AAOYPACABVwAAnxkAMBUHAADSCwAgMAAA-gsAIDMAAPsLACA0AAD2CwAgNQAAyQsAINoFAAD3CwAw2wUAAIEBABDcBQAA9wsAMO0FAQAAAAHuBUAA4AkAIYEGAQDBCgAhtAYAAPgL2gcizgYBAJMLACHPBgEAlAsAIZQHQADhCQAh0gcBAAAAAdoHAAC4CwAg2wcBAJMLACHcBwAA7QkAIN0HIAD5CwAh3gdAAOEJACECAAAAgwEAIFcAAOYPACACAAAA5A8AIFcAAOUPACAQ2gUAAOMPADDbBQAA5A8AENwFAADjDwAw7QUBAMEKACHuBUAA4AkAIYEGAQDBCgAhtAYAAPgL2gcizgYBAJMLACHPBgEAlAsAIZQHQADhCQAh0gcBAJMLACHaBwAAuAsAINsHAQCTCwAh3AcAAO0JACDdByAA-QsAId4HQADhCQAhENoFAADjDwAw2wUAAOQPABDcBQAA4w8AMO0FAQDBCgAh7gVAAOAJACGBBgEAwQoAIbQGAAD4C9oHIs4GAQCTCwAhzwYBAJQLACGUB0AA4QkAIdIHAQCTCwAh2gcAALgLACDbBwEAkwsAIdwHAADtCQAg3QcgAPkLACHeB0AA4QkAIQztBQEAwQwAIe4FQADDDAAhgQYBAMEMACG0BgAA1Q_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_QsAMNsFAAB5ABDcBQAA_QsAMO0FAQAAAAHuBUAA4AkAIYwGAQDBCgAhyAYBAMEKACHJBiAA-QsAIcoGIAD5CwAhywYBAJQLACHMBkAA4QkAIc0GAQCTCwAh_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_xgAIIoIAABRACAcCgAAlhEAIAsAAJcRACAOAACYEQAgDwAAmREAIBAAAJoRACATAACbEQAgFAAAnBEAIBgAAJ0RACDtBQEAAAAB7gVAAAAAAfMFAAAAwwcCxwZAAAAAAewGAAAAtAcCtAeAAAAAAbUHAQAAAAG2BwEAAAABtwcgAAAAAbkHAAAAuQcCugcAAJQRACC7BwEAAAABvAcAAJURACC9B0AAAAABvgcCAAAAAb8HAgAAAAHAB0AAAAABwQdAAAAAAcMHQAAAAAHEB4AAAAABAgAAAGsAIF4AAJMRACADAAAAawAgXgAAkxEAIF8AAMYQACABVwAA_RgAMCEHAADSCwAgCgAA9AsAIAsAAPoLACAOAADvCwAgDwAA8AsAIBAAAOcKACATAAC-CwAgFAAAigwAIBgAAIsMACDaBQAAhgwAMNsFAAAfABDcBQAAhgwAMO0FAQAAAAHuBUAA4AkAIfMFAACJDMMHIoEGAQDBCgAhxwZAAOEJACHsBgAAhwy0ByK0BwAAwwoAILUHAQCUCwAhtgcBAMEKACG3ByAA-QsAIbkHAACIDLkHIroHAADtCQAguwcBAJMLACG8BwAA7QkAIL0HQADhCQAhvgcCAN8JACG_BwIA3wkAIcAHQADgCQAhwQdAAOAJACHDB0AA4QkAIcQHAAC4CwAgAgAAAGsAIFcAAMYQACACAAAAvxAAIFcAAMAQACAY2gUAAL4QADDbBQAAvxAAENwFAAC-EAAw7QUBAMEKACHuBUAA4AkAIfMFAACJDMMHIoEGAQDBCgAhxwZAAOEJACHsBgAAhwy0ByK0BwAAwwoAILUHAQCUCwAhtgcBAMEKACG3ByAA-QsAIbkHAACIDLkHIroHAADtCQAguwcBAJMLACG8BwAA7QkAIL0HQADhCQAhvgcCAN8JACG_BwIA3wkAIcAHQADgCQAhwQdAAOAJACHDB0AA4QkAIcQHAAC4CwAgGNoFAAC-EAAw2wUAAL8QABDcBQAAvhAAMO0FAQDBCgAh7gVAAOAJACHzBQAAiQzDByKBBgEAwQoAIccGQADhCQAh7AYAAIcMtAcitAcAAMMKACC1BwEAlAsAIbYHAQDBCgAhtwcgAPkLACG5BwAAiAy5ByK6BwAA7QkAILsHAQCTCwAhvAcAAO0JACC9B0AA4QkAIb4HAgDfCQAhvwcCAN8JACHAB0AA4AkAIcEHQADgCQAhwwdAAOEJACHEBwAAuAsAIBTtBQEAwQwAIe4FQADDDAAh8wUAAMUQwwcixwZAAMQMACHsBgAAwRC0ByK0B4AAAAABtQcBAMgMACG2BwEAwQwAIbcHIADXDwAhuQcAAMIQuQciugcAAMMQACC7BwEAyAwAIbwHAADEEAAgvQdAAMQMACG-BwIAwgwAIb8HAgDCDAAhwAdAAMMMACHBB0AAwwwAIcMHQADEDAAhxAeAAAAAAQGHCAAAALQHAgGHCAAAALkHAgKHCAEAAAAEjQgBAAAABQKHCAEAAAAEjQgBAAAABQGHCAAAAMMHAhwKAADHEAAgCwAAyBAAIA4AAMkQACAPAADKEAAgEAAAyxAAIBMAAMwQACAUAADNEAAgGAAAzhAAIO0FAQDBDAAh7gVAAMMMACHzBQAAxRDDByLHBkAAxAwAIewGAADBELQHIrQHgAAAAAG1BwEAyAwAIbYHAQDBDAAhtwcgANcPACG5BwAAwhC5ByK6BwAAwxAAILsHAQDIDAAhvAcAAMQQACC9B0AAxAwAIb4HAgDCDAAhvwcCAMIMACHAB0AAwwwAIcEHQADDDAAhwwdAAMQMACHEB4AAAAABBV4AANMYACBfAAD7GAAghAgAANQYACCFCAAA-hgAIIoIAAC0AQAgB14AANEYACBfAAD4GAAghAgAANIYACCFCAAA9xgAIIgIAAAZACCJCAAAGQAgiggAALQBACALXgAAhREAMF8AAIoRADCECAAAhhEAMIUIAACHEQAwhggAAIgRACCHCAAAiREAMIgIAACJEQAwiQgAAIkRADCKCAAAiREAMIsIAACLEQAwjAgAAIwRADALXgAA9hAAMF8AAPsQADCECAAA9xAAMIUIAAD4EAAwhggAAPkQACCHCAAA-hAAMIgIAAD6EAAwiQgAAPoQADCKCAAA-hAAMIsIAAD8EAAwjAgAAP0QADALXgAA5BAAMF8AAOkQADCECAAA5RAAMIUIAADmEAAwhggAAOcQACCHCAAA6BAAMIgIAADoEAAwiQgAAOgQADCKCAAA6BAAMIsIAADqEAAwjAgAAOsQADALXgAA2RAAMF8AAN0QADCECAAA2hAAMIUIAADbEAAwhggAANwQACCHCAAA8g0AMIgIAADyDQAwiQgAAPINADCKCAAA8g0AMIsIAADeEAAwjAgAAPUNADAHXgAA1BAAIF8AANcQACCECAAA1RAAIIUIAADWEAAgiAgAADEAIIkIAAAxACCKCAAAVAAgB14AAM8QACBfAADSEAAghAgAANAQACCFCAAA0RAAIIgIAAA3ACCJCAAANwAgiggAAHEAIA4HAAC_DQAgFQAAwA0AIBYAAMENACAXAAC2EAAg7QUBAAAAAe4FQAAAAAHzBQAAAK8HAoEGAQAAAAGVBgIAAAABogYBAAAAAakHAQAAAAGqBwEAAAABrAcAAACsBwKtBwEAAAABAgAAAHEAIF4AAM8QACADAAAANwAgXgAAzxAAIF8AANMQACAQAAAANwAgBwAAuw0AIBUAALwNACAWAAC9DQAgFwAAtBAAIFcAANMQACDtBQEAwQwAIe4FQADDDAAh8wUAALoNrwcigQYBAMEMACGVBgIAwgwAIaIGAQDIDAAhqQcBAMEMACGqBwEAwQwAIawHAAC5DawHIq0HAQDIDAAhDgcAALsNACAVAAC8DQAgFgAAvQ0AIBcAALQQACDtBQEAwQwAIe4FQADDDAAh8wUAALoNrwcigQYBAMEMACGVBgIAwgwAIaIGAQDIDAAhqQcBAMEMACGqBwEAwQwAIawHAAC5DawHIq0HAQDIDAAhFAcAAKMNACANAACkDQAgFwAApg0AIBsAAKcNACDhBUAAAAAB7QUBAAAAAe4FQAAAAAHzBQAAAJ4GAoEGAQAAAAGMBgEAAAABlwYCAAAAAZgGAgAAAAGZBgIAAAABmgYCAAAAAZsGAgAAAAGcBgIAAAABngYBAAAAAZ8GAQAAAAGgBkAAAAABogYBAAAAAQIAAABUACBeAADUEAAgAwAAADEAIF4AANQQACBfAADYEAAgFgAAADEAIAcAAIcNACANAACIDQAgFwAAig0AIBsAAIsNACBXAADYEAAg4QVAAMMMACHtBQEAwQwAIe4FQADDDAAh8wUAAIYNngYigQYBAMEMACGMBgEAwQwAIZcGAgDCDAAhmAYCAMIMACGZBgIAwgwAIZoGAgDCDAAhmwYCAMIMACGcBgIAwgwAIZ4GAQDIDAAhnwYBAMgMACGgBkAAxAwAIaIGAQDIDAAhFAcAAIcNACANAACIDQAgFwAAig0AIBsAAIsNACDhBUAAwwwAIe0FAQDBDAAh7gVAAMMMACHzBQAAhg2eBiKBBgEAwQwAIYwGAQDBDAAhlwYCAMIMACGYBgIAwgwAIZkGAgDCDAAhmgYCAMIMACGbBgIAwgwAIZwGAgDCDAAhngYBAMgMACGfBgEAyAwAIaAGQADEDAAhogYBAMgMACEIBwAA_A0AIBEAAOMQACDtBQEAAAAB7gVAAAAAAYEGAQAAAAGYBwIAAAABmQeAAAAAAZoHAQAAAAECAAAALQAgXgAA4hAAIAMAAAAtACBeAADiEAAgXwAA4BAAIAFXAAD2GAAwAgAAAC0AIFcAAOAQACACAAAA9g0AIFcAAN8QACAG7QUBAMEMACHuBUAAwwwAIYEGAQDBDAAhmAcCAMIMACGZB4AAAAABmgcBAMgMACEIBwAA-Q0AIBEAAOEQACDtBQEAwQwAIe4FQADDDAAhgQYBAMEMACGYBwIAwgwAIZkHgAAAAAGaBwEAyAwAIQdeAADxGAAgXwAA9BgAIIQIAADyGAAghQgAAPMYACCICAAAFQAgiQgAABUAIIoIAAAXACAIBwAA_A0AIBEAAOMQACDtBQEAAAAB7gVAAAAAAYEGAQAAAAGYBwIAAAABmQeAAAAAAZoHAQAAAAEDXgAA8RgAIIQIAADyGAAgiggAABcAIA4GAAD1EAAgBwAA8xAAIB0AAPQQACDfBUAAAAAB7QUBAAAAAe4FQAAAAAGBBgEAAAAB-gYBAAAAAYAHQAAAAAGCB0AAAAABnAcBAAAAAZ0HAQAAAAGeBwEAAAABnwcBAAAAAQIAAAAdACBeAADyEAAgAwAAAB0AIF4AAPIQACBfAADuEAAgAVcAAPAYADATBgAA9AsAIAcAANILACAMAACEDAAgHQAA1AsAINoFAACsDAAw2wUAABsAENwFAACsDAAw3wVAAOAJACHtBQEAAAAB7gVAAOAJACGBBgEAwQoAIaEGAQCTCwAh-gYBAAAAAYAHQADhCQAhggdAAOEJACGcBwEA3gkAIZ0HAQDeCQAhngcBAJMLACGfBwEAwQoAIQIAAAAdACBXAADuEAAgAgAAAOwQACBXAADtEAAgD9oFAADrEAAw2wUAAOwQABDcBQAA6xAAMN8FQADgCQAh7QUBAMEKACHuBUAA4AkAIYEGAQDBCgAhoQYBAJMLACH6BgEA3gkAIYAHQADhCQAhggdAAOEJACGcBwEA3gkAIZ0HAQDeCQAhngcBAJMLACGfBwEAwQoAIQ_aBQAA6xAAMNsFAADsEAAQ3AUAAOsQADDfBUAA4AkAIe0FAQDBCgAh7gVAAOAJACGBBgEAwQoAIaEGAQCTCwAh-gYBAN4JACGAB0AA4QkAIYIHQADhCQAhnAcBAN4JACGdBwEA3gkAIZ4HAQCTCwAhnwcBAMEKACEL3wVAAMMMACHtBQEAwQwAIe4FQADDDAAhgQYBAMEMACH6BgEAwQwAIYAHQADEDAAhggdAAMQMACGcBwEAwQwAIZ0HAQDBDAAhngcBAMgMACGfBwEAwQwAIQ4GAADxEAAgBwAA7xAAIB0AAPAQACDfBUAAwwwAIe0FAQDBDAAh7gVAAMMMACGBBgEAwQwAIfoGAQDBDAAhgAdAAMQMACGCB0AAxAwAIZwHAQDBDAAhnQcBAMEMACGeBwEAyAwAIZ8HAQDBDAAhBV4AAOUYACBfAADuGAAghAgAAOYYACCFCAAA7RgAIIoIAACCAgAgB14AAOMYACBfAADrGAAghAgAAOQYACCFCAAA6hgAIIgIAABIACCJCAAASAAgiggAAJ4FACAFXgAA4RgAIF8AAOgYACCECAAA4hgAIIUIAADnGAAgiggAALQBACAOBgAA9RAAIAcAAPMQACAdAAD0EAAg3wVAAAAAAe0FAQAAAAHuBUAAAAABgQYBAAAAAfoGAQAAAAGAB0AAAAABggdAAAAAAZwHAQAAAAGdBwEAAAABngcBAAAAAZ8HAQAAAAEDXgAA5RgAIIQIAADmGAAgiggAAIICACADXgAA4xgAIIQIAADkGAAgiggAAJ4FACADXgAA4RgAIIQIAADiGAAgiggAALQBACAGDQAAhBEAIO0FAQAAAAHuBUAAAAABjAYBAAAAAbAHAAAAsAcCsQdAAAAAAQIAAAAoACBeAACDEQAgAwAAACgAIF4AAIMRACBfAACBEQAgAVcAAOAYADAMDAAAqQwAIA0AAPQLACDaBQAApwwAMNsFAAAmABDcBQAApwwAMO0FAQAAAAHuBUAA4AkAIYwGAQDBCgAhoQYBAMEKACGwBwAAqAywByKxB0AA4AkAIYAIAACmDAAgAgAAACgAIFcAAIERACACAAAA_hAAIFcAAP8QACAJ2gUAAP0QADDbBQAA_hAAENwFAAD9EAAw7QUBAMEKACHuBUAA4AkAIYwGAQDBCgAhoQYBAMEKACGwBwAAqAywByKxB0AA4AkAIQnaBQAA_RAAMNsFAAD-EAAQ3AUAAP0QADDtBQEAwQoAIe4FQADgCQAhjAYBAMEKACGhBgEAwQoAIbAHAACoDLAHIrEHQADgCQAhBe0FAQDBDAAh7gVAAMMMACGMBgEAwQwAIbAHAACAEbAHIrEHQADDDAAhAYcIAAAAsAcCBg0AAIIRACDtBQEAwQwAIe4FQADDDAAhjAYBAMEMACGwBwAAgBGwByKxB0AAwwwAIQVeAADbGAAgXwAA3hgAIIQIAADcGAAghQgAAN0YACCKCAAAtAEAIAYNAACEEQAg7QUBAAAAAe4FQAAAAAGMBgEAAAABsAcAAACwBwKxB0AAAAABA14AANsYACCECAAA3BgAIIoIAAC0AQAgBQ0AAJIRACDtBQEAAAAB7gVAAAAAAYwGAQAAAAGyB0AAAAABAgAAACQAIF4AAJERACADAAAAJAAgXgAAkREAIF8AAI8RACABVwAA2hgAMAsMAACpDAAgDQAA9AsAINoFAACrDAAw2wUAACIAENwFAACrDAAw7QUBAAAAAe4FQADgCQAhjAYBAMEKACGhBgEAwQoAIbIHQADgCQAhgAgAAKoMACACAAAAJAAgVwAAjxEAIAIAAACNEQAgVwAAjhEAIAjaBQAAjBEAMNsFAACNEQAQ3AUAAIwRADDtBQEAwQoAIe4FQADgCQAhjAYBAMEKACGhBgEAwQoAIbIHQADgCQAhCNoFAACMEQAw2wUAAI0RABDcBQAAjBEAMO0FAQDBCgAh7gVAAOAJACGMBgEAwQoAIaEGAQDBCgAhsgdAAOAJACEE7QUBAMEMACHuBUAAwwwAIYwGAQDBDAAhsgdAAMMMACEFDQAAkBEAIO0FAQDBDAAh7gVAAMMMACGMBgEAwQwAIbIHQADDDAAhBV4AANUYACBfAADYGAAghAgAANYYACCFCAAA1xgAIIoIAAC0AQAgBQ0AAJIRACDtBQEAAAAB7gVAAAAAAYwGAQAAAAGyB0AAAAABA14AANUYACCECAAA1hgAIIoIAAC0AQAgHAoAAJYRACALAACXEQAgDgAAmBEAIA8AAJkRACAQAACaEQAgEwAAmxEAIBQAAJwRACAYAACdEQAg7QUBAAAAAe4FQAAAAAHzBQAAAMMHAscGQAAAAAHsBgAAALQHArQHgAAAAAG1BwEAAAABtgcBAAAAAbcHIAAAAAG5BwAAALkHAroHAACUEQAguwcBAAAAAbwHAACVEQAgvQdAAAAAAb4HAgAAAAG_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_hEAIAFXAADDGAAwAgAAAB0AIFcAAP4RACACAAAA7BAAIFcAAP0RACAL3wVAAMMMACHtBQEAwQwAIe4FQADDDAAhoQYBAMgMACH6BgEAwQwAIYAHQADEDAAhggdAAMQMACGcBwEAwQwAIZ0HAQDBDAAhngcBAMgMACGfBwEAwQwAIQ4GAADxEAAgDAAA_xEAIB0AAPAQACDfBUAAwwwAIe0FAQDBDAAh7gVAAMMMACGhBgEAyAwAIfoGAQDBDAAhgAdAAMQMACGCB0AAxAwAIZwHAQDBDAAhnQcBAMEMACGeBwEAyAwAIZ8HAQDBDAAhB14AAL4YACBfAADBGAAghAgAAL8YACCFCAAAwBgAIIgIAAAfACCJCAAAHwAgiggAAGsAIA4GAAD1EAAgDAAAgRIAIB0AAPQQACDfBUAAAAAB7QUBAAAAAe4FQAAAAAGhBgEAAAAB-gYBAAAAAYAHQAAAAAGCB0AAAAABnAcBAAAAAZ0HAQAAAAGeBwEAAAABnwcBAAAAAQNeAAC-GAAghAgAAL8YACCKCAAAawAgHgMAAPcTACAOAACEFAAgDwAAhRQAIBsAAPkTACAeAAD4EwAgHwAA-hMAICAAAPsTACAhAAD8EwAgIgAA_RMAICMAAP4TACAkAAD_EwAgJQAAgBQAICgAAIEUACApAACCFAAgKgAAgxQAICsAAIYUACAsAACHFAAgLQAAiBQAIC8AAIkUACA2AACKFAAgNwAAixQAIDoAAIwUACDtBQEAAAAB7gVAAAAAAfMFAAAAowcC9gUBAAAAAaEHAAAAoQcCowcCAAAAAaQHQAAAAAGlB0AAAAABAgAAALQBACBeAAD2EwAgAwAAALQBACBeAAD2EwAgXwAAjhIAIAFXAAC9GAAwJAMAAPMJACAHAADSCwAgDgAA7wsAIA8AAPALACAbAADBCwAgHgAA5woAIB8AAMELACAgAADCCwAgIQAAwwsAICIAAMQLACAjAADtCwAgJAAAwAsAICUAAO4LACAoAADFCwAgKQAAxgsAICoAAMYLACArAADHCwAgLAAAxwsAIC0AAOMLACAvAADkCwAgNgAAyQsAIDcAAMoLACA6AADNCwAg2gUAAOkLADDbBQAAGQAQ3AUAAOkLADDtBQEAAAAB7gVAAOAJACHzBQAA6wujByL2BQEAwQoAIYEGAQDBCgAhoQcAAOoLoQciowcCAOwLACGkB0AA4QkAIaUHQADhCQAh-gcAAOgLACACAAAAtAEAIFcAAI4SACACAAAAihIAIFcAAIsSACAM2gUAAIkSADDbBQAAihIAENwFAACJEgAw7QUBAMEKACHuBUAA4AkAIfMFAADrC6MHIvYFAQDBCgAhgQYBAMEKACGhBwAA6guhByKjBwIA7AsAIaQHQADhCQAhpQdAAOEJACEM2gUAAIkSADDbBQAAihIAENwFAACJEgAw7QUBAMEKACHuBUAA4AkAIfMFAADrC6MHIvYFAQDBCgAhgQYBAMEKACGhBwAA6guhByKjBwIA7AsAIaQHQADhCQAhpQdAAOEJACEI7QUBAMEMACHuBUAAwwwAIfMFAACNEqMHIvYFAQDBDAAhoQcAAIwSoQciowcCAK4NACGkB0AAxAwAIaUHQADEDAAhAYcIAAAAoQcCAYcIAAAAowcCHgMAAI8SACAOAACcEgAgDwAAnRIAIBsAAJESACAeAACQEgAgHwAAkhIAICAAAJMSACAhAACUEgAgIgAAlRIAICMAAJYSACAkAACXEgAgJQAAmBIAICgAAJkSACApAACaEgAgKgAAmxIAICsAAJ4SACAsAACfEgAgLQAAoBIAIC8AAKESACA2AACiEgAgNwAAoxIAIDoAAKQSACDtBQEAwQwAIe4FQADDDAAh8wUAAI0Sowci9gUBAMEMACGhBwAAjBKhByKjBwIArg0AIaQHQADEDAAhpQdAAMQMACEFXgAAgBgAIF8AALsYACCECAAAgRgAIIUIAAC6GAAgiggAAJ4FACALXgAA7RMAMF8AAPETADCECAAA7hMAMIUIAADvEwAwhggAAPATACCHCAAA6BAAMIgIAADoEAAwiQgAAOgQADCKCAAA6BAAMIsIAADyEwAwjAgAAOsQADALXgAA5BMAMF8AAOgTADCECAAA5RMAMIUIAADmEwAwhggAAOcTACCHCAAAkA0AMIgIAACQDQAwiQgAAJANADCKCAAAkA0AMIsIAADpEwAwjAgAAJMNADALXgAA2xMAMF8AAN8TADCECAAA3BMAMIUIAADdEwAwhggAAN4TACCHCAAAkA0AMIgIAACQDQAwiQgAAJANADCKCAAAkA0AMIsIAADgEwAwjAgAAJMNADALXgAA0hMAMF8AANYTADCECAAA0xMAMIUIAADUEwAwhggAANUTACCHCAAAxREAMIgIAADFEQAwiQgAAMURADCKCAAAxREAMIsIAADXEwAwjAgAAMgRADALXgAAyRMAMF8AAM0TADCECAAAyhMAMIUIAADLEwAwhggAAMwTACCHCAAAuREAMIgIAAC5EQAwiQgAALkRADCKCAAAuREAMIsIAADOEwAwjAgAALwRADALXgAAwBMAMF8AAMQTADCECAAAwRMAMIUIAADCEwAwhggAAMMTACCHCAAArREAMIgIAACtEQAwiQgAAK0RADCKCAAArREAMIsIAADFEwAwjAgAALARADALXgAAtxMAMF8AALsTADCECAAAuBMAMIUIAAC5EwAwhggAALoTACCHCAAAoQ4AMIgIAAChDgAwiQgAAKEOADCKCAAAoQ4AMIsIAAC8EwAwjAgAAKQOADALXgAArhMAMF8AALITADCECAAArxMAMIUIAACwEwAwhggAALETACCHCAAAxw4AMIgIAADHDgAwiQgAAMcOADCKCAAAxw4AMIsIAACzEwAwjAgAAMoOADALXgAAohMAMF8AAKcTADCECAAAoxMAMIUIAACkEwAwhggAAKUTACCHCAAAphMAMIgIAACmEwAwiQgAAKYTADCKCAAAphMAMIsIAACoEwAwjAgAAKkTADALXgAAmRMAMF8AAJ0TADCECAAAmhMAMIUIAACbEwAwhggAAJwTACCHCAAAgg4AMIgIAACCDgAwiQgAAIIOADCKCAAAgg4AMIsIAACeEwAwjAgAAIUOADALXgAAkBMAMF8AAJQTADCECAAAkRMAMIUIAACSEwAwhggAAJMTACCHCAAAuxAAMIgIAAC7EAAwiQgAALsQADCKCAAAuxAAMIsIAACVEwAwjAgAAL4QADALXgAAhRMAMF8AAIkTADCECAAAhhMAMIUIAACHEwAwhggAAIgTACCHCAAAuxAAMIgIAAC7EAAwiQgAALsQADCKCAAAuxAAMIsIAACKEwAwjAgAAL4QADALXgAA-hIAMF8AAP4SADCECAAA-xIAMIUIAAD8EgAwhggAAP0SACCHCAAAiREAMIgIAACJEQAwiQgAAIkRADCKCAAAiREAMIsIAAD_EgAwjAgAAIwRADALXgAA7xIAMF8AAPMSADCECAAA8BIAMIUIAADxEgAwhggAAPISACCHCAAA-hAAMIgIAAD6EAAwiQgAAPoQADCKCAAA-hAAMIsIAAD0EgAwjAgAAP0QADALXgAA5hIAMF8AAOoSADCECAAA5xIAMIUIAADoEgAwhggAAOkSACCHCAAArRAAMIgIAACtEAAwiQgAAK0QADCKCAAArRAAMIsIAADrEgAwjAgAALAQADALXgAA3RIAMF8AAOESADCECAAA3hIAMIUIAADfEgAwhggAAOASACCHCAAArRAAMIgIAACtEAAwiQgAAK0QADCKCAAArRAAMIsIAADiEgAwjAgAALAQADALXgAA0hIAMF8AANYSADCECAAA0xIAMIUIAADUEgAwhggAANUSACCHCAAAmxAAMIgIAACbEAAwiQgAAJsQADCKCAAAmxAAMIsIAADXEgAwjAgAAJ4QADALXgAAxxIAMF8AAMsSADCECAAAyBIAMIUIAADJEgAwhggAAMoSACCHCAAAjRAAMIgIAACNEAAwiQgAAI0QADCKCAAAjRAAMIsIAADMEgAwjAgAAJAQADALXgAAvhIAMF8AAMISADCECAAAvxIAMIUIAADAEgAwhggAAMESACCHCAAA4A8AMIgIAADgDwAwiQgAAOAPADCKCAAA4A8AMIsIAADDEgAwjAgAAOMPADALXgAAsxIAMF8AALcSADCECAAAtBIAMIUIAAC1EgAwhggAALYSACCHCAAAxw8AMIgIAADHDwAwiQgAAMcPADCKCAAAxw8AMIsIAAC4EgAwjAgAAMoPADALXgAApRIAMF8AAKoSADCECAAAphIAMIUIAACnEgAwhggAAKgSACCHCAAAqRIAMIgIAACpEgAwiQgAAKkSADCKCAAAqRIAMIsIAACrEgAwjAgAAKwSADAFOQAAshIAIO0FAQAAAAHuBUAAAAABgQYBAAAAAfUGAQAAAAECAAAAkQEAIF4AALESACADAAAAkQEAIF4AALESACBfAACvEgAgAVcAALkYADALDQAA9AsAIDkAAPMLACDaBQAA8gsAMNsFAACPAQAQ3AUAAPILADDtBQEAAAAB7gVAAOAJACGBBgEAwQoAIYwGAQDBCgAh9QYBAMEKACH7BwAA8QsAIAIAAACRAQAgVwAArxIAIAIAAACtEgAgVwAArhIAIAjaBQAArBIAMNsFAACtEgAQ3AUAAKwSADDtBQEAwQoAIe4FQADgCQAhgQYBAMEKACGMBgEAwQoAIfUGAQDBCgAhCNoFAACsEgAw2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_DQAgDAAAwg0AIBUAAMANACAXAAC2EAAg7QUBAAAAAe4FQAAAAAHzBQAAAK8HAoEGAQAAAAGVBgIAAAABoQYBAAAAAaIGAQAAAAGpBwEAAAABrAcAAACsBwKtBwEAAAABAgAAAHEAIF4AAOUSACADAAAAcQAgXgAA5RIAIF8AAOQSACABVwAAoBgAMAIAAABxACBXAADkEgAgAgAAALEQACBXAADjEgAgCu0FAQDBDAAh7gVAAMMMACHzBQAAug2vByKBBgEAwQwAIZUGAgDCDAAhoQYBAMgMACGiBgEAyAwAIakHAQDBDAAhrAcAALkNrAcirQcBAMgMACEOBwAAuw0AIAwAAL4NACAVAAC8DQAgFwAAtBAAIO0FAQDBDAAh7gVAAMMMACHzBQAAug2vByKBBgEAwQwAIZUGAgDCDAAhoQYBAMgMACGiBgEAyAwAIakHAQDBDAAhrAcAALkNrAcirQcBAMgMACEOBwAAvw0AIAwAAMINACAVAADADQAgFwAAthAAIO0FAQAAAAHuBUAAAAAB8wUAAACvBwKBBgEAAAABlQYCAAAAAaEGAQAAAAGiBgEAAAABqQcBAAAAAawHAAAArAcCrQcBAAAAAQ4HAAC_DQAgDAAAwg0AIBYAAMENACAXAAC2EAAg7QUBAAAAAe4FQAAAAAHzBQAAAK8HAoEGAQAAAAGVBgIAAAABoQYBAAAAAaIGAQAAAAGqBwEAAAABrAcAAACsBwKtBwEAAAABAgAAAHEAIF4AAO4SACADAAAAcQAgXgAA7hIAIF8AAO0SACABVwAAnxgAMAIAAABxACBXAADtEgAgAgAAALEQACBXAADsEgAgCu0FAQDBDAAh7gVAAMMMACHzBQAAug2vByKBBgEAwQwAIZUGAgDCDAAhoQYBAMgMACGiBgEAyAwAIaoHAQDBDAAhrAcAALkNrAcirQcBAMgMACEOBwAAuw0AIAwAAL4NACAWAAC9DQAgFwAAtBAAIO0FAQDBDAAh7gVAAMMMACHzBQAAug2vByKBBgEAwQwAIZUGAgDCDAAhoQYBAMgMACGiBgEAyAwAIaoHAQDBDAAhrAcAALkNrAcirQcBAMgMACEOBwAAvw0AIAwAAMINACAWAADBDQAgFwAAthAAIO0FAQAAAAHuBUAAAAAB8wUAAACvBwKBBgEAAAABlQYCAAAAAaEGAQAAAAGiBgEAAAABqgcBAAAAAawHAAAArAcCrQcBAAAAAQYMAAD5EgAg7QUBAAAAAe4FQAAAAAGhBgEAAAABsAcAAACwBwKxB0AAAAABAgAAACgAIF4AAPgSACADAAAAKAAgXgAA-BIAIF8AAPYSACABVwAAnhgAMAIAAAAoACBXAAD2EgAgAgAAAP4QACBXAAD1EgAgBe0FAQDBDAAh7gVAAMMMACGhBgEAwQwAIbAHAACAEbAHIrEHQADDDAAhBgwAAPcSACDtBQEAwQwAIe4FQADDDAAhoQYBAMEMACGwBwAAgBGwByKxB0AAwwwAIQVeAACZGAAgXwAAnBgAIIQIAACaGAAghQgAAJsYACCKCAAAawAgBgwAAPkSACDtBQEAAAAB7gVAAAAAAaEGAQAAAAGwBwAAALAHArEHQAAAAAEDXgAAmRgAIIQIAACaGAAgiggAAGsAIAUMAACEEwAg7QUBAAAAAe4FQAAAAAGhBgEAAAABsgdAAAAAAQIAAAAkACBeAACDEwAgAwAAACQAIF4AAIMTACBfAACBEwAgAVcAAJgYADACAAAAJAAgVwAAgRMAIAIAAACNEQAgVwAAgBMAIATtBQEAwQwAIe4FQADDDAAhoQYBAMEMACGyB0AAwwwAIQUMAACCEwAg7QUBAMEMACHuBUAAwwwAIaEGAQDBDAAhsgdAAMMMACEFXgAAkxgAIF8AAJYYACCECAAAlBgAIIUIAACVGAAgiggAAGsAIAUMAACEEwAg7QUBAAAAAe4FQAAAAAGhBgEAAAABsgdAAAAAAQNeAACTGAAghAgAAJQYACCKCAAAawAgHAcAAI8TACAKAACWEQAgDgAAmBEAIA8AAJkRACAQAACaEQAgEwAAmxEAIBQAAJwRACAYAACdEQAg7QUBAAAAAe4FQAAAAAHzBQAAAMMHAoEGAQAAAAHHBkAAAAAB7AYAAAC0BwK0B4AAAAABtQcBAAAAAbYHAQAAAAG3ByAAAAABuQcAAAC5BwK6BwAAlBEAILwHAACVEQAgvQdAAAAAAb4HAgAAAAG_BwIAAAABwAdAAAAAAcEHQAAAAAHDB0AAAAABxAeAAAAAAQIAAABrACBeAACOEwAgAwAAAGsAIF4AAI4TACBfAACMEwAgAVcAAJIYADACAAAAawAgVwAAjBMAIAIAAAC_EAAgVwAAixMAIBTtBQEAwQwAIe4FQADDDAAh8wUAAMUQwwcigQYBAMEMACHHBkAAxAwAIewGAADBELQHIrQHgAAAAAG1BwEAyAwAIbYHAQDBDAAhtwcgANcPACG5BwAAwhC5ByK6BwAAwxAAILwHAADEEAAgvQdAAMQMACG-BwIAwgwAIb8HAgDCDAAhwAdAAMMMACHBB0AAwwwAIcMHQADEDAAhxAeAAAAAARwHAACNEwAgCgAAxxAAIA4AAMkQACAPAADKEAAgEAAAyxAAIBMAAMwQACAUAADNEAAgGAAAzhAAIO0FAQDBDAAh7gVAAMMMACHzBQAAxRDDByKBBgEAwQwAIccGQADEDAAh7AYAAMEQtAcitAeAAAAAAbUHAQDIDAAhtgcBAMEMACG3ByAA1w8AIbkHAADCELkHIroHAADDEAAgvAcAAMQQACC9B0AAxAwAIb4HAgDCDAAhvwcCAMIMACHAB0AAwwwAIcEHQADDDAAhwwdAAMQMACHEB4AAAAABBV4AAI0YACBfAACQGAAghAgAAI4YACCFCAAAjxgAIIoIAACCAgAgHAcAAI8TACAKAACWEQAgDgAAmBEAIA8AAJkRACAQAACaEQAgEwAAmxEAIBQAAJwRACAYAACdEQAg7QUBAAAAAe4FQAAAAAHzBQAAAMMHAoEGAQAAAAHHBkAAAAAB7AYAAAC0BwK0B4AAAAABtQcBAAAAAbYHAQAAAAG3ByAAAAABuQcAAAC5BwK6BwAAlBEAILwHAACVEQAgvQdAAAAAAb4HAgAAAAG_BwIAAAABwAdAAAAAAcEHQAAAAAHDB0AAAAABxAeAAAAAAQNeAACNGAAghAgAAI4YACCKCAAAggIAIBwHAACPEwAgCwAAlxEAIA4AAJgRACAPAACZEQAgEAAAmhEAIBMAAJsRACAUAACcEQAgGAAAnREAIO0FAQAAAAHuBUAAAAAB8wUAAADDBwKBBgEAAAABxwZAAAAAAewGAAAAtAcCtAeAAAAAAbUHAQAAAAG3ByAAAAABuQcAAAC5BwK6BwAAlBEAILsHAQAAAAG8BwAAlREAIL0HQAAAAAG-BwIAAAABvwcCAAAAAcAHQAAAAAHBB0AAAAABwwdAAAAAAcQHgAAAAAECAAAAawAgXgAAmBMAIAMAAABrACBeAACYEwAgXwAAlxMAIAFXAACMGAAwAgAAAGsAIFcAAJcTACACAAAAvxAAIFcAAJYTACAU7QUBAMEMACHuBUAAwwwAIfMFAADFEMMHIoEGAQDBDAAhxwZAAMQMACHsBgAAwRC0ByK0B4AAAAABtQcBAMgMACG3ByAA1w8AIbkHAADCELkHIroHAADDEAAguwcBAMgMACG8BwAAxBAAIL0HQADEDAAhvgcCAMIMACG_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-BkAAAAABwAYCAAAAAQcZAAD_DAAg4QVAAAAAAe0FAQAAAAHuBUAAAAABlAYBAAAAAZUGAgAAAAGWBkAAAAABAgAAAFgAIF4AAL8TACADAAAAWAAgXgAAvxMAIF8AAL4TACABVwAAiBgAMAIAAABYACBXAAC-EwAgAgAAAKUOACBXAAC9EwAgBuEFQADDDAAh7QUBAMEMACHuBUAAwwwAIZQGAQDBDAAhlQYCAMIMACGWBkAAwwwAIQcZAAD9DAAg4QVAAMMMACHtBQEAwQwAIe4FQADDDAAhlAYBAMEMACGVBgIAwgwAIZYGQADDDAAhBxkAAP8MACDhBUAAAAAB7QUBAAAAAe4FQAAAAAGUBgEAAAABlQYCAAAAAZYGQAAAAAEUBwAAow0AIAwAAKUNACAXAACmDQAgGwAApw0AIOEFQAAAAAHtBQEAAAAB7gVAAAAAAfMFAAAAngYCgQYBAAAAAZcGAgAAAAGYBgIAAAABmQYCAAAAAZoGAgAAAAGbBgIAAAABnAYCAAAAAZ4GAQAAAAGfBgEAAAABoAZAAAAAAaEGAQAAAAGiBgEAAAABAgAAAFQAIF4AAMgTACADAAAAVAAgXgAAyBMAIF8AAMcTACABVwAAhxgAMAIAAABUACBXAADHEwAgAgAAALERACBXAADGEwAgEOEFQADDDAAh7QUBAMEMACHuBUAAwwwAIfMFAACGDZ4GIoEGAQDBDAAhlwYCAMIMACGYBgIAwgwAIZkGAgDCDAAhmgYCAMIMACGbBgIAwgwAIZwGAgDCDAAhngYBAMgMACGfBgEAyAwAIaAGQADEDAAhoQYBAMgMACGiBgEAyAwAIRQHAACHDQAgDAAAiQ0AIBcAAIoNACAbAACLDQAg4QVAAMMMACHtBQEAwQwAIe4FQADDDAAh8wUAAIYNngYigQYBAMEMACGXBgIAwgwAIZgGAgDCDAAhmQYCAMIMACGaBgIAwgwAIZsGAgDCDAAhnAYCAMIMACGeBgEAyAwAIZ8GAQDIDAAhoAZAAMQMACGhBgEAyAwAIaIGAQDIDAAhFAcAAKMNACAMAAClDQAgFwAApg0AIBsAAKcNACDhBUAAAAAB7QUBAAAAAe4FQAAAAAHzBQAAAJ4GAoEGAQAAAAGXBgIAAAABmAYCAAAAAZkGAgAAAAGaBgIAAAABmwYCAAAAAZwGAgAAAAGeBgEAAAABnwYBAAAAAaAGQAAAAAGhBgEAAAABogYBAAAAARAHAADIDQAgFAAAyg0AIBgAAMsNACDhBUAAAAAB7QUBAAAAAe4FQAAAAAHzBQAAAKoGAoEGAQAAAAGVBgIAAAABmwYCAAAAAaQGAAAApAYCpQYCAAAAAaYGAQAAAAGnBgEAAAABqAYBAAAAAaoGQAAAAAECAAAAUQAgXgAA0RMAIAMAAABRACBeAADREwAgXwAA0BMAIAFXAACGGAAwAgAAAFEAIFcAANATACACAAAAvREAIFcAAM8TACAN4QVAAMMMACHtBQEAwQwAIe4FQADDDAAh8wUAAK8NqgYigQYBAMEMACGVBgIAwgwAIZsGAgDCDAAhpAYAAK0NpAYipQYCAK4NACGmBgEAwQwAIacGAQDBDAAhqAYBAMgMACGqBkAAxAwAIRAHAACwDQAgFAAAsg0AIBgAALMNACDhBUAAwwwAIe0FAQDBDAAh7gVAAMMMACHzBQAArw2qBiKBBgEAwQwAIZUGAgDCDAAhmwYCAMIMACGkBgAArQ2kBiKlBgIArg0AIaYGAQDBDAAhpwYBAMEMACGoBgEAyAwAIaoGQADEDAAhEAcAAMgNACAUAADKDQAgGAAAyw0AIOEFQAAAAAHtBQEAAAAB7gVAAAAAAfMFAAAAqgYCgQYBAAAAAZUGAgAAAAGbBgIAAAABpAYAAACkBgKlBgIAAAABpgYBAAAAAacGAQAAAAGoBgEAAAABqgZAAAAAARAHAADYDQAg4QVAAAAAAe0FAQAAAAHuBUAAAAAB8wUAAACtBgKBBgEAAAABlQYCAAAAAaYGAQAAAAGnBgEAAAABqAYBAAAAAaoGQAAAAAGrBgAA1w0AIK0GAgAAAAGvBgAAAK8GA7EGAAAAsQYDsgYBAAAAAQIAAABOACBeAADaEwAgAwAAAE4AIF4AANoTACBfAADZEwAgAVcAAIUYADACAAAATgAgVwAA2RMAIAIAAADJEQAgVwAA2BMAIA_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_EQAgHQAA8BAAIN8FQADDDAAh7QUBAMEMACHuBUAAwwwAIYEGAQDBDAAhoQYBAMgMACH6BgEAwQwAIYAHQADEDAAhggdAAMQMACGcBwEAwQwAIZ0HAQDBDAAhngcBAMgMACEOBwAA8xAAIAwAAIESACAdAAD0EAAg3wVAAAAAAe0FAQAAAAHuBUAAAAABgQYBAAAAAaEGAQAAAAH6BgEAAAABgAdAAAAAAYIHQAAAAAGcBwEAAAABnQcBAAAAAZ4HAQAAAAEeAwAA9xMAIA4AAIQUACAPAACFFAAgGwAA-RMAIB4AAPgTACAfAAD6EwAgIAAA-xMAICEAAPwTACAiAAD9EwAgIwAA_hMAICQAAP8TACAlAACAFAAgKAAAgRQAICkAAIIUACAqAACDFAAgKwAAhhQAICwAAIcUACAtAACIFAAgLwAAiRQAIDYAAIoUACA3AACLFAAgOgAAjBQAIO0FAQAAAAHuBUAAAAAB8wUAAACjBwL2BQEAAAABoQcAAAChBwKjBwIAAAABpAdAAAAAAaUHQAAAAAEDXgAAgBgAIIQIAACBGAAgiggAAJ4FACAEXgAA7RMAMIQIAADuEwAwhggAAPATACCKCAAA6BAAMAReAADkEwAwhAgAAOUTADCGCAAA5xMAIIoIAACQDQAwBF4AANsTADCECAAA3BMAMIYIAADeEwAgiggAAJANADAEXgAA0hMAMIQIAADTEwAwhggAANUTACCKCAAAxREAMAReAADJEwAwhAgAAMoTADCGCAAAzBMAIIoIAAC5EQAwBF4AAMATADCECAAAwRMAMIYIAADDEwAgiggAAK0RADAEXgAAtxMAMIQIAAC4EwAwhggAALoTACCKCAAAoQ4AMAReAACuEwAwhAgAAK8TADCGCAAAsRMAIIoIAADHDgAwBF4AAKITADCECAAAoxMAMIYIAAClEwAgiggAAKYTADAEXgAAmRMAMIQIAACaEwAwhggAAJwTACCKCAAAgg4AMAReAACQEwAwhAgAAJETADCGCAAAkxMAIIoIAAC7EAAwBF4AAIUTADCECAAAhhMAMIYIAACIEwAgiggAALsQADAEXgAA-hIAMIQIAAD7EgAwhggAAP0SACCKCAAAiREAMAReAADvEgAwhAgAAPASADCGCAAA8hIAIIoIAAD6EAAwBF4AAOYSADCECAAA5xIAMIYIAADpEgAgiggAAK0QADAEXgAA3RIAMIQIAADeEgAwhggAAOASACCKCAAArRAAMAReAADSEgAwhAgAANMSADCGCAAA1RIAIIoIAACbEAAwBF4AAMcSADCECAAAyBIAMIYIAADKEgAgiggAAI0QADAEXgAAvhIAMIQIAAC_EgAwhggAAMESACCKCAAA4A8AMAReAACzEgAwhAgAALQSADCGCAAAthIAIIoIAADHDwAwBF4AAKUSADCECAAAphIAMIYIAACoEgAgiggAAKkSADADXgAA_hcAIIQIAAD_FwAgiggAAJ4FACAEXgAAghIAMIQIAACDEgAwhggAAIUSACCKCAAAhhIAMAReAAD3EQAwhAgAAPgRADCGCAAA-hEAIIoIAADoEAAwBF4AAO4RADCECAAA7xEAMIYIAADxEQAgiggAAPINADAEXgAA3xEAMIQIAADgEQAwhggAAOIRACCKCAAA4xEAMAReAADWEQAwhAgAANcRADCGCAAA2REAIIoIAADHDgAwBF4AAM0RADCECAAAzhEAMIYIAADQEQAgiggAAJANADAEXgAAwREAMIQIAADCEQAwhggAAMQRACCKCAAAxREAMAReAAC1EQAwhAgAALYRADCGCAAAuBEAIIoIAAC5EQAwBF4AAKkRADCECAAAqhEAMIYIAACsEQAgiggAAK0RADAEXgAAnhEAMIQIAACfEQAwhggAAKERACCKCAAAgg4AMAReAAC3EAAwhAgAALgQADCGCAAAuhAAIIoIAAC7EAAwBF4AAKkQADCECAAAqhAAMIYIAACsEAAgiggAAK0QADAEXgAA-w8AMIQIAAD8DwAwhggAAP4PACCKCAAA_w8AMAReAADyDwAwhAgAAPMPADCGCAAA9Q8AIIoIAADgDwAwBF4AAMMPADCECAAAxA8AMIYIAADGDwAgiggAAMcPADAEXgAAtw8AMIQIAAC4DwAwhggAALoPACCKCAAAuw8AMAReAACmDwAwhAgAAKcPADCGCAAAqQ8AIIoIAACqDwAwBF4AAIcPADCECAAAiA8AMIYIAACKDwAgiggAAIsPADAEXgAA-Q4AMIQIAAD6DgAwhggAAPwOACCKCAAA_Q4AMAReAADqDgAwhAgAAOsOADCGCAAA7Q4AIIoIAADuDgAwA14AAPwXACCECAAA_RcAIIoIAACCAgAgAAAAAAAAAAAAAAAFXgAA9xcAIF8AAPoXACCECAAA-BcAIIUIAAD5FwAgiggAAIICACADXgAA9xcAIIQIAAD4FwAgiggAAIICACAAAAAAAAGHCAAAAOcGAgAAAAAABV4AAPIXACBfAAD1FwAghAgAAPMXACCFCAAA9BcAIIoIAABhACADXgAA8hcAIIQIAADzFwAgiggAAGEAIAAAAAAAAAAABV4AAO0XACBfAADwFwAghAgAAO4XACCFCAAA7xcAIIoIAAC0AQAgA14AAO0XACCECAAA7hcAIIoIAAC0AQAgAAAAAYcIAAAA9wYCBV4AAOcXACBfAADrFwAghAgAAOgXACCFCAAA6hcAIIoIAACeBQAgC14AAM0UADBfAADRFAAwhAgAAM4UADCFCAAAzxQAMIYIAADQFAAghwgAAKkSADCICAAAqRIAMIkIAACpEgAwiggAAKkSADCLCAAA0hQAMIwIAACsEgAwBQ0AAMYUACDtBQEAAAAB7gVAAAAAAYEGAQAAAAGMBgEAAAABAgAAAJEBACBeAADVFAAgAwAAAJEBACBeAADVFAAgXwAA1BQAIAFXAADpFwAwAgAAAJEBACBXAADUFAAgAgAAAK0SACBXAADTFAAgBO0FAQDBDAAh7gVAAMMMACGBBgEAwQwAIYwGAQDBDAAhBQ0AAMUUACDtBQEAwQwAIe4FQADDDAAhgQYBAMEMACGMBgEAwQwAIQUNAADGFAAg7QUBAAAAAe4FQAAAAAGBBgEAAAABjAYBAAAAAQNeAADnFwAghAgAAOgXACCKCAAAngUAIAReAADNFAAwhAgAAM4UADCGCAAA0BQAIIoIAACpEgAwAAAAAYcIAAAA_wYCAYcIAAAAhAcDBV4AAN8XACBfAADlFwAghAgAAOAXACCFCAAA5BcAIIoIAACeBQAgB14AAN0XACBfAADiFwAghAgAAN4XACCFCAAA4RcAIIgIAAADACCJCAAAAwAgiggAAAUAIANeAADfFwAghAgAAOAXACCKCAAAngUAIANeAADdFwAghAgAAN4XACCKCAAABQAgAAAAAYcIAAAAsQYCBV4AANgXACBfAADbFwAghAgAANkXACCFCAAA2hcAIIoIAACeBQAgA14AANgXACCECAAA2RcAIIoIAACeBQAgAAAAAYcIAAAAiAcCBV4AANEXACBfAADWFwAghAgAANIXACCFCAAA1RcAIIoIAACeBQAgC14AAPcUADBfAAD8FAAwhAgAAPgUADCFCAAA-RQAMIYIAAD6FAAghwgAAPsUADCICAAA-xQAMIkIAAD7FAAwiggAAPsUADCLCAAA_RQAMIwIAAD-FAAwC14AAO4UADBfAADyFAAwhAgAAO8UADCFCAAA8BQAMIYIAADxFAAghwgAAOcMADCICAAA5wwAMIkIAADnDAAwiggAAOcMADCLCAAA8xQAMIwIAADqDAAwCEoAAMwMACDtBQEAAAAB7gVAAAAAAe8FAQAAAAHxBQEAAAAB8wUAAADzBQL0BQEAAAAB9QVAAAAAAQIAAAAOACBeAAD2FAAgAwAAAA4AIF4AAPYUACBfAAD1FAAgAVcAANQXADACAAAADgAgVwAA9RQAIAIAAADrDAAgVwAA9BQAIAftBQEAwQwAIe4FQADDDAAh7wUBAMEMACHxBQEAyAwAIfMFAADJDPMFIvQFAQDIDAAh9QVAAMQMACEISgAAygwAIO0FAQDBDAAh7gVAAMMMACHvBQEAwQwAIfEFAQDIDAAh8wUAAMkM8wUi9AUBAMgMACH1BUAAxAwAIQhKAADMDAAg7QUBAAAAAe4FQAAAAAHvBQEAAAAB8QUBAAAAAfMFAAAA8wUC9AUBAAAAAfUFQAAAAAEMAwAA3xQAIN8FQAAAAAHtBQEAAAAB7gVAAAAAAfYFAQAAAAH6BgEAAAAB_QYBAAAAAf8GAAAA_wYCgAdAAAAAAYEHAQAAAAGCB0AAAAABhAcAAACEBwMCAAAACQAgXgAAghUAIAMAAAAJACBeAACCFQAgXwAAgRUAIAFXAADTFwAwEQMAAPMJACAEAAC4DAAg2gUAALUMADDbBQAABwAQ3AUAALUMADDfBUAA4AkAIe0FAQAAAAHuBUAA4AkAIfAFAQCTCwAh9gUBAMEKACH6BgEAAAAB_QYBAMEKACH_BgAAtgz_BiKAB0AA4QkAIYEHAQCTCwAhggdAAOEJACGEBwAAtwyEByMCAAAACQAgVwAAgRUAIAIAAAD_FAAgVwAAgBUAIA_aBQAA_hQAMNsFAAD_FAAQ3AUAAP4UADDfBUAA4AkAIe0FAQDBCgAh7gVAAOAJACHwBQEAkwsAIfYFAQDBCgAh-gYBAN4JACH9BgEAwQoAIf8GAAC2DP8GIoAHQADhCQAhgQcBAJMLACGCB0AA4QkAIYQHAAC3DIQHIw_aBQAA_hQAMNsFAAD_FAAQ3AUAAP4UADDfBUAA4AkAIe0FAQDBCgAh7gVAAOAJACHwBQEAkwsAIfYFAQDBCgAh-gYBAN4JACH9BgEAwQoAIf8GAAC2DP8GIoAHQADhCQAhgQcBAJMLACGCB0AA4QkAIYQHAAC3DIQHIwvfBUAAwwwAIe0FAQDBDAAh7gVAAMMMACH2BQEAwQwAIfoGAQDBDAAh_QYBAMEMACH_BgAA2xT_BiKAB0AAxAwAIYEHAQDIDAAhggdAAMQMACGEBwAA3BSEByMMAwAA3RQAIN8FQADDDAAh7QUBAMEMACHuBUAAwwwAIfYFAQDBDAAh-gYBAMEMACH9BgEAwQwAIf8GAADbFP8GIoAHQADEDAAhgQcBAMgMACGCB0AAxAwAIYQHAADcFIQHIwwDAADfFAAg3wVAAAAAAe0FAQAAAAHuBUAAAAAB9gUBAAAAAfoGAQAAAAH9BgEAAAAB_wYAAAD_BgKAB0AAAAABgQcBAAAAAYIHQAAAAAGEBwAAAIQHAwNeAADRFwAghAgAANIXACCKCAAAngUAIAReAAD3FAAwhAgAAPgUADCGCAAA-hQAIIoIAAD7FAAwBF4AAO4UADCECAAA7xQAMIYIAADxFAAgiggAAOcMADAAAAAAAAteAACVFgAwXwAAmhYAMIQIAACWFgAwhQgAAJcWADCGCAAAmBYAIIcIAACZFgAwiAgAAJkWADCJCAAAmRYAMIoIAACZFgAwiwgAAJsWADCMCAAAnBYAMAteAACJFgAwXwAAjhYAMIQIAACKFgAwhQgAAIsWADCGCAAAjBYAIIcIAACNFgAwiAgAAI0WADCJCAAAjRYAMIoIAACNFgAwiwgAAI8WADCMCAAAkBYAMAteAACAFgAwXwAAhBYAMIQIAACBFgAwhQgAAIIWADCGCAAAgxYAIIcIAAD7FAAwiAgAAPsUADCJCAAA-xQAMIoIAAD7FAAwiwgAAIUWADCMCAAA_hQAMAteAAD0FQAwXwAA-RUAMIQIAAD1FQAwhQgAAPYVADCGCAAA9xUAIIcIAAD4FQAwiAgAAPgVADCJCAAA-BUAMIoIAAD4FQAwiwgAAPoVADCMCAAA-xUAMAteAADpFQAwXwAA7RUAMIQIAADqFQAwhQgAAOsVADCGCAAA7BUAIIcIAACGEgAwiAgAAIYSADCJCAAAhhIAMIoIAACGEgAwiwgAAO4VADCMCAAAiRIAMAteAADbFQAwXwAA4BUAMIQIAADcFQAwhQgAAN0VADCGCAAA3hUAIIcIAADfFQAwiAgAAN8VADCJCAAA3xUAMIoIAADfFQAwiwgAAOEVADCMCAAA4hUAMAteAADSFQAwXwAA1hUAMIQIAADTFQAwhQgAANQVADCGCAAA1RUAIIcIAADoEAAwiAgAAOgQADCJCAAA6BAAMIoIAADoEAAwiwgAANcVADCMCAAA6xAAMAteAADJFQAwXwAAzRUAMIQIAADKFQAwhQgAAMsVADCGCAAAzBUAIIcIAAC7DwAwiAgAALsPADCJCAAAuw8AMIoIAAC7DwAwiwgAAM4VADCMCAAAvg8AMAdeAADEFQAgXwAAxxUAIIQIAADFFQAghQgAAMYVACCICAAAhgIAIIkIAACGAgAgiggAAIcJACALXgAAuRUAMF8AAL0VADCECAAAuhUAMIUIAAC7FQAwhggAALwVACCHCAAAqg8AMIgIAACqDwAwiQgAAKoPADCKCAAAqg8AMIsIAAC-FQAwjAgAAK0PADALXgAArhUAMF8AALIVADCECAAArxUAMIUIAACwFQAwhggAALEVACCHCAAAiw8AMIgIAACLDwAwiQgAAIsPADCKCAAAiw8AMIsIAACzFQAwjAgAAI4PADALXgAAoxUAMF8AAKcVADCECAAApBUAMIUIAAClFQAwhggAAKYVACCHCAAA_Q4AMIgIAAD9DgAwiQgAAP0OADCKCAAA_Q4AMIsIAACoFQAwjAgAAIAPADALXgAAmBUAMF8AAJwVADCECAAAmRUAMIUIAACaFQAwhggAAJsVACCHCAAA7g4AMIgIAADuDgAwiQgAAO4OADCKCAAA7g4AMIsIAACdFQAwjAgAAPEOADAMBwAAohUAIN8FQAAAAAHtBQEAAAAB7gVAAAAAAYEGAQAAAAG0BgAAAM4HAvwGQAAAAAHOBwEAAAABzwcCAAAAAdAHAQAAAAHRBwEAAAAB0gcBAAAAAQIAAADdAQAgXgAAoRUAIAMAAADdAQAgXgAAoRUAIF8AAJ8VACABVwAA0BcAMAIAAADdAQAgVwAAnxUAIAIAAADyDgAgVwAAnhUAIAvfBUAAwwwAIe0FAQDBDAAh7gVAAMMMACGBBgEAwQwAIbQGAAD0Ds4HIvwGQADEDAAhzgcBAMEMACHPBwIAwgwAIdAHAQDBDAAh0QcBAMgMACHSBwEAyAwAIQwHAACgFQAg3wVAAMMMACHtBQEAwQwAIe4FQADDDAAhgQYBAMEMACG0BgAA9A7OByL8BkAAxAwAIc4HAQDBDAAhzwcCAMIMACHQBwEAwQwAIdEHAQDIDAAh0gcBAMgMACEFXgAAyxcAIF8AAM4XACCECAAAzBcAIIUIAADNFwAgiggAAIICACAMBwAAohUAIN8FQAAAAAHtBQEAAAAB7gVAAAAAAYEGAQAAAAG0BgAAAM4HAvwGQAAAAAHOBwEAAAABzwcCAAAAAdAHAQAAAAHRBwEAAAAB0gcBAAAAAQNeAADLFwAghAgAAMwXACCKCAAAggIAIAkHAACtFQAg7QUBAAAAAe4FQAAAAAHwBQEAAAABgQYBAAAAAecGgAAAAAHgBwEAAAAB4QcBAAAAAeIHAQAAAAECAAAA1wEAIF4AAKwVACADAAAA1wEAIF4AAKwVACBfAACqFQAgAVcAAMoXADACAAAA1wEAIFcAAKoVACACAAAAgQ8AIFcAAKkVACAI7QUBAMEMACHuBUAAwwwAIfAFAQDIDAAhgQYBAMgMACHnBoAAAAAB4AcBAMEMACHhBwEAyAwAIeIHAQDIDAAhCQcAAKsVACDtBQEAwQwAIe4FQADDDAAh8AUBAMgMACGBBgEAyAwAIecGgAAAAAHgBwEAwQwAIeEHAQDIDAAh4gcBAMgMACEHXgAAxRcAIF8AAMgXACCECAAAxhcAIIUIAADHFwAgiAgAABAAIIkIAAAQACCKCAAAggIAIAkHAACtFQAg7QUBAAAAAe4FQAAAAAHwBQEAAAABgQYBAAAAAecGgAAAAAHgBwEAAAAB4QcBAAAAAeIHAQAAAAEDXgAAxRcAIIQIAADGFwAgiggAAIICACAIBwAAuBUAIDYAAKUPACDhBUAAAAAB7QUBAAAAAe4FQAAAAAGBBgEAAAAB9wcAAAD3BwL4BwEAAAABAgAAAAEAIF4AALcVACADAAAAAQAgXgAAtxUAIF8AALUVACABVwAAxBcAMAIAAAABACBXAAC1FQAgAgAAAI8PACBXAAC0FQAgBuEFQADDDAAh7QUBAMEMACHuBUAAwwwAIYEGAQDIDAAh9wcAAJEP9wci-AcBAMgMACEIBwAAthUAIDYAAJQPACDhBUAAwwwAIe0FAQDBDAAh7gVAAMMMACGBBgEAyAwAIfcHAACRD_cHIvgHAQDIDAAhB14AAL8XACBfAADCFwAghAgAAMAXACCFCAAAwRcAIIgIAAAQACCJCAAAEAAgiggAAIICACAIBwAAuBUAIDYAAKUPACDhBUAAAAAB7QUBAAAAAe4FQAAAAAGBBgEAAAAB9wcAAAD3BwL4BwEAAAABA14AAL8XACCECAAAwBcAIIoIAACCAgAgEQcAAMMVACDfBUAAAAAB7QUBAAAAAe4FQAAAAAHzBQAAAOgHAoEGAQAAAAHsBgEAAAAB_AZAAAAAAeMHgAAAAAHkB4AAAAAB5gcAAADmBwLpBwAAAOkHAuoHQAAAAAHrBwEAAAAB7AeAAAAAAe0HAQAAAAHuB4AAAAABAgAAAM8BACBeAADCFQAgAwAAAM8BACBeAADCFQAgXwAAwBUAIAFXAAC-FwAwAgAAAM8BACBXAADAFQAgAgAAAK4PACBXAAC_FQAgEN8FQADDDAAh7QUBAMEMACHuBUAAwwwAIfMFAACxD-gHIoEGAQDIDAAh7AYBAMEMACH8BkAAxAwAIeMHgAAAAAHkB4AAAAAB5gcAALAP5gci6QcAALIP6Qci6gdAAMQMACHrBwEAyAwAIewHgAAAAAHtBwEAyAwAIe4HgAAAAAERBwAAwRUAIN8FQADDDAAh7QUBAMEMACHuBUAAwwwAIfMFAACxD-gHIoEGAQDIDAAh7AYBAMEMACH8BkAAxAwAIeMHgAAAAAHkB4AAAAAB5gcAALAP5gci6QcAALIP6Qci6gdAAMQMACHrBwEAyAwAIewHgAAAAAHtBwEAyAwAIe4HgAAAAAEHXgAAuRcAIF8AALwXACCECAAAuhcAIIUIAAC7FwAgiAgAABAAIIkIAAAQACCKCAAAggIAIBEHAADDFQAg3wVAAAAAAe0FAQAAAAHuBUAAAAAB8wUAAADoBwKBBgEAAAAB7AYBAAAAAfwGQAAAAAHjB4AAAAAB5AeAAAAAAeYHAAAA5gcC6QcAAADpBwLqB0AAAAAB6wcBAAAAAewHgAAAAAHtBwEAAAAB7geAAAAAAQNeAAC5FwAghAgAALoXACCKCAAAggIAIAjhBUAAAAAB7QUBAAAAAe4FQAAAAAH3BQAA1wwAIPgFAgAAAAH5BQIAAAAB-gUAANgMACD8BQAAAPwFAgIAAACHCQAgXgAAxBUAIAMAAACGAgAgXgAAxBUAIF8AAMgVACAKAAAAhgIAIFcAAMgVACDhBUAAwwwAIe0FAQDBDAAh7gVAAMMMACH3BQAA0wwAIPgFAgDCDAAh-QUCAMIMACH6BQAA1AwAIPwFAADVDPwFIgjhBUAAwwwAIe0FAQDBDAAh7gVAAMMMACH3BQAA0wwAIPgFAgDCDAAh-QUCAMIMACH6BQAA1AwAIPwFAADVDPwFIg4HAADwDAAgSQAA8QwAIO0FAQAAAAHuBUAAAAABgQYBAAAAAYIGAAAAgQYCgwYBAAAAAYQGAQAAAAGFBgEAAAABhgYBAAAAAYcGAQAAAAGIBkAAAAABiQYBAAAAAYsGAAAAiwYCAgAAAMsBACBeAADRFQAgAwAAAMsBACBeAADRFQAgXwAA0BUAIAFXAAC4FwAwAgAAAMsBACBXAADQFQAgAgAAAL8PACBXAADPFQAgDO0FAQDBDAAh7gVAAMMMACGBBgEAyAwAIYIGAADeDIEGIoMGAQDBDAAhhAYBAMEMACGFBgEAwQwAIYYGAQDBDAAhhwYBAMgMACGIBkAAxAwAIYkGAQDIDAAhiwYAAN8MiwYiDgcAAOEMACBJAADiDAAg7QUBAMEMACHuBUAAwwwAIYEGAQDIDAAhggYAAN4MgQYigwYBAMEMACGEBgEAwQwAIYUGAQDBDAAhhgYBAMEMACGHBgEAyAwAIYgGQADEDAAhiQYBAMgMACGLBgAA3wyLBiIOBwAA8AwAIEkAAPEMACDtBQEAAAAB7gVAAAAAAYEGAQAAAAGCBgAAAIEGAoMGAQAAAAGEBgEAAAABhQYBAAAAAYYGAQAAAAGHBgEAAAABiAZAAAAAAYkGAQAAAAGLBgAAAIsGAg4GAAD1EAAgBwAA8xAAIAwAAIESACDfBUAAAAAB7QUBAAAAAe4FQAAAAAGBBgEAAAABoQYBAAAAAfoGAQAAAAGAB0AAAAABggdAAAAAAZwHAQAAAAGdBwEAAAABnwcBAAAAAQIAAAAdACBeAADaFQAgAwAAAB0AIF4AANoVACBfAADZFQAgAVcAALcXADACAAAAHQAgVwAA2RUAIAIAAADsEAAgVwAA2BUAIAvfBUAAwwwAIe0FAQDBDAAh7gVAAMMMACGBBgEAwQwAIaEGAQDIDAAh-gYBAMEMACGAB0AAxAwAIYIHQADEDAAhnAcBAMEMACGdBwEAwQwAIZ8HAQDBDAAhDgYAAPEQACAHAADvEAAgDAAA_xEAIN8FQADDDAAh7QUBAMEMACHuBUAAwwwAIYEGAQDBDAAhoQYBAMgMACH6BgEAwQwAIYAHQADEDAAhggdAAMQMACGcBwEAwQwAIZ0HAQDBDAAhnwcBAMEMACEOBgAA9RAAIAcAAPMQACAMAACBEgAg3wVAAAAAAe0FAQAAAAHuBUAAAAABgQYBAAAAAaEGAQAAAAH6BgEAAAABgAdAAAAAAYIHQAAAAAGcBwEAAAABnQcBAAAAAZ8HAQAAAAEdEAAAjxQAIBMAAJAUACAbAACTFAAgIAAAlBQAICEAAJUUACAiAACWFAAgKAAAlxQAICkAAJgUACA2AACbFAAgNwAAnBQAID0AAJIUACA-AADoFQAgPwAAjhQAIEAAAJEUACBBAACZFAAgQgAAmhQAIEMAAJ0UACBEAACeFAAgRQAAnxQAIEcAAKAUACBIAAChFAAg4QVAAAAAAe0FAQAAAAHuBUAAAAAB8wUAAACnBwLDBkAAAAAB4QYBAAAAAYwHAQAAAAGoBwEAAAABAgAAAIICACBeAADnFQAgAwAAAIICACBeAADnFQAgXwAA5RUAIAFXAAC2FwAwIgYAAPMJACAQAADnCgAgEwAAvgsAIBsAAMELACAgAADCCwAgIQAAwwsAICIAAMQLACAoAADFCwAgKQAAxgsAIDYAAMkLACA3AADKCwAgPQAAwAsAID4AAL0LACA_AADlCgAgQAAAvwsAIEEAAMcLACBCAADICwAgQwAA6AoAIEQAAOoKACBFAADrCgAgRwAA7AoAIEgAAO0KACDaBQAAuwsAMNsFAAAQABDcBQAAuwsAMOEFQADgCQAh7QUBAAAAAe4FQADgCQAh8wUAALwLpwciwwZAAOAJACHhBgEA3gkAIYwHAQDeCQAhpwcBAMEKACGoBwEAAAABAgAAAIICACBXAADlFQAgAgAAAOMVACBXAADkFQAgDNoFAADiFQAw2wUAAOMVABDcBQAA4hUAMOEFQADgCQAh7QUBAMEKACHuBUAA4AkAIfMFAAC8C6cHIsMGQADgCQAh4QYBAN4JACGMBwEA3gkAIacHAQDBCgAhqAcBAJMLACEM2gUAAOIVADDbBQAA4xUAENwFAADiFQAw4QVAAOAJACHtBQEAwQoAIe4FQADgCQAh8wUAALwLpwciwwZAAOAJACHhBgEA3gkAIYwHAQDeCQAhpwcBAMEKACGoBwEAkwsAIQjhBUAAwwwAIe0FAQDBDAAh7gVAAMMMACHzBQAA1A6nByLDBkAAwwwAIeEGAQDBDAAhjAcBAMEMACGoBwEAyAwAIR0QAADXDgAgEwAA2A4AIBsAANsOACAgAADcDgAgIQAA3Q4AICIAAN4OACAoAADfDgAgKQAA4A4AIDYAAOMOACA3AADkDgAgPQAA2g4AID4AAOYVACA_AADWDgAgQAAA2Q4AIEEAAOEOACBCAADiDgAgQwAA5Q4AIEQAAOYOACBFAADnDgAgRwAA6A4AIEgAAOkOACDhBUAAwwwAIe0FAQDBDAAh7gVAAMMMACHzBQAA1A6nByLDBkAAwwwAIeEGAQDBDAAhjAcBAMEMACGoBwEAyAwAIQdeAACxFwAgXwAAtBcAIIQIAACyFwAghQgAALMXACCICAAAEgAgiQgAABIAIIoIAAC5AQAgHRAAAI8UACATAACQFAAgGwAAkxQAICAAAJQUACAhAACVFAAgIgAAlhQAICgAAJcUACApAACYFAAgNgAAmxQAIDcAAJwUACA9AACSFAAgPgAA6BUAID8AAI4UACBAAACRFAAgQQAAmRQAIEIAAJoUACBDAACdFAAgRAAAnhQAIEUAAJ8UACBHAACgFAAgSAAAoRQAIOEFQAAAAAHtBQEAAAAB7gVAAAAAAfMFAAAApwcCwwZAAAAAAeEGAQAAAAGMBwEAAAABqAcBAAAAAQNeAACxFwAghAgAALIXACCKCAAAuQEAIB4HAADzFQAgDgAAhBQAIA8AAIUUACAbAAD5EwAgHgAA-BMAIB8AAPoTACAgAAD7EwAgIQAA_BMAICIAAP0TACAjAAD-EwAgJAAA_xMAICUAAIAUACAoAACBFAAgKQAAghQAICoAAIMUACArAACGFAAgLAAAhxQAIC0AAIgUACAvAACJFAAgNgAAihQAIDcAAIsUACA6AACMFAAg7QUBAAAAAe4FQAAAAAHzBQAAAKMHAoEGAQAAAAGhBwAAAKEHAqMHAgAAAAGkB0AAAAABpQdAAAAAAQIAAAC0AQAgXgAA8hUAIAMAAAC0AQAgXgAA8hUAIF8AAPAVACABVwAAsBcAMAIAAAC0AQAgVwAA8BUAIAIAAACKEgAgVwAA7xUAIAjtBQEAwQwAIe4FQADDDAAh8wUAAI0SowcigQYBAMEMACGhBwAAjBKhByKjBwIArg0AIaQHQADEDAAhpQdAAMQMACEeBwAA8RUAIA4AAJwSACAPAACdEgAgGwAAkRIAIB4AAJASACAfAACSEgAgIAAAkxIAICEAAJQSACAiAACVEgAgIwAAlhIAICQAAJcSACAlAACYEgAgKAAAmRIAICkAAJoSACAqAACbEgAgKwAAnhIAICwAAJ8SACAtAACgEgAgLwAAoRIAIDYAAKISACA3AACjEgAgOgAApBIAIO0FAQDBDAAh7gVAAMMMACHzBQAAjRKjByKBBgEAwQwAIaEHAACMEqEHIqMHAgCuDQAhpAdAAMQMACGlB0AAxAwAIQVeAACrFwAgXwAArhcAIIQIAACsFwAghQgAAK0XACCKCAAAggIAIB4HAADzFQAgDgAAhBQAIA8AAIUUACAbAAD5EwAgHgAA-BMAIB8AAPoTACAgAAD7EwAgIQAA_BMAICIAAP0TACAjAAD-EwAgJAAA_xMAICUAAIAUACAoAACBFAAgKQAAghQAICoAAIMUACArAACGFAAgLAAAhxQAIC0AAIgUACAvAACJFAAgNgAAihQAIDcAAIsUACA6AACMFAAg7QUBAAAAAe4FQAAAAAHzBQAAAKMHAoEGAQAAAAGhBwAAAKEHAqMHAgAAAAGkB0AAAAABpQdAAAAAAQNeAACrFwAghAgAAKwXACCKCAAAggIAIAo4AADXFAAg7QUBAAAAAe4FQAAAAAHzBQAAAPcGAvcGQAAAAAH4BgEAAAAB-QZAAAAAAfoGAQAAAAH7BkAAAAAB_AZAAAAAAQIAAAD-AQAgXgAA_xUAIAMAAAD-AQAgXgAA_xUAIF8AAP4VACABVwAAqhcAMA8DAADzCQAgOAAAzQsAINoFAADLCwAw2wUAAPwBABDcBQAAywsAMO0FAQAAAAHuBUAA4AkAIfMFAADMC_cGIvYFAQDBCgAh9wZAAOAJACH4BgEAkwsAIfkGQADhCQAh-gYBAAAAAfsGQADhCQAh_AZAAOEJACECAAAA_gEAIFcAAP4VACACAAAA_BUAIFcAAP0VACAN2gUAAPsVADDbBQAA_BUAENwFAAD7FQAw7QUBAMEKACHuBUAA4AkAIfMFAADMC_cGIvYFAQDBCgAh9wZAAOAJACH4BgEAkwsAIfkGQADhCQAh-gYBAJQLACH7BkAA4QkAIfwGQADhCQAhDdoFAAD7FQAw2wUAAPwVABDcBQAA-xUAMO0FAQDBCgAh7gVAAOAJACHzBQAAzAv3BiL2BQEAwQoAIfcGQADgCQAh-AYBAJMLACH5BkAA4QkAIfoGAQCUCwAh-wZAAOEJACH8BkAA4QkAIQntBQEAwQwAIe4FQADDDAAh8wUAAMoU9wYi9wZAAMMMACH4BgEAyAwAIfkGQADEDAAh-gYBAMgMACH7BkAAxAwAIfwGQADEDAAhCjgAAMwUACDtBQEAwQwAIe4FQADDDAAh8wUAAMoU9wYi9wZAAMMMACH4BgEAyAwAIfkGQADEDAAh-gYBAMgMACH7BkAAxAwAIfwGQADEDAAhCjgAANcUACDtBQEAAAAB7gVAAAAAAfMFAAAA9wYC9wZAAAAAAfgGAQAAAAH5BkAAAAAB-gYBAAAAAfsGQAAAAAH8BkAAAAABDAQAAOAUACDfBUAAAAAB7QUBAAAAAe4FQAAAAAHwBQEAAAAB-gYBAAAAAf0GAQAAAAH_BgAAAP8GAoAHQAAAAAGBBwEAAAABggdAAAAAAYQHAAAAhAcDAgAAAAkAIF4AAIgWACADAAAACQAgXgAAiBYAIF8AAIcWACABVwAAqRcAMAIAAAAJACBXAACHFgAgAgAAAP8UACBXAACGFgAgC98FQADDDAAh7QUBAMEMACHuBUAAwwwAIfAFAQDIDAAh-gYBAMEMACH9BgEAwQwAIf8GAADbFP8GIoAHQADEDAAhgQcBAMgMACGCB0AAxAwAIYQHAADcFIQHIwwEAADeFAAg3wVAAMMMACHtBQEAwQwAIe4FQADDDAAh8AUBAMgMACH6BgEAwQwAIf0GAQDBDAAh_wYAANsU_wYigAdAAMQMACGBBwEAyAwAIYIHQADEDAAhhAcAANwUhAcjDAQAAOAUACDfBUAAAAAB7QUBAAAAAe4FQAAAAAHwBQEAAAAB-gYBAAAAAf0GAQAAAAH_BgAAAP8GAoAHQAAAAAGBBwEAAAABggdAAAAAAYQHAAAAhAcDBu0FAQAAAAHuBUAAAAABsQYAAACxBgK8BgEAAAABhQdAAAAAAYYHQAAAAAECAAAA-QEAIF4AAJQWACADAAAA-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-AcAALsMACAGBwAAixcAIAgAAIsXACA9AAD_FgAgxAYAALsMACDGBgAAuwwAIMcGAAC7DAAgAAAAAAAAAAAAAAAAAAAXBgAA2gwAIBAAALQWACATAAD9FgAgGwAAgBcAICAAAIEXACAhAACCFwAgIgAAgxcAICgAAIQXACApAACFFwAgNgAAiBcAIDcAAIkXACA9AAD_FgAgPgAA_BYAID8AALIWACBAAAD-FgAgQQAAhhcAIEIAAIcXACBDAAC1FgAgRAAAtxYAIEUAALgWACBHAAC5FgAgSAAAuhYAIKgHAAC7DAAgAAAAAAAAAAAHAwAA2gwAIDgAAIoXACD4BgAAuwwAIPkGAAC7DAAg-gYAALsMACD7BgAAuwwAIPwGAAC7DAAgGgMAANoMACAHAACLFwAgDgAAkhcAIA8AAJMXACAbAACAFwAgHgAAtBYAIB8AAIAXACAgAACBFwAgIQAAghcAICIAAIMXACAjAACQFwAgJAAA_xYAICUAAJEXACAoAACEFwAgKQAAhRcAICoAAIUXACArAACGFwAgLAAAhhcAIC0AAI4XACAvAACPFwAgNgAAiBcAIDcAAIkXACA6AACKFwAgowcAALsMACCkBwAAuwwAIKUHAAC7DAAgDAcAAIsXACAwAACVFwAgMwAAlxcAIDQAAJYXACA1AACIFwAgzgYAALsMACDPBgAAuwwAIJQHAAC7DAAg0gcAALsMACDaBwAAuwwAINsHAAC7DAAg3gcAALsMACAHBwAAixcAIDEAAJUXACAyAACWFwAg0QcAALsMACDWBwAAuwwAINcHAAC7DAAg2AcAALsMACAHBwAAixcAIC0AAI4XACAvAACPFwAg1QYAALsMACDWBgAAuwwAINcGAAC7DAAg2QYAALsMACAPBwAAixcAIAoAAJUXACALAACVFwAgDgAAkhcAIA8AAJMXACAQAAC0FgAgEwAA_RYAIBQAAJsXACAYAACcFwAgxwYAALsMACC1BwAAuwwAILsHAAC7DAAgvQcAALsMACDDBwAAuwwAIMQHAAC7DAAgBwcAAIsXACANAACVFwAgFAAAmxcAIBgAAJwXACClBgAAuwwAIKgGAAC7DAAgqgYAALsMACAKBwAAixcAIAwAAJkXACANAACVFwAgFwAAmhcAIBsAAIAXACCeBgAAuwwAIJ8GAAC7DAAgoAYAALsMACChBgAAuwwAIKIGAAC7DAAgCAcAAIsXACAMAACZFwAgFQAAlRcAIBYAAJUXACAXAACaFwAgoQYAALsMACCiBgAAuwwAIK0HAAC7DAAgCAcAAIsXACANAACVFwAgGQAAnhcAICcAAJ8XACCMBgAAuwwAIJQGAAC7DAAg7gYAALsMACDvBgAAuwwAIAgHAACLFwAgCQAA_BYAIBsAAIAXACAjAACQFwAgKAAAhBcAIDsAAJUXACA8AAD9FgAgvQYAALsMACAABwMAANoMACAHAACLFwAgSQAAjRcAIIEGAAC7DAAghwYAALsMACCIBgAAuwwAIIkGAAC7DAAgBgMAANoMACAFAACwFgAgSQAAjRcAIIIHAAC7DAAgiQcAALsMACCLBwAAuwwAIAkDAACkDwAgBwAAuBUAIOEFQAAAAAHtBQEAAAAB7gVAAAAAAfYFAQAAAAGBBgEAAAAB9wcAAAD3BwL4BwEAAAABAgAAAAEAIF4AAKIXACADAAAA0gEAIF4AAKIXACBfAACmFwAgCwAAANIBACADAACTDwAgBwAAthUAIFcAAKYXACDhBUAAwwwAIe0FAQDBDAAh7gVAAMMMACH2BQEAwQwAIYEGAQDIDAAh9wcAAJEP9wci-AcBAMgMACEJAwAAkw8AIAcAALYVACDhBUAAwwwAIe0FAQDBDAAh7gVAAMMMACH2BQEAwQwAIYEGAQDIDAAh9wcAAJEP9wci-AcBAMgMACEH7QUBAAAAAe4FQAAAAAGCB0AAAAABiAcAAACIBwKJBwEAAAABigdAAAAAAYsHAQAAAAEG7QUBAAAAAe4FQAAAAAGxBgAAALEGArwGAQAAAAGFB0AAAAABhgdAAAAAAQvfBUAAAAAB7QUBAAAAAe4FQAAAAAHwBQEAAAAB-gYBAAAAAf0GAQAAAAH_BgAAAP8GAoAHQAAAAAGBBwEAAAABggdAAAAAAYQHAAAAhAcDCe0FAQAAAAHuBUAAAAAB8wUAAAD3BgL3BkAAAAAB-AYBAAAAAfkGQAAAAAH6BgEAAAAB-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_AADWDgAgQAAA2Q4AIEEAAOEOACBCAADiDgAgQwAA5Q4AIEUAAOcOACBHAADoDgAgSAAA6Q4AIFcAAL0XACDhBUAAwwwAIe0FAQDBDAAh7gVAAMMMACHzBQAA1A6nByLDBkAAwwwAIeEGAQDBDAAhjAcBAMEMACGnBwEAwQwAIagHAQDIDAAhHgYAANUOACAQAADXDgAgEwAA2A4AIBsAANsOACAgAADcDgAgIQAA3Q4AICIAAN4OACAoAADfDgAgKQAA4A4AIDYAAOMOACA3AADkDgAgPQAA2g4AID4AAOYVACA_AADWDgAgQAAA2Q4AIEEAAOEOACBCAADiDgAgQwAA5Q4AIEUAAOcOACBHAADoDgAgSAAA6Q4AIOEFQADDDAAh7QUBAMEMACHuBUAAwwwAIfMFAADUDqcHIsMGQADDDAAh4QYBAMEMACGMBwEAwQwAIacHAQDBDAAhqAcBAMgMACEQ3wVAAAAAAe0FAQAAAAHuBUAAAAAB8wUAAADoBwKBBgEAAAAB7AYBAAAAAfwGQAAAAAHjB4AAAAAB5AeAAAAAAeYHAAAA5gcC6QcAAADpBwLqB0AAAAAB6wcBAAAAAewHgAAAAAHtBwEAAAAB7geAAAAAAR4GAACNFAAgEAAAjxQAIBMAAJAUACAbAACTFAAgIAAAlBQAICEAAJUUACAiAACWFAAgKAAAlxQAICkAAJgUACA2AACbFAAgNwAAnBQAID0AAJIUACA-AADoFQAgPwAAjhQAIEAAAJEUACBBAACZFAAgQgAAmhQAIEMAAJ0UACBEAACeFAAgRwAAoBQAIEgAAKEUACDhBUAAAAAB7QUBAAAAAe4FQAAAAAHzBQAAAKcHAsMGQAAAAAHhBgEAAAABjAcBAAAAAacHAQAAAAGoBwEAAAABAgAAAIICACBeAAC_FwAgAwAAABAAIF4AAL8XACBfAADDFwAgIAAAABAAIAYAANUOACAQAADXDgAgEwAA2A4AIBsAANsOACAgAADcDgAgIQAA3Q4AICIAAN4OACAoAADfDgAgKQAA4A4AIDYAAOMOACA3AADkDgAgPQAA2g4AID4AAOYVACA_AADWDgAgQAAA2Q4AIEEAAOEOACBCAADiDgAgQwAA5Q4AIEQAAOYOACBHAADoDgAgSAAA6Q4AIFcAAMMXACDhBUAAwwwAIe0FAQDBDAAh7gVAAMMMACHzBQAA1A6nByLDBkAAwwwAIeEGAQDBDAAhjAcBAMEMACGnBwEAwQwAIagHAQDIDAAhHgYAANUOACAQAADXDgAgEwAA2A4AIBsAANsOACAgAADcDgAgIQAA3Q4AICIAAN4OACAoAADfDgAgKQAA4A4AIDYAAOMOACA3AADkDgAgPQAA2g4AID4AAOYVACA_AADWDgAgQAAA2Q4AIEEAAOEOACBCAADiDgAgQwAA5Q4AIEQAAOYOACBHAADoDgAgSAAA6Q4AIOEFQADDDAAh7QUBAMEMACHuBUAAwwwAIfMFAADUDqcHIsMGQADDDAAh4QYBAMEMACGMBwEAwQwAIacHAQDBDAAhqAcBAMgMACEG4QVAAAAAAe0FAQAAAAHuBUAAAAABgQYBAAAAAfcHAAAA9wcC-AcBAAAAAR4GAACNFAAgEAAAjxQAIBMAAJAUACAbAACTFAAgIAAAlBQAICEAAJUUACAiAACWFAAgKAAAlxQAICkAAJgUACA2AACbFAAgNwAAnBQAID0AAJIUACA-AADoFQAgPwAAjhQAIEAAAJEUACBBAACZFAAgQgAAmhQAIEMAAJ0UACBEAACeFAAgRQAAnxQAIEgAAKEUACDhBUAAAAAB7QUBAAAAAe4FQAAAAAHzBQAAAKcHAsMGQAAAAAHhBgEAAAABjAcBAAAAAacHAQAAAAGoBwEAAAABAgAAAIICACBeAADFFwAgAwAAABAAIF4AAMUXACBfAADJFwAgIAAAABAAIAYAANUOACAQAADXDgAgEwAA2A4AIBsAANsOACAgAADcDgAgIQAA3Q4AICIAAN4OACAoAADfDgAgKQAA4A4AIDYAAOMOACA3AADkDgAgPQAA2g4AID4AAOYVACA_AADWDgAgQAAA2Q4AIEEAAOEOACBCAADiDgAgQwAA5Q4AIEQAAOYOACBFAADnDgAgSAAA6Q4AIFcAAMkXACDhBUAAwwwAIe0FAQDBDAAh7gVAAMMMACHzBQAA1A6nByLDBkAAwwwAIeEGAQDBDAAhjAcBAMEMACGnBwEAwQwAIagHAQDIDAAhHgYAANUOACAQAADXDgAgEwAA2A4AIBsAANsOACAgAADcDgAgIQAA3Q4AICIAAN4OACAoAADfDgAgKQAA4A4AIDYAAOMOACA3AADkDgAgPQAA2g4AID4AAOYVACA_AADWDgAgQAAA2Q4AIEEAAOEOACBCAADiDgAgQwAA5Q4AIEQAAOYOACBFAADnDgAgSAAA6Q4AIOEFQADDDAAh7QUBAMEMACHuBUAAwwwAIfMFAADUDqcHIsMGQADDDAAh4QYBAMEMACGMBwEAwQwAIacHAQDBDAAhqAcBAMgMACEI7QUBAAAAAe4FQAAAAAHwBQEAAAABgQYBAAAAAecGgAAAAAHgBwEAAAAB4QcBAAAAAeIHAQAAAAEeBgAAjRQAIBAAAI8UACATAACQFAAgGwAAkxQAICAAAJQUACAhAACVFAAgIgAAlhQAICgAAJcUACApAACYFAAgNgAAmxQAIDcAAJwUACA9AACSFAAgPgAA6BUAID8AAI4UACBAAACRFAAgQQAAmRQAIEIAAJoUACBDAACdFAAgRAAAnhQAIEUAAJ8UACBHAACgFAAg4QVAAAAAAe0FAQAAAAHuBUAAAAAB8wUAAACnBwLDBkAAAAAB4QYBAAAAAYwHAQAAAAGnBwEAAAABqAcBAAAAAQIAAACCAgAgXgAAyxcAIAMAAAAQACBeAADLFwAgXwAAzxcAICAAAAAQACAGAADVDgAgEAAA1w4AIBMAANgOACAbAADbDgAgIAAA3A4AICEAAN0OACAiAADeDgAgKAAA3w4AICkAAOAOACA2AADjDgAgNwAA5A4AID0AANoOACA-AADmFQAgPwAA1g4AIEAAANkOACBBAADhDgAgQgAA4g4AIEMAAOUOACBEAADmDgAgRQAA5w4AIEcAAOgOACBXAADPFwAg4QVAAMMMACHtBQEAwQwAIe4FQADDDAAh8wUAANQOpwciwwZAAMMMACHhBgEAwQwAIYwHAQDBDAAhpwcBAMEMACGoBwEAyAwAIR4GAADVDgAgEAAA1w4AIBMAANgOACAbAADbDgAgIAAA3A4AICEAAN0OACAiAADeDgAgKAAA3w4AICkAAOAOACA2AADjDgAgNwAA5A4AID0AANoOACA-AADmFQAgPwAA1g4AIEAAANkOACBBAADhDgAgQgAA4g4AIEMAAOUOACBEAADmDgAgRQAA5w4AIEcAAOgOACDhBUAAwwwAIe0FAQDBDAAh7gVAAMMMACHzBQAA1A6nByLDBkAAwwwAIeEGAQDBDAAhjAcBAMEMACGnBwEAwQwAIagHAQDIDAAhC98FQAAAAAHtBQEAAAAB7gVAAAAAAYEGAQAAAAG0BgAAAM4HAvwGQAAAAAHOBwEAAAABzwcCAAAAAdAHAQAAAAHRBwEAAAAB0gcBAAAAARkFAACjFgAgPwAApRYAIEMAAKgWACBEAACqFgAgRQAAqxYAIEcAAKwWACBIAACtFgAgTAAAohYAIE0AAKQWACBOAACmFgAgTwAApxYAIFAAAKkWACDhBUAAAAAB7QUBAAAAAe4FQAAAAAGQBgAAAJAGAowHAQAAAAGNBwEAAAABjgcBAAAAAY8HAQAAAAGQB0AAAAABkQdAAAAAAZIHQAAAAAGTBwIAAAABlAdAAAAAAQIAAACeBQAgXgAA0RcAIAvfBUAAAAAB7QUBAAAAAe4FQAAAAAH2BQEAAAAB-gYBAAAAAf0GAQAAAAH_BgAAAP8GAoAHQAAAAAGBBwEAAAABggdAAAAAAYQHAAAAhAcDB-0FAQAAAAHuBUAAAAAB7wUBAAAAAfEFAQAAAAHzBQAAAPMFAvQFAQAAAAH1BUAAAAABAwAAAEgAIF4AANEXACBfAADXFwAgGwAAAEgAIAUAAI0VACA_AACPFQAgQwAAkhUAIEQAAJQVACBFAACVFQAgRwAAlhUAIEgAAJcVACBMAACMFQAgTQAAjhUAIE4AAJAVACBPAACRFQAgUAAAkxUAIFcAANcXACDhBUAAwwwAIe0FAQDBDAAh7gVAAMMMACGQBgAA9QyQBiKMBwEAwQwAIY0HAQDBDAAhjgcBAMEMACGPBwEAwQwAIZAHQADDDAAhkQdAAMQMACGSB0AAxAwAIZMHAgDCDAAhlAdAAMQMACEZBQAAjRUAID8AAI8VACBDAACSFQAgRAAAlBUAIEUAAJUVACBHAACWFQAgSAAAlxUAIEwAAIwVACBNAACOFQAgTgAAkBUAIE8AAJEVACBQAACTFQAg4QVAAMMMACHtBQEAwQwAIe4FQADDDAAhkAYAAPUMkAYijAcBAMEMACGNBwEAwQwAIY4HAQDBDAAhjwcBAMEMACGQB0AAwwwAIZEHQADEDAAhkgdAAMQMACGTBwIAwgwAIZQHQADEDAAhGQUAAKMWACA_AAClFgAgQwAAqBYAIEQAAKoWACBFAACrFgAgRwAArBYAIEgAAK0WACBLAAChFgAgTQAApBYAIE4AAKYWACBPAACnFgAgUAAAqRYAIOEFQAAAAAHtBQEAAAAB7gVAAAAAAZAGAAAAkAYCjAcBAAAAAY0HAQAAAAGOBwEAAAABjwcBAAAAAZAHQAAAAAGRB0AAAAABkgdAAAAAAZMHAgAAAAGUB0AAAAABAgAAAJ4FACBeAADYFwAgAwAAAEgAIF4AANgXACBfAADcFwAgGwAAAEgAIAUAAI0VACA_AACPFQAgQwAAkhUAIEQAAJQVACBFAACVFQAgRwAAlhUAIEgAAJcVACBLAACLFQAgTQAAjhUAIE4AAJAVACBPAACRFQAgUAAAkxUAIFcAANwXACDhBUAAwwwAIe0FAQDBDAAh7gVAAMMMACGQBgAA9QyQBiKMBwEAwQwAIY0HAQDBDAAhjgcBAMEMACGPBwEAwQwAIZAHQADDDAAhkQdAAMQMACGSB0AAxAwAIZMHAgDCDAAhlAdAAMQMACEZBQAAjRUAID8AAI8VACBDAACSFQAgRAAAlBUAIEUAAJUVACBHAACWFQAgSAAAlxUAIEsAAIsVACBNAACOFQAgTgAAkBUAIE8AAJEVACBQAACTFQAg4QVAAMMMACHtBQEAwQwAIe4FQADDDAAhkAYAAPUMkAYijAcBAMEMACGNBwEAwQwAIY4HAQDBDAAhjwcBAMEMACGQB0AAwwwAIZEHQADEDAAhkgdAAMQMACGTBwIAwgwAIZQHQADEDAAhCgMAAIMVACBJAACFFQAg7QUBAAAAAe4FQAAAAAH2BQEAAAABggdAAAAAAYgHAAAAiAcCiQcBAAAAAYoHQAAAAAGLBwEAAAABAgAAAAUAIF4AAN0XACAZPwAApRYAIEMAAKgWACBEAACqFgAgRQAAqxYAIEcAAKwWACBIAACtFgAgSwAAoRYAIEwAAKIWACBNAACkFgAgTgAAphYAIE8AAKcWACBQAACpFgAg4QVAAAAAAe0FAQAAAAHuBUAAAAABkAYAAACQBgKMBwEAAAABjQcBAAAAAY4HAQAAAAGPBwEAAAABkAdAAAAAAZEHQAAAAAGSB0AAAAABkwcCAAAAAZQHQAAAAAECAAAAngUAIF4AAN8XACADAAAAAwAgXgAA3RcAIF8AAOMXACAMAAAAAwAgAwAA6xQAIEkAAO0UACBXAADjFwAg7QUBAMEMACHuBUAAwwwAIfYFAQDBDAAhggdAAMQMACGIBwAA6hSIByKJBwEAyAwAIYoHQADDDAAhiwcBAMgMACEKAwAA6xQAIEkAAO0UACDtBQEAwQwAIe4FQADDDAAh9gUBAMEMACGCB0AAxAwAIYgHAADqFIgHIokHAQDIDAAhigdAAMMMACGLBwEAyAwAIQMAAABIACBeAADfFwAgXwAA5hcAIBsAAABIACA_AACPFQAgQwAAkhUAIEQAAJQVACBFAACVFQAgRwAAlhUAIEgAAJcVACBLAACLFQAgTAAAjBUAIE0AAI4VACBOAACQFQAgTwAAkRUAIFAAAJMVACBXAADmFwAg4QVAAMMMACHtBQEAwQwAIe4FQADDDAAhkAYAAPUMkAYijAcBAMEMACGNBwEAwQwAIY4HAQDBDAAhjwcBAMEMACGQB0AAwwwAIZEHQADEDAAhkgdAAMQMACGTBwIAwgwAIZQHQADEDAAhGT8AAI8VACBDAACSFQAgRAAAlBUAIEUAAJUVACBHAACWFQAgSAAAlxUAIEsAAIsVACBMAACMFQAgTQAAjhUAIE4AAJAVACBPAACRFQAgUAAAkxUAIOEFQADDDAAh7QUBAMEMACHuBUAAwwwAIZAGAAD1DJAGIowHAQDBDAAhjQcBAMEMACGOBwEAwQwAIY8HAQDBDAAhkAdAAMMMACGRB0AAxAwAIZIHQADEDAAhkwcCAMIMACGUB0AAxAwAIRkFAACjFgAgPwAApRYAIEMAAKgWACBEAACqFgAgRQAAqxYAIEcAAKwWACBIAACtFgAgSwAAoRYAIEwAAKIWACBOAACmFgAgTwAApxYAIFAAAKkWACDhBUAAAAAB7QUBAAAAAe4FQAAAAAGQBgAAAJAGAowHAQAAAAGNBwEAAAABjgcBAAAAAY8HAQAAAAGQB0AAAAABkQdAAAAAAZIHQAAAAAGTBwIAAAABlAdAAAAAAQIAAACeBQAgXgAA5xcAIATtBQEAAAAB7gVAAAAAAYEGAQAAAAGMBgEAAAABAwAAAEgAIF4AAOcXACBfAADsFwAgGwAAAEgAIAUAAI0VACA_AACPFQAgQwAAkhUAIEQAAJQVACBFAACVFQAgRwAAlhUAIEgAAJcVACBLAACLFQAgTAAAjBUAIE4AAJAVACBPAACRFQAgUAAAkxUAIFcAAOwXACDhBUAAwwwAIe0FAQDBDAAh7gVAAMMMACGQBgAA9QyQBiKMBwEAwQwAIY0HAQDBDAAhjgcBAMEMACGPBwEAwQwAIZAHQADDDAAhkQdAAMQMACGSB0AAxAwAIZMHAgDCDAAhlAdAAMQMACEZBQAAjRUAID8AAI8VACBDAACSFQAgRAAAlBUAIEUAAJUVACBHAACWFQAgSAAAlxUAIEsAAIsVACBMAACMFQAgTgAAkBUAIE8AAJEVACBQAACTFQAg4QVAAMMMACHtBQEAwQwAIe4FQADDDAAhkAYAAPUMkAYijAcBAMEMACGNBwEAwQwAIY4HAQDBDAAhjwcBAMEMACGQB0AAwwwAIZEHQADEDAAhkgdAAMQMACGTBwIAwgwAIZQHQADEDAAhHwMAAPcTACAHAADzFQAgDgAAhBQAIA8AAIUUACAbAAD5EwAgHgAA-BMAIB8AAPoTACAgAAD7EwAgIQAA_BMAICIAAP0TACAjAAD-EwAgJAAA_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_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-QZAAMQMACH6BgEAyAwAIfsGQADEDAAh_AZAAMQMACELAwAAyxQAIO0FAQDBDAAh7gVAAMMMACHzBQAAyhT3BiL2BQEAwQwAIfcGQADDDAAh-AYBAMgMACH5BkAAxAwAIfoGAQDIDAAh-wZAAMQMACH8BkAAxAwAIQTtBQEAAAAB7gVAAAAAAYEGAQAAAAH1BgEAAAABAwAAAEgAIF4AAIAYACBfAAC8GAAgGwAAAEgAIAUAAI0VACBDAACSFQAgRAAAlBUAIEUAAJUVACBHAACWFQAgSAAAlxUAIEsAAIsVACBMAACMFQAgTQAAjhUAIE4AAJAVACBPAACRFQAgUAAAkxUAIFcAALwYACDhBUAAwwwAIe0FAQDBDAAh7gVAAMMMACGQBgAA9QyQBiKMBwEAwQwAIY0HAQDBDAAhjgcBAMEMACGPBwEAwQwAIZAHQADDDAAhkQdAAMQMACGSB0AAxAwAIZMHAgDCDAAhlAdAAMQMACEZBQAAjRUAIEMAAJIVACBEAACUFQAgRQAAlRUAIEcAAJYVACBIAACXFQAgSwAAixUAIEwAAIwVACBNAACOFQAgTgAAkBUAIE8AAJEVACBQAACTFQAg4QVAAMMMACHtBQEAwQwAIe4FQADDDAAhkAYAAPUMkAYijAcBAMEMACGNBwEAwQwAIY4HAQDBDAAhjwcBAMEMACGQB0AAwwwAIZEHQADEDAAhkgdAAMQMACGTBwIAwgwAIZQHQADEDAAhCO0FAQAAAAHuBUAAAAAB8wUAAACjBwL2BQEAAAABoQcAAAChBwKjBwIAAAABpAdAAAAAAaUHQAAAAAEdBwAAjxMAIAoAAJYRACALAACXEQAgDgAAmBEAIA8AAJkRACATAACbEQAgFAAAnBEAIBgAAJ0RACDtBQEAAAAB7gVAAAAAAfMFAAAAwwcCgQYBAAAAAccGQAAAAAHsBgAAALQHArQHgAAAAAG1BwEAAAABtgcBAAAAAbcHIAAAAAG5BwAAALkHAroHAACUEQAguwcBAAAAAbwHAACVEQAgvQdAAAAAAb4HAgAAAAG_BwIAAAABwAdAAAAAAcEHQAAAAAHDB0AAAAABxAeAAAAAAQIAAABrACBeAAC-GAAgAwAAAB8AIF4AAL4YACBfAADCGAAgHwAAAB8AIAcAAI0TACAKAADHEAAgCwAAyBAAIA4AAMkQACAPAADKEAAgEwAAzBAAIBQAAM0QACAYAADOEAAgVwAAwhgAIO0FAQDBDAAh7gVAAMMMACHzBQAAxRDDByKBBgEAwQwAIccGQADEDAAh7AYAAMEQtAcitAeAAAAAAbUHAQDIDAAhtgcBAMEMACG3ByAA1w8AIbkHAADCELkHIroHAADDEAAguwcBAMgMACG8BwAAxBAAIL0HQADEDAAhvgcCAMIMACG_BwIAwgwAIcAHQADDDAAhwQdAAMMMACHDB0AAxAwAIcQHgAAAAAEdBwAAjRMAIAoAAMcQACALAADIEAAgDgAAyRAAIA8AAMoQACATAADMEAAgFAAAzRAAIBgAAM4QACDtBQEAwQwAIe4FQADDDAAh8wUAAMUQwwcigQYBAMEMACHHBkAAxAwAIewGAADBELQHIrQHgAAAAAG1BwEAyAwAIbYHAQDBDAAhtwcgANcPACG5BwAAwhC5ByK6BwAAwxAAILsHAQDIDAAhvAcAAMQQACC9B0AAxAwAIb4HAgDCDAAhvwcCAMIMACHAB0AAwwwAIcEHQADDDAAhwwdAAMQMACHEB4AAAAABC98FQAAAAAHtBQEAAAAB7gVAAAAAAaEGAQAAAAH6BgEAAAABgAdAAAAAAYIHQAAAAAGcBwEAAAABnQcBAAAAAZ4HAQAAAAGfBwEAAAABBu0FAQAAAAHuBUAAAAABmAcCAAAAAZkHgAAAAAGaBwEAAAABmwcBAAAAAQntBQEAAAAB7gVAAAAAAbwGAgAAAAHCBgAAAMIGAsMGQAAAAAHEBgEAAAABxQYAAOsRACDGBkAAAAABxwZAAAAAAQntBQEAAAAB7gVAAAAAAfMFAAAAwAYCtwZAAAAAAbsGAQAAAAG8BgIAAAABvQYBAAAAAb4GQAAAAAHABgIAAAABDO0FAQAAAAHuBUAAAAAB8wUAAAC5BgKMBgEAAAABlAYBAAAAAZUGAgAAAAG0BgAAALQGArUGAQAAAAG2BgEAAAABtwZAAAAAAbkGQAAAAAG6BiAAAAABD-EFQAAAAAHtBQEAAAAB7gVAAAAAAfMFAAAArQYCjAYBAAAAAZUGAgAAAAGmBgEAAAABpwYBAAAAAagGAQAAAAGqBkAAAAABqwYAANcNACCtBgIAAAABrwYAAACvBgOxBgAAALEGA7IGAQAAAAEN4QVAAAAAAe0FAQAAAAHuBUAAAAAB8wUAAACqBgKMBgEAAAABlQYCAAAAAZsGAgAAAAGkBgAAAKQGAqUGAgAAAAGmBgEAAAABpwYBAAAAAagGAQAAAAGqBkAAAAABEOEFQAAAAAHtBQEAAAAB7gVAAAAAAfMFAAAAngYCjAYBAAAAAZcGAgAAAAGYBgIAAAABmQYCAAAAAZoGAgAAAAGbBgIAAAABnAYCAAAAAZ4GAQAAAAGfBgEAAAABoAZAAAAAAaEGAQAAAAGiBgEAAAABEAcAALIOACAJAACzDgAgGwAAtQ4AICMAALYOACA7AAC0DgAgPAAAuA4AIO0FAQAAAAHuBUAAAAAB8wUAAADABgKBBgEAAAABtwZAAAAAAbsGAQAAAAG8BgIAAAABvQYBAAAAAb4GQAAAAAHABgIAAAABAgAAABcAIF4AAMsYACADAAAAFQAgXgAAyxgAIF8AAM8YACASAAAAFQAgBwAA5w0AIAkAAOgNACAbAADqDQAgIwAA6w0AIDsAAOkNACA8AADtDQAgVwAAzxgAIO0FAQDBDAAh7gVAAMMMACHzBQAA5g3ABiKBBgEAwQwAIbcGQADDDAAhuwYBAMEMACG8BgIAwgwAIb0GAQDIDAAhvgZAAMMMACHABgIAwgwAIRAHAADnDQAgCQAA6A0AIBsAAOoNACAjAADrDQAgOwAA6Q0AIDwAAO0NACDtBQEAwQwAIe4FQADDDAAh8wUAAOYNwAYigQYBAMEMACG3BkAAwwwAIbsGAQDBDAAhvAYCAMIMACG9BgEAyAwAIb4GQADDDAAhwAYCAMIMACEO7QUBAAAAAe4FQAAAAAGMBgEAAAABlAYBAAAAAeoGAgAAAAHsBgAAAOwGAu0GQAAAAAHuBgEAAAAB7wYBAAAAAfAGAQAAAAHxBgEAAAAB8gaAAAAAAfMGAQAAAAH0BgEAAAABHwMAAPcTACAHAADzFQAgDgAAhBQAIA8AAIUUACAbAAD5EwAgHgAA-BMAIB8AAPoTACAgAAD7EwAgIQAA_BMAICIAAP0TACAjAAD-EwAgJAAA_xMAICUAAIAUACAoAACBFAAgKQAAghQAICsAAIYUACAsAACHFAAgLQAAiBQAIC8AAIkUACA2AACKFAAgNwAAixQAIDoAAIwUACDtBQEAAAAB7gVAAAAAAfMFAAAAowcC9gUBAAAAAYEGAQAAAAGhBwAAAKEHAqMHAgAAAAGkB0AAAAABpQdAAAAAAQIAAAC0AQAgXgAA0RgAIB8DAAD3EwAgBwAA8xUAIA4AAIQUACAPAACFFAAgGwAA-RMAIB4AAPgTACAfAAD6EwAgIAAA-xMAICEAAPwTACAiAAD9EwAgIwAA_hMAICQAAP8TACAlAACAFAAgKAAAgRQAICoAAIMUACArAACGFAAgLAAAhxQAIC0AAIgUACAvAACJFAAgNgAAihQAIDcAAIsUACA6AACMFAAg7QUBAAAAAe4FQAAAAAHzBQAAAKMHAvYFAQAAAAGBBgEAAAABoQcAAAChBwKjBwIAAAABpAdAAAAAAaUHQAAAAAECAAAAtAEAIF4AANMYACAfAwAA9xMAIAcAAPMVACAPAACFFAAgGwAA-RMAIB4AAPgTACAfAAD6EwAgIAAA-xMAICEAAPwTACAiAAD9EwAgIwAA_hMAICQAAP8TACAlAACAFAAgKAAAgRQAICkAAIIUACAqAACDFAAgKwAAhhQAICwAAIcUACAtAACIFAAgLwAAiRQAIDYAAIoUACA3AACLFAAgOgAAjBQAIO0FAQAAAAHuBUAAAAAB8wUAAACjBwL2BQEAAAABgQYBAAAAAaEHAAAAoQcCowcCAAAAAaQHQAAAAAGlB0AAAAABAgAAALQBACBeAADVGAAgAwAAABkAIF4AANUYACBfAADZGAAgIQAAABkAIAMAAI8SACAHAADxFQAgDwAAnRIAIBsAAJESACAeAACQEgAgHwAAkhIAICAAAJMSACAhAACUEgAgIgAAlRIAICMAAJYSACAkAACXEgAgJQAAmBIAICgAAJkSACApAACaEgAgKgAAmxIAICsAAJ4SACAsAACfEgAgLQAAoBIAIC8AAKESACA2AACiEgAgNwAAoxIAIDoAAKQSACBXAADZGAAg7QUBAMEMACHuBUAAwwwAIfMFAACNEqMHIvYFAQDBDAAhgQYBAMEMACGhBwAAjBKhByKjBwIArg0AIaQHQADEDAAhpQdAAMQMACEfAwAAjxIAIAcAAPEVACAPAACdEgAgGwAAkRIAIB4AAJASACAfAACSEgAgIAAAkxIAICEAAJQSACAiAACVEgAgIwAAlhIAICQAAJcSACAlAACYEgAgKAAAmRIAICkAAJoSACAqAACbEgAgKwAAnhIAICwAAJ8SACAtAACgEgAgLwAAoRIAIDYAAKISACA3AACjEgAgOgAApBIAIO0FAQDBDAAh7gVAAMMMACHzBQAAjRKjByL2BQEAwQwAIYEGAQDBDAAhoQcAAIwSoQciowcCAK4NACGkB0AAxAwAIaUHQADEDAAhBO0FAQAAAAHuBUAAAAABjAYBAAAAAbIHQAAAAAEfAwAA9xMAIAcAAPMVACAOAACEFAAgGwAA-RMAIB4AAPgTACAfAAD6EwAgIAAA-xMAICEAAPwTACAiAAD9EwAgIwAA_hMAICQAAP8TACAlAACAFAAgKAAAgRQAICkAAIIUACAqAACDFAAgKwAAhhQAICwAAIcUACAtAACIFAAgLwAAiRQAIDYAAIoUACA3AACLFAAgOgAAjBQAIO0FAQAAAAHuBUAAAAAB8wUAAACjBwL2BQEAAAABgQYBAAAAAaEHAAAAoQcCowcCAAAAAaQHQAAAAAGlB0AAAAABAgAAALQBACBeAADbGAAgAwAAABkAIF4AANsYACBfAADfGAAgIQAAABkAIAMAAI8SACAHAADxFQAgDgAAnBIAIBsAAJESACAeAACQEgAgHwAAkhIAICAAAJMSACAhAACUEgAgIgAAlRIAICMAAJYSACAkAACXEgAgJQAAmBIAICgAAJkSACApAACaEgAgKgAAmxIAICsAAJ4SACAsAACfEgAgLQAAoBIAIC8AAKESACA2AACiEgAgNwAAoxIAIDoAAKQSACBXAADfGAAg7QUBAMEMACHuBUAAwwwAIfMFAACNEqMHIvYFAQDBDAAhgQYBAMEMACGhBwAAjBKhByKjBwIArg0AIaQHQADEDAAhpQdAAMQMACEfAwAAjxIAIAcAAPEVACAOAACcEgAgGwAAkRIAIB4AAJASACAfAACSEgAgIAAAkxIAICEAAJQSACAiAACVEgAgIwAAlhIAICQAAJcSACAlAACYEgAgKAAAmRIAICkAAJoSACAqAACbEgAgKwAAnhIAICwAAJ8SACAtAACgEgAgLwAAoRIAIDYAAKISACA3AACjEgAgOgAApBIAIO0FAQDBDAAh7gVAAMMMACHzBQAAjRKjByL2BQEAwQwAIYEGAQDBDAAhoQcAAIwSoQciowcCAK4NACGkB0AAxAwAIaUHQADEDAAhBe0FAQAAAAHuBUAAAAABjAYBAAAAAbAHAAAAsAcCsQdAAAAAAR8DAAD3EwAgBwAA8xUAIA4AAIQUACAPAACFFAAgGwAA-RMAIB8AAPoTACAgAAD7EwAgIQAA_BMAICIAAP0TACAjAAD-EwAgJAAA_xMAICUAAIAUACAoAACBFAAgKQAAghQAICoAAIMUACArAACGFAAgLAAAhxQAIC0AAIgUACAvAACJFAAgNgAAihQAIDcAAIsUACA6AACMFAAg7QUBAAAAAe4FQAAAAAHzBQAAAKMHAvYFAQAAAAGBBgEAAAABoQcAAAChBwKjBwIAAAABpAdAAAAAAaUHQAAAAAECAAAAtAEAIF4AAOEYACAZBQAAoxYAID8AAKUWACBDAACoFgAgRAAAqhYAIEUAAKsWACBHAACsFgAgSAAArRYAIEsAAKEWACBMAACiFgAgTQAApBYAIE4AAKYWACBQAACpFgAg4QVAAAAAAe0FAQAAAAHuBUAAAAABkAYAAACQBgKMBwEAAAABjQcBAAAAAY4HAQAAAAGPBwEAAAABkAdAAAAAAZEHQAAAAAGSB0AAAAABkwcCAAAAAZQHQAAAAAECAAAAngUAIF4AAOMYACAeBgAAjRQAIBMAAJAUACAbAACTFAAgIAAAlBQAICEAAJUUACAiAACWFAAgKAAAlxQAICkAAJgUACA2AACbFAAgNwAAnBQAID0AAJIUACA-AADoFQAgPwAAjhQAIEAAAJEUACBBAACZFAAgQgAAmhQAIEMAAJ0UACBEAACeFAAgRQAAnxQAIEcAAKAUACBIAAChFAAg4QVAAAAAAe0FAQAAAAHuBUAAAAAB8wUAAACnBwLDBkAAAAAB4QYBAAAAAYwHAQAAAAGnBwEAAAABqAcBAAAAAQIAAACCAgAgXgAA5RgAIAMAAAAZACBeAADhGAAgXwAA6RgAICEAAAAZACADAACPEgAgBwAA8RUAIA4AAJwSACAPAACdEgAgGwAAkRIAIB8AAJISACAgAACTEgAgIQAAlBIAICIAAJUSACAjAACWEgAgJAAAlxIAICUAAJgSACAoAACZEgAgKQAAmhIAICoAAJsSACArAACeEgAgLAAAnxIAIC0AAKASACAvAAChEgAgNgAAohIAIDcAAKMSACA6AACkEgAgVwAA6RgAIO0FAQDBDAAh7gVAAMMMACHzBQAAjRKjByL2BQEAwQwAIYEGAQDBDAAhoQcAAIwSoQciowcCAK4NACGkB0AAxAwAIaUHQADEDAAhHwMAAI8SACAHAADxFQAgDgAAnBIAIA8AAJ0SACAbAACREgAgHwAAkhIAICAAAJMSACAhAACUEgAgIgAAlRIAICMAAJYSACAkAACXEgAgJQAAmBIAICgAAJkSACApAACaEgAgKgAAmxIAICsAAJ4SACAsAACfEgAgLQAAoBIAIC8AAKESACA2AACiEgAgNwAAoxIAIDoAAKQSACDtBQEAwQwAIe4FQADDDAAh8wUAAI0Sowci9gUBAMEMACGBBgEAwQwAIaEHAACMEqEHIqMHAgCuDQAhpAdAAMQMACGlB0AAxAwAIQMAAABIACBeAADjGAAgXwAA7BgAIBsAAABIACAFAACNFQAgPwAAjxUAIEMAAJIVACBEAACUFQAgRQAAlRUAIEcAAJYVACBIAACXFQAgSwAAixUAIEwAAIwVACBNAACOFQAgTgAAkBUAIFAAAJMVACBXAADsGAAg4QVAAMMMACHtBQEAwQwAIe4FQADDDAAhkAYAAPUMkAYijAcBAMEMACGNBwEAwQwAIY4HAQDBDAAhjwcBAMEMACGQB0AAwwwAIZEHQADEDAAhkgdAAMQMACGTBwIAwgwAIZQHQADEDAAhGQUAAI0VACA_AACPFQAgQwAAkhUAIEQAAJQVACBFAACVFQAgRwAAlhUAIEgAAJcVACBLAACLFQAgTAAAjBUAIE0AAI4VACBOAACQFQAgUAAAkxUAIOEFQADDDAAh7QUBAMEMACHuBUAAwwwAIZAGAAD1DJAGIowHAQDBDAAhjQcBAMEMACGOBwEAwQwAIY8HAQDBDAAhkAdAAMMMACGRB0AAxAwAIZIHQADEDAAhkwcCAMIMACGUB0AAxAwAIQMAAAAQACBeAADlGAAgXwAA7xgAICAAAAAQACAGAADVDgAgEwAA2A4AIBsAANsOACAgAADcDgAgIQAA3Q4AICIAAN4OACAoAADfDgAgKQAA4A4AIDYAAOMOACA3AADkDgAgPQAA2g4AID4AAOYVACA_AADWDgAgQAAA2Q4AIEEAAOEOACBCAADiDgAgQwAA5Q4AIEQAAOYOACBFAADnDgAgRwAA6A4AIEgAAOkOACBXAADvGAAg4QVAAMMMACHtBQEAwQwAIe4FQADDDAAh8wUAANQOpwciwwZAAMMMACHhBgEAwQwAIYwHAQDBDAAhpwcBAMEMACGoBwEAyAwAIR4GAADVDgAgEwAA2A4AIBsAANsOACAgAADcDgAgIQAA3Q4AICIAAN4OACAoAADfDgAgKQAA4A4AIDYAAOMOACA3AADkDgAgPQAA2g4AID4AAOYVACA_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-RMAIB4AAPgTACAfAAD6EwAgIAAA-xMAICEAAPwTACAiAAD9EwAgIwAA_hMAICQAAP8TACAlAACAFAAgKAAAgRQAICkAAIIUACAqAACDFAAgKwAAhhQAICwAAIcUACAvAACJFAAgNgAAihQAIDcAAIsUACA6AACMFAAg7QUBAAAAAe4FQAAAAAHzBQAAAKMHAvYFAQAAAAGBBgEAAAABoQcAAAChBwKjBwIAAAABpAdAAAAAAaUHQAAAAAECAAAAtAEAIF4AAIQZACADAAAAGQAgXgAAhBkAIF8AAIgZACAhAAAAGQAgAwAAjxIAIAcAAPEVACAOAACcEgAgDwAAnRIAIBsAAJESACAeAACQEgAgHwAAkhIAICAAAJMSACAhAACUEgAgIgAAlRIAICMAAJYSACAkAACXEgAgJQAAmBIAICgAAJkSACApAACaEgAgKgAAmxIAICsAAJ4SACAsAACfEgAgLwAAoRIAIDYAAKISACA3AACjEgAgOgAApBIAIFcAAIgZACDtBQEAwQwAIe4FQADDDAAh8wUAAI0Sowci9gUBAMEMACGBBgEAwQwAIaEHAACMEqEHIqMHAgCuDQAhpAdAAMQMACGlB0AAxAwAIR8DAACPEgAgBwAA8RUAIA4AAJwSACAPAACdEgAgGwAAkRIAIB4AAJASACAfAACSEgAgIAAAkxIAICEAAJQSACAiAACVEgAgIwAAlhIAICQAAJcSACAlAACYEgAgKAAAmRIAICkAAJoSACAqAACbEgAgKwAAnhIAICwAAJ8SACAvAAChEgAgNgAAohIAIDcAAKMSACA6AACkEgAg7QUBAMEMACHuBUAAwwwAIfMFAACNEqMHIvYFAQDBDAAhgQYBAMEMACGhBwAAjBKhByKjBwIArg0AIaQHQADEDAAhpQdAAMQMACEF7QUBAAAAAe4FQAAAAAHOBgEAAAABzwYBAAAAAdEGAAAA0QYCHwMAAPcTACAHAADzFQAgDgAAhBQAIA8AAIUUACAbAAD5EwAgHgAA-BMAIB8AAPoTACAgAAD7EwAgIQAA_BMAICIAAP0TACAjAAD-EwAgJAAA_xMAICUAAIAUACAoAACBFAAgKQAAghQAICoAAIMUACArAACGFAAgLAAAhxQAIC0AAIgUACA2AACKFAAgNwAAixQAIDoAAIwUACDtBQEAAAAB7gVAAAAAAfMFAAAAowcC9gUBAAAAAYEGAQAAAAGhBwAAAKEHAqMHAgAAAAGkB0AAAAABpQdAAAAAAQIAAAC0AQAgXgAAihkAIAMAAAAZACBeAACKGQAgXwAAjhkAICEAAAAZACADAACPEgAgBwAA8RUAIA4AAJwSACAPAACdEgAgGwAAkRIAIB4AAJASACAfAACSEgAgIAAAkxIAICEAAJQSACAiAACVEgAgIwAAlhIAICQAAJcSACAlAACYEgAgKAAAmRIAICkAAJoSACAqAACbEgAgKwAAnhIAICwAAJ8SACAtAACgEgAgNgAAohIAIDcAAKMSACA6AACkEgAgVwAAjhkAIO0FAQDBDAAh7gVAAMMMACHzBQAAjRKjByL2BQEAwQwAIYEGAQDBDAAhoQcAAIwSoQciowcCAK4NACGkB0AAxAwAIaUHQADEDAAhHwMAAI8SACAHAADxFQAgDgAAnBIAIA8AAJ0SACAbAACREgAgHgAAkBIAIB8AAJISACAgAACTEgAgIQAAlBIAICIAAJUSACAjAACWEgAgJAAAlxIAICUAAJgSACAoAACZEgAgKQAAmhIAICoAAJsSACArAACeEgAgLAAAnxIAIC0AAKASACA2AACiEgAgNwAAoxIAIDoAAKQSACDtBQEAwQwAIe4FQADDDAAh8wUAAI0Sowci9gUBAMEMACGBBgEAwQwAIaEHAACMEqEHIqMHAgCuDQAhpAdAAMQMACGlB0AAxAwAIQjtBQEAAAAB7gVAAAAAAYwGAQAAAAHJBiAAAAABygYgAAAAAcsGAQAAAAHMBkAAAAABzQYBAAAAAQrtBQEAAAAB7gVAAAAAAfMFAAAA1QYC0gZAAAAAAdMGAQAAAAHVBoAAAAAB1gYBAAAAAdcGAQAAAAHYBgIAAAAB2QZAAAAAAQztBQEAAAAB7gVAAAAAAbQGAAAA2gcCzgYBAAAAAc8GAQAAAAGUB0AAAAAB0gcBAAAAAdoHgAAAAAHbBwEAAAAB3AcAAOkPACDdByAAAAAB3gdAAAAAAR8DAAD3EwAgBwAA8xUAIA4AAIQUACAPAACFFAAgGwAA-RMAIB4AAPgTACAfAAD6EwAgIAAA-xMAICEAAPwTACAiAAD9EwAgIwAA_hMAICQAAP8TACAlAACAFAAgKAAAgRQAICkAAIIUACAqAACDFAAgKwAAhhQAICwAAIcUACAtAACIFAAgLwAAiRQAIDYAAIoUACA6AACMFAAg7QUBAAAAAe4FQAAAAAHzBQAAAKMHAvYFAQAAAAGBBgEAAAABoQcAAAChBwKjBwIAAAABpAdAAAAAAaUHQAAAAAECAAAAtAEAIF4AAJIZACARBwAA6g8AIDAAAOsPACAzAADsDwAgNAAA7g8AIO0FAQAAAAHuBUAAAAABgQYBAAAAAbQGAAAA2gcCzgYBAAAAAc8GAQAAAAGUB0AAAAAB0gcBAAAAAdoHgAAAAAHbBwEAAAAB3AcAAOkPACDdByAAAAAB3gdAAAAAAQIAAACDAQAgXgAAlBkAIA4HAAC9EgAgMQAA8A8AIO0FAQAAAAHuBUAAAAABgQYBAAAAAbQGAAAAzgcC0AcBAAAAAdEHAQAAAAHTBwEAAAAB1AcBAAAAAdUHAgAAAAHWBwIAAAAB1wcCAAAAAdgHAgAAAAECAAAAjQEAIF4AAJYZACAfAwAA9xMAIAcAAPMVACAOAACEFAAgDwAAhRQAIBsAAPkTACAeAAD4EwAgHwAA-hMAICAAAPsTACAhAAD8EwAgIgAA_RMAICMAAP4TACAkAAD_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_AAClFgAgQwAAqBYAIEUAAKsWACBHAACsFgAgSAAArRYAIEsAAKEWACBMAACiFgAgTQAApBYAIE4AAKYWACBPAACnFgAgUAAAqRYAIOEFQAAAAAHtBQEAAAAB7gVAAAAAAZAGAAAAkAYCjAcBAAAAAY0HAQAAAAGOBwEAAAABjwcBAAAAAZAHQAAAAAGRB0AAAAABkgdAAAAAAZMHAgAAAAGUB0AAAAABAgAAAJ4FACBeAACuGQAgAwAAAEgAIF4AAK4ZACBfAACyGQAgGwAAAEgAIAUAAI0VACA_AACPFQAgQwAAkhUAIEUAAJUVACBHAACWFQAgSAAAlxUAIEsAAIsVACBMAACMFQAgTQAAjhUAIE4AAJAVACBPAACRFQAgUAAAkxUAIFcAALIZACDhBUAAwwwAIe0FAQDBDAAh7gVAAMMMACGQBgAA9QyQBiKMBwEAwQwAIY0HAQDBDAAhjgcBAMEMACGPBwEAwQwAIZAHQADDDAAhkQdAAMQMACGSB0AAxAwAIZMHAgDCDAAhlAdAAMQMACEZBQAAjRUAID8AAI8VACBDAACSFQAgRQAAlRUAIEcAAJYVACBIAACXFQAgSwAAixUAIEwAAIwVACBNAACOFQAgTgAAkBUAIE8AAJEVACBQAACTFQAg4QVAAMMMACHtBQEAwQwAIe4FQADDDAAhkAYAAPUMkAYijAcBAMEMACGNBwEAwQwAIY4HAQDBDAAhjwcBAMEMACGQB0AAwwwAIZEHQADEDAAhkgdAAMQMACGTBwIAwgwAIZQHQADEDAAhEN8FQAAAAAHtBQEAAAAB7gVAAAAAAfMFAAAA6AcC9gUBAAAAAewGAQAAAAH8BkAAAAAB4weAAAAAAeQHgAAAAAHmBwAAAOYHAukHAAAA6QcC6gdAAAAAAesHAQAAAAHsB4AAAAAB7QcBAAAAAe4HgAAAAAEZBQAAoxYAID8AAKUWACBDAACoFgAgRAAAqhYAIEcAAKwWACBIAACtFgAgSwAAoRYAIEwAAKIWACBNAACkFgAgTgAAphYAIE8AAKcWACBQAACpFgAg4QVAAAAAAe0FAQAAAAHuBUAAAAABkAYAAACQBgKMBwEAAAABjQcBAAAAAY4HAQAAAAGPBwEAAAABkAdAAAAAAZEHQAAAAAGSB0AAAAABkwcCAAAAAZQHQAAAAAECAAAAngUAIF4AALQZACAH7QUBAAAAAe4FQAAAAAGhBwAAAPEHAvEHAQAAAAHyBwEAAAAB8weAAAAAAfUHAAAA9QcDAwAAAEgAIF4AALQZACBfAAC5GQAgGwAAAEgAIAUAAI0VACA_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_AZAAAAAAc4HAQAAAAHPBwIAAAAB0AcBAAAAAdEHAQAAAAHSBwEAAAABAwAAAEgAIF4AAP4XACBfAADJGQAgGwAAAEgAIAUAAI0VACA_AACPFQAgQwAAkhUAIEQAAJQVACBFAACVFQAgRwAAlhUAIEgAAJcVACBLAACLFQAgTAAAjBUAIE0AAI4VACBPAACRFQAgUAAAkxUAIFcAAMkZACDhBUAAwwwAIe0FAQDBDAAh7gVAAMMMACGQBgAA9QyQBiKMBwEAwQwAIY0HAQDBDAAhjgcBAMEMACGPBwEAwQwAIZAHQADDDAAhkQdAAMQMACGSB0AAxAwAIZMHAgDCDAAhlAdAAMQMACEZBQAAjRUAID8AAI8VACBDAACSFQAgRAAAlBUAIEUAAJUVACBHAACWFQAgSAAAlxUAIEsAAIsVACBMAACMFQAgTQAAjhUAIE8AAJEVACBQAACTFQAg4QVAAMMMACHtBQEAwQwAIe4FQADDDAAhkAYAAPUMkAYijAcBAMEMACGNBwEAwQwAIY4HAQDBDAAhjwcBAMEMACGQB0AAwwwAIZEHQADEDAAhkgdAAMQMACGTBwIAwgwAIZQHQADEDAAhCe0FAQAAAAHuBUAAAAAB8wUAAADABgKBBgEAAAABtwZAAAAAAbwGAgAAAAG9BgEAAAABvgZAAAAAAcAGAgAAAAEDAAAAEAAgXgAA_BcAIF8AAM0ZACAgAAAAEAAgBgAA1Q4AIBAAANcOACATAADYDgAgGwAA2w4AICAAANwOACAhAADdDgAgIgAA3g4AICgAAN8OACApAADgDgAgNgAA4w4AIDcAAOQOACA9AADaDgAgPgAA5hUAID8AANYOACBBAADhDgAgQgAA4g4AIEMAAOUOACBEAADmDgAgRQAA5w4AIEcAAOgOACBIAADpDgAgVwAAzRkAIOEFQADDDAAh7QUBAMEMACHuBUAAwwwAIfMFAADUDqcHIsMGQADDDAAh4QYBAMEMACGMBwEAwQwAIacHAQDBDAAhqAcBAMgMACEeBgAA1Q4AIBAAANcOACATAADYDgAgGwAA2w4AICAAANwOACAhAADdDgAgIgAA3g4AICgAAN8OACApAADgDgAgNgAA4w4AIDcAAOQOACA9AADaDgAgPgAA5hUAID8AANYOACBBAADhDgAgQgAA4g4AIEMAAOUOACBEAADmDgAgRQAA5w4AIEcAAOgOACBIAADpDgAg4QVAAMMMACHtBQEAwQwAIe4FQADDDAAh8wUAANQOpwciwwZAAMMMACHhBgEAwQwAIYwHAQDBDAAhpwcBAMEMACGoBwEAyAwAIR8DAAD3EwAgBwAA8xUAIA4AAIQUACAPAACFFAAgGwAA-RMAIB4AAPgTACAfAAD6EwAgIAAA-xMAICEAAPwTACAiAAD9EwAgIwAA_hMAICUAAIAUACAoAACBFAAgKQAAghQAICoAAIMUACArAACGFAAgLAAAhxQAIC0AAIgUACAvAACJFAAgNgAAihQAIDcAAIsUACA6AACMFAAg7QUBAAAAAe4FQAAAAAHzBQAAAKMHAvYFAQAAAAGBBgEAAAABoQcAAAChBwKjBwIAAAABpAdAAAAAAaUHQAAAAAECAAAAtAEAIF4AAM4ZACAMBwAAohQAIAgAAOwRACDtBQEAAAAB7gVAAAAAAYEGAQAAAAG8BgIAAAABwgYAAADCBgLDBkAAAAABxAYBAAAAAcUGAADrEQAgxgZAAAAAAccGQAAAAAECAAAAuQEAIF4AANAZACAeBgAAjRQAIBAAAI8UACATAACQFAAgGwAAkxQAICAAAJQUACAhAACVFAAgIgAAlhQAICgAAJcUACApAACYFAAgNgAAmxQAIDcAAJwUACA-AADoFQAgPwAAjhQAIEAAAJEUACBBAACZFAAgQgAAmhQAIEMAAJ0UACBEAACeFAAgRQAAnxQAIEcAAKAUACBIAAChFAAg4QVAAAAAAe0FAQAAAAHuBUAAAAAB8wUAAACnBwLDBkAAAAAB4QYBAAAAAYwHAQAAAAGnBwEAAAABqAcBAAAAAQIAAACCAgAgXgAA0hkAIAztBQEAAAAB7gVAAAAAAfMFAAAAuQYCgQYBAAAAAYwGAQAAAAGVBgIAAAABtAYAAAC0BgK1BgEAAAABtgYBAAAAAbcGQAAAAAG5BkAAAAABugYgAAAAAQbhBUAAAAAB7QUBAAAAAe4FQAAAAAGMBgEAAAABlQYCAAAAAZYGQAAAAAEfAwAA9xMAIAcAAPMVACAOAACEFAAgDwAAhRQAIBsAAPkTACAeAAD4EwAgHwAA-hMAICAAAPsTACAhAAD8EwAgIgAA_RMAICMAAP4TACAkAAD_EwAgJQAAgBQAICkAAIIUACAqAACDFAAgKwAAhhQAICwAAIcUACAtAACIFAAgLwAAiRQAIDYAAIoUACA3AACLFAAgOgAAjBQAIO0FAQAAAAHuBUAAAAAB8wUAAACjBwL2BQEAAAABgQYBAAAAAaEHAAAAoQcCowcCAAAAAaQHQAAAAAGlB0AAAAABAgAAALQBACBeAADWGQAgHgYAAI0UACAQAACPFAAgEwAAkBQAIBsAAJMUACAgAACUFAAgIQAAlRQAICIAAJYUACApAACYFAAgNgAAmxQAIDcAAJwUACA9AACSFAAgPgAA6BUAID8AAI4UACBAAACRFAAgQQAAmRQAIEIAAJoUACBDAACdFAAgRAAAnhQAIEUAAJ8UACBHAACgFAAgSAAAoRQAIOEFQAAAAAHtBQEAAAAB7gVAAAAAAfMFAAAApwcCwwZAAAAAAeEGAQAAAAGMBwEAAAABpwcBAAAAAagHAQAAAAECAAAAggIAIF4AANgZACAE7QUBAAAAAe4FQAAAAAGVBgIAAAAB6QYBAAAAAQMAAAAZACBeAADWGQAgXwAA3RkAICEAAAAZACADAACPEgAgBwAA8RUAIA4AAJwSACAPAACdEgAgGwAAkRIAIB4AAJASACAfAACSEgAgIAAAkxIAICEAAJQSACAiAACVEgAgIwAAlhIAICQAAJcSACAlAACYEgAgKQAAmhIAICoAAJsSACArAACeEgAgLAAAnxIAIC0AAKASACAvAAChEgAgNgAAohIAIDcAAKMSACA6AACkEgAgVwAA3RkAIO0FAQDBDAAh7gVAAMMMACHzBQAAjRKjByL2BQEAwQwAIYEGAQDBDAAhoQcAAIwSoQciowcCAK4NACGkB0AAxAwAIaUHQADEDAAhHwMAAI8SACAHAADxFQAgDgAAnBIAIA8AAJ0SACAbAACREgAgHgAAkBIAIB8AAJISACAgAACTEgAgIQAAlBIAICIAAJUSACAjAACWEgAgJAAAlxIAICUAAJgSACApAACaEgAgKgAAmxIAICsAAJ4SACAsAACfEgAgLQAAoBIAIC8AAKESACA2AACiEgAgNwAAoxIAIDoAAKQSACDtBQEAwQwAIe4FQADDDAAh8wUAAI0Sowci9gUBAMEMACGBBgEAwQwAIaEHAACMEqEHIqMHAgCuDQAhpAdAAMQMACGlB0AAxAwAIQMAAAAQACBeAADYGQAgXwAA4BkAICAAAAAQACAGAADVDgAgEAAA1w4AIBMAANgOACAbAADbDgAgIAAA3A4AICEAAN0OACAiAADeDgAgKQAA4A4AIDYAAOMOACA3AADkDgAgPQAA2g4AID4AAOYVACA_AADWDgAgQAAA2Q4AIEEAAOEOACBCAADiDgAgQwAA5Q4AIEQAAOYOACBFAADnDgAgRwAA6A4AIEgAAOkOACBXAADgGQAg4QVAAMMMACHtBQEAwQwAIe4FQADDDAAh8wUAANQOpwciwwZAAMMMACHhBgEAwQwAIYwHAQDBDAAhpwcBAMEMACGoBwEAyAwAIR4GAADVDgAgEAAA1w4AIBMAANgOACAbAADbDgAgIAAA3A4AICEAAN0OACAiAADeDgAgKQAA4A4AIDYAAOMOACA3AADkDgAgPQAA2g4AID4AAOYVACA_AADWDgAgQAAA2Q4AIEEAAOEOACBCAADiDgAgQwAA5Q4AIEQAAOYOACBFAADnDgAgRwAA6A4AIEgAAOkOACDhBUAAwwwAIe0FAQDBDAAh7gVAAMMMACHzBQAA1A6nByLDBkAAwwwAIeEGAQDBDAAhjAcBAMEMACGnBwEAwQwAIagHAQDIDAAhDu0FAQAAAAHuBUAAAAABgQYBAAAAAYwGAQAAAAHqBgIAAAAB7AYAAADsBgLtBkAAAAAB7gYBAAAAAe8GAQAAAAHwBgEAAAAB8QYBAAAAAfIGgAAAAAHzBgEAAAAB9AYBAAAAAR0HAACPEwAgCgAAlhEAIAsAAJcRACAOAACYEQAgDwAAmREAIBAAAJoRACAUAACcEQAgGAAAnREAIO0FAQAAAAHuBUAAAAAB8wUAAADDBwKBBgEAAAABxwZAAAAAAewGAAAAtAcCtAeAAAAAAbUHAQAAAAG2BwEAAAABtwcgAAAAAbkHAAAAuQcCugcAAJQRACC7BwEAAAABvAcAAJURACC9B0AAAAABvgcCAAAAAb8HAgAAAAHAB0AAAAABwQdAAAAAAcMHQAAAAAHEB4AAAAABAgAAAGsAIF4AAOIZACAeBgAAjRQAIBAAAI8UACAbAACTFAAgIAAAlBQAICEAAJUUACAiAACWFAAgKAAAlxQAICkAAJgUACA2AACbFAAgNwAAnBQAID0AAJIUACA-AADoFQAgPwAAjhQAIEAAAJEUACBBAACZFAAgQgAAmhQAIEMAAJ0UACBEAACeFAAgRQAAnxQAIEcAAKAUACBIAAChFAAg4QVAAAAAAe0FAQAAAAHuBUAAAAAB8wUAAACnBwLDBkAAAAAB4QYBAAAAAYwHAQAAAAGnBwEAAAABqAcBAAAAAQIAAACCAgAgXgAA5BkAIAMAAAAfACBeAADiGQAgXwAA6BkAIB8AAAAfACAHAACNEwAgCgAAxxAAIAsAAMgQACAOAADJEAAgDwAAyhAAIBAAAMsQACAUAADNEAAgGAAAzhAAIFcAAOgZACDtBQEAwQwAIe4FQADDDAAh8wUAAMUQwwcigQYBAMEMACHHBkAAxAwAIewGAADBELQHIrQHgAAAAAG1BwEAyAwAIbYHAQDBDAAhtwcgANcPACG5BwAAwhC5ByK6BwAAwxAAILsHAQDIDAAhvAcAAMQQACC9B0AAxAwAIb4HAgDCDAAhvwcCAMIMACHAB0AAwwwAIcEHQADDDAAhwwdAAMQMACHEB4AAAAABHQcAAI0TACAKAADHEAAgCwAAyBAAIA4AAMkQACAPAADKEAAgEAAAyxAAIBQAAM0QACAYAADOEAAg7QUBAMEMACHuBUAAwwwAIfMFAADFEMMHIoEGAQDBDAAhxwZAAMQMACHsBgAAwRC0ByK0B4AAAAABtQcBAMgMACG2BwEAwQwAIbcHIADXDwAhuQcAAMIQuQciugcAAMMQACC7BwEAyAwAIbwHAADEEAAgvQdAAMQMACG-BwIAwgwAIb8HAgDCDAAhwAdAAMMMACHBB0AAwwwAIcMHQADEDAAhxAeAAAAAAQMAAAAQACBeAADkGQAgXwAA6xkAICAAAAAQACAGAADVDgAgEAAA1w4AIBsAANsOACAgAADcDgAgIQAA3Q4AICIAAN4OACAoAADfDgAgKQAA4A4AIDYAAOMOACA3AADkDgAgPQAA2g4AID4AAOYVACA_AADWDgAgQAAA2Q4AIEEAAOEOACBCAADiDgAgQwAA5Q4AIEQAAOYOACBFAADnDgAgRwAA6A4AIEgAAOkOACBXAADrGQAg4QVAAMMMACHtBQEAwQwAIe4FQADDDAAh8wUAANQOpwciwwZAAMMMACHhBgEAwQwAIYwHAQDBDAAhpwcBAMEMACGoBwEAyAwAIR4GAADVDgAgEAAA1w4AIBsAANsOACAgAADcDgAgIQAA3Q4AICIAAN4OACAoAADfDgAgKQAA4A4AIDYAAOMOACA3AADkDgAgPQAA2g4AID4AAOYVACA_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-hMAICEAAPwTACAiAAD9EwAgIwAA_hMAICQAAP8TACAlAACAFAAgKAAAgRQAICkAAIIUACAqAACDFAAgKwAAhhQAICwAAIcUACAtAACIFAAgLwAAiRQAIDYAAIoUACA3AACLFAAgOgAAjBQAIO0FAQAAAAHuBUAAAAAB8wUAAACjBwL2BQEAAAABgQYBAAAAAaEHAAAAoQcCowcCAAAAAaQHQAAAAAGlB0AAAAABAgAAALQBACBeAAD7GQAgHgYAAI0UACAQAACPFAAgEwAAkBQAIBsAAJMUACAhAACVFAAgIgAAlhQAICgAAJcUACApAACYFAAgNgAAmxQAIDcAAJwUACA9AACSFAAgPgAA6BUAID8AAI4UACBAAACRFAAgQQAAmRQAIEIAAJoUACBDAACdFAAgRAAAnhQAIEUAAJ8UACBHAACgFAAgSAAAoRQAIOEFQAAAAAHtBQEAAAAB7gVAAAAAAfMFAAAApwcCwwZAAAAAAeEGAQAAAAGMBwEAAAABpwcBAAAAAagHAQAAAAECAAAAggIAIF4AAP0ZACADAAAAGQAgXgAA-xkAIF8AAIEaACAhAAAAGQAgAwAAjxIAIAcAAPEVACAOAACcEgAgDwAAnRIAIBsAAJESACAeAACQEgAgHwAAkhIAICEAAJQSACAiAACVEgAgIwAAlhIAICQAAJcSACAlAACYEgAgKAAAmRIAICkAAJoSACAqAACbEgAgKwAAnhIAICwAAJ8SACAtAACgEgAgLwAAoRIAIDYAAKISACA3AACjEgAgOgAApBIAIFcAAIEaACDtBQEAwQwAIe4FQADDDAAh8wUAAI0Sowci9gUBAMEMACGBBgEAwQwAIaEHAACMEqEHIqMHAgCuDQAhpAdAAMQMACGlB0AAxAwAIR8DAACPEgAgBwAA8RUAIA4AAJwSACAPAACdEgAgGwAAkRIAIB4AAJASACAfAACSEgAgIQAAlBIAICIAAJUSACAjAACWEgAgJAAAlxIAICUAAJgSACAoAACZEgAgKQAAmhIAICoAAJsSACArAACeEgAgLAAAnxIAIC0AAKASACAvAAChEgAgNgAAohIAIDcAAKMSACA6AACkEgAg7QUBAMEMACHuBUAAwwwAIfMFAACNEqMHIvYFAQDBDAAhgQYBAMEMACGhBwAAjBKhByKjBwIArg0AIaQHQADEDAAhpQdAAMQMACEDAAAAEAAgXgAA_RkAIF8AAIQaACAgAAAAEAAgBgAA1Q4AIBAAANcOACATAADYDgAgGwAA2w4AICEAAN0OACAiAADeDgAgKAAA3w4AICkAAOAOACA2AADjDgAgNwAA5A4AID0AANoOACA-AADmFQAgPwAA1g4AIEAAANkOACBBAADhDgAgQgAA4g4AIEMAAOUOACBEAADmDgAgRQAA5w4AIEcAAOgOACBIAADpDgAgVwAAhBoAIOEFQADDDAAh7QUBAMEMACHuBUAAwwwAIfMFAADUDqcHIsMGQADDDAAh4QYBAMEMACGMBwEAwQwAIacHAQDBDAAhqAcBAMgMACEeBgAA1Q4AIBAAANcOACATAADYDgAgGwAA2w4AICEAAN0OACAiAADeDgAgKAAA3w4AICkAAOAOACA2AADjDgAgNwAA5A4AID0AANoOACA-AADmFQAgPwAA1g4AIEAAANkOACBBAADhDgAgQgAA4g4AIEMAAOUOACBEAADmDgAgRQAA5w4AIEcAAOgOACBIAADpDgAg4QVAAMMMACHtBQEAwQwAIe4FQADDDAAh8wUAANQOpwciwwZAAMMMACHhBgEAwQwAIYwHAQDBDAAhpwcBAMEMACGoBwEAyAwAIR8DAAD3EwAgBwAA8xUAIA4AAIQUACAPAACFFAAgGwAA-RMAIB4AAPgTACAfAAD6EwAgIAAA-xMAICIAAP0TACAjAAD-EwAgJAAA_xMAICUAAIAUACAoAACBFAAgKQAAghQAICoAAIMUACArAACGFAAgLAAAhxQAIC0AAIgUACAvAACJFAAgNgAAihQAIDcAAIsUACA6AACMFAAg7QUBAAAAAe4FQAAAAAHzBQAAAKMHAvYFAQAAAAGBBgEAAAABoQcAAAChBwKjBwIAAAABpAdAAAAAAaUHQAAAAAECAAAAtAEAIF4AAIUaACAeBgAAjRQAIBAAAI8UACATAACQFAAgGwAAkxQAICAAAJQUACAiAACWFAAgKAAAlxQAICkAAJgUACA2AACbFAAgNwAAnBQAID0AAJIUACA-AADoFQAgPwAAjhQAIEAAAJEUACBBAACZFAAgQgAAmhQAIEMAAJ0UACBEAACeFAAgRQAAnxQAIEcAAKAUACBIAAChFAAg4QVAAAAAAe0FAQAAAAHuBUAAAAAB8wUAAACnBwLDBkAAAAAB4QYBAAAAAYwHAQAAAAGnBwEAAAABqAcBAAAAAQIAAACCAgAgXgAAhxoAIB0HAACPEwAgCgAAlhEAIAsAAJcRACAOAACYEQAgDwAAmREAIBAAAJoRACATAACbEQAgFAAAnBEAIO0FAQAAAAHuBUAAAAAB8wUAAADDBwKBBgEAAAABxwZAAAAAAewGAAAAtAcCtAeAAAAAAbUHAQAAAAG2BwEAAAABtwcgAAAAAbkHAAAAuQcCugcAAJQRACC7BwEAAAABvAcAAJURACC9B0AAAAABvgcCAAAAAb8HAgAAAAHAB0AAAAABwQdAAAAAAcMHQAAAAAHEB4AAAAABAgAAAGsAIF4AAIkaACAfAwAA9xMAIAcAAPMVACAOAACEFAAgDwAAhRQAIBsAAPkTACAeAAD4EwAgHwAA-hMAICAAAPsTACAhAAD8EwAgIgAA_RMAICMAAP4TACAkAAD_EwAgJQAAgBQAICgAAIEUACApAACCFAAgKgAAgxQAICsAAIYUACAtAACIFAAgLwAAiRQAIDYAAIoUACA3AACLFAAgOgAAjBQAIO0FAQAAAAHuBUAAAAAB8wUAAACjBwL2BQEAAAABgQYBAAAAAaEHAAAAoQcCowcCAAAAAaQHQAAAAAGlB0AAAAABAgAAALQBACBeAACLGgAgHwMAAPcTACAHAADzFQAgDgAAhBQAIA8AAIUUACAbAAD5EwAgHgAA-BMAIB8AAPoTACAgAAD7EwAgIQAA_BMAICIAAP0TACAjAAD-EwAgJAAA_xMAICUAAIAUACAoAACBFAAgKQAAghQAICoAAIMUACAsAACHFAAgLQAAiBQAIC8AAIkUACA2AACKFAAgNwAAixQAIDoAAIwUACDtBQEAAAAB7gVAAAAAAfMFAAAAowcC9gUBAAAAAYEGAQAAAAGhBwAAAKEHAqMHAgAAAAGkB0AAAAABpQdAAAAAAQIAAAC0AQAgXgAAjRoAIB4GAACNFAAgEAAAjxQAIBMAAJAUACAbAACTFAAgIAAAlBQAICEAAJUUACAiAACWFAAgKAAAlxQAICkAAJgUACA2AACbFAAgNwAAnBQAID0AAJIUACA-AADoFQAgPwAAjhQAIEAAAJEUACBCAACaFAAgQwAAnRQAIEQAAJ4UACBFAACfFAAgRwAAoBQAIEgAAKEUACDhBUAAAAAB7QUBAAAAAe4FQAAAAAHzBQAAAKcHAsMGQAAAAAHhBgEAAAABjAcBAAAAAacHAQAAAAGoBwEAAAABAgAAAIICACBeAACPGgAgAwAAAB8AIF4AAIkaACBfAACTGgAgHwAAAB8AIAcAAI0TACAKAADHEAAgCwAAyBAAIA4AAMkQACAPAADKEAAgEAAAyxAAIBMAAMwQACAUAADNEAAgVwAAkxoAIO0FAQDBDAAh7gVAAMMMACHzBQAAxRDDByKBBgEAwQwAIccGQADEDAAh7AYAAMEQtAcitAeAAAAAAbUHAQDIDAAhtgcBAMEMACG3ByAA1w8AIbkHAADCELkHIroHAADDEAAguwcBAMgMACG8BwAAxBAAIL0HQADEDAAhvgcCAMIMACG_BwIAwgwAIcAHQADDDAAhwQdAAMMMACHDB0AAxAwAIcQHgAAAAAEdBwAAjRMAIAoAAMcQACALAADIEAAgDgAAyRAAIA8AAMoQACAQAADLEAAgEwAAzBAAIBQAAM0QACDtBQEAwQwAIe4FQADDDAAh8wUAAMUQwwcigQYBAMEMACHHBkAAxAwAIewGAADBELQHIrQHgAAAAAG1BwEAyAwAIbYHAQDBDAAhtwcgANcPACG5BwAAwhC5ByK6BwAAwxAAILsHAQDIDAAhvAcAAMQQACC9B0AAxAwAIb4HAgDCDAAhvwcCAMIMACHAB0AAwwwAIcEHQADDDAAhwwdAAMQMACHEB4AAAAABAwAAABkAIF4AAIsaACBfAACWGgAgIQAAABkAIAMAAI8SACAHAADxFQAgDgAAnBIAIA8AAJ0SACAbAACREgAgHgAAkBIAIB8AAJISACAgAACTEgAgIQAAlBIAICIAAJUSACAjAACWEgAgJAAAlxIAICUAAJgSACAoAACZEgAgKQAAmhIAICoAAJsSACArAACeEgAgLQAAoBIAIC8AAKESACA2AACiEgAgNwAAoxIAIDoAAKQSACBXAACWGgAg7QUBAMEMACHuBUAAwwwAIfMFAACNEqMHIvYFAQDBDAAhgQYBAMEMACGhBwAAjBKhByKjBwIArg0AIaQHQADEDAAhpQdAAMQMACEfAwAAjxIAIAcAAPEVACAOAACcEgAgDwAAnRIAIBsAAJESACAeAACQEgAgHwAAkhIAICAAAJMSACAhAACUEgAgIgAAlRIAICMAAJYSACAkAACXEgAgJQAAmBIAICgAAJkSACApAACaEgAgKgAAmxIAICsAAJ4SACAtAACgEgAgLwAAoRIAIDYAAKISACA3AACjEgAgOgAApBIAIO0FAQDBDAAh7gVAAMMMACHzBQAAjRKjByL2BQEAwQwAIYEGAQDBDAAhoQcAAIwSoQciowcCAK4NACGkB0AAxAwAIaUHQADEDAAhAwAAABkAIF4AAI0aACBfAACZGgAgIQAAABkAIAMAAI8SACAHAADxFQAgDgAAnBIAIA8AAJ0SACAbAACREgAgHgAAkBIAIB8AAJISACAgAACTEgAgIQAAlBIAICIAAJUSACAjAACWEgAgJAAAlxIAICUAAJgSACAoAACZEgAgKQAAmhIAICoAAJsSACAsAACfEgAgLQAAoBIAIC8AAKESACA2AACiEgAgNwAAoxIAIDoAAKQSACBXAACZGgAg7QUBAMEMACHuBUAAwwwAIfMFAACNEqMHIvYFAQDBDAAhgQYBAMEMACGhBwAAjBKhByKjBwIArg0AIaQHQADEDAAhpQdAAMQMACEfAwAAjxIAIAcAAPEVACAOAACcEgAgDwAAnRIAIBsAAJESACAeAACQEgAgHwAAkhIAICAAAJMSACAhAACUEgAgIgAAlRIAICMAAJYSACAkAACXEgAgJQAAmBIAICgAAJkSACApAACaEgAgKgAAmxIAICwAAJ8SACAtAACgEgAgLwAAoRIAIDYAAKISACA3AACjEgAgOgAApBIAIO0FAQDBDAAh7gVAAMMMACHzBQAAjRKjByL2BQEAwQwAIYEGAQDBDAAhoQcAAIwSoQciowcCAK4NACGkB0AAxAwAIaUHQADEDAAhAwAAABAAIF4AAI8aACBfAACcGgAgIAAAABAAIAYAANUOACAQAADXDgAgEwAA2A4AIBsAANsOACAgAADcDgAgIQAA3Q4AICIAAN4OACAoAADfDgAgKQAA4A4AIDYAAOMOACA3AADkDgAgPQAA2g4AID4AAOYVACA_AADWDgAgQAAA2Q4AIEIAAOIOACBDAADlDgAgRAAA5g4AIEUAAOcOACBHAADoDgAgSAAA6Q4AIFcAAJwaACDhBUAAwwwAIe0FAQDBDAAh7gVAAMMMACHzBQAA1A6nByLDBkAAwwwAIeEGAQDBDAAhjAcBAMEMACGnBwEAwQwAIagHAQDIDAAhHgYAANUOACAQAADXDgAgEwAA2A4AIBsAANsOACAgAADcDgAgIQAA3Q4AICIAAN4OACAoAADfDgAgKQAA4A4AIDYAAOMOACA3AADkDgAgPQAA2g4AID4AAOYVACA_AADWDgAgQAAA2Q4AIEIAAOIOACBDAADlDgAgRAAA5g4AIEUAAOcOACBHAADoDgAgSAAA6Q4AIOEFQADDDAAh7QUBAMEMACHuBUAAwwwAIfMFAADUDqcHIsMGQADDDAAh4QYBAMEMACGMBwEAwQwAIacHAQDBDAAhqAcBAMgMACEDAAAAGQAgXgAAhRoAIF8AAJ8aACAhAAAAGQAgAwAAjxIAIAcAAPEVACAOAACcEgAgDwAAnRIAIBsAAJESACAeAACQEgAgHwAAkhIAICAAAJMSACAiAACVEgAgIwAAlhIAICQAAJcSACAlAACYEgAgKAAAmRIAICkAAJoSACAqAACbEgAgKwAAnhIAICwAAJ8SACAtAACgEgAgLwAAoRIAIDYAAKISACA3AACjEgAgOgAApBIAIFcAAJ8aACDtBQEAwQwAIe4FQADDDAAh8wUAAI0Sowci9gUBAMEMACGBBgEAwQwAIaEHAACMEqEHIqMHAgCuDQAhpAdAAMQMACGlB0AAxAwAIR8DAACPEgAgBwAA8RUAIA4AAJwSACAPAACdEgAgGwAAkRIAIB4AAJASACAfAACSEgAgIAAAkxIAICIAAJUSACAjAACWEgAgJAAAlxIAICUAAJgSACAoAACZEgAgKQAAmhIAICoAAJsSACArAACeEgAgLAAAnxIAIC0AAKASACAvAAChEgAgNgAAohIAIDcAAKMSACA6AACkEgAg7QUBAMEMACHuBUAAwwwAIfMFAACNEqMHIvYFAQDBDAAhgQYBAMEMACGhBwAAjBKhByKjBwIArg0AIaQHQADEDAAhpQdAAMQMACEDAAAAEAAgXgAAhxoAIF8AAKIaACAgAAAAEAAgBgAA1Q4AIBAAANcOACATAADYDgAgGwAA2w4AICAAANwOACAiAADeDgAgKAAA3w4AICkAAOAOACA2AADjDgAgNwAA5A4AID0AANoOACA-AADmFQAgPwAA1g4AIEAAANkOACBBAADhDgAgQgAA4g4AIEMAAOUOACBEAADmDgAgRQAA5w4AIEcAAOgOACBIAADpDgAgVwAAohoAIOEFQADDDAAh7QUBAMEMACHuBUAAwwwAIfMFAADUDqcHIsMGQADDDAAh4QYBAMEMACGMBwEAwQwAIacHAQDBDAAhqAcBAMgMACEeBgAA1Q4AIBAAANcOACATAADYDgAgGwAA2w4AICAAANwOACAiAADeDgAgKAAA3w4AICkAAOAOACA2AADjDgAgNwAA5A4AID0AANoOACA-AADmFQAgPwAA1g4AIEAAANkOACBBAADhDgAgQgAA4g4AIEMAAOUOACBEAADmDgAgRQAA5w4AIEcAAOgOACBIAADpDgAg4QVAAMMMACHtBQEAwQwAIe4FQADDDAAh8wUAANQOpwciwwZAAMMMACHhBgEAwQwAIYwHAQDBDAAhpwcBAMEMACGoBwEAyAwAIREHAADIDQAgDQAAyQ0AIBgAAMsNACDhBUAAAAAB7QUBAAAAAe4FQAAAAAHzBQAAAKoGAoEGAQAAAAGMBgEAAAABlQYCAAAAAZsGAgAAAAGkBgAAAKQGAqUGAgAAAAGmBgEAAAABpwYBAAAAAagGAQAAAAGqBkAAAAABAgAAAFEAIF4AAKMaACAdBwAAjxMAIAoAAJYRACALAACXEQAgDgAAmBEAIA8AAJkRACAQAACaEQAgEwAAmxEAIBgAAJ0RACDtBQEAAAAB7gVAAAAAAfMFAAAAwwcCgQYBAAAAAccGQAAAAAHsBgAAALQHArQHgAAAAAG1BwEAAAABtgcBAAAAAbcHIAAAAAG5BwAAALkHAroHAACUEQAguwcBAAAAAbwHAACVEQAgvQdAAAAAAb4HAgAAAAG_BwIAAAABwAdAAAAAAcEHQAAAAAHDB0AAAAABxAeAAAAAAQIAAABrACBeAAClGgAgHwMAAPcTACAHAADzFQAgDgAAhBQAIA8AAIUUACAbAAD5EwAgHgAA-BMAIB8AAPoTACAgAAD7EwAgIQAA_BMAICMAAP4TACAkAAD_EwAgJQAAgBQAICgAAIEUACApAACCFAAgKgAAgxQAICsAAIYUACAsAACHFAAgLQAAiBQAIC8AAIkUACA2AACKFAAgNwAAixQAIDoAAIwUACDtBQEAAAAB7gVAAAAAAfMFAAAAowcC9gUBAAAAAYEGAQAAAAGhBwAAAKEHAqMHAgAAAAGkB0AAAAABpQdAAAAAAQIAAAC0AQAgXgAApxoAIB4GAACNFAAgEAAAjxQAIBMAAJAUACAbAACTFAAgIAAAlBQAICEAAJUUACAoAACXFAAgKQAAmBQAIDYAAJsUACA3AACcFAAgPQAAkhQAID4AAOgVACA_AACOFAAgQAAAkRQAIEEAAJkUACBCAACaFAAgQwAAnRQAIEQAAJ4UACBFAACfFAAgRwAAoBQAIEgAAKEUACDhBUAAAAAB7QUBAAAAAe4FQAAAAAHzBQAAAKcHAsMGQAAAAAHhBgEAAAABjAcBAAAAAacHAQAAAAGoBwEAAAABAgAAAIICACBeAACpGgAgHwMAAPcTACAHAADzFQAgDgAAhBQAIA8AAIUUACAbAAD5EwAgHgAA-BMAICAAAPsTACAhAAD8EwAgIgAA_RMAICMAAP4TACAkAAD_EwAgJQAAgBQAICgAAIEUACApAACCFAAgKgAAgxQAICsAAIYUACAsAACHFAAgLQAAiBQAIC8AAIkUACA2AACKFAAgNwAAixQAIDoAAIwUACDtBQEAAAAB7gVAAAAAAfMFAAAAowcC9gUBAAAAAYEGAQAAAAGhBwAAAKEHAqMHAgAAAAGkB0AAAAABpQdAAAAAAQIAAAC0AQAgXgAAqxoAIBAHAACyDgAgCQAAsw4AICMAALYOACAoAAC3DgAgOwAAtA4AIDwAALgOACDtBQEAAAAB7gVAAAAAAfMFAAAAwAYCgQYBAAAAAbcGQAAAAAG7BgEAAAABvAYCAAAAAb0GAQAAAAG-BkAAAAABwAYCAAAAAQIAAAAXACBeAACtGgAgHwMAAPcTACAHAADzFQAgDgAAhBQAIA8AAIUUACAeAAD4EwAgHwAA-hMAICAAAPsTACAhAAD8EwAgIgAA_RMAICMAAP4TACAkAAD_EwAgJQAAgBQAICgAAIEUACApAACCFAAgKgAAgxQAICsAAIYUACAsAACHFAAgLQAAiBQAIC8AAIkUACA2AACKFAAgNwAAixQAIDoAAIwUACDtBQEAAAAB7gVAAAAAAfMFAAAAowcC9gUBAAAAAYEGAQAAAAGhBwAAAKEHAqMHAgAAAAGkB0AAAAABpQdAAAAAAQIAAAC0AQAgXgAArxoAIB4GAACNFAAgEAAAjxQAIBMAAJAUACAgAACUFAAgIQAAlRQAICIAAJYUACAoAACXFAAgKQAAmBQAIDYAAJsUACA3AACcFAAgPQAAkhQAID4AAOgVACA_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_BwIAwgwAIcAHQADDDAAhwQdAAMMMACHDB0AAxAwAIcQHgAAAAAEDAAAAGQAgXgAApxoAIF8AAMgaACAhAAAAGQAgAwAAjxIAIAcAAPEVACAOAACcEgAgDwAAnRIAIBsAAJESACAeAACQEgAgHwAAkhIAICAAAJMSACAhAACUEgAgIwAAlhIAICQAAJcSACAlAACYEgAgKAAAmRIAICkAAJoSACAqAACbEgAgKwAAnhIAICwAAJ8SACAtAACgEgAgLwAAoRIAIDYAAKISACA3AACjEgAgOgAApBIAIFcAAMgaACDtBQEAwQwAIe4FQADDDAAh8wUAAI0Sowci9gUBAMEMACGBBgEAwQwAIaEHAACMEqEHIqMHAgCuDQAhpAdAAMQMACGlB0AAxAwAIR8DAACPEgAgBwAA8RUAIA4AAJwSACAPAACdEgAgGwAAkRIAIB4AAJASACAfAACSEgAgIAAAkxIAICEAAJQSACAjAACWEgAgJAAAlxIAICUAAJgSACAoAACZEgAgKQAAmhIAICoAAJsSACArAACeEgAgLAAAnxIAIC0AAKASACAvAAChEgAgNgAAohIAIDcAAKMSACA6AACkEgAg7QUBAMEMACHuBUAAwwwAIfMFAACNEqMHIvYFAQDBDAAhgQYBAMEMACGhBwAAjBKhByKjBwIArg0AIaQHQADEDAAhpQdAAMQMACEDAAAAEAAgXgAAqRoAIF8AAMsaACAgAAAAEAAgBgAA1Q4AIBAAANcOACATAADYDgAgGwAA2w4AICAAANwOACAhAADdDgAgKAAA3w4AICkAAOAOACA2AADjDgAgNwAA5A4AID0AANoOACA-AADmFQAgPwAA1g4AIEAAANkOACBBAADhDgAgQgAA4g4AIEMAAOUOACBEAADmDgAgRQAA5w4AIEcAAOgOACBIAADpDgAgVwAAyxoAIOEFQADDDAAh7QUBAMEMACHuBUAAwwwAIfMFAADUDqcHIsMGQADDDAAh4QYBAMEMACGMBwEAwQwAIacHAQDBDAAhqAcBAMgMACEeBgAA1Q4AIBAAANcOACATAADYDgAgGwAA2w4AICAAANwOACAhAADdDgAgKAAA3w4AICkAAOAOACA2AADjDgAgNwAA5A4AID0AANoOACA-AADmFQAgPwAA1g4AIEAAANkOACBBAADhDgAgQgAA4g4AIEMAAOUOACBEAADmDgAgRQAA5w4AIEcAAOgOACBIAADpDgAg4QVAAMMMACHtBQEAwQwAIe4FQADDDAAh8wUAANQOpwciwwZAAMMMACHhBgEAwQwAIYwHAQDBDAAhpwcBAMEMACGoBwEAyAwAIR8DAAD3EwAgBwAA8xUAIA4AAIQUACAPAACFFAAgGwAA-RMAIB4AAPgTACAfAAD6EwAgIAAA-xMAICEAAPwTACAiAAD9EwAgJAAA_xMAICUAAIAUACAoAACBFAAgKQAAghQAICoAAIMUACArAACGFAAgLAAAhxQAIC0AAIgUACAvAACJFAAgNgAAihQAIDcAAIsUACA6AACMFAAg7QUBAAAAAe4FQAAAAAHzBQAAAKMHAvYFAQAAAAGBBgEAAAABoQcAAAChBwKjBwIAAAABpAdAAAAAAaUHQAAAAAECAAAAtAEAIF4AAMwaACAQBwAAsg4AIAkAALMOACAbAAC1DgAgKAAAtw4AIDsAALQOACA8AAC4DgAg7QUBAAAAAe4FQAAAAAHzBQAAAMAGAoEGAQAAAAG3BkAAAAABuwYBAAAAAbwGAgAAAAG9BgEAAAABvgZAAAAAAcAGAgAAAAECAAAAFwAgXgAAzhoAIAMAAAAZACBeAADMGgAgXwAA0hoAICEAAAAZACADAACPEgAgBwAA8RUAIA4AAJwSACAPAACdEgAgGwAAkRIAIB4AAJASACAfAACSEgAgIAAAkxIAICEAAJQSACAiAACVEgAgJAAAlxIAICUAAJgSACAoAACZEgAgKQAAmhIAICoAAJsSACArAACeEgAgLAAAnxIAIC0AAKASACAvAAChEgAgNgAAohIAIDcAAKMSACA6AACkEgAgVwAA0hoAIO0FAQDBDAAh7gVAAMMMACHzBQAAjRKjByL2BQEAwQwAIYEGAQDBDAAhoQcAAIwSoQciowcCAK4NACGkB0AAxAwAIaUHQADEDAAhHwMAAI8SACAHAADxFQAgDgAAnBIAIA8AAJ0SACAbAACREgAgHgAAkBIAIB8AAJISACAgAACTEgAgIQAAlBIAICIAAJUSACAkAACXEgAgJQAAmBIAICgAAJkSACApAACaEgAgKgAAmxIAICsAAJ4SACAsAACfEgAgLQAAoBIAIC8AAKESACA2AACiEgAgNwAAoxIAIDoAAKQSACDtBQEAwQwAIe4FQADDDAAh8wUAAI0Sowci9gUBAMEMACGBBgEAwQwAIaEHAACMEqEHIqMHAgCuDQAhpAdAAMQMACGlB0AAxAwAIQMAAAAVACBeAADOGgAgXwAA1RoAIBIAAAAVACAHAADnDQAgCQAA6A0AIBsAAOoNACAoAADsDQAgOwAA6Q0AIDwAAO0NACBXAADVGgAg7QUBAMEMACHuBUAAwwwAIfMFAADmDcAGIoEGAQDBDAAhtwZAAMMMACG7BgEAwQwAIbwGAgDCDAAhvQYBAMgMACG-BkAAwwwAIcAGAgDCDAAhEAcAAOcNACAJAADoDQAgGwAA6g0AICgAAOwNACA7AADpDQAgPAAA7Q0AIO0FAQDBDAAh7gVAAMMMACHzBQAA5g3ABiKBBgEAwQwAIbcGQADDDAAhuwYBAMEMACG8BgIAwgwAIb0GAQDIDAAhvgZAAMMMACHABgIAwgwAIR8DAAD3EwAgBwAA8xUAIA4AAIQUACAPAACFFAAgGwAA-RMAIB4AAPgTACAfAAD6EwAgIAAA-xMAICEAAPwTACAiAAD9EwAgIwAA_hMAICQAAP8TACAoAACBFAAgKQAAghQAICoAAIMUACArAACGFAAgLAAAhxQAIC0AAIgUACAvAACJFAAgNgAAihQAIDcAAIsUACA6AACMFAAg7QUBAAAAAe4FQAAAAAHzBQAAAKMHAvYFAQAAAAGBBgEAAAABoQcAAAChBwKjBwIAAAABpAdAAAAAAaUHQAAAAAECAAAAtAEAIF4AANYaACADAAAAGQAgXgAA1hoAIF8AANoaACAhAAAAGQAgAwAAjxIAIAcAAPEVACAOAACcEgAgDwAAnRIAIBsAAJESACAeAACQEgAgHwAAkhIAICAAAJMSACAhAACUEgAgIgAAlRIAICMAAJYSACAkAACXEgAgKAAAmRIAICkAAJoSACAqAACbEgAgKwAAnhIAICwAAJ8SACAtAACgEgAgLwAAoRIAIDYAAKISACA3AACjEgAgOgAApBIAIFcAANoaACDtBQEAwQwAIe4FQADDDAAh8wUAAI0Sowci9gUBAMEMACGBBgEAwQwAIaEHAACMEqEHIqMHAgCuDQAhpAdAAMQMACGlB0AAxAwAIR8DAACPEgAgBwAA8RUAIA4AAJwSACAPAACdEgAgGwAAkRIAIB4AAJASACAfAACSEgAgIAAAkxIAICEAAJQSACAiAACVEgAgIwAAlhIAICQAAJcSACAoAACZEgAgKQAAmhIAICoAAJsSACArAACeEgAgLAAAnxIAIC0AAKASACAvAAChEgAgNgAAohIAIDcAAKMSACA6AACkEgAg7QUBAMEMACHuBUAAwwwAIfMFAACNEqMHIvYFAQDBDAAhgQYBAMEMACGhBwAAjBKhByKjBwIArg0AIaQHQADEDAAhpQdAAMQMACEeBgAAjRQAIBAAAI8UACATAACQFAAgGwAAkxQAICAAAJQUACAhAACVFAAgIgAAlhQAICgAAJcUACApAACYFAAgNgAAmxQAIDcAAJwUACA9AACSFAAgPgAA6BUAID8AAI4UACBAAACRFAAgQQAAmRQAIEIAAJoUACBEAACeFAAgRQAAnxQAIEcAAKAUACBIAAChFAAg4QVAAAAAAe0FAQAAAAHuBUAAAAAB8wUAAACnBwLDBkAAAAAB4QYBAAAAAYwHAQAAAAGnBwEAAAABqAcBAAAAAQIAAACCAgAgXgAA2xoAIBkFAACjFgAgPwAApRYAIEQAAKoWACBFAACrFgAgRwAArBYAIEgAAK0WACBLAAChFgAgTAAAohYAIE0AAKQWACBOAACmFgAgTwAApxYAIFAAAKkWACDhBUAAAAAB7QUBAAAAAe4FQAAAAAGQBgAAAJAGAowHAQAAAAGNBwEAAAABjgcBAAAAAY8HAQAAAAGQB0AAAAABkQdAAAAAAZIHQAAAAAGTBwIAAAABlAdAAAAAAQIAAACeBQAgXgAA3RoAIAftBQEAAAAB7gVAAAAAAfAFAQAAAAHxBQEAAAAB8wUAAADzBQL0BQEAAAAB9QVAAAAAAQMAAAAQACBeAADbGgAgXwAA4hoAICAAAAAQACAGAADVDgAgEAAA1w4AIBMAANgOACAbAADbDgAgIAAA3A4AICEAAN0OACAiAADeDgAgKAAA3w4AICkAAOAOACA2AADjDgAgNwAA5A4AID0AANoOACA-AADmFQAgPwAA1g4AIEAAANkOACBBAADhDgAgQgAA4g4AIEQAAOYOACBFAADnDgAgRwAA6A4AIEgAAOkOACBXAADiGgAg4QVAAMMMACHtBQEAwQwAIe4FQADDDAAh8wUAANQOpwciwwZAAMMMACHhBgEAwQwAIYwHAQDBDAAhpwcBAMEMACGoBwEAyAwAIR4GAADVDgAgEAAA1w4AIBMAANgOACAbAADbDgAgIAAA3A4AICEAAN0OACAiAADeDgAgKAAA3w4AICkAAOAOACA2AADjDgAgNwAA5A4AID0AANoOACA-AADmFQAgPwAA1g4AIEAAANkOACBBAADhDgAgQgAA4g4AIEQAAOYOACBFAADnDgAgRwAA6A4AIEgAAOkOACDhBUAAwwwAIe0FAQDBDAAh7gVAAMMMACHzBQAA1A6nByLDBkAAwwwAIeEGAQDBDAAhjAcBAMEMACGnBwEAwQwAIagHAQDIDAAhAwAAAEgAIF4AAN0aACBfAADlGgAgGwAAAEgAIAUAAI0VACA_AACPFQAgRAAAlBUAIEUAAJUVACBHAACWFQAgSAAAlxUAIEsAAIsVACBMAACMFQAgTQAAjhUAIE4AAJAVACBPAACRFQAgUAAAkxUAIFcAAOUaACDhBUAAwwwAIe0FAQDBDAAh7gVAAMMMACGQBgAA9QyQBiKMBwEAwQwAIY0HAQDBDAAhjgcBAMEMACGPBwEAwQwAIZAHQADDDAAhkQdAAMQMACGSB0AAxAwAIZMHAgDCDAAhlAdAAMQMACEZBQAAjRUAID8AAI8VACBEAACUFQAgRQAAlRUAIEcAAJYVACBIAACXFQAgSwAAixUAIEwAAIwVACBNAACOFQAgTgAAkBUAIE8AAJEVACBQAACTFQAg4QVAAMMMACHtBQEAwQwAIe4FQADDDAAhkAYAAPUMkAYijAcBAMEMACGNBwEAwQwAIY4HAQDBDAAhjwcBAMEMACGQB0AAwwwAIZEHQADEDAAhkgdAAMQMACGTBwIAwgwAIZQHQADEDAAhGQUAAKMWACA_AAClFgAgQwAAqBYAIEQAAKoWACBFAACrFgAgRwAArBYAIEgAAK0WACBLAAChFgAgTAAAohYAIE0AAKQWACBOAACmFgAgTwAApxYAIOEFQAAAAAHtBQEAAAAB7gVAAAAAAZAGAAAAkAYCjAcBAAAAAY0HAQAAAAGOBwEAAAABjwcBAAAAAZAHQAAAAAGRB0AAAAABkgdAAAAAAZMHAgAAAAGUB0AAAAABAgAAAJ4FACBeAADmGgAgAwAAAEgAIF4AAOYaACBfAADqGgAgGwAAAEgAIAUAAI0VACA_AACPFQAgQwAAkhUAIEQAAJQVACBFAACVFQAgRwAAlhUAIEgAAJcVACBLAACLFQAgTAAAjBUAIE0AAI4VACBOAACQFQAgTwAAkRUAIFcAAOoaACDhBUAAwwwAIe0FAQDBDAAh7gVAAMMMACGQBgAA9QyQBiKMBwEAwQwAIY0HAQDBDAAhjgcBAMEMACGPBwEAwQwAIZAHQADDDAAhkQdAAMQMACGSB0AAxAwAIZMHAgDCDAAhlAdAAMQMACEZBQAAjRUAID8AAI8VACBDAACSFQAgRAAAlBUAIEUAAJUVACBHAACWFQAgSAAAlxUAIEsAAIsVACBMAACMFQAgTQAAjhUAIE4AAJAVACBPAACRFQAg4QVAAMMMACHtBQEAwQwAIe4FQADDDAAhkAYAAPUMkAYijAcBAMEMACGNBwEAwQwAIY4HAQDBDAAhjwcBAMEMACGQB0AAwwwAIZEHQADEDAAhkgdAAMQMACGTBwIAwgwAIZQHQADEDAAhCgMAAIMVACAFAACEFQAg7QUBAAAAAe4FQAAAAAH2BQEAAAABggdAAAAAAYgHAAAAiAcCiQcBAAAAAYoHQAAAAAGLBwEAAAABAgAAAAUAIF4AAOsaACAPAwAA7wwAIAcAAPAMACDtBQEAAAAB7gVAAAAAAfYFAQAAAAGBBgEAAAABggYAAACBBgKDBgEAAAABhAYBAAAAAYUGAQAAAAGGBgEAAAABhwYBAAAAAYgGQAAAAAGJBgEAAAABiwYAAACLBgICAAAAywEAIF4AAO0aACADAAAAAwAgXgAA6xoAIF8AAPEaACAMAAAAAwAgAwAA6xQAIAUAAOwUACBXAADxGgAg7QUBAMEMACHuBUAAwwwAIfYFAQDBDAAhggdAAMQMACGIBwAA6hSIByKJBwEAyAwAIYoHQADDDAAhiwcBAMgMACEKAwAA6xQAIAUAAOwUACDtBQEAwQwAIe4FQADDDAAh9gUBAMEMACGCB0AAxAwAIYgHAADqFIgHIokHAQDIDAAhigdAAMMMACGLBwEAyAwAIQMAAADJAQAgXgAA7RoAIF8AAPQaACARAAAAyQEAIAMAAOAMACAHAADhDAAgVwAA9BoAIO0FAQDBDAAh7gVAAMMMACH2BQEAwQwAIYEGAQDIDAAhggYAAN4MgQYigwYBAMEMACGEBgEAwQwAIYUGAQDBDAAhhgYBAMEMACGHBgEAyAwAIYgGQADEDAAhiQYBAMgMACGLBgAA3wyLBiIPAwAA4AwAIAcAAOEMACDtBQEAwQwAIe4FQADDDAAh9gUBAMEMACGBBgEAyAwAIYIGAADeDIEGIoMGAQDBDAAhhAYBAMEMACGFBgEAwQwAIYYGAQDBDAAhhwYBAMgMACGIBkAAxAwAIYkGAQDIDAAhiwYAAN8MiwYiBAMAAgeYAgccADM2nAIyDgX7AQQcADE_gAIKQ4UCBkSIAilFiQIBR4oCKkiLAitLBgNM-gEvTf8BJE6DAgdPhAILUIcCMAQDAAIFCgQcAC5JDwUCAwACBAsDAgQAA0oABgQDAAIHEQccAC1J8wEFFwYAAhC2AQsTtwEPG7wBExwALCC9ARYhvgERIr8BECjAARkpwQEMNscBIDfIASE9uwEJPhMIP7UBCkC6AQhBwgESQsYBHUPMAQZE0AEpRdQBAUfYASpI3gErBAcABwgUBxwAKD0YCQgHAAcJAAgbqgETHAAnI6sBFyisARk7Ggo8rQEPGAMAAgcABw5uDQ9vDhtKExwAJh4eCx9LEyBPFiFSESJVECNZFyRaCSVeGChiGSlsDCptDCtyEixzEi13HC-AAR42hAEgN44BITqSASMEBgAKBwAHDCAMHUkCCgcABwoACgshCg4lDQ8pDhAqCxMuDxQyEBhDEhwAFQIMAAwNAAoCDAAMDQAKAwcABxEvCRIwDAYHAAcMMwwNAAoXNREbPhMcABQEBwAHDQAKFDYQGDgSBQcABww5DBUAChYAChc6EQUHAAcNAAoUQBAZPwkaQQoBG0IABA5EAA9FABBGABNHAAIHAAcNAAoCDQAKGQAJAQ0ACgUHAAcNZAoZYwkcABsnaBoBJgAZASdpAAIuAB0wfwoEBwAHHAAfLXgcL3weAg0ACi4AHQItfQAvfgAGBwAHHAAiMIUBCjOHASE0iQEgNYoBIAMHAAcxAAoyiAEgATWLAQACDQAKOQAkAwMAAhwAJTiTASMBOJQBABUOoQEAD6IBABuWAQAelQEAH5cBACCYAQAhmQEAIpoBACObAQAknAEAJZ0BACieAQApnwEAKqABACujAQAspAEALaUBAC-mAQA2pwEAN6gBADqpAQAEG64BACOvAQAosAEAPLEBAAE9sgEAAgMAAgfRAQcCB9oBB0bZAQICAwACBwAHFBDgAQAT4QEAG-QBACDlAQAh5gEAIucBACjoAQAp6QEANuwBADftAQA94wEAP98BAEDiAQBB6gEAQusBAEPuAQBE7wEARfABAEfxAQBI8gEAAUn0AQACBfUBAEn2AQABAwACAQMAAgwFjgIAP5ACAEOTAgBElAIARZUCAEeWAgBIlwIAS4wCAEyNAgBNjwIATpECAE-SAgABUQABATadAgAAAgMAAgenAgcCAwACB60CBwMcADhkADllADoAAAADHAA4ZAA5ZQA6AVEAAQFRAAEDHAA_ZABAZQBBAAAAAxwAP2QAQGUAQQIDAAIH1QIHAgMAAgfbAgcDHABGZABHZQBIAAAAAxwARmQAR2UASAIH7gIHRu0CAgIH9QIHRvQCAgMcAE1kAE5lAE8AAAADHABNZABOZQBPBAcABzCHAwoziAMhNIkDIAQHAAcwjwMKM5ADITSRAyADHABUZABVZQBWAAAAAxwAVGQAVWUAVgIHAAcxAAoCBwAHMQAKBRwAW2QAXmUAX7YBAFy3AQBdAAAAAAAFHABbZABeZQBftgEAXLcBAF0CAwACBwAHAgMAAgcABwUcAGRkAGdlAGi2AQBltwEAZgAAAAAABRwAZGQAZ2UAaLYBAGW3AQBmAAAABRwAbmQAcWUAcrYBAG-3AQBwAAAAAAAFHABuZABxZQBytgEAb7cBAHADBwAHCgAKC-gDCgMHAAcKAAoL7gMKBRwAd2QAemUAe7YBAHi3AQB5AAAAAAAFHAB3ZAB6ZQB7tgEAeLcBAHkCDAAMDQAKAgwADA0ACgMcAIABZACBAWUAggEAAAADHACAAWQAgQFlAIIBAgwADA0ACgIMAAwNAAoDHACHAWQAiAFlAIkBAAAAAxwAhwFkAIgBZQCJAQUHAAcMrAQMFQAKFgAKF60EEQUHAAcMswQMFQAKFgAKF7QEEQUcAI4BZACRAWUAkgG2AQCPAbcBAJABAAAAAAAFHACOAWQAkQFlAJIBtgEAjwG3AQCQAQIGAAI-xgQIAgYAAj7MBAgDHACXAWQAmAFlAJkBAAAAAxwAlwFkAJgBZQCZAQIDAAIHAAcCAwACBwAHBRwAngFkAKEBZQCiAbYBAJ8BtwEAoAEAAAAAAAUcAJ4BZAChAWUAogG2AQCfAbcBAKABBAYACgcABwz0BAwd9QQCBAYACgcABwz7BAwd_AQCAxwApwFkAKgBZQCpAQAAAAMcAKcBZACoAWUAqQEDBwAHEY4FCRKPBQwDBwAHEZUFCRKWBQwFHACuAWQAsQFlALIBtgEArwG3AQCwAQAAAAAABRwArgFkALEBZQCyAbYBAK8BtwEAsAEAAAUcALcBZAC6AWUAuwG2AQC4AbcBALkBAAAAAAAFHAC3AWQAugFlALsBtgEAuAG3AQC5AQEDAAIBAwACAxwAwAFkAMEBZQDCAQAAAAMcAMABZADBAWUAwgEBAwACAQMAAgMcAMcBZADIAWUAyQEAAAADHADHAWQAyAFlAMkBAgMAAgTsBQMCAwACBPIFAwMcAM4BZADPAWUA0AEAAAADHADOAWQAzwFlANABAQMAAgEDAAIDHADVAWQA1gFlANcBAAAAAxwA1QFkANYBZQDXAQINAAo5ACQCDQAKOQAkAxwA3AFkAN0BZQDeAQAAAAMcANwBZADdAWUA3gEDBwAHDbEGChmwBgkDBwAHDbgGChm3BgkFHADjAWQA5gFlAOcBtgEA5AG3AQDlAQAAAAAABRwA4wFkAOYBZQDnAbYBAOQBtwEA5QEBJgAZASYAGQUcAOwBZADvAWUA8AG2AQDtAbcBAO4BAAAAAAAFHADsAWQA7wFlAPABtgEA7QG3AQDuAQAAAAUcAPYBZAD5AWUA-gG2AQD3AbcBAPgBAAAAAAAFHAD2AWQA-QFlAPoBtgEA9wG3AQD4AQEHAAcBBwAHBRwA_wFkAIICZQCDArYBAIACtwEAgQIAAAAAAAUcAP8BZACCAmUAgwK2AQCAArcBAIECAi4AHTCPBwoCLgAdMJUHCgMcAIgCZACJAmUAigIAAAADHACIAmQAiQJlAIoCAg0ACi4AHQINAAouAB0DHACPAmQAkAJlAJECAAAAAxwAjwJkAJACZQCRAgEHAAcBBwAHBRwAlgJkAJkCZQCaArYBAJcCtwEAmAIAAAAAAAUcAJYCZACZAmUAmgK2AQCXArcBAJgCAwcABwkACDvTBwoDBwAHCQAIO9kHCgUcAJ8CZACiAmUAowK2AQCgArcBAKECAAAAAAAFHACfAmQAogJlAKMCtgEAoAK3AQChAgUHAAcNAAoU7AcQGesHCRrtBwoFBwAHDQAKFPQHEBnzBwka9QcKBRwAqAJkAKsCZQCsArYBAKkCtwEAqgIAAAAAAAUcAKgCZACrAmUArAK2AQCpArcBAKoCAgcABw0ACgIHAAcNAAoFHACxAmQAtAJlALUCtgEAsgK3AQCzAgAAAAAABRwAsQJkALQCZQC1ArYBALICtwEAswICBwAHDQAKAgcABw0ACgUcALoCZAC9AmUAvgK2AQC7ArcBALwCAAAAAAAFHAC6AmQAvQJlAL4CtgEAuwK3AQC8AgQHAAcMswgMDQAKF7QIEQQHAAcMuggMDQAKF7sIEQUcAMMCZADGAmUAxwK2AQDEArcBAMUCAAAAAAAFHADDAmQAxgJlAMcCtgEAxAK3AQDFAgINAAoZAAkCDQAKGQAJBRwAzAJkAM8CZQDQArYBAM0CtwEAzgIAAAAAAAUcAMwCZADPAmUA0AK2AQDNArcBAM4CAQ0ACgENAAoDHADVAmQA1gJlANcCAAAAAxwA1QJkANYCZQDXAgIDAAIH-QgHAgMAAgf_CAcDHADcAmQA3QJlAN4CAAAAAxwA3AJkAN0CZQDeAgEDAAIBAwACBRwA4wJkAOYCZQDnArYBAOQCtwEA5QIAAAAAAAUcAOMCZADmAmUA5wK2AQDkArcBAOUCAgQAA0oABgIEAANKAAYDHADsAmQA7QJlAO4CAAAAAxwA7AJkAO0CZQDuAgAAAAUcAPQCZAD3AmUA-AK2AQD1ArcBAPYCAAAAAAAFHAD0AmQA9wJlAPgCtgEA9QK3AQD2AlICAVOeAgFUnwIBVaACAVahAgFYowIBWaUCNFqmAjVbqQIBXKsCNF2sAjZgrgIBYa8CAWKwAjRmswI3Z7QCO2i1AjJptgIyarcCMmu4AjJsuQIybbsCMm69AjRvvgI8cMACMnHCAjRywwI9c8QCMnTFAjJ1xgI0dskCPnfKAkJ4ywIpecwCKXrNAil7zgIpfM8CKX3RAil-0wI0f9QCQ4AB1wIpgQHZAjSCAdoCRIMB3AIphAHdAimFAd4CNIYB4QJFhwHiAkmIAeMCKokB5AIqigHlAiqLAeYCKowB5wIqjQHpAiqOAesCNI8B7AJKkAHwAiqRAfICNJIB8wJLkwH2AiqUAfcCKpUB-AI0lgH7AkyXAfwCUJgB_QIgmQH-AiCaAf8CIJsBgAMgnAGBAyCdAYMDIJ4BhQM0nwGGA1GgAYsDIKEBjQM0ogGOA1KjAZIDIKQBkwMgpQGUAzSmAZcDU6cBmANXqAGZAyGpAZoDIaoBmwMhqwGcAyGsAZ0DIa0BnwMhrgGhAzSvAaIDWLABpAMhsQGmAzSyAacDWbMBqAMhtAGpAyG1AaoDNLgBrQNauQGuA2C6Aa8DK7sBsAMrvAGxAyu9AbIDK74BswMrvwG1AyvAAbcDNMEBuANhwgG6AyvDAbwDNMQBvQNixQG-AyvGAb8DK8cBwAM0yAHDA2PJAcQDacoBxgNqywHHA2rMAcoDas0BywNqzgHMA2rPAc4DatAB0AM00QHRA2vSAdMDatMB1QM01AHWA2zVAdcDatYB2ANq1wHZAzTYAdwDbdkB3QNz2gHeAwzbAd8DDNwB4AMM3QHhAwzeAeIDDN8B5AMM4AHmAzThAecDdOIB6gMM4wHsAzTkAe0DdeUB7wMM5gHwAwznAfEDNOgB9AN26QH1A3zqAfYDDesB9wMN7AH4Aw3tAfkDDe4B-gMN7wH8Aw3wAf4DNPEB_wN98gGBBA3zAYMENPQBhAR-9QGFBA32AYYEDfcBhwQ0-AGKBH_5AYsEgwH6AYwEDvsBjQQO_AGOBA79AY8EDv4BkAQO_wGSBA6AApQENIEClQSEAYIClwQOgwKZBDSEApoEhQGFApsEDoYCnAQOhwKdBDSIAqAEhgGJAqEEigGKAqIEEosCowQSjAKkBBKNAqUEEo4CpgQSjwKoBBKQAqoENJECqwSLAZICrwQSkwKxBDSUArIEjAGVArUEEpYCtgQSlwK3BDSYAroEjQGZArsEkwGaArwEB5sCvQQHnAK-BAedAr8EB54CwAQHnwLCBAegAsQENKECxQSUAaICyAQHowLKBDSkAssElQGlAs0EB6YCzgQHpwLPBDSoAtIElgGpAtMEmgGqAtQECqsC1QQKrALWBAqtAtcECq4C2AQKrwLaBAqwAtwENLEC3QSbAbIC3wQKswLhBDS0AuIEnAG1AuMECrYC5AQKtwLlBDS4AugEnQG5AukEowG6AuoEC7sC6wQLvALsBAu9Au0EC74C7gQLvwLwBAvAAvIENMEC8wSkAcIC9wQLwwL5BDTEAvoEpQHFAv0EC8YC_gQLxwL_BDTIAoIFpgHJAoMFqgHKAoQFD8sChQUPzAKGBQ_NAocFD84CiAUPzwKKBQ_QAowFNNECjQWrAdICkQUP0wKTBTTUApQFrAHVApcFD9YCmAUP1wKZBTTYApwFrQHZAp0FswHaAp8FAtsCoAUC3AKiBQLdAqMFAt4CpAUC3wKmBQLgAqgFNOECqQW0AeICqwUC4wKtBTTkAq4FtQHlAq8FAuYCsAUC5wKxBTToArQFtgHpArUFvAHqArYFA-sCtwUD7AK4BQPtArkFA-4CugUD7wK8BQPwAr4FNPECvwW9AfICwQUD8wLDBTT0AsQFvgH1AsUFA_YCxgUD9wLHBTT4AsoFvwH5AssFwwH6AswFL_sCzQUv_ALOBS_9As8FL_4C0AUv_wLSBS-AA9QFNIED1QXEAYID1wUvgwPZBTSEA9oFxQGFA9sFL4YD3AUvhwPdBTSIA-AFxgGJA-EFygGKA-IFBIsD4wUEjAPkBQSNA-UFBI4D5gUEjwPoBQSQA-oFNJED6wXLAZID7gUEkwPwBTSUA_EFzAGVA_MFBJYD9AUElwP1BTSYA_gFzQGZA_kF0QGaA_oFJJsD-wUknAP8BSSdA_0FJJ4D_gUknwOABiSgA4IGNKEDgwbSAaIDhQYkowOHBjSkA4gG0wGlA4kGJKYDigYkpwOLBjSoA44G1AGpA48G2AGqA5AGI6sDkQYjrAOSBiOtA5MGI64DlAYjrwOWBiOwA5gGNLEDmQbZAbIDmwYjswOdBjS0A54G2gG1A58GI7YDoAYjtwOhBjS4A6QG2wG5A6UG3wG6A6YGGbsDpwYZvAOoBhm9A6kGGb4DqgYZvwOsBhnAA64GNMEDrwbgAcIDswYZwwO1BjTEA7YG4QHFA7kGGcYDugYZxwO7BjTIA74G4gHJA78G6AHKA8AGGssDwQYazAPCBhrNA8MGGs4DxAYazwPGBhrQA8gGNNEDyQbpAdIDywYa0wPNBjTUA84G6gHVA88GGtYD0AYa1wPRBjTYA9QG6wHZA9UG8QHaA9cG8gHbA9gG8gHcA9sG8gHdA9wG8gHeA90G8gHfA98G8gHgA-EGNOED4gbzAeID5AbyAeMD5gY05APnBvQB5QPoBvIB5gPpBvIB5wPqBjToA-0G9QHpA-4G-wHqA-8GHesD8AYd7APxBh3tA_IGHe4D8wYd7wP1Bh3wA_cGNPED-Ab8AfID-gYd8wP8BjT0A_0G_QH1A_4GHfYD_wYd9wOABzT4A4MH_gH5A4QHhAL6A4UHHPsDhgcc_AOHBxz9A4gHHP4DiQcc_wOLBxyABI0HNIEEjgeFAoIEkQccgwSTBzSEBJQHhgKFBJYHHIYElwcchwSYBzSIBJsHhwKJBJwHiwKKBJ0HHosEngcejASfBx6NBKAHHo4EoQcejwSjBx6QBKUHNJEEpgeMApIEqAcekwSqBzSUBKsHjQKVBKwHHpYErQcelwSuBzSYBLEHjgKZBLIHkgKaBLMHCJsEtAcInAS1BwidBLYHCJ4EtwcInwS5BwigBLsHNKEEvAeTAqIEvgcIowTABzSkBMEHlAKlBMIHCKYEwwcIpwTEBzSoBMcHlQKpBMgHmwKqBMkHCasEygcJrATLBwmtBMwHCa4EzQcJrwTPBwmwBNEHNLEE0gecArIE1QcJswTXBzS0BNgHnQK1BNoHCbYE2wcJtwTcBzS4BN8HngK5BOAHpAK6BOEHE7sE4gcTvATjBxO9BOQHE74E5QcTvwTnBxPABOkHNMEE6gelAsIE7wcTwwTxBzTEBPIHpgLFBPYHE8YE9wcTxwT4BzTIBPsHpwLJBPwHrQLKBP0HFssE_gcWzAT_BxbNBIAIFs4EgQgWzwSDCBbQBIUINNEEhgiuAtIEiAgW0wSKCDTUBIsIrwLVBIwIFtYEjQgW1wSOCDTYBJEIsALZBJIItgLaBJMIEdsElAgR3ASVCBHdBJYIEd4ElwgR3wSZCBHgBJsINOEEnAi3AuIEnggR4wSgCDTkBKEIuALlBKIIEeYEowgR5wSkCDToBKcIuQLpBKgIvwLqBKkIEOsEqggQ7ASrCBDtBKwIEO4ErQgQ7wSvCBDwBLEINPEEsgjAAvIEtggQ8wS4CDT0BLkIwQL1BLwIEPYEvQgQ9wS-CDT4BMEIwgL5BMIIyAL6BMMIF_sExAgX_ATFCBf9BMYIF_4ExwgX_wTJCBeABcsINIEFzAjJAoIFzggXgwXQCDSEBdEIygKFBdIIF4YF0wgXhwXUCDSIBdcIywKJBdgI0QKKBdkIGIsF2ggYjAXbCBiNBdwIGI4F3QgYjwXfCBiQBeEINJEF4gjSApIF5AgYkwXmCDSUBecI0wKVBegIGJYF6QgYlwXqCDSYBe0I1AKZBe4I2AKaBe8IBpsF8AgGnAXxCAadBfIIBp4F8wgGnwX1CAagBfcINKEF-AjZAqIF-wgGowX9CDSkBf4I2gKlBYAJBqYFgQkGpwWCCTSoBYUJ2wKpBYYJ3wKqBYgJMKsFiQkwrAWLCTCtBYwJMK4FjQkwrwWPCTCwBZEJNLEFkgngArIFlAkwswWWCTS0BZcJ4QK1BZgJMLYFmQkwtwWaCTS4BZ0J4gK5BZ4J6AK6BZ8JBbsFoAkFvAWhCQW9BaIJBb4FowkFvwWlCQXABacJNMEFqAnpAsIFqgkFwwWsCTTEBa0J6gLFBa4JBcYFrwkFxwWwCTTIBbMJ6wLJBbQJ7wLKBbYJ8ALLBbcJ8ALMBboJ8ALNBbsJ8ALOBbwJ8ALPBb4J8ALQBcAJNNEFwQnxAtIFwwnwAtMFxQk01AXGCfIC1QXHCfAC1gXICfAC1wXJCTTYBcwJ8wLZBc0J-QI"
};
async function decodeBase64AsWasm(wasmBase64) {
  const { Buffer: Buffer2 } = await import("node:buffer");
  const wasmArray = Buffer2.from(wasmBase64, "base64");
  return new WebAssembly.Module(wasmArray);
}
config.compilerWasm = {
  getRuntime: async () => await import("@prisma/client/runtime/query_compiler_fast_bg.postgresql.mjs"),
  getQueryCompilerWasmModule: async () => {
    const { wasm } = await import("@prisma/client/runtime/query_compiler_fast_bg.postgresql.wasm-base64.mjs");
    return await decodeBase64AsWasm(wasm);
  },
  importName: "./query_compiler_fast_bg.js"
};
function getPrismaClientClass() {
  return runtime.getPrismaClient(config);
}

// generated/prisma/internal/prismaNamespace.ts
var prismaNamespace_exports = {};
__export(prismaNamespace_exports, {
  AgendaItemScalarFieldEnum: () => AgendaItemScalarFieldEnum,
  AgentConversationScalarFieldEnum: () => AgentConversationScalarFieldEnum,
  AgentMessageScalarFieldEnum: () => AgentMessageScalarFieldEnum,
  AnyNull: () => AnyNull2,
  AttachmentScalarFieldEnum: () => AttachmentScalarFieldEnum,
  AttendanceScalarFieldEnum: () => AttendanceScalarFieldEnum,
  AuditLogScalarFieldEnum: () => AuditLogScalarFieldEnum,
  BallotScalarFieldEnum: () => BallotScalarFieldEnum,
  BidScalarFieldEnum: () => BidScalarFieldEnum,
  CycleScalarFieldEnum: () => CycleScalarFieldEnum,
  DbNull: () => DbNull2,
  Decimal: () => Decimal2,
  DeploymentJobScalarFieldEnum: () => DeploymentJobScalarFieldEnum,
  DeviceScalarFieldEnum: () => DeviceScalarFieldEnum,
  DisbursementScalarFieldEnum: () => DisbursementScalarFieldEnum,
  GroupScalarFieldEnum: () => GroupScalarFieldEnum,
  InviteScalarFieldEnum: () => InviteScalarFieldEnum,
  JsonNull: () => JsonNull2,
  JsonNullValueFilter: () => JsonNullValueFilter,
  JsonNullValueInput: () => JsonNullValueInput,
  LedgerPostingScalarFieldEnum: () => LedgerPostingScalarFieldEnum,
  LedgerTransactionScalarFieldEnum: () => LedgerTransactionScalarFieldEnum,
  LoanScalarFieldEnum: () => LoanScalarFieldEnum,
  MeetingScalarFieldEnum: () => MeetingScalarFieldEnum,
  MembershipScalarFieldEnum: () => MembershipScalarFieldEnum,
  MessageScalarFieldEnum: () => MessageScalarFieldEnum,
  ModelName: () => ModelName,
  NotificationPrefsScalarFieldEnum: () => NotificationPrefsScalarFieldEnum,
  NotificationScalarFieldEnum: () => NotificationScalarFieldEnum,
  NullTypes: () => NullTypes2,
  NullableJsonNullValueInput: () => NullableJsonNullValueInput,
  NullsOrder: () => NullsOrder,
  ObligationScalarFieldEnum: () => ObligationScalarFieldEnum,
  PaymentIntentScalarFieldEnum: () => PaymentIntentScalarFieldEnum,
  PaymentNumberScalarFieldEnum: () => PaymentNumberScalarFieldEnum,
  PendingActionScalarFieldEnum: () => PendingActionScalarFieldEnum,
  PinResetApprovalScalarFieldEnum: () => PinResetApprovalScalarFieldEnum,
  PinResetScalarFieldEnum: () => PinResetScalarFieldEnum,
  PrismaClientInitializationError: () => PrismaClientInitializationError2,
  PrismaClientKnownRequestError: () => PrismaClientKnownRequestError2,
  PrismaClientRustPanicError: () => PrismaClientRustPanicError2,
  PrismaClientUnknownRequestError: () => PrismaClientUnknownRequestError2,
  PrismaClientValidationError: () => PrismaClientValidationError2,
  ProposalScalarFieldEnum: () => ProposalScalarFieldEnum,
  PushTicketScalarFieldEnum: () => PushTicketScalarFieldEnum,
  QueryMode: () => QueryMode,
  RateLimitRecordScalarFieldEnum: () => RateLimitRecordScalarFieldEnum,
  ReconciliationRunScalarFieldEnum: () => ReconciliationRunScalarFieldEnum,
  RefreshTokenScalarFieldEnum: () => RefreshTokenScalarFieldEnum,
  RoundScalarFieldEnum: () => RoundScalarFieldEnum,
  RuleSetScalarFieldEnum: () => RuleSetScalarFieldEnum,
  SolidarityRequestScalarFieldEnum: () => SolidarityRequestScalarFieldEnum,
  SortOrder: () => SortOrder,
  Sql: () => Sql2,
  StatementScalarFieldEnum: () => StatementScalarFieldEnum,
  TransactionIsolationLevel: () => TransactionIsolationLevel,
  UploadTicketScalarFieldEnum: () => UploadTicketScalarFieldEnum,
  UserScalarFieldEnum: () => UserScalarFieldEnum,
  VoteReceiptScalarFieldEnum: () => VoteReceiptScalarFieldEnum,
  defineExtension: () => defineExtension,
  empty: () => empty2,
  getExtensionContext: () => getExtensionContext,
  join: () => join2,
  prismaVersion: () => prismaVersion,
  raw: () => raw2,
  sql: () => sql
});
import * as runtime2 from "@prisma/client/runtime/client";
var PrismaClientKnownRequestError2 = runtime2.PrismaClientKnownRequestError;
var PrismaClientUnknownRequestError2 = runtime2.PrismaClientUnknownRequestError;
var PrismaClientRustPanicError2 = runtime2.PrismaClientRustPanicError;
var PrismaClientInitializationError2 = runtime2.PrismaClientInitializationError;
var PrismaClientValidationError2 = runtime2.PrismaClientValidationError;
var sql = runtime2.sqltag;
var empty2 = runtime2.empty;
var join2 = runtime2.join;
var raw2 = runtime2.raw;
var Sql2 = runtime2.Sql;
var Decimal2 = runtime2.Decimal;
var getExtensionContext = runtime2.Extensions.getExtensionContext;
var prismaVersion = {
  client: "7.10.1",
  engine: "d1b3f377ca835d73fd50954a5e22128b9ebdd6b8"
};
var NullTypes2 = {
  DbNull: runtime2.NullTypes.DbNull,
  JsonNull: runtime2.NullTypes.JsonNull,
  AnyNull: runtime2.NullTypes.AnyNull
};
var DbNull2 = runtime2.DbNull;
var JsonNull2 = runtime2.JsonNull;
var AnyNull2 = runtime2.AnyNull;
var ModelName = {
  AgentConversation: "AgentConversation",
  AgentMessage: "AgentMessage",
  PendingAction: "PendingAction",
  AuditLog: "AuditLog",
  Message: "Message",
  Attachment: "Attachment",
  UploadTicket: "UploadTicket",
  DeploymentJob: "DeploymentJob",
  Proposal: "Proposal",
  VoteReceipt: "VoteReceipt",
  Ballot: "Ballot",
  SolidarityRequest: "SolidarityRequest",
  Group: "Group",
  Membership: "Membership",
  Invite: "Invite",
  RuleSet: "RuleSet",
  User: "User",
  Device: "Device",
  PaymentNumber: "PaymentNumber",
  RefreshToken: "RefreshToken",
  PinReset: "PinReset",
  PinResetApproval: "PinResetApproval",
  LedgerTransaction: "LedgerTransaction",
  LedgerPosting: "LedgerPosting",
  ReconciliationRun: "ReconciliationRun",
  Meeting: "Meeting",
  AgendaItem: "AgendaItem",
  Attendance: "Attendance",
  Cycle: "Cycle",
  Round: "Round",
  Obligation: "Obligation",
  PaymentIntent: "PaymentIntent",
  Disbursement: "Disbursement",
  Loan: "Loan",
  Bid: "Bid",
  Statement: "Statement",
  Notification: "Notification",
  NotificationPrefs: "NotificationPrefs",
  PushTicket: "PushTicket",
  RateLimitRecord: "RateLimitRecord"
};
var TransactionIsolationLevel = runtime2.makeStrictEnum({
  ReadUncommitted: "ReadUncommitted",
  ReadCommitted: "ReadCommitted",
  RepeatableRead: "RepeatableRead",
  Serializable: "Serializable"
});
var AgentConversationScalarFieldEnum = {
  id: "id",
  createdAt: "createdAt",
  updatedAt: "updatedAt",
  userId: "userId",
  groupId: "groupId",
  channel: "channel",
  rollingSummary: "rollingSummary"
};
var AgentMessageScalarFieldEnum = {
  id: "id",
  createdAt: "createdAt",
  conversationId: "conversationId",
  role: "role",
  content: "content",
  toolName: "toolName",
  toolArgsRedacted: "toolArgsRedacted",
  toolStatus: "toolStatus"
};
var PendingActionScalarFieldEnum = {
  id: "id",
  createdAt: "createdAt",
  userId: "userId",
  groupId: "groupId",
  type: "type",
  args: "args",
  preview: "preview",
  level: "level",
  status: "status",
  origin: "origin",
  expiresAt: "expiresAt",
  confirmedAt: "confirmedAt",
  completedAt: "completedAt",
  resultRef: "resultRef",
  resultSummary: "resultSummary",
  failureCode: "failureCode",
  failureText: "failureText"
};
var AuditLogScalarFieldEnum = {
  id: "id",
  createdAt: "createdAt",
  actorUserId: "actorUserId",
  groupId: "groupId",
  action: "action",
  target: "target",
  details: "details",
  deviceId: "deviceId",
  requestId: "requestId"
};
var MessageScalarFieldEnum = {
  id: "id",
  createdAt: "createdAt",
  groupId: "groupId",
  authorMembershipId: "authorMembershipId",
  kind: "kind",
  text: "text",
  systemText: "systemText",
  attachmentId: "attachmentId",
  replyToId: "replyToId",
  mentions: "mentions",
  isAnnouncement: "isAnnouncement",
  deletedAt: "deletedAt",
  hiddenByAdminAt: "hiddenByAdminAt"
};
var AttachmentScalarFieldEnum = {
  id: "id",
  createdAt: "createdAt",
  groupId: "groupId",
  uploaderMembershipId: "uploaderMembershipId",
  kind: "kind",
  mime: "mime",
  sizeBytes: "sizeBytes",
  durationSec: "durationSec",
  width: "width",
  height: "height",
  storageKey: "storageKey",
  thumbnailKey: "thumbnailKey"
};
var UploadTicketScalarFieldEnum = {
  id: "id",
  createdAt: "createdAt",
  userId: "userId",
  groupId: "groupId",
  kind: "kind",
  declaredMime: "declaredMime",
  maxBytes: "maxBytes",
  storageKey: "storageKey",
  thumbnailKey: "thumbnailKey",
  expiresAt: "expiresAt",
  completedAt: "completedAt",
  attachmentId: "attachmentId"
};
var DeploymentJobScalarFieldEnum = {
  id: "id",
  name: "name",
  jobKey: "jobKey",
  payload: "payload",
  runAt: "runAt",
  status: "status",
  attempts: "attempts",
  maxAttempts: "maxAttempts",
  leaseUntil: "leaseUntil",
  leaseToken: "leaseToken",
  lastError: "lastError",
  createdAt: "createdAt",
  updatedAt: "updatedAt"
};
var ProposalScalarFieldEnum = {
  id: "id",
  createdAt: "createdAt",
  groupId: "groupId",
  type: "type",
  payload: "payload",
  reason: "reason",
  proposerMembershipId: "proposerMembershipId",
  secret: "secret",
  thresholdKind: "thresholdKind",
  eligibleMembershipIds: "eligibleMembershipIds",
  subjectMembershipId: "subjectMembershipId",
  mustApproveMembershipIds: "mustApproveMembershipIds",
  remindedAt: "remindedAt",
  yesCount: "yesCount",
  noCount: "noCount",
  opensAt: "opensAt",
  closesAt: "closesAt",
  status: "status",
  closedAt: "closedAt",
  appliedAt: "appliedAt",
  effect: "effect"
};
var VoteReceiptScalarFieldEnum = {
  id: "id",
  createdAt: "createdAt",
  proposalId: "proposalId",
  membershipId: "membershipId",
  votedAt: "votedAt"
};
var BallotScalarFieldEnum = {
  id: "id",
  createdAt: "createdAt",
  proposalId: "proposalId",
  membershipId: "membershipId",
  choice: "choice",
  castAt: "castAt"
};
var SolidarityRequestScalarFieldEnum = {
  id: "id",
  createdAt: "createdAt",
  groupId: "groupId",
  requesterMembershipId: "requesterMembershipId",
  recipientMembershipId: "recipientMembershipId",
  event: "event",
  amount: "amount",
  note: "note",
  proposalId: "proposalId",
  status: "status",
  disbursementId: "disbursementId"
};
var GroupScalarFieldEnum = {
  id: "id",
  createdAt: "createdAt",
  updatedAt: "updatedAt",
  name: "name",
  status: "status",
  createdByUserId: "createdByUserId",
  firstPayoutAt: "firstPayoutAt",
  currentCycleId: "currentCycleId",
  providerAccount: "providerAccount"
};
var MembershipScalarFieldEnum = {
  id: "id",
  createdAt: "createdAt",
  groupId: "groupId",
  userId: "userId",
  role: "role",
  status: "status",
  activeFromCycle: "activeFromCycle",
  leftAt: "leftAt",
  chatLastReadAt: "chatLastReadAt"
};
var InviteScalarFieldEnum = {
  id: "id",
  createdAt: "createdAt",
  groupId: "groupId",
  proposalId: "proposalId",
  inviteeName: "inviteeName",
  phoneHash: "phoneHash",
  tokenHash: "tokenHash",
  expiresAt: "expiresAt",
  usedAt: "usedAt",
  acceptedByUserId: "acceptedByUserId",
  revokedAt: "revokedAt",
  createdByMembershipId: "createdByMembershipId"
};
var RuleSetScalarFieldEnum = {
  id: "id",
  createdAt: "createdAt",
  groupId: "groupId",
  version: "version",
  params: "params",
  effectiveFromRoundId: "effectiveFromRoundId",
  createdByProposalId: "createdByProposalId"
};
var UserScalarFieldEnum = {
  id: "id",
  createdAt: "createdAt",
  updatedAt: "updatedAt",
  name: "name",
  loginPhone: "loginPhone",
  pinHash: "pinHash",
  language: "language",
  consentVersion: "consentVersion",
  consentAt: "consentAt",
  pinChangedAt: "pinChangedAt",
  pinResetAt: "pinResetAt",
  sessionEpoch: "sessionEpoch",
  deletedAt: "deletedAt"
};
var DeviceScalarFieldEnum = {
  id: "id",
  createdAt: "createdAt",
  userId: "userId",
  platform: "platform",
  expoPushToken: "expoPushToken",
  lastSeenAt: "lastSeenAt",
  sessionFamilyId: "sessionFamilyId",
  revokedAt: "revokedAt"
};
var PaymentNumberScalarFieldEnum = {
  id: "id",
  createdAt: "createdAt",
  userId: "userId",
  number: "number",
  operator: "operator",
  activeFrom: "activeFrom",
  activeTo: "activeTo"
};
var RefreshTokenScalarFieldEnum = {
  id: "id",
  createdAt: "createdAt",
  userId: "userId",
  familyId: "familyId",
  tokenHash: "tokenHash",
  client: "client",
  deviceId: "deviceId",
  expiresAt: "expiresAt",
  usedAt: "usedAt",
  replacedByTokenId: "replacedByTokenId",
  revokedAt: "revokedAt",
  revokedReason: "revokedReason"
};
var PinResetScalarFieldEnum = {
  id: "id",
  createdAt: "createdAt",
  userId: "userId",
  status: "status",
  requestExpiresAt: "requestExpiresAt",
  approvedInGroupId: "approvedInGroupId",
  approvedAt: "approvedAt",
  tokenHash: "tokenHash",
  linkExpiresAt: "linkExpiresAt",
  completedAt: "completedAt"
};
var PinResetApprovalScalarFieldEnum = {
  id: "id",
  createdAt: "createdAt",
  pinResetId: "pinResetId",
  groupId: "groupId",
  membershipId: "membershipId"
};
var LedgerTransactionScalarFieldEnum = {
  id: "id",
  createdAt: "createdAt",
  groupId: "groupId",
  seq: "seq",
  type: "type",
  occurredAt: "occurredAt",
  roundId: "roundId",
  membershipId: "membershipId",
  refType: "refType",
  refId: "refId",
  descriptionFr: "descriptionFr",
  descriptionEn: "descriptionEn",
  metadata: "metadata",
  prevHash: "prevHash",
  hash: "hash"
};
var LedgerPostingScalarFieldEnum = {
  id: "id",
  createdAt: "createdAt",
  transactionId: "transactionId",
  account: "account",
  amount: "amount"
};
var ReconciliationRunScalarFieldEnum = {
  id: "id",
  createdAt: "createdAt",
  ranAt: "ranAt",
  providerAccount: "providerAccount",
  providerBalance: "providerBalance",
  ledgerCash: "ledgerCash",
  inFlight: "inFlight",
  difference: "difference",
  status: "status",
  details: "details"
};
var MeetingScalarFieldEnum = {
  id: "id",
  createdAt: "createdAt",
  groupId: "groupId",
  scheduledAt: "scheduledAt",
  place: "place",
  status: "status",
  agenda: "agenda",
  minutesDraft: "minutesDraft",
  minutesPublished: "minutesPublished",
  minutesVersion: "minutesVersion",
  publishedAt: "publishedAt"
};
var AgendaItemScalarFieldEnum = {
  id: "id",
  createdAt: "createdAt",
  meetingId: "meetingId",
  authorMembershipId: "authorMembershipId",
  text: "text",
  source: "source"
};
var AttendanceScalarFieldEnum = {
  id: "id",
  createdAt: "createdAt",
  meetingId: "meetingId",
  membershipId: "membershipId",
  present: "present",
  excused: "excused",
  excuseReason: "excuseReason",
  checkedInAt: "checkedInAt",
  markedByMembershipId: "markedByMembershipId"
};
var CycleScalarFieldEnum = {
  id: "id",
  createdAt: "createdAt",
  groupId: "groupId",
  number: "number",
  mode: "mode",
  firstPayoutAt: "firstPayoutAt",
  drawSeed: "drawSeed",
  rotation: "rotation",
  startedAt: "startedAt",
  closedAt: "closedAt"
};
var RoundScalarFieldEnum = {
  id: "id",
  createdAt: "createdAt",
  groupId: "groupId",
  cycleId: "cycleId",
  number: "number",
  beneficiaryMembershipId: "beneficiaryMembershipId",
  dueAt: "dueAt",
  payoutAt: "payoutAt",
  status: "status",
  ruleSetVersion: "ruleSetVersion"
};
var ObligationScalarFieldEnum = {
  id: "id",
  createdAt: "createdAt",
  groupId: "groupId",
  membershipId: "membershipId",
  kind: "kind",
  roundId: "roundId",
  loanId: "loanId",
  creditorMembershipId: "creditorMembershipId",
  amount: "amount",
  dueAt: "dueAt",
  status: "status",
  paidAt: "paidAt",
  onTime: "onTime"
};
var PaymentIntentScalarFieldEnum = {
  id: "id",
  createdAt: "createdAt",
  updatedAt: "updatedAt",
  groupId: "groupId",
  membershipId: "membershipId",
  obligationIds: "obligationIds",
  amount: "amount",
  phoneSnapshot: "phoneSnapshot",
  provider: "provider",
  providerRef: "providerRef",
  status: "status",
  fee: "fee",
  feeSource: "feeSource",
  operator: "operator",
  operatorRef: "operatorRef",
  settledAt: "settledAt"
};
var DisbursementScalarFieldEnum = {
  id: "id",
  createdAt: "createdAt",
  updatedAt: "updatedAt",
  groupId: "groupId",
  membershipId: "membershipId",
  purpose: "purpose",
  amount: "amount",
  feeEstimated: "feeEstimated",
  feeActual: "feeActual",
  phoneSnapshot: "phoneSnapshot",
  provider: "provider",
  providerRef: "providerRef",
  status: "status",
  settledAt: "settledAt"
};
var LoanScalarFieldEnum = {
  id: "id",
  createdAt: "createdAt",
  updatedAt: "updatedAt",
  groupId: "groupId",
  membershipId: "membershipId",
  principal: "principal",
  months: "months",
  ratePermille: "ratePermille",
  interest: "interest",
  feeEstimated: "feeEstimated",
  totalDue: "totalDue",
  status: "status",
  decidedByMembershipId: "decidedByMembershipId",
  decisionReason: "decisionReason",
  decidedAt: "decidedAt",
  proposalId: "proposalId",
  disbursementId: "disbursementId"
};
var BidScalarFieldEnum = {
  id: "id",
  createdAt: "createdAt",
  roundId: "roundId",
  membershipId: "membershipId",
  amount: "amount",
  placedAt: "placedAt",
  updatedAt: "updatedAt"
};
var StatementScalarFieldEnum = {
  id: "id",
  createdAt: "createdAt",
  membershipId: "membershipId",
  periodStart: "periodStart",
  periodEnd: "periodEnd",
  language: "language",
  fileKey: "fileKey",
  verificationCode: "verificationCode",
  ledgerHeadHash: "ledgerHeadHash"
};
var NotificationScalarFieldEnum = {
  id: "id",
  createdAt: "createdAt",
  userId: "userId",
  groupId: "groupId",
  category: "category",
  titleFr: "titleFr",
  titleEn: "titleEn",
  bodyFr: "bodyFr",
  bodyEn: "bodyEn",
  deepLink: "deepLink",
  readAt: "readAt",
  pushTicketId: "pushTicketId",
  pushStatus: "pushStatus"
};
var NotificationPrefsScalarFieldEnum = {
  id: "id",
  createdAt: "createdAt",
  updatedAt: "updatedAt",
  userId: "userId",
  mutedCategories: "mutedCategories",
  quietStartMinute: "quietStartMinute",
  quietEndMinute: "quietEndMinute",
  mutedChatGroupIds: "mutedChatGroupIds",
  mediaAutoDownload: "mediaAutoDownload"
};
var PushTicketScalarFieldEnum = {
  id: "id",
  createdAt: "createdAt",
  notificationId: "notificationId",
  deviceId: "deviceId",
  ticketId: "ticketId",
  status: "status",
  error: "error",
  checkedAt: "checkedAt"
};
var RateLimitRecordScalarFieldEnum = {
  key: "key",
  consumed: "consumed",
  expiresAt: "expiresAt",
  blockedUntil: "blockedUntil",
  updatedAt: "updatedAt"
};
var SortOrder = {
  asc: "asc",
  desc: "desc"
};
var NullableJsonNullValueInput = {
  DbNull: DbNull2,
  JsonNull: JsonNull2
};
var JsonNullValueInput = {
  JsonNull: JsonNull2
};
var QueryMode = {
  default: "default",
  insensitive: "insensitive"
};
var NullsOrder = {
  first: "first",
  last: "last"
};
var JsonNullValueFilter = {
  DbNull: DbNull2,
  JsonNull: JsonNull2,
  AnyNull: AnyNull2
};
var defineExtension = runtime2.Extensions.defineExtension;

// generated/prisma/client.ts
globalThis["__dirname"] = path.dirname(fileURLToPath(import.meta.url));
var PrismaClient = getPrismaClientClass();

// src/config/env.ts
import { z as z4 } from "zod";
var secret = (name) => z4.string().min(32, `${name} must be at least 32 characters (generate it, never type it)`);
var optionalString = z4.string().optional().transform((v) => v === void 0 || v.trim() === "" ? void 0 : v.trim());
function isBareOrigin(value) {
  try {
    const url = new URL(value);
    return (url.protocol === "http:" || url.protocol === "https:") && url.pathname === "/" && !url.search && !url.hash && !url.username && !url.password;
  } catch {
    return false;
  }
}
var feeScheduleSchema = z4.strictObject({
  collection: z4.number().int().min(0),
  disbursement: z4.number().int().min(0)
});
var schema = z4.object({
  NODE_ENV: z4.enum(["development", "test", "production"]).default("development"),
  PORT: z4.coerce.number().int().min(1).max(65535).default(3e3),
  /** Interface to listen on. Unset: every interface in development (phones on the LAN, D21),
   *  loopback otherwise (production sits behind a proxy; set HOST=0.0.0.0 in a container). */
  HOST: optionalString,
  LOG_LEVEL: z4.enum(["fatal", "error", "warn", "info", "debug", "trace", "silent"]).optional(),
  /** Number of proxy hops in front of the API (for client IPs in rate limits). */
  TRUST_PROXY: z4.coerce.number().int().min(0).max(5).default(0),
  DATABASE_URL: z4.string().url("DATABASE_URL must be a postgresql:// URL"),
  /** Optional during the Vercel transition; production serverless paths must not depend on it. */
  REDIS_URL: optionalString.pipe(z4.string().url("REDIS_URL must be a redis:// URL").optional()),
  JWT_SECRET: secret("JWT_SECRET"),
  JWT_REFRESH_SECRET: secret("JWT_REFRESH_SECRET"),
  CRON_SECRET: optionalString.pipe(z4.string().min(32).optional()),
  /** Key for hashing invited phone numbers. Falls back to a key derived from JWT_REFRESH_SECRET. */
  HASH_SECRET: optionalString.pipe(z4.string().min(32).optional()),
  STORAGE_DRIVER: z4.enum(["local", "s3", "supabase"]).default("local"),
  STORAGE_LOCAL_DIR: z4.string().default(".storage"),
  STORAGE_SIGNING_SECRET: optionalString,
  S3_ENDPOINT: optionalString,
  S3_REGION: optionalString,
  S3_BUCKET: optionalString,
  S3_ACCESS_KEY: optionalString,
  S3_SECRET_KEY: optionalString,
  SUPABASE_URL: optionalString.pipe(z4.string().url().optional()),
  SUPABASE_SERVICE_ROLE_KEY: optionalString,
  /** Project JWT signing secret used only to mint short-lived Realtime client tokens. */
  SUPABASE_JWT_SECRET: optionalString.pipe(z4.string().min(32).optional()),
  SUPABASE_STORAGE_BUCKET: optionalString,
  PAYMENT_PROVIDER: z4.enum(["mock", "campay"]).default("mock"),
  CAMPAY_USERNAME: optionalString,
  CAMPAY_PASSWORD: optionalString,
  CAMPAY_ENV: z4.enum(["DEV", "PROD"]).default("DEV"),
  FEE_SCHEDULE: z4.string().default('{"collection":100,"disbursement":500}').transform((raw3, ctx) => {
    try {
      return feeScheduleSchema.parse(JSON.parse(raw3));
    } catch {
      ctx.addIssue({
        code: "custom",
        message: 'FEE_SCHEDULE must be {"collection":int,"disbursement":int}'
      });
      return z4.NEVER;
    }
  }),
  /** Expo push access token (optional; enhanced push security in the Expo project). */
  EXPO_ACCESS_TOKEN: optionalString,
  OPENROUTER_API_KEY: optionalString,
  OPENROUTER_MODEL: optionalString,
  OPENROUTER_BASE_URL: z4.string().url().default("https://openrouter.ai/api/v1"),
  APP_TIMEZONE: z4.literal("Africa/Douala").default("Africa/Douala"),
  /** Public mobile/web application origin for links that must open an app route. Falls back to
   * PUBLIC_BASE_URL for existing deployments where the API and app share one origin. */
  PUBLIC_APP_URL: optionalString.pipe(
    z4.string().url("PUBLIC_APP_URL must be a full origin").refine(
      isBareOrigin,
      "PUBLIC_APP_URL must be an origin only: no path, query or credentials"
    ).transform((v) => v.replace(/\/+$/, "")).optional()
  ),
  PUBLIC_BASE_URL: z4.string().url(),
  /** D1: comma-separated web origins allowed by CORS, e.g. `http://localhost:8081`. */
  WEB_ORIGINS: z4.string().default("").transform(
    (raw3) => raw3.split(",").map((o) => o.trim().replace(/\/$/, "")).filter((o) => o.length > 0)
  ).pipe(
    z4.array(z4.string().url("WEB_ORIGINS must be full origins such as https://app.example.com"))
  )
}).superRefine((env, ctx) => {
  if (env.JWT_SECRET === env.JWT_REFRESH_SECRET) {
    ctx.addIssue({
      code: "custom",
      path: ["JWT_REFRESH_SECRET"],
      message: "must differ from JWT_SECRET"
    });
  }
  if (env.STORAGE_DRIVER === "local" && (env.STORAGE_SIGNING_SECRET ?? "").length < 32) {
    ctx.addIssue({
      code: "custom",
      path: ["STORAGE_SIGNING_SECRET"],
      message: "is required (at least 32 characters) with STORAGE_DRIVER=local"
    });
  }
  if (env.STORAGE_DRIVER === "s3") {
    for (const key of ["S3_BUCKET", "S3_ACCESS_KEY", "S3_SECRET_KEY"]) {
      if (!env[key])
        ctx.addIssue({
          code: "custom",
          path: [key],
          message: "is required with STORAGE_DRIVER=s3"
        });
    }
  }
  if (env.STORAGE_DRIVER === "supabase") {
    for (const key of ["SUPABASE_URL", "SUPABASE_SERVICE_ROLE_KEY", "SUPABASE_STORAGE_BUCKET"]) {
      if (!env[key]) ctx.addIssue({ code: "custom", path: [key], message: "is required with STORAGE_DRIVER=supabase" });
    }
  }
  if (env.NODE_ENV === "production" && !env.CRON_SECRET) {
    ctx.addIssue({ code: "custom", path: ["CRON_SECRET"], message: "is required in production for Vercel Cron" });
  }
  if (env.PAYMENT_PROVIDER === "campay") {
    for (const key of ["CAMPAY_USERNAME", "CAMPAY_PASSWORD"]) {
      if (!env[key])
        ctx.addIssue({
          code: "custom",
          path: [key],
          message: "is required with PAYMENT_PROVIDER=campay"
        });
    }
  }
  if (env.NODE_ENV === "production") {
    if (!env.PUBLIC_BASE_URL.startsWith("https://")) {
      ctx.addIssue({
        code: "custom",
        path: ["PUBLIC_BASE_URL"],
        message: "must use https in production"
      });
    }
    if (env.PUBLIC_APP_URL && !env.PUBLIC_APP_URL.startsWith("https://")) {
      ctx.addIssue({
        code: "custom",
        path: ["PUBLIC_APP_URL"],
        message: "must use https in production"
      });
    }
    if (env.WEB_ORIGINS.some((origin) => !origin.startsWith("https://"))) {
      ctx.addIssue({
        code: "custom",
        path: ["WEB_ORIGINS"],
        message: "must all use https in production"
      });
    }
    if (!env.HASH_SECRET) {
      ctx.addIssue({
        code: "custom",
        path: ["HASH_SECRET"],
        message: "is required in production"
      });
    }
  }
});
var EnvError = class extends Error {
  name = "EnvError";
};
function parseEnv(source2) {
  const result = schema.safeParse(source2);
  if (result.success) return Object.freeze(result.data);
  const lines = result.error.issues.map((issue) => {
    const key = issue.path.join(".") || "(environment)";
    return `  - ${key}: ${issue.message}`;
  });
  throw new EnvError(`Invalid environment (see apps/api/.env):
${lines.join("\n")}`);
}
var cached;
function getEnv() {
  cached ??= parseEnv(process.env);
  return cached;
}

// src/lib/prisma.ts
function createPrisma(connectionString) {
  return new PrismaClient({ adapter: new PrismaPg({ connectionString }) });
}
var client;
function getPrisma() {
  client ??= createPrisma(getEnv().DATABASE_URL);
  return client;
}

// ../../packages/shared/src/i18n/server/auth.ts
var authErrorTexts = {
  PIN_TOO_WEAK: {
    fr: "Ce code PIN est trop facile \xE0 deviner. \xC9vite les chiffres identiques, les suites comme 123456 et les chiffres de ton num\xE9ro.",
    en: "This PIN is too easy to guess. Avoid repeated digits, sequences like 123456 and the digits of your phone number."
  },
  PIN_SAME_AS_OLD: {
    fr: "Le nouveau code PIN doit \xEAtre diff\xE9rent de l\u2019ancien.",
    en: "The new PIN must be different from the old one."
  },
  PHONE_ALREADY_REGISTERED: {
    fr: "Ce num\xE9ro a d\xE9j\xE0 un compte. Connecte-toi avec ton code PIN, ou demande une r\xE9initialisation si tu l\u2019as oubli\xE9.",
    en: "This number already has an account. Log in with your PIN, or ask for a reset if you forgot it."
  },
  CONSENT_OUTDATED: {
    fr: "La politique de confidentialit\xE9 a chang\xE9. Lis la nouvelle version puis accepte-la pour continuer.",
    en: "The privacy notice has changed. Read the new version and accept it to continue."
  },
  OPERATOR_REQUIRED: {
    fr: "Choisis l\u2019op\xE9rateur de ton num\xE9ro de paiement : MTN ou Orange.",
    en: "Choose the operator of your payment number: MTN or Orange."
  },
  INVALID_CREDENTIALS: {
    fr: "Num\xE9ro ou code PIN incorrect. V\xE9rifie-les puis r\xE9essaie.",
    en: "Wrong phone number or PIN. Check them and try again."
  },
  INVALID_CREDENTIALS_LAST_ATTEMPT: {
    fr: "Num\xE9ro ou code PIN incorrect. Attention : encore une erreur et la connexion sera bloqu\xE9e 15 minutes.",
    en: "Wrong phone number or PIN. Careful: one more mistake and login will be blocked for 15 minutes."
  },
  LOGIN_LOCKED: {
    fr: "Trop de codes PIN incorrects. La connexion est bloqu\xE9e pendant {{minutes}} minutes. Si tu as oubli\xE9 ton code PIN, demande une r\xE9initialisation.",
    en: "Too many wrong PINs. Login is blocked for {{minutes}} minutes. If you forgot your PIN, ask for a reset."
  },
  SESSION_INVALID: {
    fr: "Ta session a expir\xE9. Reconnecte-toi avec ton num\xE9ro et ton code PIN.",
    en: "Your session has expired. Log in again with your phone number and PIN."
  },
  SESSION_REUSED: {
    fr: "Ta session a \xE9t\xE9 ferm\xE9e par s\xE9curit\xE9. Reconnecte-toi avec ton num\xE9ro et ton code PIN.",
    en: "Your session was closed for security. Log in again with your phone number and PIN."
  },
  PIN_REQUIRED: {
    fr: "Saisis ton code PIN pour confirmer cette action.",
    en: "Enter your PIN to confirm this action."
  },
  PIN_INCORRECT: {
    fr: "Code PIN incorrect. V\xE9rifie-le puis r\xE9essaie.",
    en: "Wrong PIN. Check it and try again."
  },
  PIN_INCORRECT_LAST_ATTEMPT: {
    fr: "Code PIN incorrect. Attention : encore une erreur et la confirmation sera bloqu\xE9e 15 minutes.",
    en: "Wrong PIN. Careful: one more mistake and confirmations will be blocked for 15 minutes."
  },
  PIN_LOCKED: {
    fr: "Trop de codes PIN incorrects. R\xE9essaie dans {{minutes}} minutes.",
    en: "Too many wrong PINs. Try again in {{minutes}} minutes."
  },
  PIN_RESET_LINK_INVALID: {
    fr: "Ce lien de r\xE9initialisation n\u2019est plus valable. Fais une nouvelle demande de r\xE9initialisation.",
    en: "This reset link is no longer valid. Ask for a new PIN reset."
  },
  PIN_RESET_PHONE_MISMATCH: {
    fr: "Ce num\xE9ro ne correspond pas \xE0 ce lien. Saisis le num\xE9ro de connexion du compte.",
    en: "This number does not match this link. Enter the login number of the account."
  },
  PIN_RESET_NOT_FOUND: {
    fr: "Cette demande de r\xE9initialisation n\u2019existe plus. Elle a peut-\xEAtre expir\xE9 ou d\xE9j\xE0 \xE9t\xE9 confirm\xE9e.",
    en: "This reset request no longer exists. It may have expired or already been confirmed."
  },
  PIN_RESET_NOT_ALLOWED: {
    fr: "Tu ne peux pas confirmer cette demande. Seul l\u2019admin du groupe le peut, ou, pour l\u2019admin, deux autres membres actifs.",
    en: "You cannot confirm this request. Only the group admin can, or, for the admin, two other active members."
  },
  PIN_RESET_LINK_NOT_YET: {
    fr: "Par s\xE9curit\xE9, ce lien ne marche qu\u2019\xE0 partir du {{date}}. Reviens \xE0 ce moment-l\xE0.",
    en: "For security, this link only works from {{date}}. Come back then."
  },
  PIN_RESET_NONE_PENDING: {
    fr: "Aucune demande de nouveau code PIN n\u2019est en cours pour ton compte.",
    en: "There is no new PIN request in progress for your account."
  },
  PIN_RESET_ALREADY_CONFIRMED: {
    fr: "Tu as d\xE9j\xE0 confirm\xE9 cette demande. Il faut maintenant la confirmation d\u2019un autre membre.",
    en: "You already confirmed this request. Another member must now confirm it too."
  }
};
var authTexts = {
  sessionReusedTitle: { fr: "Session ferm\xE9e par s\xE9curit\xE9", en: "Session closed for security" },
  sessionReusedBody: {
    fr: "Une ancienne connexion \xE0 ton compte a \xE9t\xE9 r\xE9utilis\xE9e, alors on l\u2019a ferm\xE9e. Si ce n\u2019\xE9tait pas toi, change ton code PIN.",
    en: "An old login to your account was reused, so we closed it. If it wasn\u2019t you, change your PIN."
  },
  pinChangedTitle: { fr: "Code PIN modifi\xE9", en: "PIN changed" },
  pinChangedBody: {
    fr: "Ton code PIN a \xE9t\xE9 modifi\xE9 et tes autres appareils ont \xE9t\xE9 d\xE9connect\xE9s. Si ce n\u2019\xE9tait pas toi, demande tout de suite une r\xE9initialisation.",
    en: "Your PIN was changed and your other devices were logged out. If it wasn\u2019t you, ask for a reset right away."
  },
  pinResetRequestedTitle: { fr: "Demande de nouveau code PIN", en: "PIN reset request" },
  pinResetRequestedBody: {
    fr: "{{name}} demande \xE0 r\xE9initialiser son code PIN. Confirme seulement si tu as v\xE9rifi\xE9 que c\u2019est bien {{name}}, en personne ou par appel.",
    en: "{{name}} is asking to reset their PIN. Confirm only if you have checked it really is {{name}}, in person or by phone."
  },
  pinResetDoneTitle: { fr: "Code PIN r\xE9initialis\xE9", en: "PIN reset" },
  pinResetDoneBody: {
    fr: "Ton code PIN a \xE9t\xE9 r\xE9initialis\xE9. Par s\xE9curit\xE9, tes retraits sont suspendus pendant le d\xE9lai de s\xE9curit\xE9 de chaque groupe.",
    en: "Your PIN was reset. For security, your withdrawals are paused for each group\u2019s security delay."
  },
  pinResetOwnerRequestedTitle: { fr: "Demande de nouveau code PIN", en: "New PIN request" },
  pinResetOwnerRequestedBody: {
    fr: "Quelqu\u2019un a demand\xE9 un nouveau code PIN pour ton compte. Si ce n\u2019est pas toi, annule la demande tout de suite.",
    en: "Someone asked for a new PIN for your account. If it wasn\u2019t you, cancel the request right away."
  },
  pinResetOwnerApprovedTitle: { fr: "Nouveau code PIN confirm\xE9", en: "New PIN confirmed" },
  pinResetOwnerApprovedBody: {
    fr: "La demande de nouveau code PIN pour ton compte a \xE9t\xE9 confirm\xE9e. Le lien marchera \xE0 partir du {{date}}. Si ce n\u2019est pas toi, annule la demande.",
    en: "The new PIN request for your account was confirmed. The link will work from {{date}}. If it wasn\u2019t you, cancel the request."
  },
  pinResetAutoCancelledTitle: {
    fr: "Demande de nouveau code PIN annul\xE9e",
    en: "New PIN request cancelled"
  },
  pinResetAutoCancelledBody: {
    fr: "Ton code PIN actuel vient d\u2019\xEAtre utilis\xE9, donc la demande de nouveau code PIN pour ton compte est annul\xE9e. Si ce n\u2019\xE9tait pas toi, change ton code PIN tout de suite.",
    en: "Your current PIN was just used, so the request for a new PIN for your account is cancelled. If it wasn\u2019t you, change your PIN right away."
  },
  pinResetDeclinedTitle: {
    fr: "Demande de nouveau code PIN refus\xE9e",
    en: "New PIN request declined"
  },
  pinResetDeclinedBody: {
    fr: "Un membre de ton groupe n\u2019a pas reconnu ta demande de nouveau code PIN. Si c\u2019\xE9tait bien toi, parle-lui puis fais une nouvelle demande.",
    en: "A member of your group did not recognise your request for a new PIN. If it was you, talk to them, then ask again."
  }
};

// ../../packages/shared/src/i18n/server/common.ts
var commonErrorTexts = {
  VALIDATION_FAILED: {
    fr: "Certaines informations sont invalides. Corrige les champs signal\xE9s puis r\xE9essaie.",
    en: "Some details are invalid. Fix the highlighted fields and try again."
  },
  INVALID_JSON: {
    fr: "La requ\xEAte est illisible. Mets l\u2019application \xE0 jour puis r\xE9essaie.",
    en: "The request could not be read. Update the app and try again."
  },
  PAYLOAD_TOO_LARGE: {
    fr: "La requ\xEAte est trop volumineuse. Raccourcis le texte puis r\xE9essaie.",
    en: "The request is too large. Shorten the text and try again."
  },
  UNSUPPORTED_MEDIA_TYPE: {
    fr: "Ce format de requ\xEAte n\u2019est pas accept\xE9. Mets l\u2019application \xE0 jour puis r\xE9essaie.",
    en: "This request format is not accepted. Update the app and try again."
  },
  UNAUTHENTICATED: {
    fr: "Ta session a expir\xE9. Reconnecte-toi avec ton num\xE9ro et ton code PIN.",
    en: "Your session has expired. Log in again with your phone number and PIN."
  },
  FORBIDDEN: {
    fr: "Tu n\u2019as pas le droit de faire cette action.",
    en: "You are not allowed to do this."
  },
  NOT_FOUND: {
    fr: "Introuvable. V\xE9rifie le lien ou actualise l\u2019\xE9cran.",
    en: "Not found. Check the link or refresh the screen."
  },
  ROUTE_NOT_FOUND: {
    fr: "Cette adresse n\u2019existe pas. Mets l\u2019application \xE0 jour.",
    en: "This address does not exist. Update the app."
  },
  RATE_LIMITED: {
    fr: "Trop de demandes en peu de temps. R\xE9essaie dans {{seconds}} secondes.",
    en: "Too many requests in a short time. Try again in {{seconds}} seconds."
  },
  CSRF_HEADER_MISSING: {
    fr: "Requ\xEAte refus\xE9e par s\xE9curit\xE9. Recharge la page puis r\xE9essaie.",
    en: "Request refused for security. Reload the page and try again."
  },
  ORIGIN_NOT_ALLOWED: {
    fr: "Ce site n\u2019est pas autoris\xE9 \xE0 utiliser NjangiTrust. Ouvre l\u2019application officielle.",
    en: "This site is not allowed to use NjangiTrust. Open the official app."
  },
  CONFLICT: {
    fr: "Une autre op\xE9ration a modifi\xE9 ces donn\xE9es en m\xEAme temps. Actualise puis r\xE9essaie.",
    en: "Another operation changed this data at the same time. Refresh and try again."
  },
  INTERNAL: {
    fr: "Une erreur inattendue s\u2019est produite. R\xE9essaie dans un moment.",
    en: "Something unexpected went wrong. Try again in a moment."
  },
  SERVICE_UNAVAILABLE: {
    fr: "Le service est momentan\xE9ment indisponible. R\xE9essaie dans quelques minutes.",
    en: "The service is temporarily unavailable. Try again in a few minutes."
  }
};

// ../../packages/shared/src/i18n/ui.en.ts
var uiEn = {
  // Foundations: shared words, time, accessibility, errors, offline (spec 1.6, 1.7)
  common: {
    appName: "NjangiTrust",
    agentName: "Njangi",
    you: "You",
    youSuffix: "{{name}} (you)",
    actions: {
      cancel: "Cancel",
      confirm: "Confirm",
      continue: "Continue",
      back: "Back",
      close: "Close",
      retry: "Try again",
      save: "Save",
      edit: "Edit",
      change: "Change",
      share: "Share",
      copy: "Copy",
      copied: "Copied",
      download: "Download",
      open: "Open",
      seeAll: "See all",
      seeDetails: "See details",
      next: "Next",
      previous: "Previous",
      done: "Done",
      send: "Send",
      delete: "Delete",
      search: "Search",
      filter: "Filter",
      clearFilters: "Clear filters",
      learnMore: "Learn more",
      later: "Later",
      start: "Start",
      add: "Add",
      remove: "Remove",
      reply: "Reply",
      more: "More options",
      refresh: "Refresh",
      showMore: "Show more",
      showLess: "Show less"
    },
    status: {
      loading: "Loading\u2026",
      saving: "Saving\u2026",
      sending: "Sending\u2026",
      preparing: "Preparing\u2026",
      connectionRequired: "Connection needed"
    },
    roles: {
      ADMIN: "Admin",
      MEMBER: "Member"
    },
    membershipStatus: {
      INVITED: "Invitation pending",
      ACTIVE: "Member",
      LEAVING: "Leaving at the end of the cycle",
      LEFT: "Left the group",
      REMOVED: "Removed by vote",
      pendingActivation: "Active from the next cycle"
    },
    operators: {
      MTN: "MTN",
      ORANGE: "Orange",
      UNKNOWN: "Unknown operator"
    },
    operatorServices: {
      MTN: "MTN Mobile Money",
      ORANGE: "Orange Money"
    },
    frequency: {
      WEEKLY: "Every week",
      BIWEEKLY: "Every two weeks",
      MONTHLY: "Every month"
    },
    rotationMode: {
      FIXED: "Order drawn by lot",
      BIDDING: "Bidding"
    },
    round: "Round {{round}}",
    roundOf: "Round {{round}} of {{total}}",
    cycle: "Cycle {{cycle}}",
    reference: "Ref. {{ref}}",
    stepOf: "Step {{current}} of {{total}}",
    optional: "Optional",
    percentPerMonth: "{{percent}}% a month",
    membersCount_one: "{{count}} member",
    membersCount_other: "{{count}} members"
  },
  time: {
    justNow: "Just now",
    minutesAgo_one: "{{count}} min ago",
    minutesAgo_other: "{{count}} min ago",
    hoursAgo_one: "{{count}} h ago",
    hoursAgo_other: "{{count}} h ago",
    today: "Today",
    yesterday: "Yesterday",
    tomorrow: "Tomorrow",
    todayAt: "today at {{time}}",
    yesterdayAt: "yesterday at {{time}}",
    tomorrowAt: "tomorrow at {{time}}",
    dateAt: "{{date}} at {{time}}",
    updatedAt: "Updated at {{time}}",
    closesIn: "Closes in {{duration}}",
    closedOn: "Closed on {{date}}",
    expiresIn: "Expires in {{duration}}",
    duration: {
      minutes_one: "{{count}} minute",
      minutes_other: "{{count}} minutes",
      hours_one: "{{count}} hour",
      hours_other: "{{count}} hours",
      days_one: "{{count}} day",
      days_other: "{{count}} days",
      months_one: "{{count}} month",
      months_other: "{{count}} months"
    },
    durationShort: {
      minutes: "{{count}} min",
      hours: "{{count}} h",
      hoursMinutes: "{{hours}} h {{minutes}}"
    }
  },
  a11y: {
    amount: "{{words}}",
    loading: "Loading",
    closeSheet: "Close",
    sheetHandle: "Handle. Swipe down to close.",
    selected: "selected",
    notSelected: "not selected",
    expanded: "expanded",
    collapsed: "collapsed",
    required: "required",
    opensSheet: "Opens a panel",
    externalLink: "Opens another app",
    image: "Image",
    unreadDot: "Unread",
    connectionBack: "Back online",
    offlineNow: "You are offline",
    stepProgress: "Step {{current}} of {{total}}",
    skeleton: "Loading content",
    maskedNumber: "Hidden number ending in {{last}}",
    ownNumber: "Your number: {{digits}}"
  },
  errors: {
    generic: {
      title: "Couldn\u2019t do that",
      body: "Something got in the way. Try again in a moment."
    },
    network: "No connection. Check your mobile data or Wi-Fi, then try again.",
    server: "The service isn\u2019t responding. Try again in a few minutes.",
    timeout: "The connection is too slow. Try again.",
    sessionExpired: "Your session has expired. Log in again with your PIN.",
    forbidden: "You don\u2019t have access to this action.",
    adminOnly: "Only the group\u2019s admin can do this.",
    notFound: "This item no longer exists.",
    leftMember: "You have left this group. Your statements and your data export are still available.",
    rateLimited: "Too many requests in a short time. Try again at {{time}}.",
    validation: {
      required: "This field is required.",
      nameTooShort: "Enter at least 2 letters.",
      phoneInvalid: "Invalid number: 9 digits starting with 6.",
      amountMin: "The minimum is {{amount}}.",
      amountMax: "The maximum is {{amount}}.",
      amountWhole: "Whole francs only, no decimals.",
      dateInPast: "Choose a date in the future.",
      endBeforeStart: "The end date must be after the start date.",
      textTooLong: "Too long: {{max}} characters at most."
    },
    media: {
      imageTooLarge: "Image too large: 10 MB at most.",
      videoTooLarge: "Video too large: 50 MB at most.",
      videoTooLong: "Video too long: 2 minutes at most.",
      voiceTooLong: "Voice notes are limited to 3 minutes.",
      documentTooLarge: "Document too large: 20 MB at most.",
      documentType: "Only PDF documents are accepted.",
      uploadFailed: "Upload failed. Tap to try again.",
      downloadFailed: "Download failed. Tap to try again."
    },
    permissions: {
      camera: "Allow camera access in your phone settings to take a photo.",
      photos: "Allow photo access in your phone settings to share photos.",
      microphone: "Allow microphone access in your phone settings to record a voice note.",
      notifications: "Notifications are turned off for NjangiTrust on this phone.",
      openSettings: "Open settings"
    }
  },
  offline: {
    banner: "Offline, updated at {{time}}",
    bannerYesterday: "Offline, updated yesterday at {{time}}",
    bannerDate: "Offline, updated on {{date}}",
    bannerNever: "Offline. Your information will appear when the connection is back.",
    connectionRequired: "Connection needed",
    actionsHint: "Payments, withdrawals and votes come back as soon as you are online.",
    queued: "Waiting for connection",
    agentComposer: "Njangi needs a connection"
  },
  emptyStates: {
    noGroup: {
      title: "You don\u2019t have a group yet",
      body: "Create your njangi, or open the invitation link your admin sent you."
    },
    loadFailed: {
      title: "Couldn\u2019t load",
      body: "Check your connection, then try again."
    }
  },
  // App shell: navigation, group switcher, notifications (spec 1.3, 1.8)
  nav: {
    tabs: {
      njangi: "Njangi",
      groupe: "Group",
      caisse: "Funds",
      votes: "Votes",
      moi: "Me"
    },
    tabsA11y: {
      njangi: "Njangi, your assistant",
      groupe_one: "Group, {{count}} unread message",
      groupe_other: "Group, {{count}} unread messages",
      caisse: "Funds",
      votes_one: "Votes, {{count}} vote is waiting for you",
      votes_other: "Votes, {{count}} votes are waiting for you",
      moi: "Me"
    },
    navigationLabel: "Main navigation",
    groupSwitcher: {
      a11yLabel: "Active group: {{name}}. Switch group",
      title: "My groups"
    },
    bell: {
      label: "Notifications",
      labelUnread_one: "Notifications, {{count}} unread",
      labelUnread_other: "Notifications, {{count}} unread"
    },
    back: "Back"
  },
  groupSwitcher: {
    title: "My groups",
    rowRound: "Round {{round}} of {{total}}",
    rowToPay: "To pay: {{amount}}",
    rowUpToDate: "Up to date",
    rowYourTurn: "It\u2019s your turn",
    rowNotStarted: "Getting ready",
    rowLeft: "Left",
    active: "Active group",
    allGroups: "All my groups: {{amount}} to pay",
    join: "Join with an invitation",
    create: "Create a njangi"
  },
  notifications: {
    title: "Notifications",
    markAllRead: "Mark all as read",
    empty: "No notifications. Reminders, payments and votes will appear here.",
    unread: "Unread",
    earlier: "Earlier",
    categories: {
      REMINDERS: "Reminders",
      MONEY: "Money",
      VOTES: "Votes",
      GROUP: "Group",
      SECURITY: "Security"
    },
    categoryHelp: {
      REMINDERS: "Contribution and repayment deadlines.",
      MONEY: "Payments received, payouts, withdrawals, fines and loans.",
      VOTES: "Open votes, reminders and results.",
      GROUP: "Messages, mentions, meetings, minutes and announcements.",
      SECURITY: "Payment number, PIN, logins and the fund check."
    },
    settings: {
      title: "Notification settings",
      categoriesTitle: "What you receive",
      securityLocked: "Always on, to protect you.",
      quietHours: "Quiet hours",
      quietHoursHelp: "No notifications from {{from}} to {{to}}. Security alerts always come through.",
      from: "From",
      to: "To",
      muteChat: "Mute group messages",
      muteChatHelp: "You still get mentions and announcements.",
      mediaWifi: "Media on Wi-Fi only",
      mediaWifiHelp: "Photos, videos and documents download by themselves only on Wi-Fi. Voice notes are light and always download.",
      webNote: "On the web, notifications appear in the app only.",
      pushOff: "Notifications are off for NjangiTrust on this phone. You\u2019ll still find them here."
    }
  },
  // Access: splash, welcome, sign-up, login, PIN reset, app lock (spec 1.4, 2.10)
  splash: {
    a11y: "NjangiTrust, loading"
  },
  welcome: {
    title: "Your njangi, clear to everyone",
    body: "Contribute with Mobile Money, follow every franc in the records and decide everything by vote.",
    create: "Create a njangi",
    invitation: "I have an invitation",
    login: "I already have an account",
    invitationHelp: {
      title: "Open your invitation link",
      body: "Your group\u2019s admin sent you a link by WhatsApp or SMS. Open it on this phone: it takes you straight to your group.",
      paste: "Paste the link",
      pastePlaceholder: "https://\u2026",
      invalid: "This link isn\u2019t a NjangiTrust invitation. Check the message you received."
    },
    languageSwitch: "Fran\xE7ais"
  },
  signup: {
    title: "Create your account",
    name: {
      title: "What\u2019s your name?",
      label: "Full name",
      placeholder: "For example Carine Fotso",
      help: "Members of your group will see this name."
    },
    loginPhone: {
      title: "Your phone number",
      label: "Phone number",
      help: "You log in with it. Other members never see it.",
      alreadyUsed: "This number already has an account. Log in with your PIN.",
      inviteMismatch: "This number doesn\u2019t match the invitation. Use the number that received the link."
    },
    paymentNumber: {
      title: "Your payment number",
      body: "You pay and receive money on this Mobile Money number.",
      sameAsLogin: "Use my phone number",
      other: "Use another number",
      label: "Payment number",
      operatorLabel: "Operator",
      detected: "Detected: {{operator}}. Change it if needed.",
      unknownOperator: "Operator not recognised. Choose MTN or Orange.",
      help: "You can change it later in Me."
    },
    consent: {
      title: "Your data",
      intro: "To run your njangi, NjangiTrust keeps:",
      items: {
        name: "your name, visible to members of your groups;",
        identity: "your phone and payment numbers, which other members never see;",
        money: "your payments, withdrawals and loans, visible to your group in the records;",
        votes: "your votes, except secret votes, which are linked to no one;",
        agent: "your conversations with Njangi, visible only to you."
      },
      abroad: "Some services, such as the assistant, may run outside Cameroon. They receive only what they strictly need, never your numbers or your PIN.",
      readPolicy: "Read the privacy policy",
      checkbox: "I agree that NjangiTrust processes my data to run my njangi.",
      version: "Version {{version}}",
      required: "Tick the box to continue.",
      rights: "You can export your data or delete your account at any time, in Me."
    },
    pin: {
      createTitle: "Choose your PIN",
      createBody: "6 digits. You use it to log in and to confirm sensitive actions.",
      createHelp: "Avoid your date of birth and simple sequences.",
      confirmTitle: "Confirm your PIN",
      confirmBody: "Enter the same 6 digits.",
      mismatch: "The two PINs don\u2019t match. Start again.",
      tooSimple: "This PIN is too simple, like 123456 or 111111. Choose another one."
    },
    creating: "Creating your account\u2026",
    done: {
      title: "Welcome, {{name}}",
      bodyCreate: "Your account is ready. Now create your njangi.",
      bodyInvite: "Your account is ready. You are joining {{group}}."
    }
  },
  login: {
    title: "Log in",
    phoneLabel: "Phone number",
    pinTitle: "Enter your PIN",
    pinBody: "Account {{maskedPhone}}",
    submit: "Log in",
    forgotPin: "Forgot your PIN?",
    noAccount: "No account yet? Create one",
    wrongPin_one: "Wrong PIN. You have {{count}} try left.",
    wrongPin_other: "Wrong PIN. You have {{count}} tries left.",
    locked: "Too many tries. Try again at {{time}}, or ask for a new PIN.",
    unknownPhone: "No account with this number. Check the number or create an account.",
    changeNumber: "Use another number"
  },
  pinReset: {
    request: {
      title: "Forgot your PIN",
      body: "Your group\u2019s admin will confirm they know you. You then receive a link from them, valid for 30 minutes, to choose a new PIN.",
      phoneLabel: "Your phone number",
      submit: "Ask for a new PIN",
      sent: {
        title: "Request sent",
        body: "Tell your admin: the request must be confirmed in the app, then the link is sent to you by WhatsApp or SMS.",
        holdNote: "For your safety, your withdrawals wait {{hours}} hours after the PIN change.",
        bodyAdmin: "Because you\u2019re the admin, two members of the group must confirm the request in the app. Tell them: one of them then sends you the link by WhatsApp or SMS."
      },
      unknownPhone: "No account with this number. Check the number.",
      alreadyPending: "A request is already waiting. Tell your admin."
    },
    admin: {
      title: "New PIN request",
      body: "{{name}} is asking for a new PIN. Confirm only if you have spoken to this person, face to face or on the phone.",
      confirm: "I confirm, create the link",
      decline: "I don\u2019t recognise this request",
      declined: "Request declined. We are letting {{name}} know.",
      linkTitle: "Link for {{name}}",
      linkBody: "Valid for 30 minutes, once. Send it directly to this person."
    },
    members: {
      title: "New PIN for the admin",
      body: "{{name}}, the group\u2019s admin, is asking for a new PIN. Two members who have spoken to this person, face to face or on the phone, must confirm.",
      confirm: "I confirm",
      decline: "I don\u2019t recognise this request",
      progress_one: "{{count}} confirmation of 2",
      progress_other: "{{count}} confirmations of 2",
      waiting: "Your confirmation is recorded. One more is needed.",
      ready: "Two members have confirmed. Send the link to {{name}}.",
      alreadyConfirmed: "You have already confirmed this request."
    },
    review: {
      empty: "No requests waiting.",
      requestedAt: "Requested {{date}}",
      expiresAt: "Without confirmation, the request expires {{date}}."
    },
    owner: {
      title: "New PIN request on your account",
      body: "If this wasn\u2019t you, cancel it now. Your current PIN still works.",
      cancel: "Cancel the request",
      cancelled: "Request cancelled. Your PIN doesn\u2019t change."
    },
    set: {
      title: "Choose a new PIN",
      expired: "This link has expired. Make a new request from the login screen.",
      used: "This link has already been used. Make a new request if needed.",
      done: "PIN changed. Your withdrawals resume on {{date}}.",
      wait: "For your safety, this link only works from {{date}}, 24 hours after the confirmation."
    }
  },
  appLock: {
    title: "NjangiTrust is locked",
    body: "Unlock with your fingerprint or face.",
    unlock: "Unlock",
    usePin: "Use my PIN",
    failed: "Not recognised. Try again or use your PIN.",
    settings: {
      toggle: "Lock the app when it opens",
      help: "With the fingerprint or face saved on this phone. Sensitive actions always ask for your PIN.",
      after: "Lock after",
      immediately: "Immediately",
      after1: "1 minute",
      after5: "5 minutes",
      unavailable: "No fingerprint or face is saved on this phone."
    }
  },
  // Group setup: create, rules, invitations, first cycle (spec 1.4, 3.2, R1.6)
  createGroup: {
    title: "Create a njangi",
    name: {
      title: "The group\u2019s name",
      label: "Njangi name",
      placeholder: "For example Njangi des Coll\xE8gues",
      help: "Every member will see this name."
    },
    schedule: {
      title: "When does the beneficiary receive?",
      firstPayout: "First payout",
      date: "Date",
      time: "Time",
      frequency: "Frequency",
      deadlineNote: "Members pay at least 24 hours before each payout.",
      preview: "Round 1: {{first}}. Round 2: {{second}}.",
      anchor: {
        title: "Each month, the payout falls on",
        dayOfMonth: "Day {{day}} of every month",
        lastWeekday: "The last {{weekday}} of every month",
        nthWeekday: "The {{nth}} {{weekday}} of every month",
        nth1: "first",
        nth2: "second",
        nth3: "third",
        nth4: "fourth",
        clampNote: "In shorter months, the payout happens on the month\u2019s last day."
      }
    },
    money: {
      title: "How much does each member contribute?",
      contribution: "Contribution per round",
      solidarity: "Solidarity fund per round",
      solidarityHelp: "Set 0 if you don\u2019t want a solidarity fund."
    },
    rules: {
      title: "The group\u2019s rules",
      body: "Suggested defaults. Change them now: afterwards, they only change by vote.",
      editRule: "Edit {{rule}}"
    },
    summary: {
      title: "Check before you create",
      create: "Create the group",
      creating: "Creating the group\u2026",
      adminNote: "You will be the admin. The admin can\u2019t change the rules or move money: everything goes through a vote."
    },
    created: {
      title: "{{group}} is created",
      body: "Now invite the founding members. You need at least 3 members, including you, to start.",
      invite: "Invite members"
    }
  },
  rules: {
    contributionAmount: { label: "Contribution per round", help: "Between {{min}} and {{max}}." },
    solidarityContribution: {
      label: "Solidarity fund per round",
      help: "0 turns the solidarity fund off."
    },
    frequency: { label: "Round frequency", help: "A change applies from the next cycle." },
    payoutTime: { label: "Payout time", help: "Payment is due 24 hours before." },
    lateFine: { label: "Late fine", help: "One fine per member per round." },
    rotationMode: { label: "Beneficiary order", help: "A change applies from the next cycle." },
    minBid: { label: "Minimum bid", help: "Bidding mode only." },
    loanRatePermille: {
      label: "Loan interest",
      help: "Per month, fixed when the loan is approved."
    },
    loanMaxMonths: { label: "Longest loan", help: "Between 1 and 6 months." },
    loanLimitFactor: {
      label: "Loan limit",
      help: "{{factor}} times the contributions paid in the cycle."
    },
    numberChangeHoldHours: {
      label: "Wait after a number change",
      help: "For withdrawals and loans to the new number."
    },
    voteWindowHours: { label: "Vote length", help: "Between 24 and 168 hours." },
    solidarityVoteWindowHours: {
      label: "Solidarity vote length",
      help: "Between 12 and 72 hours."
    },
    meetingAbsenceFine: { label: "Meeting absence fine", help: "0 = no fine." },
    distributeFundAtCycleEnd: {
      label: "Share the general fund at cycle end",
      help: "Among members present for the whole cycle and without debt."
    },
    reliabilityWindow: { label: "Reliability based on", help: "The most recent past due items." },
    values: {
      hours_one: "{{count}} hour",
      hours_other: "{{count}} hours",
      months_one: "{{count}} month",
      months_other: "{{count}} months",
      items_one: "{{count}} due item",
      items_other: "{{count}} due items",
      factor: "{{factor}}\xD7",
      off: "Off",
      yes: "Yes",
      no: "No"
    }
  },
  invite: {
    founding: {
      title: "Founding members",
      body: "Before the first cycle, you invite people directly. After that, every new member goes through a vote.",
      add: "Invite a member",
      nameLabel: "Name",
      phoneLabel: "Their phone number",
      phoneHelp: "The link only works with this number. Other members won\u2019t see it.",
      create: "Create the link",
      progress_one: "{{count}} member of 3 minimum",
      progress_other: "{{count}} members of 3 minimum",
      ready: "The group can start.",
      statusPending: "Invitation sent, expires {{date}}",
      statusExpired: "Invitation expired",
      statusJoined: "Joined the group",
      newLink: "New link"
    },
    approved: {
      title: "Invite {{name}}",
      body: "The vote to add {{name}} has passed. Create the link and send it."
    },
    shareMessage: "{{inviter}} is inviting you to the njangi \u201C{{group}}\u201D on NjangiTrust. Open this link on your phone (valid for 72 hours): {{url}}",
    landing: {
      title: "{{inviter}} is inviting you to {{group}}",
      facts: {
        members_one: "{{count}} member",
        members_other: "{{count}} members",
        contribution: "{{amount}} per round, {{frequency}}",
        nextRound: "Next round: {{date}}",
        notStarted: "The first cycle hasn\u2019t started."
      },
      rulesTitle: "The group\u2019s rules",
      rulesNote: "By joining, you accept these rules. They only change by vote.",
      join: "Join {{group}}",
      haveAccount: "I already have an account",
      activeFromNextCycle: "You become an active member at the next cycle, on {{date}}. Until then, you can read the group and the records.",
      expired: "This invitation has expired. Ask {{inviter}} for a new link.",
      used: "This invitation has already been used. If that was you, log in.",
      wrongPhone: "This link belongs to another number. Use the number that received the invitation, or ask for a new link.",
      invalid: "This link isn\u2019t valid. Check the message you received.",
      joined: "You joined {{group}}."
    }
  },
  startCycle: {
    title: "Start the cycle",
    soonTitle: "Coming soon",
    soonBody: "Starting the cycle arrives with Mobile Money payments in a coming update. Your members are ready; nothing is lost.",
    body_one: "{{count}} active member. The round order will be drawn by lot, and anyone can verify it.",
    body_other: "{{count}} active members. The round order will be drawn by lot, and anyone can verify it.",
    needMore_one: "{{count}} more member needed to start (3 minimum).",
    needMore_other: "{{count}} more members needed to start (3 minimum).",
    pendingInvites_one: "{{count}} invitation hasn\u2019t been accepted yet. Members who join after the start wait for the next cycle.",
    pendingInvites_other: "{{count}} invitations haven\u2019t been accepted yet. Members who join after the start wait for the next cycle.",
    drawn: "Order drawn. Round 1 beneficiary: {{name}}."
  },
  // Njangi tab: the agent (spec 1.4, Part 4)
  agent: {
    header: {
      a11y: "Round status. Tap to open the funds.",
      round: "Round {{round}} of {{total}}",
      beneficiary: "Beneficiary: {{name}}",
      beneficiaryYou: "Beneficiary: you",
      contribution: "Your contribution: {{status}}",
      status: {
        toPay: "to pay",
        paid: "paid",
        late: "late",
        processing: "waiting for {{operator}}"
      },
      payoutOpenYou: "Your money is available",
      payoutLockedYou: "Withdrawal possible {{date}}",
      biddingOpen: "Bidding open until {{date}}",
      notStarted: "The cycle hasn\u2019t started",
      notStartedMembers_one: "{{count}} member, 3 minimum",
      notStartedMembers_other: "{{count}} members, 3 minimum",
      pendingActivation: "You become active at the next cycle",
      left: "You have left this group",
      withdrawalsPaused: "Withdrawals paused for the group"
    },
    greeting: {
      firstRun: "Hello {{name}}. I\u2019m Njangi, the assistant for {{group}}. I can pay your contribution, tell you where the round stands, prepare a vote or summarise the group.",
      firstRunTrust: "I prepare, you confirm: nothing moves without your approval.",
      firstRunPrompt: "Where would you like to start?",
      morning: "Good morning, {{name}}.",
      evening: "Good evening, {{name}}.",
      owes: "Your round {{round}} contribution ({{amount}}) is due before {{date}}.",
      late: "Your round {{round}} contribution is late. With the fine, you owe {{amount}}.",
      paid: "You\u2019re up to date for round {{round}}. Beneficiary: {{name}}, {{date}}.",
      beneficiarySoon: "It\u2019s your turn! Your payout will be available {{date}}.",
      payoutOpen: "Your round {{round}} payout is available: {{amount}}.",
      votesWaiting_one: "{{count}} vote is waiting for you.",
      votesWaiting_other: "{{count}} votes are waiting for you.",
      unread_one: "{{count}} unread message in the group.",
      unread_other: "{{count}} unread messages in the group.",
      notStartedAdmin: "The group has {{count}} members. Invite the founders, then start the cycle.",
      notStartedMember: "The cycle hasn\u2019t started yet. I\u2019ll tell you when the first round opens.",
      withdrawalsPaused: "The group\u2019s withdrawals are paused: today\u2019s check found a difference. Your payments still work.",
      left: "You have left {{group}}. I can still send you your statements or your data export."
    },
    chips: {
      pay: "Pay my contribution",
      payNow: "Pay now",
      howMuch: "How much do I owe?",
      whoUnpaid: "Who hasn\u2019t paid?",
      whyFine: "Why do I have a fine?",
      myTurn: "When is my turn?",
      fund: "How much is in the fund?",
      openVotes: "Which votes are open?",
      openVotesCount_one: "See the open vote",
      openVotesCount_other: "See the {{count}} open votes",
      withdraw: "Withdraw my money",
      payoutDetail: "My payout in detail",
      whenPayout: "When do I receive?",
      missed: "What did I miss?",
      whyPaused: "Why are withdrawals paused?",
      loansToDecide_one: "{{count}} loan to decide",
      loansToDecide_other: "{{count}} loans to decide",
      scheduleMeeting: "Schedule a meeting",
      inviteMember: "Invite a member",
      startCycle: "Start the cycle",
      whenCanWithdraw: "When can I withdraw?",
      checkIn: "Check in to the meeting",
      nextInstallment: "My next repayment",
      borrow: "How much can I borrow?",
      statement: "My statement this month",
      placeBid: "Bid for this round",
      a11yLabel: "Suggestion: {{label}}",
      groupLabel: "Suggestions"
    },
    composer: {
      placeholder: "Write to Njangi\u2026",
      send: "Send",
      tooLong: "Message too long: 1,000 characters at most."
    },
    typing: "Njangi is writing\u2026",
    activity: {
      default: "Checking\u2026",
      get_my_overview: "Looking at your situation\u2026",
      get_round: "Checking the round\u2026",
      list_unpaid: "Checking who has paid\u2026",
      get_payout_breakdown: "Getting the payout details\u2026",
      get_funds: "Checking the funds\u2026",
      get_ledger: "Searching the records\u2026",
      get_rules: "Reading the rules\u2026",
      explain_rule: "Reading the rule\u2026",
      list_members: "Looking at the members\u2026",
      get_member: "Looking at this profile\u2026",
      list_proposals: "Looking at the votes\u2026",
      get_proposal: "Looking at this vote\u2026",
      list_loans: "Looking at the loans\u2026",
      get_loan_quote: "Preparing a loan estimate\u2026",
      list_bids: "Looking at the bids\u2026",
      get_solidarity: "Checking the solidarity fund\u2026",
      get_meeting: "Looking at the meeting\u2026",
      summarize_unread: "Reading the group\u2019s messages\u2026",
      search_chat: "Searching the group\u2026",
      list_my_groups: "Looking at your groups\u2026",
      get_statement: "Preparing your statement\u2026",
      export_ledger: "Preparing the records export\u2026",
      get_my_payment_number: "Getting your payment number\u2026",
      get_notifications: "Looking at your notifications\u2026",
      get_agent_history: "Looking at my history\u2026",
      set_language: "Changing the language\u2026",
      set_notification_prefs: "Updating your notifications\u2026",
      switch_group: "Switching group\u2026",
      mark_chat_read: "Marking the group as read\u2026",
      prepareAction: "Preparing the card for you to confirm\u2026",
      draft_minutes: "Drafting the minutes\u2026"
    },
    errors: {
      failed: "I couldn\u2019t finish. Rephrase your request, more simply.",
      notSent: "Message not sent. Check your connection, then tap Try again.",
      rateLimited: "You\u2019ve sent a lot of messages in a short time. You can write to me again at {{time}}. Every screen in the app still works.",
      unavailable: "Njangi isn\u2019t responding right now. Try again in a few minutes, or use the app\u2019s screens.",
      interrupted: "Reply interrupted. Tap Try again to restart it."
    },
    privateFromGroup: {
      label: "From the group",
      a11y: "You wrote in the group: {{text}}"
    },
    group: {
      privateReply: "I\u2019ve replied to you privately, {{name}}.",
      caption: "Assistant",
      mentionHint: "Write @njangi to ask Njangi a question in front of the group."
    },
    results: {
      paymentSuccess: "Payment of {{amount}}: successful, ref. {{ref}}.",
      paymentFailed: "Payment of {{amount}}: refused by {{operator}}.",
      paymentExpired: "Payment of {{amount}}: no answer from {{operator}}. I\u2019ll tell you if it arrives within 24 hours.",
      withdrawalSuccess: "Withdrawal of {{amount}}: sent to your number {{number}}, ref. {{ref}}.",
      withdrawalFailed: "Withdrawal of {{amount}}: not completed. Your money is still available.",
      voteRecorded: "Vote \u201C{{choice}}\u201D recorded: {{title}}.",
      voteRecordedSecret: "Secret vote recorded: {{title}}.",
      proposalCreated: "Proposal published: {{title}}. Voting open until {{date}}.",
      loanRequested: "Loan request of {{amount}} sent to the admin.",
      loanRequestedVote: "Loan request of {{amount}} put to the members\u2019 vote.",
      loanDisbursed: "Loan of {{amount}} sent to your number {{number}}, ref. {{ref}}.",
      bidPlaced: "Bid of {{amount}} recorded for round {{round}}. It stays secret until bidding closes.",
      numberChanged: "Payment number changed. Withdrawals possible from {{date}}.",
      generic: "{{title}}: done.",
      cancelled: "Cancelled. Nothing was done.",
      expired: "Expired. Nothing was done."
    },
    dateSeparator: {
      today: "Today",
      yesterday: "Yesterday"
    },
    loadOlder: "Older messages",
    panel: {
      title: "This round",
      todo: "To do",
      nothingToDo: "Nothing to do right now."
    },
    a11y: {
      agentMessage: "Njangi: {{text}}",
      ownMessage: "You: {{text}}",
      streaming: "Njangi is replying",
      activity: "Njangi: {{text}}"
    }
  },
  notificationPrefill: {
    reminderDue: "You owe {{amount}} for round {{round}}. Pay now?",
    reminderLate: "Your round {{round}} contribution is late. With the fine, you owe {{amount}}. Pay now?",
    yourTurnSoon: "You\u2019re the beneficiary of round {{round}}. Your payout will be available {{date}}.",
    payoutOpen: "Your round {{round}} payout is available: {{amount}}. Withdraw now?",
    fineAssessed: "A fine of {{amount}} was added for round {{round}}. Do you want to pay it, or understand why?",
    installmentDue: "Your repayment of {{amount}} is due {{date}}. Pay now?",
    voteReminder: "The vote \u201C{{title}}\u201D ends {{date}}. Do you want to vote?",
    loanDecision: "The admin has answered your loan request of {{amount}}.",
    statementReady: "Your {{month}} statement is ready.",
    missed: "There are {{count}} unread messages in the group. Shall I summarise them?"
  },
  // Confirmation, PIN sheet, information cards (spec 1.5, 4.5)
  confirmation: {
    pinRequired: "PIN required",
    a11y: {
      card: "Confirmation card: {{title}}",
      total: "Total: {{words}}",
      line: "{{label}}: {{words}}"
    },
    buttons: {
      cancel: "Cancel",
      change: "Change",
      retry: "Try again",
      prepareAgain: "Prepare again",
      viewLedger: "See in the records",
      close: "Close"
    },
    lines: {
      contribution: "Contribution, round {{round}}",
      solidarity: "Solidarity fund",
      fine: "Fine, round {{round}}",
      fineMeeting: "Absence fine, meeting of {{date}}",
      loanInstallment: "Loan repayment, {{n}} of {{total}}",
      bid: "Winning bid, round {{round}}",
      shortfallShare: "Refund share for {{name}}",
      total: "Total",
      withdrawAmount: "Amount withdrawn",
      fee: "{{operator}} fee",
      feeEstimated: "Estimated fee",
      youReceive: "You receive",
      fromBalance: "Taken from your balance",
      principal: "Amount borrowed",
      interest: "Interest, {{percent}}% over {{months}} months",
      totalDue: "Total to repay",
      installments_one: "{{count}} repayment of {{amount}}",
      installments_other: "{{count}} repayments of {{amount}}",
      lastInstallment: "last one: {{amount}}",
      bidAmount: "Your bid",
      supportAmount: "Amount requested",
      recipient: "For",
      event: "Event",
      current: "Now",
      proposed: "Proposed",
      threshold: "Threshold",
      closes: "Closes",
      newNumber: "New number",
      meetingDate: "Date",
      meetingPlace: "Place",
      message: "Message"
    },
    notes: {
      operatorRequest: "You\u2019ll get an {{operator}} request on {{number}}.",
      exactAmount: "You\u2019ll be charged exactly this amount, with no fee on top.",
      oldestFirst: "The oldest round is suggested first. Tap Change to choose.",
      withdrawalTo: "Sent to your {{operator}} number {{number}}.",
      holdUntil: "Withdrawals blocked until {{date}}.",
      feeBorne: "Fees are paid by whoever receives the money.",
      voteFinal: "A vote can\u2019t be changed.",
      voteSecret: "Secret vote: nobody will know your choice, not even the admin.",
      threshold: "It needs {{needed}} yes out of {{eligible}} members.",
      loanAdmin: "The admin decides within 72 hours. Without a decision, the request expires.",
      loanAdminVote: "Because you\u2019re the admin, your request goes to a members\u2019 vote.",
      bidSealed: "Your bid stays secret until bidding closes, {{date}}.",
      numberHold: "Withdrawals and loans to this number are possible after {{hours}} hours.",
      numberAllGroups: "Applies to all your groups. Admins are told, without the digits.",
      deleteAnonymised: "Your name and numbers will be anonymised. The records\u2019 entries stay.",
      expiresSoon: "Expires in {{duration}}.",
      leaveAtCycleEnd: "You keep your obligations and rights until {{date}}.",
      earlyExitSettlement: "If the vote passes, settlement follows the mid-cycle exit rule."
    },
    processing: {
      payment: "Waiting for your {{operator}} approval\u2026",
      paymentHelp: "Approve the request on your phone with your {{operator}} PIN. You can leave this screen: I\u2019ll tell you as soon as it\u2019s confirmed.",
      withdrawal: "Sending to your number {{number}}\u2026",
      generic: "In progress\u2026",
      stillWaiting: "Still waiting for {{operator}}. Don\u2019t start the payment again."
    },
    pendingLate: {
      title: "No answer from {{operator}} yet",
      body: "If you approved, we keep checking for 24 hours and tell you. Don\u2019t start the payment again."
    },
    expired: {
      title: "Expired",
      body: "This request wasn\u2019t confirmed within 10 minutes. Nothing was done."
    },
    cancelled: {
      title: "Cancelled",
      body: "Nothing was done."
    },
    failed: {
      insufficientBalance: {
        title: "Payment refused by {{operator}}",
        body: "Check your balance, then try again."
      },
      declined: {
        title: "Payment not approved",
        body: "The request wasn\u2019t approved on your phone. Try again when you\u2019re ready."
      },
      operatorTimeout: {
        title: "No answer from {{operator}}",
        body: "The request wasn\u2019t approved in time. Nothing was charged. Try again."
      },
      providerUnavailable: {
        title: "Payment service unavailable",
        body: "Nothing was charged. Try again in a few minutes."
      },
      invalidNumber: {
        title: "Number refused by {{operator}}",
        body: "Check your payment number in Me, then try again."
      },
      disbursementFailed: {
        title: "Transfer not completed",
        body: "The operator couldn\u2019t send the money. It stays available in the fund. Try again later."
      },
      situationChanged: {
        title: "Things have changed",
        body: "The amounts are different since this was prepared. Prepare a new card."
      },
      alreadyPaid: {
        title: "Already paid",
        body: "This contribution is already settled. Nothing was charged."
      },
      holdActive: {
        title: "Withdrawals on hold",
        body: "Your payment number changed recently. Withdrawals possible from {{date}}."
      },
      withdrawalsPaused: {
        title: "Withdrawals paused",
        body: "Today\u2019s check found a difference. Withdrawals resume once it\u2019s fixed."
      },
      limitExceeded: {
        title: "Above the limit",
        body: "The most you can do is {{amount}}. Prepare a new card with this amount."
      },
      voteClosed: {
        title: "Vote closed",
        body: "This vote ended before you confirmed."
      },
      alreadyVoted: {
        title: "You\u2019ve already voted",
        body: "A vote can\u2019t be changed."
      },
      notEligible: {
        title: "Not possible",
        body: "{{reason}}"
      },
      generic: {
        title: "Failed",
        body: "Nothing was done. Try again in a moment."
      }
    },
    actions: {
      pay: { title: "Pay your contribution", button: "Pay {{amount}}", done: "Paid" },
      payDebts: { title: "Pay your debts", button: "Pay {{amount}}", done: "Paid" },
      repayLoan: { title: "Repay your loan", button: "Repay {{amount}}", done: "Repaid" },
      withdraw: { title: "Withdraw your money", button: "Withdraw {{amount}}", done: "Withdrawn" },
      requestLoan: { title: "Request a loan", button: "Request {{amount}}", done: "Requested" },
      approveLoan: { title: "Approve the loan", button: "Approve {{amount}}", done: "Approved" },
      rejectLoan: { title: "Reject the loan", button: "Reject", done: "Rejected" },
      placeBid: { title: "Bid for round {{round}}", button: "Bid {{amount}}", done: "Bid placed" },
      raiseBid: { title: "Raise your bid", button: "Bid {{amount}}", done: "Bid placed" },
      voteYes: { title: "Vote yes", button: "Vote yes", done: "Voted" },
      voteNo: { title: "Vote no", button: "Vote no", done: "Voted" },
      propose: { title: "Propose: {{title}}", button: "Propose", done: "Proposed" },
      requestSolidarity: {
        title: "Request support",
        button: "Request {{amount}}",
        done: "Requested"
      },
      requestEarlyExit: { title: "Ask to leave now", button: "Ask", done: "Asked" },
      announceLeave: {
        title: "Leave at the end of the cycle",
        button: "Announce my departure",
        done: "Announced"
      },
      addAgendaItem: { title: "Add an agenda item", button: "Add", done: "Added" },
      checkIn: { title: "Check in", button: "I\u2019m here", done: "Checked in" },
      sendExcuse: { title: "Send an apology for absence", button: "Send", done: "Sent" },
      postToGroup: { title: "Post in the group", button: "Post", done: "Posted" },
      scheduleMeeting: { title: "Schedule a meeting", button: "Schedule", done: "Scheduled" },
      markAttendance: { title: "Record attendance", button: "Record", done: "Recorded" },
      publishMinutes: { title: "Publish the minutes", button: "Publish", done: "Published" },
      postAnnouncement: { title: "Post an announcement", button: "Post", done: "Posted" },
      createInvite: { title: "Create an invitation", button: "Create the link", done: "Created" },
      startCycle: { title: "Start cycle {{cycle}}", button: "Start", done: "Started" },
      hideMessage: { title: "Hide this message", button: "Hide", done: "Hidden" },
      changePaymentNumber: {
        title: "Change your payment number",
        button: "Change the number",
        done: "Changed"
      },
      deleteAccount: { title: "Delete your account", button: "Delete my account", done: "Deleted" }
    }
  },
  pinSheet: {
    title: "Confirm with your PIN",
    subtitle: "{{action}}",
    digitsA11y: "{{count}} of 6 digits entered",
    key: "{{digit}}",
    delete: "Delete",
    wrong_one: "Wrong PIN. You have {{count}} try left.",
    wrong_other: "Wrong PIN. You have {{count}} tries left.",
    locked: "Too many tries. Try again at {{time}}.",
    forgot: "Forgot your PIN?",
    keyboardHint: "You can also type your PIN on the keyboard.",
    checking: "Checking\u2026"
  },
  infoCards: {
    paymentNumber: {
      title: "Your payment number",
      since: "Active since {{date}}",
      hold: "Withdrawals to this number possible from {{date}}.",
      onlyYou: "Only you see this number in full.",
      change: "Change",
      copy: "Copy"
    },
    statement: {
      title: "Statement: {{period}}",
      meta: "PDF, {{size}}",
      code: "Verification code: {{code}}",
      open: "Open",
      share: "Share",
      preparing: "Preparing the statement\u2026"
    },
    ledgerExport: {
      title: "Full records: {{group}}",
      metaCsv_one: "CSV spreadsheet, {{count}} entry",
      metaCsv_other: "CSV spreadsheet, {{count}} entries",
      metaJson_one: "JSON data, {{count}} entry",
      metaJson_other: "JSON data, {{count}} entries",
      masked: "Phone numbers are masked.",
      download: "Download",
      share: "Share"
    },
    inviteLink: {
      title: "Invitation for {{name}}",
      validity: "Valid for 72 hours, until {{date}}. One use only, tied to their number.",
      shareWhatsApp: "Send by WhatsApp",
      copyLink: "Copy the link",
      share: "Share"
    },
    pinResetLink: {
      title: "Link for {{name}}",
      validity: "Valid for 30 minutes, once."
    }
  },
  // Groupe tab: chat (spec 1.5, 4.9)
  chat: {
    composer: {
      placeholder: "Write a message\u2026",
      attach: "Attach a file",
      send: "Send",
      voice: "Hold to record a voice note",
      voiceTap: "Record a voice note",
      mention: "Mention a member"
    },
    attachMenu: {
      title: "Attach",
      photo: "Photo from gallery",
      camera: "Take a photo",
      video: "Video",
      document: "PDF document"
    },
    voice: {
      recording: "Recording {{duration}}",
      slideToCancel: "Slide left to cancel",
      releaseToSend: "Release to send",
      stopAndSend: "Stop and send",
      cancel: "Cancel recording",
      tooShort: "Too short. Hold the button while you speak.",
      maxReached: "3 minutes reached. The note is ready to send.",
      play: "Play voice note",
      pause: "Pause",
      speed: "Speed {{speed}}",
      speeds: {
        x1: "1\xD7",
        x15: "1.5\xD7",
        x2: "2\xD7"
      },
      a11y: "Voice note from {{name}}, {{duration}}",
      a11yOwn: "Your voice note, {{duration}}",
      position: "{{elapsed}} of {{duration}}"
    },
    media: {
      photo: "Photo",
      video: "Video",
      document: "Document",
      tapToDownload: "Tap to download, {{size}}",
      downloading: "Downloading\u2026",
      wifiOnly: "Automatic download on Wi-Fi only",
      photoA11y: "Photo from {{name}}",
      videoA11y: "Video from {{name}}, {{duration}}",
      documentA11y: "Document {{file}}, {{size}}",
      open: "Open",
      sendCaption: "Add a caption"
    },
    message: {
      deleted: "Message deleted",
      deletedOwn: "You deleted this message",
      hidden: "Message hidden by the admin",
      queued: "Waiting for connection",
      failed: "Not sent. Tap to try again.",
      replyTo: "Reply to {{name}}",
      replyToYou: "Reply to you",
      cancelReply: "Cancel reply",
      delete: "Delete for everyone",
      deleteConfirm: "Delete this message for everyone? Its file will be deleted too.",
      hide: "Hide (admin)",
      hideReason: "Reason, kept in the admin log",
      copyText: "Copy text",
      mentionYou: "{{name}} mentioned you",
      a11y: "{{name}}, {{time}}: {{text}}",
      a11yOwn: "You, {{time}}: {{text}}"
    },
    newMessages_one: "{{count}} new message",
    newMessages_other: "{{count}} new messages",
    jumpToLatest: "Go to latest messages",
    typing: "{{name}} is writing\u2026",
    typingMany: "Several members are writing\u2026",
    summarize: {
      banner_one: "{{count}} unread message",
      banner_other: "{{count}} unread messages",
      action: "Summarise",
      a11y: "Ask Njangi to summarise the unread messages"
    },
    pinned: {
      label: "Pinned announcement",
      by: "By {{name}}, {{date}}",
      showAll: "See announcements"
    },
    empty: "No messages yet. Say hello to the group, or ask @njangi a question.",
    leftReadOnly: "You have left this group. The conversation is no longer available.",
    pendingActivationNote: "You can read and write. Your contributions start at the next cycle.",
    system: {
      paymentReceived: "{{name}} paid the round {{round}} contribution.",
      paymentReceivedLate: "{{name}} paid the round {{round}} contribution, late.",
      roundOpened: "Round {{round}} is open. Beneficiary: {{name}}. Pay before {{date}}.",
      roundComplete: "Round {{round}}: everyone has paid.",
      payoutOpen: "Round {{round}}: payout available for {{name}}.",
      voteOpened: "Vote open: {{title}}.",
      votePassed: "Vote passed: {{title}}. {{yes}} yes, {{no}} no.",
      voteRejected: "Vote rejected: {{title}}. {{yes}} yes, {{no}} no.",
      voteExpired: "Vote closed without reaching the threshold: {{title}}.",
      ruleApplied: "New rule from round {{round}}: {{rule}}.",
      memberJoined: "{{name}} joined the group.",
      memberActive: "{{name}} becomes an active member in cycle {{cycle}}.",
      memberLeaving: "{{name}} will leave the group at the end of the cycle.",
      memberLeft: "{{name}} left the group.",
      memberRemoved: "{{name}} is no longer in the group, after a vote.",
      adminChanged: "{{name}} is now the group\u2019s admin.",
      numberUpdated: "{{name}} updated their payment number.",
      pinReset: "{{name}} reset their PIN. Their withdrawals wait {{hours}} hours.",
      cycleStarted: "Cycle {{cycle}} started. Order drawn by lot, verifiable in the records.",
      cycleClosed: "Cycle {{cycle}} ended.",
      fundDistributed: "General fund shared: {{amount}} per eligible member.",
      solidarityRequested: "Support request for {{name}} ({{event}}). Vote open.",
      solidarityPaid: "Support of {{amount}} paid to {{name}}.",
      meetingScheduled: "Meeting planned {{date}}, {{place}}.",
      agendaReady: "Agenda ready for the meeting {{date}}.",
      minutesPublished: "Minutes published: meeting of {{date}}.",
      minutesCorrected: "Minutes corrected, version {{version}}: meeting of {{date}}.",
      announcement: "New announcement pinned by the admin.",
      withdrawalsPaused: "Withdrawals paused: today\u2019s check found a difference. Payments still work.",
      withdrawalsResumed: "Withdrawals back on: the check is in order.",
      biddingClosed: "Round {{round}} bidding closed. Beneficiary: {{name}}."
    }
  },
  // Caisse tab: ring, round, funds, records, members (spec 1.2, 1.4, R5, R14)
  caisse: {
    segments: {
      tour: "Round",
      fund: "Fund",
      solidarity: "Solidarity",
      ledger: "Records"
    },
    segmentsA11y: "Funds sections",
    tour: {
      beneficiary: "{{name}} receives {{date}}",
      beneficiaryYou: "You receive {{date}}",
      payoutOpen: "Payout available for {{name}} since {{date}}",
      payoutOpenYou: "Your payout is available",
      deadline: "Pay before {{date}}",
      deadlinePassed: "Deadline passed {{date}}",
      paidSection: "Paid ({{count}})",
      unpaidSection: "To pay ({{count}})",
      late: "late",
      pending: "pending",
      onTime: "on time",
      payButton: "Pay {{amount}}",
      youPaid: "You paid on {{date}}",
      breakdown: "Payout details",
      biddingNote: "Bidding mode: the beneficiary is known when bidding closes, {{date}}.",
      biddingOpen: "See the bids",
      noCycle: "The cycle hasn\u2019t started yet.",
      noCycleAdmin: "The cycle hasn\u2019t started yet. Invite at least 3 members, then start it.",
      allPaid: "Everyone has paid this round.",
      nobodyPaid: "Nobody has paid this round yet.",
      previousRounds: "Previous rounds",
      roundPicker: "Choose a round"
    },
    breakdown: {
      title: "Round {{round}} details",
      gross: "Contributions received",
      fees: "Mobile Money fees",
      deductions: "Automatic deductions",
      deductionFine: "Fine, round {{round}}",
      deductionInstallment: "Loan repayment, {{n}} of {{total}}",
      deductionBid: "Winning bid",
      net: "Net for {{name}}",
      netYou: "Net for you",
      withdrawn: "Already withdrawn",
      remaining: "Left to withdraw",
      locked: "Locked until {{date}}",
      pendingContributions_one: "{{count}} contribution not received yet: {{amount}}",
      pendingContributions_other: "{{count}} contributions not received yet: {{amount}}",
      feeNote: "Fees are paid by whoever receives the money.",
      autoSettlementNote: "When the payout opens, debts that are due are settled first, oldest first.",
      lateNote: "A contribution paid after the payout still goes to this round\u2019s beneficiary."
    },
    fund: {
      title: "General fund",
      balance: "Balance",
      availableForLoans: "Available for loans",
      reserved: "Reserved for members",
      reservedHelp: "Money that belongs to members or to the solidarity fund. It is never lent.",
      sources: "Fed by fines, loan interest and bids.",
      distribution: "Shared at the end of the cycle among eligible members.",
      noDistribution: "No sharing at cycle end: the fund carries on to the next cycle.",
      loansInProgress: "Loans in progress",
      requestLoan: "Request a loan",
      yourLimit: "Your limit: {{amount}}",
      emptyLoans: "No loans in progress.",
      emptyLoansCta: "You can borrow up to {{amount}}.",
      loansToDecide_one: "{{count}} request to decide",
      loansToDecide_other: "{{count}} requests to decide"
    },
    solidarity: {
      title: "Solidarity fund",
      balance: "Balance",
      perRound: "{{amount}} per member per round",
      requests: "Requests",
      request: "Request support",
      empty: "No requests. The solidarity fund helps a member through a bereavement, a birth, an illness or a wedding.",
      off: "The solidarity fund is off. Propose a rule change to turn it on.",
      carriesOver: "It isn\u2019t shared at the end of the cycle: it carries on.",
      requestRow: "{{name}}, {{event}}",
      statuses: {
        OPEN: "Vote in progress",
        PASSED: "Accepted, sending",
        PAID: "Paid",
        REJECTED: "Rejected",
        EXPIRED: "Expired",
        FAILED: "Transfer failed"
      },
      events: {
        DEUIL: "Bereavement",
        NAISSANCE: "Birth",
        MALADIE: "Illness",
        MARIAGE: "Wedding",
        AUTRE: "Other"
      }
    },
    ledger: {
      title: "Records",
      intro: "Every franc of the group, in order. Nothing can be changed or erased.",
      filters: {
        all: "All",
        payments: "Payments",
        payouts: "Payouts and withdrawals",
        loans: "Loans",
        fines: "Fines",
        solidarity: "Solidarity",
        decisions: "Decisions",
        member: "Member",
        period: "Period",
        allMembers: "All members"
      },
      export: "Export",
      exportTitle: "Export the records",
      exportCsv: "Spreadsheet (CSV)",
      exportJson: "Data (JSON)",
      exportHelp: "Every entry, posting and fingerprint. Numbers are masked.",
      empty: "No entries for these filters. Remove a filter to see everything.",
      emptyAll: "The records are empty. The first entry appears with the first payment.",
      rowA11y: "{{date}}, {{description}}, {{amount}}, reference {{ref}}",
      loadMore: "Older entries",
      shortRef: "No. {{seq}}",
      types: {
        PAYMENT_RECEIVED: "Payment received",
        FINE_ASSESSED: "Fine",
        BID_ASSESSED: "Winning bid",
        AUTO_SETTLEMENT: "Automatic deduction",
        WITHDRAWAL_COMPLETED: "Withdrawal",
        LOAN_DISBURSED: "Loan paid out",
        SOLIDARITY_DISBURSED: "Support paid out",
        LEAVER_REFUND: "Leaver refund",
        FUND_DISTRIBUTION: "Fund sharing",
        REVERSAL: "Reversal",
        EVENT: "Decision"
      }
    },
    entry: {
      title: "Entry no. {{seq}}",
      date: "Date",
      type: "Type",
      description: "Description",
      amount: "Amount",
      member: "Member",
      round: "Round",
      operatorRef: "Operator reference",
      feeSource: "Fee source",
      feeSources: {
        PROVIDER: "Reported by the operator",
        SCHEDULE: "Configured fee schedule"
      },
      postings: "Postings",
      postingsHelp: "Every entry balances: its postings add up to zero.",
      postingsSum: "Sum of postings: 0",
      accounts: {
        cash: "Money held by the operator",
        payable: "Owed to {{name}}",
        receivable: "Debt of {{name}}",
        fundGeneral: "General fund",
        fundSolidarity: "Solidarity fund"
      },
      hash: "Fingerprint",
      prevHash: "Previous fingerprint",
      hashHelp: "Each entry is linked to the one before by its fingerprint. Any change would break the chain and be detected.",
      copyHash: "Copy the fingerprint",
      related: {
        title: "Linked to",
        payment: "See the payment",
        proposal: "See the vote",
        loan: "See the loan",
        meeting: "See the meeting",
        reversedBy: "Reversed by entry no. {{seq}}",
        reverses: "Reverses entry no. {{seq}}"
      },
      eventNoPostings: "Decision recorded with no money movement.",
      drawSeed: "Draw seed"
    },
    dailyCheck: {
      ok: "Today\u2019s check: in order, {{time}}. Records intact.",
      warning: "Today\u2019s check: small difference being checked, {{time}}. Withdrawals still work.",
      alert: "Today\u2019s check: difference found, {{time}}. Withdrawals paused.",
      notYet: "Today\u2019s check: scheduled at 06:00.",
      stale: "Today\u2019s check: not done yet. Last one: {{date}}.",
      a11yOk: "Today\u2019s check in order at {{time}}. Records intact.",
      details: "See details",
      sheet: {
        title: "Today\u2019s check",
        ranAt: "Done on {{date}}",
        providerBalance: "Balance at the operator",
        ledgerCash: "Money according to the records",
        inFlight: "Operations in progress",
        difference: "Difference",
        chain: "Records chain",
        chainOk: "Intact",
        chainBroken: "Broken at entry no. {{seq}}",
        invariants: "Fund rules",
        invariantsOk: "All respected",
        okBody: "The records match the money held at the operator exactly.",
        alertWhat: "What\u2019s happening",
        alertBody: "The records don\u2019t match the money held at the operator. For safety, all the group\u2019s withdrawals are paused until it\u2019s fixed.",
        alertPayments: "Your payments still work and are recorded as usual.",
        alertNext: "The NjangiTrust team has been told. You\u2019ll get a notification when withdrawals resume.",
        warningBody: "A small difference usually comes from an operation still in progress at the operator. It is checked again automatically."
      }
    }
  },
  ring: {
    a11y: {
      summary: "Round {{round}} of {{total}}. Beneficiary: {{name}}. {{collected}} collected out of {{target}}.",
      paidCount_one: "{{count}} member has paid.",
      paidCount_other: "{{count}} members have paid.",
      unpaidCount_one: "{{count}} hasn\u2019t paid yet.",
      unpaidCount_other: "{{count}} haven\u2019t paid yet.",
      lateCount_one: "{{count}} of them is late.",
      lateCount_other: "{{count}} of them are late.",
      complete: "Round complete: everyone has paid.",
      hint: "Double-tap to see the list of members.",
      keyboardHint: "Arrow keys move between members, Enter opens their profile.",
      dot: "{{name}}, {{status}}",
      contributionLanded: "{{name}} has paid.",
      roundCompleted: "Round complete."
    },
    dotStatus: {
      paid: "has paid",
      unpaid: "hasn\u2019t paid yet",
      late: "late",
      pending: "payment pending",
      beneficiary: "this round\u2019s beneficiary",
      served: "has already received their turn"
    },
    center: {
      of: "of {{target}}",
      complete: "Round complete",
      notStarted: "Not started yet"
    },
    legend: {
      paid: "Paid",
      unpaid: "Not paid yet",
      late: "Late",
      beneficiary: "Beneficiary",
      served: "Already received"
    }
  },
  memberProfile: {
    a11y: "Profile of {{name}}",
    thisRound: "This round",
    roundStatus: {
      paid: "Paid, {{date}}",
      paidLate: "Paid late, {{date}}",
      unpaid: "Hasn\u2019t paid yet",
      late: "Late",
      pending: "Payment pending",
      beneficiary: "This round\u2019s beneficiary",
      notActive: "No contribution this cycle"
    },
    turn: "Their turn",
    turnValue: "Round {{round}}, {{date}}",
    servedValue: "Received in round {{round}}",
    biddingTurn: "Bidding mode: not served yet this cycle",
    reliability: "Reliability",
    memberSince: "Member since {{date}}",
    left: "Left the group on {{date}}",
    previous: "Previous member",
    next: "Next member",
    positionA11y: "{{position}} of {{total}} in the round order"
  },
  reliability: {
    value: "{{onTime}} of {{due}} on time",
    score: "{{score}}%",
    a11y: "Reliability {{score}} percent: {{onTime}} of {{due}} due items paid on time",
    newMember: "New member",
    newMemberHelp: "Fewer than 3 past due items: no score yet.",
    formula: {
      title: "How reliability is calculated",
      body: "We look at the last {{window}} past due items in this group: each contribution (with its solidarity part) and each loan repayment.",
      equation: "Reliability = items paid on time \xF7 items due \xD7 100, rounded.",
      onTimeRule: "A payment counts as on time if it was started before the deadline, even if the operator confirms it later.",
      privacy: "The score is only used in this group. It is never shared anywhere else.",
      example: "Example: {{onTime}} of {{due}} on time = {{score}}%."
    }
  },
  members: {
    title: "Members",
    count_one: "{{count}} member",
    count_other: "{{count}} members",
    search: "Search for a member",
    rotationOrder: "In round order",
    position: "Round {{round}}",
    leaving: "Leaving at the end of the cycle",
    empty: "No member matches.",
    noPhones: "Members\u2019 numbers are never shown."
  },
  withdraw: {
    title: "Your round {{round}} payout",
    titleGeneric: "Withdraw your money",
    available: "Available",
    availableA11y: "Available: {{words}}",
    breakdown: "How this amount is worked out",
    amountLabel: "Amount to withdraw",
    all: "Withdraw everything",
    fee: "Estimated fee",
    youReceive: "You receive",
    fromBalance: "Taken from your balance",
    to: "To your {{operator}} number {{number}}",
    min: "The minimum is 100 FCFA.",
    max: "You can withdraw at most {{amount}}.",
    partialNote: "You can withdraw in several goes. What you leave stays reserved for you.",
    prepare: "Continue",
    hold: "Withdrawals on hold until {{date}}, after your number change.",
    paused: "Withdrawals paused for the whole group: today\u2019s check found a difference.",
    inProgress: "A withdrawal is already in progress. Wait for it to finish before starting another.",
    nothing: "Nothing to withdraw for now.",
    nothingTurn: "Your turn: round {{round}}, {{date}}.",
    locked: "Your payout will be available {{date}}."
  },
  solidarityRequest: {
    title: "Request support",
    recipient: "Who is it for?",
    me: "For me",
    other: "For another member",
    member: "Member",
    event: "Event",
    amount: "Amount",
    max: "At most {{amount}}, the solidarity fund\u2019s balance.",
    note: "Note",
    notePlaceholder: "A few words for the group",
    noteHelp: "Members of the group can see it.",
    vote: "The request goes to a majority vote, open for {{duration}}.",
    prepare: "Prepare the request",
    fundEmpty: "The solidarity fund is empty for now."
  },
  // Votes tab and proposals (spec 1.4, R11)
  votes: {
    title: "Votes",
    open: "Open",
    closed: "Closed",
    propose: "Propose",
    emptyOpen: "No open votes. Propose a rule change or a new member.",
    emptyClosed: "No closed votes yet.",
    beforeCycleTitle: "Votes start with the first cycle",
    beforeCycleBodyAdmin: "Before the first cycle, you set up the group directly: invite the founding members, then start the cycle. After that, every change goes through a vote.",
    beforeCycleBodyMember: "Before the first cycle, the admin sets up the group directly. Once the cycle starts, every change goes through a vote.",
    card: {
      proposer: "Proposed by {{name}}",
      proposerYou: "Proposed by you",
      timeLeft: "Closes in {{duration}}",
      progress: "{{yes}} yes of {{needed}} needed",
      noCount: "{{count}} no",
      secretBadge: "Secret vote",
      participation: "{{voted}} of {{eligible}} members have voted",
      participationNote: "Totals appear when the vote closes.",
      yes: "Yes",
      no: "No",
      yourVote: {
        notVoted: "You haven\u2019t voted yet",
        yes: "You voted yes",
        no: "You voted no",
        secret: "You voted. Your choice stays secret.",
        notEligible: "You don\u2019t vote on this proposal",
        excludedTarget: "This proposal is about you: you don\u2019t vote.",
        excludedProposer: "You made this request: you don\u2019t vote.",
        excludedAdmin: "Admin loan: the admin doesn\u2019t vote.",
        joinedAfter: "You weren\u2019t an active member when the vote opened."
      },
      result: {
        PASSED: "Passed",
        REJECTED: "Rejected",
        EXPIRED: "Expired"
      },
      tally: "{{yes}} yes, {{no}} no, {{none}} didn\u2019t vote",
      effect: {
        round: "Applied from round {{round}}",
        cycle: "Applied from cycle {{cycle}}",
        immediate: "Applied on {{date}}",
        pending: "Will apply from round {{round}}",
        pendingCycle: "Will apply from cycle {{cycle}}",
        inviteCreated: "Invitation created",
        none: "No change"
      },
      a11yProgress: "{{yes}} yes of {{needed}} needed, {{eligible}} voters"
    },
    threshold: {
      majority: "Majority: {{needed}} yes of {{eligible}}",
      twoThirds: "Two-thirds: {{needed}} yes of {{eligible}}",
      rotation: "Majority, and every member who moves must vote yes",
      closesEarly: "The vote ends as soon as the threshold is reached, or can no longer be.",
      countsEligible: "The threshold counts every voter, not only those who voted."
    },
    detail: {
      reason: "Reason",
      details: "Details",
      eligible_one: "{{count}} voter",
      eligible_other: "{{count}} voters",
      excluded: "{{name}} doesn\u2019t vote on this proposal",
      closesAt: "Closes {{date}}",
      openedAt: "Opened {{date}}",
      votesList: "Votes",
      notYetVoted: "Not voted yet",
      secretExplain: "Secret vote: choices are linked to no one, not even in the database. Only participation shows until the vote closes.",
      ledgerLink: "See the decision in the records"
    },
    types: {
      RULE_CHANGE: "Rule change",
      MEMBER_ADD: "New member",
      MEMBER_REMOVE: "Member removal",
      ROTATION_CHANGE: "Order change",
      ADMIN_CHANGE: "Admin change",
      EARLY_EXIT: "Leaving mid-cycle",
      ADMIN_LOAN: "Admin loan",
      SOLIDARITY_PAYOUT: "Solidarity fund support",
      FINE_WAIVER: "Fine waiver",
      LEDGER_CORRECTION: "Records correction"
    },
    titles: {
      ruleChange: "{{rule}}: {{from}} \u2192 {{to}}",
      memberAdd: "Add {{name}}",
      memberRemove: "Remove {{name}}",
      rotationSwap: "Swap turns: {{a}} and {{b}}",
      adminChange: "{{name}} as admin",
      earlyExit: "{{name}} leaving mid-cycle",
      adminLoan: "Loan of {{amount}} for the admin, {{name}}",
      solidarity: "Support of {{amount}} for {{name}}, {{event}}",
      fineWaiver: "Waive the round {{round}} fine for {{name}}",
      ledgerCorrection: "Correct entry no. {{seq}}"
    }
  },
  newProposal: {
    title: "New proposal",
    chooseType: "What do you want to propose?",
    typeHelp: {
      RULE_CHANGE: "Change a rule: amount, fine, vote length\u2026",
      MEMBER_ADD: "Bring a new person in from the next cycle.",
      MEMBER_REMOVE: "Remove a member. Secret vote.",
      ROTATION_CHANGE: "Swap the turns of two members.",
      ADMIN_CHANGE: "Choose a new admin. Secret vote.",
      EARLY_EXIT: "Leave the group before the end of the cycle.",
      FINE_WAIVER: "Cancel a fine.",
      LEDGER_CORRECTION: "Correct a records entry with a reversal.",
      SOLIDARITY_PAYOUT: "Request support from the solidarity fund."
    },
    reason: "Reason",
    reasonPlaceholder: "Explain why in one or two sentences",
    reasonHelp: "Every member can see it.",
    preview: "It needs {{needed}} yes out of {{eligible}} members ({{kind}}).",
    previewKinds: {
      majority: "majority",
      twoThirds: "two-thirds"
    },
    window: "Voting stays open for {{duration}}.",
    prepare: "Prepare the proposal",
    rule: {
      label: "Rule",
      current: "Current value: {{value}}",
      newValue: "New value",
      range: "Between {{min}} and {{max}}.",
      outOfRange: "Out of range: between {{min}} and {{max}}.",
      same: "That\u2019s already the current value.",
      alreadyOpen: "A vote on this rule is already open. Wait until it closes.",
      effectNextRound: "Applied from the next round if the vote passes.",
      effectNextCycle: "Applied from the next cycle if the vote passes."
    },
    memberAdd: {
      name: "The person\u2019s name",
      phone: "Their phone number",
      phoneHelp: "Only used to create the invitation. Members won\u2019t see it.",
      effect: "If the vote passes, the admin creates the invitation. The person becomes active at the next cycle."
    },
    memberRemove: {
      member: "Member concerned",
      note: "Secret vote. The person concerned doesn\u2019t vote. Settlement follows the leaving rule."
    },
    rotation: {
      first: "First member",
      second: "Second member",
      note: "Both members must vote yes.",
      served: "{{name}} has already received their turn this cycle."
    },
    admin: {
      member: "New admin",
      note: "Secret vote. Takes effect as soon as it passes."
    },
    fineWaiver: {
      fine: "Fine to cancel",
      note: "The person concerned doesn\u2019t vote. If the vote passes, a reversal is added to the records."
    },
    ledgerCorrection: {
      seq: "Entry to correct",
      correction: "Correction requested",
      note: "Nothing is erased: a reversal and a corrected entry are added to the records."
    },
    earlyExit: {
      note: "You don\u2019t vote. If you haven\u2019t received your turn yet, your contributions for this cycle are refunded. Otherwise, your remaining contributions stay due.",
      cycleEndAlternative: "You can also leave at the end of the cycle, without a vote."
    }
  },
  // Loans, bidding, meetings (R7, R8, R15)
  loans: {
    title: "Loans",
    request: {
      title: "Request a loan",
      limit: "Your limit: {{amount}}",
      limitHelp: "{{factor}} times your contributions paid this cycle, within what the fund can lend.",
      amount: "Amount",
      amountA11y: "Loan amount, {{words}}",
      months: "Length",
      monthsOption_one: "{{count}} month",
      monthsOption_other: "{{count}} months",
      breakdownTitle: "What you\u2019ll repay",
      schedule: "Repayment schedule",
      scheduleRow: "Round {{round}}, {{date}}",
      prepare: "Prepare the request",
      adminDecides: "The admin decides within 72 hours."
    },
    notEligible: {
      activeLoan: "You already have a loan in progress. Repay it before asking for another.",
      overdueDebt: "You have an overdue debt. Settle it first.",
      leaving: "You are leaving the group: you can no longer borrow.",
      zeroLimit: "Your limit is 0 FCFA for now. It grows with each contribution you pay this cycle.",
      fundEmpty: "The general fund has nothing available to lend right now.",
      notActive: "Only active members can borrow."
    },
    mine: {
      title: "My loan",
      none: "No loan in progress.",
      nextInstallment: "Next repayment: {{amount}}, {{date}}",
      remaining: "Left to repay",
      repayNow: "Repay now",
      repayEarlyNote: "You can repay early. The interest stays as fixed at approval.",
      autoSettlementNote: "When you receive your turn, repayments that are due are taken from your payout.",
      overdue: "Repayment late since {{date}}",
      carriesOver: "A loan not repaid at the end of the cycle stays due in the next cycle, with no share of the fund.",
      paidRow: "Paid on {{date}}",
      dueRow: "Due {{date}}"
    },
    status: {
      REQUESTED: "Waiting for a decision",
      APPROVED: "Approved, sending",
      REJECTED: "Rejected",
      DISBURSED: "Being repaid",
      REPAID: "Repaid",
      OVERDUE: "Late",
      EXPIRED: "Expired without a decision"
    },
    rejectedReason: "Admin\u2019s reason: {{reason}}",
    queue: {
      title: "Loans to decide",
      empty: "No loan requests waiting.",
      requestedAt: "Requested {{date}}",
      expiresAt: "Without a decision, the request expires {{date}}.",
      reliability: "Reliability",
      debts: "Debts",
      noDebts: "No debts",
      contributionsPaid: "Contributions paid this cycle",
      approve: "Approve",
      reject: "Reject",
      reasonLabel: "Reason",
      reasonHelp: "The member will see it.",
      reasonRequired: "Give a reason to reject.",
      ownLoan: "Your own request goes to a members\u2019 vote. You can\u2019t decide it."
    }
  },
  bidding: {
    title: "Round {{round}} bidding",
    explain: "Sealed bids: nobody sees the bids before bidding closes. The highest wins; on a tie, the first to arrive.",
    closesAt: "Closes {{date}}",
    minBid: "Minimum {{amount}}",
    yourBid: "Your bid: {{amount}}",
    yourBidAt: "Placed {{date}}",
    noBid: "You haven\u2019t bid yet.",
    bidsCount_one: "{{count}} bid placed",
    bidsCount_other: "{{count}} bids placed",
    amountLabel: "Your bid",
    place: "Bid",
    raise: "Raise my bid",
    mustBeHigher: "Your new bid must be above {{amount}}.",
    belowMin: "The minimum bid is {{amount}}.",
    notEligible: "You\u2019ve already received your turn this cycle: you don\u2019t bid.",
    lastRound: "Last round: {{name}} is the beneficiary without bidding.",
    winnerDebt: "The winning bid is taken from the winner\u2019s payout and goes to the general fund.",
    results: {
      title: "Results",
      winner: "{{name}} wins with {{amount}}",
      winnerYou: "You win with {{amount}}",
      draw: "No bids: beneficiary drawn by lot, {{name}}.",
      allBids: "All bids",
      bidRow: "{{name}}, {{time}}",
      tieNote: "On a tie, the bid that arrived first wins."
    }
  },
  meetings: {
    title: "Meetings",
    next: "Next meeting",
    none: "No meeting planned.",
    noneAdmin: "No meeting planned. Schedule the next one.",
    schedule: "Schedule a meeting",
    when: "{{date}}",
    place: "Place",
    agenda: {
      title: "Agenda",
      pending: "The agenda will be ready 24 hours before the meeting.",
      auto: "Added automatically",
      byMember: "Added by {{name}}",
      add: "Add an item",
      addPlaceholder: "What you want to discuss",
      autoItems: {
        round: "Round {{round}}: beneficiary {{name}}, {{paid}} of {{total}} have paid",
        unpaid: "Unpaid contributions: {{names}}",
        votes_one: "{{count}} open vote",
        votes_other: "{{count}} open votes",
        installments: "Upcoming loan repayments",
        solidarity: "Support requests in progress"
      }
    },
    checkIn: {
      button: "I\u2019m here",
      window: "Check-in open from {{start}} to {{end}}.",
      notOpen: "Check-in opens 1 hour before the meeting.",
      closed: "Check-in is closed.",
      done: "Checked in at {{time}}."
    },
    excuse: {
      button: "Send an apology",
      placeholder: "Reason for your absence",
      sent: "Apology sent on {{date}}.",
      tooLate: "Apologies must be sent before the meeting starts."
    },
    attendance: {
      title: "Attendance",
      present: "Present ({{count}})",
      excused: "Excused ({{count}})",
      absent: "Absent ({{count}})",
      unmarked: "Not recorded ({{count}})",
      markPresent: "Present",
      markAbsent: "Absent",
      fineNote: "Absence fine: {{amount}}, for absences without an apology.",
      rowStatus: {
        present: "Present, {{time}}",
        excused: "Excused",
        absent: "Absent",
        unmarked: "Not recorded"
      }
    },
    minutes: {
      title: "Minutes",
      draft: "Draft",
      generate: "Prepare the draft with Njangi",
      generating: "Njangi is drafting the minutes\u2026",
      notes: "Your notes",
      notesPlaceholder: "Decisions, remarks, items to follow up\u2026",
      edit: "Edit the draft",
      publish: "Publish the minutes",
      publishNote: "Once published, the minutes can\u2019t be edited. A correction is published as a new version, with a reason.",
      published: "Published on {{date}}",
      version: "Version {{version}}",
      correct: "Publish a correction",
      correctionReason: "Reason for the correction",
      notPublished: "The minutes aren\u2019t published yet.",
      draftOnlyAdmin: "Only the admin sees the draft.",
      sections: {
        dateAndPlace: "Date and place",
        present: "Present",
        excused: "Excused",
        absent: "Absent",
        items: "Items discussed",
        money: "Money received",
        votes: "Vote results",
        nextMeeting: "Next meeting"
      }
    },
    form: {
      title: "Schedule a meeting",
      date: "Date",
      time: "Time",
      place: "Place or link",
      placePlaceholder: "For example at Carine\u2019s, Bonamoussadi, or a video call link"
    }
  },
  // Moi tab and settings (spec 1.4, R13, Part 7)
  moi: {
    title: "Me",
    situation: "My situation in {{group}}",
    toPay: "To pay",
    toPayValue: "{{amount}} before {{date}}",
    upToDate: "Up to date",
    available: "Available",
    availableAction: "Withdraw",
    locked: "Locked until {{date}}",
    holdUntil: "Withdrawals on hold until {{date}}",
    myTurn: "My turn",
    myTurnValue: "Round {{round}}, {{date}}",
    myTurnServed: "Received in round {{round}}",
    myTurnBidding: "Bidding mode: bid to get a turn",
    debts: "My debts",
    noDebts: "No debts",
    loan: "My loan",
    noLoan: "No loan",
    reliability: "My reliability",
    paymentNumber: "Payment number",
    paymentNumberChange: "Change",
    statements: "Statements",
    groups: "My groups",
    settingsTitle: "Settings",
    language: "Language",
    notifications: "Notifications",
    security: "Security",
    privacy: "Privacy",
    agentHistory: "Assistant history",
    logout: "Log out",
    version: "Version {{version}}",
    allGroupsTotal: "All my groups: {{amount}} to pay this month"
  },
  paymentNumber: {
    title: "Change payment number",
    current: "Current number",
    newLabel: "New number",
    operator: "Operator",
    detected: "Detected: {{operator}}. Change it if needed.",
    holdWarning: "For your safety, withdrawals and loans to this new number wait {{hours}} hours. Your payments aren\u2019t affected.",
    allGroups: "The change applies to all your groups.",
    inProgress: "Operations already in progress keep the old number.",
    notify: "Admins and members of your groups will be told, without the digits.",
    same: "That\u2019s already your payment number.",
    prepare: "Continue",
    history: "Previous numbers",
    historyHelp: "Visible only to you.",
    historyRow: "{{from}} to {{to}}",
    done: "Number changed. Withdrawals possible from {{date}}."
  },
  statements: {
    title: "Statements",
    generate: "Generate a statement",
    periodTitle: "Which period?",
    periods: {
      month: "A month",
      cycle: "A cycle",
      custom: "Custom dates"
    },
    month: "Month",
    cycle: "Cycle",
    from: "From",
    to: "To",
    names: {
      month: "{{month}}",
      cycle: "Cycle {{cycle}}",
      custom: "{{from}} to {{to}}"
    },
    generating: "Preparing the statement\u2026",
    ready: "Statement ready",
    rowMeta: "Created on {{date}}, PDF {{size}}",
    verificationCode: "Verification code: {{code}}",
    verifyHelp: "An institution can check this statement at {{url}}.",
    contents: "Includes your contributions, payouts, withdrawals, loans, fines, fees, the solidarity fund and your reliability.",
    empty: "No statements yet. Your monthly statement arrives automatically on the 1st at 7 am.",
    leftMember: "You have left this group: your statements are still available."
  },
  groupSettings: {
    title: "Group settings",
    adminOnly: "Admin only",
    rules: "Rules",
    rulesHelp: "Rules only change by vote, admin included.",
    rulesVersion: "Version {{version}}, since round {{round}}",
    proposeChange: "Propose a change",
    openRuleVote: "Vote in progress: {{title}}",
    members: "Members and roles",
    invites: "Invitations",
    inviteFounding: "Invite a founding member",
    inviteApproved_one: "{{count}} member approved by vote to invite",
    inviteApproved_other: "{{count}} members approved by vote to invite",
    noInvites: "No invitations waiting.",
    inviteNeedsVote: "Since the first cycle, every new member goes through a vote. Propose them in Votes.",
    meetings: "Meetings",
    announcements: "Announcements",
    newAnnouncement: "New announcement",
    announcementPlaceholder: "What the whole group needs to know",
    announcementNote: "The announcement is pinned at the top of the group.",
    loansQueue: "Loans to decide",
    pinResets: "New PIN requests",
    startCycle: "Start the cycle",
    adminLimits: "The admin can\u2019t change the rules, move money or see members\u2019 numbers.",
    memberViewNote: "You can see the rules. Only the admin manages invitations, meetings and announcements."
  },
  privacy: {
    title: "Privacy",
    consent: "My consent",
    consentValue: "Given on {{date}}, version {{version}}",
    readPolicy: "Read the privacy policy",
    whatOthersSee: "What other members see",
    whatOthersSeeBody: "Your name, your payments in the records, your reliability and your non-secret votes. Never your numbers.",
    export: {
      title: "Export my data",
      body: "A file with your profile, your payments, your non-secret votes and your assistant history.",
      action: "Prepare the export",
      preparing: "Preparing the export\u2026",
      ready: "Your export is ready."
    },
    delete: {
      title: "Delete my account",
      conditions: "Only possible when you have no obligations and no money left in any group.",
      what: "Your name and numbers will be anonymised. The records\u2019 entries stay, because the group needs them for its accounts.",
      blocked: "You still have obligations or money in {{group}}. Settle them, or announce that you\u2019re leaving at the end of the cycle.",
      leaveInstead: "Leave at the end of the cycle",
      action: "Delete my account",
      done: "Your account is deleted."
    },
    screenshots: "Screenshots are blocked on PIN and money screens."
  },
  agentHistory: {
    title: "Assistant history",
    help: "What Njangi looked at, prepared or did for you. Only you can see this list, not even the admin.",
    empty: "Njangi hasn\u2019t done anything for you yet.",
    filters: {
      all: "All",
      actions: "Actions",
      reads: "Look-ups"
    },
    status: {
      looked: "Looked up",
      prepared: "Prepared",
      confirmed: "Confirmed by you",
      done: "Done",
      cancelled: "Cancelled",
      expired: "Expired",
      failed: "Failed",
      refused: "Refused by the rules"
    },
    tools: {
      get_my_overview: "Your situation",
      get_round: "Round status",
      list_unpaid: "Members who haven\u2019t paid",
      get_payout_breakdown: "Payout details",
      get_funds: "Funds",
      get_ledger: "Records",
      get_rules: "Rules",
      explain_rule: "Rule explanation",
      list_members: "Members",
      get_member: "Member profile",
      list_proposals: "Votes",
      get_proposal: "Vote details",
      list_loans: "Loans",
      get_loan_quote: "Loan estimate",
      list_bids: "Bids",
      get_solidarity: "Solidarity fund",
      get_meeting: "Meeting",
      summarize_unread: "Group summary",
      search_chat: "Group search",
      list_my_groups: "Your groups",
      get_statement: "Statement",
      export_ledger: "Records export",
      get_my_payment_number: "Your payment number",
      get_notifications: "Notifications",
      get_agent_history: "History",
      set_language: "Language",
      set_notification_prefs: "Notification settings",
      switch_group: "Group switch",
      mark_chat_read: "Group marked as read",
      pay: "Contribution payment",
      pay_debts: "Debt payment",
      withdraw: "Withdrawal",
      request_loan: "Loan request",
      repay_loan: "Loan repayment",
      decide_loan: "Loan decision",
      place_bid: "Bid",
      propose_rule_change: "Rule proposal",
      propose_member_add: "New member proposal",
      propose_member_removal: "Removal proposal",
      propose_rotation_change: "Order change proposal",
      propose_admin_change: "Admin change proposal",
      propose_fine_waiver: "Fine waiver proposal",
      propose_ledger_correction: "Records correction proposal",
      request_early_exit: "Leaving request",
      announce_leave_at_cycle_end: "Leaving at cycle end",
      cast_vote: "Vote",
      request_solidarity: "Support request",
      add_agenda_item: "Agenda item",
      check_in: "Meeting check-in",
      send_absence_excuse: "Apology for absence",
      post_to_group: "Group message",
      schedule_meeting: "Meeting scheduled",
      mark_attendance: "Attendance",
      draft_minutes: "Minutes draft",
      publish_minutes: "Minutes published",
      post_announcement: "Announcement",
      create_invite: "Invitation",
      start_cycle: "Cycle start",
      hide_message: "Message hidden",
      change_payment_number: "Number change",
      delete_my_account: "Account deletion"
    }
  },
  language: {
    title: "Language",
    fr: "Fran\xE7ais",
    en: "English",
    followPhone: "Phone language",
    note: "Njangi will also reply in this language."
  },
  security: {
    title: "Security",
    changePin: "Change my PIN",
    currentPin: "Enter your current PIN",
    newPin: "Choose your new PIN",
    confirmPin: "Confirm your new PIN",
    pinChanged: "PIN changed.",
    logoutEverywhere: "Log out everywhere",
    logoutEverywhereHelp: "Logs out all your devices, including this one. Useful if you\u2019ve lost a phone."
  },
  session: {
    logout: {
      title: "Log out?",
      body: "You\u2019ll need your number and your PIN to come back.",
      confirm: "Log out"
    },
    logoutEverywhere: {
      title: "Log out everywhere?",
      body: "All your devices will be logged out, including this one.",
      confirm: "Log out everywhere",
      done: "All your devices are logged out."
    }
  }
};

// ../../packages/shared/src/i18n/ui.fr.ts
var uiFr = {
  // Foundations: shared words, time, accessibility, errors, offline (spec 1.6, 1.7)
  common: {
    appName: "NjangiTrust",
    agentName: "Njangi",
    you: "Toi",
    youSuffix: "{{name}} (toi)",
    actions: {
      cancel: "Annuler",
      confirm: "Confirmer",
      continue: "Continuer",
      back: "Retour",
      close: "Fermer",
      retry: "R\xE9essayer",
      save: "Enregistrer",
      edit: "Modifier",
      change: "Changer",
      share: "Partager",
      copy: "Copier",
      copied: "Copi\xE9",
      download: "T\xE9l\xE9charger",
      open: "Ouvrir",
      seeAll: "Tout voir",
      seeDetails: "Voir le d\xE9tail",
      next: "Suivant",
      previous: "Pr\xE9c\xE9dent",
      done: "Termin\xE9",
      send: "Envoyer",
      delete: "Supprimer",
      search: "Chercher",
      filter: "Filtrer",
      clearFilters: "Retirer les filtres",
      learnMore: "En savoir plus",
      later: "Plus tard",
      start: "Commencer",
      add: "Ajouter",
      remove: "Retirer",
      reply: "R\xE9pondre",
      more: "Plus d\u2019options",
      refresh: "Actualiser",
      showMore: "Afficher plus",
      showLess: "Afficher moins"
    },
    status: {
      loading: "Chargement\u2026",
      saving: "Enregistrement\u2026",
      sending: "Envoi\u2026",
      preparing: "Pr\xE9paration\u2026",
      connectionRequired: "Connexion requise"
    },
    roles: {
      ADMIN: "Admin",
      MEMBER: "Membre"
    },
    membershipStatus: {
      INVITED: "Invitation en attente",
      ACTIVE: "Membre",
      LEAVING: "Part \xE0 la fin du cycle",
      LEFT: "A quitt\xE9 le groupe",
      REMOVED: "Exclusion vot\xE9e",
      pendingActivation: "Membre actif au prochain cycle"
    },
    operators: {
      MTN: "MTN",
      ORANGE: "Orange",
      UNKNOWN: "Op\xE9rateur inconnu"
    },
    operatorServices: {
      MTN: "MTN Mobile Money",
      ORANGE: "Orange Money"
    },
    frequency: {
      WEEKLY: "Chaque semaine",
      BIWEEKLY: "Toutes les deux semaines",
      MONTHLY: "Chaque mois"
    },
    rotationMode: {
      FIXED: "Ordre tir\xE9 au sort",
      BIDDING: "Ench\xE8res"
    },
    round: "Tour {{round}}",
    roundOf: "Tour {{round}} sur {{total}}",
    cycle: "Cycle {{cycle}}",
    reference: "R\xE9f. {{ref}}",
    stepOf: "\xC9tape {{current}} sur {{total}}",
    optional: "Facultatif",
    percentPerMonth: "{{percent}}\xA0% par mois",
    membersCount_one: "{{count}} membre",
    membersCount_other: "{{count}} membres"
  },
  time: {
    justNow: "\xC0 l\u2019instant",
    minutesAgo_one: "Il y a {{count}}\xA0min",
    minutesAgo_other: "Il y a {{count}}\xA0min",
    hoursAgo_one: "Il y a {{count}}\xA0h",
    hoursAgo_other: "Il y a {{count}}\xA0h",
    today: "Aujourd\u2019hui",
    yesterday: "Hier",
    tomorrow: "Demain",
    todayAt: "aujourd\u2019hui \xE0 {{time}}",
    yesterdayAt: "hier \xE0 {{time}}",
    tomorrowAt: "demain \xE0 {{time}}",
    dateAt: "{{date}} \xE0 {{time}}",
    updatedAt: "Mis \xE0 jour \xE0 {{time}}",
    closesIn: "Cl\xF4ture dans {{duration}}",
    closedOn: "Clos le {{date}}",
    expiresIn: "Expire dans {{duration}}",
    duration: {
      minutes_one: "{{count}} minute",
      minutes_other: "{{count}} minutes",
      hours_one: "{{count}} heure",
      hours_other: "{{count}} heures",
      days_one: "{{count}} jour",
      days_other: "{{count}} jours",
      months_one: "{{count}} mois",
      months_other: "{{count}} mois"
    },
    durationShort: {
      minutes: "{{count}}\xA0min",
      hours: "{{count}}\xA0h",
      hoursMinutes: "{{hours}}\xA0h {{minutes}}"
    }
  },
  a11y: {
    amount: "{{words}}",
    loading: "Chargement en cours",
    closeSheet: "Fermer",
    sheetHandle: "Poign\xE9e. Glisse vers le bas pour fermer.",
    selected: "s\xE9lectionn\xE9",
    notSelected: "non s\xE9lectionn\xE9",
    expanded: "ouvert",
    collapsed: "ferm\xE9",
    required: "obligatoire",
    opensSheet: "Ouvre une fen\xEAtre",
    externalLink: "Ouvre une autre application",
    image: "Image",
    unreadDot: "Non lu",
    connectionBack: "Connexion r\xE9tablie",
    offlineNow: "Tu es hors ligne",
    stepProgress: "\xC9tape {{current}} sur {{total}}",
    skeleton: "Chargement du contenu",
    maskedNumber: "Num\xE9ro masqu\xE9, se terminant par {{last}}",
    ownNumber: "Ton num\xE9ro\xA0: {{digits}}"
  },
  errors: {
    generic: {
      title: "Action impossible",
      body: "Quelque chose a bloqu\xE9. R\xE9essaie dans un instant."
    },
    network: "Pas de connexion. V\xE9rifie tes donn\xE9es mobiles ou le Wi-Fi, puis r\xE9essaie.",
    server: "Le service ne r\xE9pond pas. R\xE9essaie dans quelques minutes.",
    timeout: "La connexion est trop lente. R\xE9essaie.",
    sessionExpired: "Ta session a expir\xE9. Reconnecte-toi avec ton code PIN.",
    forbidden: "Tu n\u2019as pas acc\xE8s \xE0 cette action.",
    adminOnly: "Seul l\u2019admin du groupe peut faire cela.",
    notFound: "Cet \xE9l\xE9ment n\u2019existe plus.",
    leftMember: "Tu as quitt\xE9 ce groupe. Tes relev\xE9s et l\u2019export de tes donn\xE9es restent disponibles.",
    rateLimited: "Trop de demandes en peu de temps. R\xE9essaie \xE0 {{time}}.",
    validation: {
      required: "Ce champ est obligatoire.",
      nameTooShort: "Entre au moins 2 lettres.",
      phoneInvalid: "Num\xE9ro invalide\xA0: 9 chiffres commen\xE7ant par 6.",
      amountMin: "Le minimum est {{amount}}.",
      amountMax: "Le maximum est {{amount}}.",
      amountWhole: "Montant en francs entiers, sans virgule.",
      dateInPast: "Choisis une date \xE0 venir.",
      endBeforeStart: "La date de fin doit suivre la date de d\xE9but.",
      textTooLong: "Texte trop long\xA0: {{max}} caract\xE8res au plus."
    },
    media: {
      imageTooLarge: "Image trop lourde\xA0: 10\xA0Mo au plus.",
      videoTooLarge: "Vid\xE9o trop lourde\xA0: 50\xA0Mo au plus.",
      videoTooLong: "Vid\xE9o trop longue\xA0: 2 minutes au plus.",
      voiceTooLong: "Note vocale limit\xE9e \xE0 3 minutes.",
      documentTooLarge: "Document trop lourd\xA0: 20\xA0Mo au plus.",
      documentType: "Seuls les documents PDF sont accept\xE9s.",
      uploadFailed: "Envoi du fichier \xE9chou\xE9. Touche pour r\xE9essayer.",
      downloadFailed: "T\xE9l\xE9chargement \xE9chou\xE9. Touche pour r\xE9essayer."
    },
    permissions: {
      camera: "Autorise l\u2019appareil photo dans les r\xE9glages du t\xE9l\xE9phone pour prendre une photo.",
      photos: "Autorise l\u2019acc\xE8s aux photos dans les r\xE9glages du t\xE9l\xE9phone pour en partager.",
      microphone: "Autorise le micro dans les r\xE9glages du t\xE9l\xE9phone pour enregistrer une note vocale.",
      notifications: "Les notifications sont coup\xE9es pour NjangiTrust sur ce t\xE9l\xE9phone.",
      openSettings: "Ouvrir les r\xE9glages"
    }
  },
  offline: {
    banner: "Hors ligne, mis \xE0 jour \xE0 {{time}}",
    bannerYesterday: "Hors ligne, mis \xE0 jour hier \xE0 {{time}}",
    bannerDate: "Hors ligne, mis \xE0 jour le {{date}}",
    bannerNever: "Hors ligne. Les informations s\u2019afficheront au retour de la connexion.",
    connectionRequired: "Connexion requise",
    actionsHint: "Paiements, retraits et votes reviennent d\xE8s que tu es en ligne.",
    queued: "En attente de connexion",
    agentComposer: "Njangi a besoin d\u2019une connexion"
  },
  emptyStates: {
    noGroup: {
      title: "Tu n\u2019as pas encore de groupe",
      body: "Cr\xE9e ta njangi, ou ouvre le lien d\u2019invitation re\xE7u de ton admin."
    },
    loadFailed: {
      title: "Chargement impossible",
      body: "V\xE9rifie ta connexion, puis r\xE9essaie."
    }
  },
  // App shell: navigation, group switcher, notifications (spec 1.3, 1.8)
  nav: {
    tabs: {
      njangi: "Njangi",
      groupe: "Groupe",
      caisse: "Caisse",
      votes: "Votes",
      moi: "Moi"
    },
    tabsA11y: {
      njangi: "Njangi, ton assistant",
      groupe_one: "Groupe, {{count}} message non lu",
      groupe_other: "Groupe, {{count}} messages non lus",
      caisse: "Caisse",
      votes_one: "Votes, {{count}} vote attend ta voix",
      votes_other: "Votes, {{count}} votes attendent ta voix",
      moi: "Moi"
    },
    navigationLabel: "Navigation principale",
    groupSwitcher: {
      a11yLabel: "Groupe actif\xA0: {{name}}. Changer de groupe",
      title: "Mes groupes"
    },
    bell: {
      label: "Notifications",
      labelUnread_one: "Notifications, {{count}} non lue",
      labelUnread_other: "Notifications, {{count}} non lues"
    },
    back: "Retour"
  },
  groupSwitcher: {
    title: "Mes groupes",
    rowRound: "Tour {{round}} sur {{total}}",
    rowToPay: "\xC0 payer\xA0: {{amount}}",
    rowUpToDate: "\xC0 jour",
    rowYourTurn: "C\u2019est ton tour",
    rowNotStarted: "En pr\xE9paration",
    rowLeft: "Quitt\xE9",
    active: "Groupe actif",
    allGroups: "Tous mes groupes\xA0: {{amount}} \xE0 payer",
    join: "Rejoindre avec une invitation",
    create: "Cr\xE9er une njangi"
  },
  notifications: {
    title: "Notifications",
    markAllRead: "Tout marquer comme lu",
    empty: "Aucune notification. Rappels, paiements et votes appara\xEEtront ici.",
    unread: "Non lue",
    earlier: "Plus anciennes",
    categories: {
      REMINDERS: "Rappels",
      MONEY: "Argent",
      VOTES: "Votes",
      GROUP: "Groupe",
      SECURITY: "S\xE9curit\xE9"
    },
    categoryHelp: {
      REMINDERS: "\xC9ch\xE9ances de cotisation et de remboursement.",
      MONEY: "Paiements re\xE7us, versements, retraits, amendes et pr\xEAts.",
      VOTES: "Votes ouverts, rappels et r\xE9sultats.",
      GROUP: "Messages, mentions, r\xE9unions, proc\xE8s-verbaux et annonces.",
      SECURITY: "Num\xE9ro de paiement, code PIN, connexions et v\xE9rification de la caisse."
    },
    settings: {
      title: "R\xE9glages des notifications",
      categoriesTitle: "Ce que tu re\xE7ois",
      securityLocked: "Toujours activ\xE9e, pour te prot\xE9ger.",
      quietHours: "Heures calmes",
      quietHoursHelp: "Pas de notification de {{from}} \xE0 {{to}}. Les alertes de s\xE9curit\xE9 passent toujours.",
      from: "De",
      to: "\xC0",
      muteChat: "Couper les messages du groupe",
      muteChatHelp: "Tu recevras toujours les mentions et les annonces.",
      mediaWifi: "M\xE9dias sur Wi-Fi uniquement",
      mediaWifiHelp: "Photos, vid\xE9os et documents ne se t\xE9l\xE9chargent seuls que sur Wi-Fi. Les notes vocales, l\xE9g\xE8res, se t\xE9l\xE9chargent toujours.",
      webNote: "Sur le web, les notifications s\u2019affichent dans l\u2019app uniquement.",
      pushOff: "Les notifications sont coup\xE9es pour NjangiTrust sur ce t\xE9l\xE9phone. Tu les retrouveras quand m\xEAme ici."
    }
  },
  // Access: splash, welcome, sign-up, login, PIN reset, app lock (spec 1.4, 2.10)
  splash: {
    a11y: "NjangiTrust, chargement"
  },
  welcome: {
    title: "Ta njangi, en toute clart\xE9",
    body: "Cotise par Mobile Money, suis chaque franc dans le registre et d\xE9cide de tout par vote.",
    create: "Cr\xE9er une njangi",
    invitation: "J\u2019ai une invitation",
    login: "J\u2019ai d\xE9j\xE0 un compte",
    invitationHelp: {
      title: "Ouvre ton lien d\u2019invitation",
      body: "L\u2019admin de ton groupe t\u2019a envoy\xE9 un lien par WhatsApp ou SMS. Ouvre-le sur ce t\xE9l\xE9phone\xA0: il t\u2019am\xE8ne directement \xE0 ton groupe.",
      paste: "Coller le lien",
      pastePlaceholder: "https://\u2026",
      invalid: "Ce lien n\u2019est pas une invitation NjangiTrust. V\xE9rifie le message re\xE7u."
    },
    languageSwitch: "English"
  },
  signup: {
    title: "Cr\xE9er ton compte",
    name: {
      title: "Comment tu t\u2019appelles\xA0?",
      label: "Nom complet",
      placeholder: "Par exemple Carine Fotso",
      help: "Les membres de ton groupe verront ce nom."
    },
    loginPhone: {
      title: "Ton num\xE9ro de t\xE9l\xE9phone",
      label: "Num\xE9ro de t\xE9l\xE9phone",
      help: "Il sert \xE0 te connecter. Les autres membres ne le voient jamais.",
      alreadyUsed: "Ce num\xE9ro a d\xE9j\xE0 un compte. Connecte-toi avec ton code PIN.",
      inviteMismatch: "Ce num\xE9ro ne correspond pas \xE0 l\u2019invitation. Utilise le num\xE9ro sur lequel tu as re\xE7u le lien."
    },
    paymentNumber: {
      title: "Ton num\xE9ro de paiement",
      body: "Tu paies et re\xE7ois l\u2019argent sur ce num\xE9ro Mobile Money.",
      sameAsLogin: "Utiliser mon num\xE9ro de t\xE9l\xE9phone",
      other: "Utiliser un autre num\xE9ro",
      label: "Num\xE9ro de paiement",
      operatorLabel: "Op\xE9rateur",
      detected: "D\xE9tect\xE9\xA0: {{operator}}. Corrige si besoin.",
      unknownOperator: "Op\xE9rateur non reconnu. Choisis MTN ou Orange.",
      help: "Tu pourras le changer plus tard dans Moi."
    },
    consent: {
      title: "Tes donn\xE9es",
      intro: "Pour faire fonctionner ta njangi, NjangiTrust garde\xA0:",
      items: {
        name: "ton nom, visible par les membres de tes groupes\xA0;",
        identity: "tes num\xE9ros de t\xE9l\xE9phone et de paiement, que les autres membres ne voient jamais\xA0;",
        money: "tes paiements, retraits et pr\xEAts, visibles par ton groupe dans le registre\xA0;",
        votes: "tes votes, sauf les votes secrets, qui ne sont li\xE9s \xE0 personne\xA0;",
        agent: "tes \xE9changes avec Njangi, visibles par toi seul."
      },
      abroad: "Certains services, comme l\u2019assistant, peuvent fonctionner hors du Cameroun. Seul le strict n\xE9cessaire leur est envoy\xE9, jamais tes num\xE9ros ni ton code PIN.",
      readPolicy: "Lire la politique de confidentialit\xE9",
      checkbox: "J\u2019accepte que NjangiTrust traite mes donn\xE9es pour faire fonctionner ma njangi.",
      version: "Version {{version}}",
      required: "Coche la case pour continuer.",
      rights: "Tu peux exporter tes donn\xE9es ou supprimer ton compte \xE0 tout moment, dans Moi."
    },
    pin: {
      createTitle: "Choisis ton code PIN",
      createBody: "6 chiffres. Il sert \xE0 te connecter et \xE0 confirmer les actions sensibles.",
      createHelp: "\xC9vite ta date de naissance et les suites simples.",
      confirmTitle: "Confirme ton code PIN",
      confirmBody: "Entre les m\xEAmes 6 chiffres.",
      mismatch: "Les deux codes ne correspondent pas. Recommence.",
      tooSimple: "Ce code est trop simple, comme 123456 ou 111111. Choisis-en un autre."
    },
    creating: "Cr\xE9ation du compte\u2026",
    done: {
      title: "Bienvenue, {{name}}",
      bodyCreate: "Ton compte est pr\xEAt. Cr\xE9e maintenant ta njangi.",
      bodyInvite: "Ton compte est pr\xEAt. Tu rejoins {{group}}."
    }
  },
  login: {
    title: "Connexion",
    phoneLabel: "Num\xE9ro de t\xE9l\xE9phone",
    pinTitle: "Entre ton code PIN",
    pinBody: "Compte {{maskedPhone}}",
    submit: "Se connecter",
    forgotPin: "Code PIN oubli\xE9\xA0?",
    noAccount: "Pas encore de compte\xA0? Cr\xE9er un compte",
    wrongPin_one: "Code PIN incorrect. Il te reste {{count}} essai.",
    wrongPin_other: "Code PIN incorrect. Il te reste {{count}} essais.",
    locked: "Trop d\u2019essais. R\xE9essaie \xE0 {{time}}, ou demande un nouveau code PIN.",
    unknownPhone: "Aucun compte avec ce num\xE9ro. V\xE9rifie le num\xE9ro ou cr\xE9e un compte.",
    changeNumber: "Changer de num\xE9ro"
  },
  pinReset: {
    request: {
      title: "Code PIN oubli\xE9",
      body: "L\u2019admin de ton groupe va confirmer te conna\xEEtre. Tu recevras ensuite de sa part un lien, valable 30 minutes, pour choisir un nouveau code.",
      phoneLabel: "Ton num\xE9ro de t\xE9l\xE9phone",
      submit: "Demander un nouveau code",
      sent: {
        title: "Demande envoy\xE9e",
        body: "Pr\xE9viens ton admin\xA0: la demande doit \xEAtre confirm\xE9e dans l\u2019app, puis le lien t\u2019est envoy\xE9 par WhatsApp ou SMS.",
        holdNote: "Par s\xE9curit\xE9, tes retraits attendront {{hours}} heures apr\xE8s le changement de code.",
        bodyAdmin: "Comme tu es l\u2019admin, deux membres du groupe doivent confirmer la demande dans l\u2019app. Pr\xE9viens-les\xA0: l\u2019un d\u2019eux t\u2019enverra ensuite le lien par WhatsApp ou SMS."
      },
      unknownPhone: "Aucun compte avec ce num\xE9ro. V\xE9rifie le num\xE9ro.",
      alreadyPending: "Une demande est d\xE9j\xE0 en attente. Pr\xE9viens ton admin."
    },
    admin: {
      title: "Demande de nouveau code PIN",
      body: "{{name}} demande un nouveau code PIN. Confirme seulement si tu as parl\xE9 \xE0 cette personne, de vive voix ou au t\xE9l\xE9phone.",
      confirm: "Je confirme, cr\xE9er le lien",
      decline: "Je ne reconnais pas cette demande",
      declined: "Demande refus\xE9e. Nous pr\xE9venons {{name}}.",
      linkTitle: "Lien pour {{name}}",
      linkBody: "Valable 30 minutes, une seule fois. Envoie-le directement \xE0 cette personne."
    },
    members: {
      title: "Nouveau code PIN pour l\u2019admin",
      body: "{{name}}, l\u2019admin du groupe, demande un nouveau code PIN. Il faut la confirmation de deux membres qui ont parl\xE9 \xE0 cette personne, de vive voix ou au t\xE9l\xE9phone.",
      confirm: "Je confirme",
      decline: "Je ne reconnais pas cette demande",
      progress_one: "{{count}} confirmation sur 2",
      progress_other: "{{count}} confirmations sur 2",
      waiting: "Ta confirmation est enregistr\xE9e. Il en faut encore une.",
      ready: "Deux membres ont confirm\xE9. Envoie le lien \xE0 {{name}}.",
      alreadyConfirmed: "Tu as d\xE9j\xE0 confirm\xE9 cette demande."
    },
    review: {
      empty: "Aucune demande en attente.",
      requestedAt: "Demand\xE9e {{date}}",
      expiresAt: "Sans confirmation, la demande expire {{date}}."
    },
    owner: {
      title: "Demande de nouveau code PIN sur ton compte",
      body: "Si ce n\u2019est pas toi, annule-la maintenant. Ton code PIN actuel reste valable.",
      cancel: "Annuler la demande",
      cancelled: "Demande annul\xE9e. Ton code PIN ne change pas."
    },
    set: {
      title: "Choisis un nouveau code PIN",
      expired: "Ce lien a expir\xE9. Fais une nouvelle demande depuis l\u2019\xE9cran de connexion.",
      used: "Ce lien a d\xE9j\xE0 servi. Fais une nouvelle demande si besoin.",
      done: "Code PIN chang\xE9. Tes retraits reprennent le {{date}}.",
      wait: "Par s\xE9curit\xE9, ce lien ne fonctionne qu\u2019\xE0 partir du {{date}}, 24\xA0heures apr\xE8s la confirmation."
    }
  },
  appLock: {
    title: "NjangiTrust est verrouill\xE9",
    body: "D\xE9verrouille avec ton empreinte ou ton visage.",
    unlock: "D\xE9verrouiller",
    usePin: "Utiliser mon code PIN",
    failed: "Non reconnu. R\xE9essaie ou utilise ton code PIN.",
    settings: {
      toggle: "Verrouiller l\u2019app \xE0 l\u2019ouverture",
      help: "Avec l\u2019empreinte ou le visage enregistr\xE9s sur ce t\xE9l\xE9phone. Les actions sensibles demandent toujours ton code PIN.",
      after: "Verrouiller apr\xE8s",
      immediately: "Tout de suite",
      after1: "1 minute",
      after5: "5 minutes",
      unavailable: "Aucune empreinte ni visage enregistr\xE9 sur ce t\xE9l\xE9phone."
    }
  },
  // Group setup: create, rules, invitations, first cycle (spec 1.4, 3.2, R1.6)
  createGroup: {
    title: "Cr\xE9er une njangi",
    name: {
      title: "Le nom du groupe",
      label: "Nom de la njangi",
      placeholder: "Par exemple Njangi des Coll\xE8gues",
      help: "Tous les membres verront ce nom."
    },
    schedule: {
      title: "Quand le b\xE9n\xE9ficiaire re\xE7oit-il\xA0?",
      firstPayout: "Premier versement",
      date: "Date",
      time: "Heure",
      frequency: "Fr\xE9quence",
      deadlineNote: "Les membres paient au plus tard 24\xA0h avant chaque versement.",
      preview: "Tour 1\xA0: {{first}}. Tour 2\xA0: {{second}}.",
      anchor: {
        title: "Chaque mois, le versement tombe",
        dayOfMonth: "Le {{day}} de chaque mois",
        lastWeekday: "Le dernier {{weekday}} de chaque mois",
        nthWeekday: "Le {{nth}} {{weekday}} de chaque mois",
        nth1: "premier",
        nth2: "deuxi\xE8me",
        nth3: "troisi\xE8me",
        nth4: "quatri\xE8me",
        clampNote: "Les mois plus courts, le versement a lieu le dernier jour du mois."
      }
    },
    money: {
      title: "Combien chaque membre cotise\xA0?",
      contribution: "Cotisation par tour",
      solidarity: "Caisse de secours par tour",
      solidarityHelp: "Mets 0 pour ne pas avoir de caisse de secours."
    },
    rules: {
      title: "Les r\xE8gles du groupe",
      body: "Valeurs propos\xE9es par d\xE9faut. Modifie-les maintenant\xA0: ensuite, elles ne changeront que par vote.",
      editRule: "Modifier {{rule}}"
    },
    summary: {
      title: "V\xE9rifie avant de cr\xE9er",
      create: "Cr\xE9er le groupe",
      creating: "Cr\xE9ation du groupe\u2026",
      adminNote: "Tu seras l\u2019admin. L\u2019admin ne peut ni changer les r\xE8gles, ni d\xE9placer de l\u2019argent\xA0: tout passe par un vote."
    },
    created: {
      title: "{{group}} est cr\xE9\xE9e",
      body: "Invite maintenant les membres fondateurs. Il faut au moins 3 membres, toi compris, pour d\xE9marrer.",
      invite: "Inviter des membres"
    }
  },
  rules: {
    contributionAmount: { label: "Cotisation par tour", help: "Entre {{min}} et {{max}}." },
    solidarityContribution: {
      label: "Caisse de secours par tour",
      help: "0 d\xE9sactive la caisse de secours."
    },
    frequency: { label: "Fr\xE9quence des tours", help: "Un changement s\u2019applique au cycle suivant." },
    payoutTime: { label: "Heure du versement", help: "Le paiement est d\xFB 24\xA0h avant." },
    lateFine: { label: "Amende de retard", help: "Une seule amende par membre et par tour." },
    rotationMode: {
      label: "Ordre des b\xE9n\xE9ficiaires",
      help: "Un changement s\u2019applique au cycle suivant."
    },
    minBid: { label: "Ench\xE8re minimale", help: "Seulement en mode ench\xE8res." },
    loanRatePermille: { label: "Int\xE9r\xEAt des pr\xEAts", help: "Par mois, fix\xE9 \xE0 l\u2019accord du pr\xEAt." },
    loanMaxMonths: { label: "Dur\xE9e maximale d\u2019un pr\xEAt", help: "Entre 1 et 6 mois." },
    loanLimitFactor: {
      label: "Plafond de pr\xEAt",
      help: "{{factor}} fois les cotisations pay\xE9es dans le cycle."
    },
    numberChangeHoldHours: {
      label: "Attente apr\xE8s un changement de num\xE9ro",
      help: "Pour les retraits et les pr\xEAts vers le nouveau num\xE9ro."
    },
    voteWindowHours: { label: "Dur\xE9e des votes", help: "Entre 24 et 168 heures." },
    solidarityVoteWindowHours: {
      label: "Dur\xE9e des votes de secours",
      help: "Entre 12 et 72 heures."
    },
    meetingAbsenceFine: { label: "Amende d\u2019absence en r\xE9union", help: "0 = pas d\u2019amende." },
    distributeFundAtCycleEnd: {
      label: "Partager la caisse g\xE9n\xE9rale en fin de cycle",
      help: "Entre les membres pr\xE9sents tout le cycle et sans dette."
    },
    reliabilityWindow: {
      label: "Fiabilit\xE9 calcul\xE9e sur",
      help: "Les derni\xE8res \xE9ch\xE9ances pass\xE9es."
    },
    values: {
      hours_one: "{{count}} heure",
      hours_other: "{{count}} heures",
      months_one: "{{count}} mois",
      months_other: "{{count}} mois",
      items_one: "{{count}} \xE9ch\xE9ance",
      items_other: "{{count}} \xE9ch\xE9ances",
      factor: "{{factor}}\xA0\xD7",
      off: "D\xE9sactiv\xE9e",
      yes: "Oui",
      no: "Non"
    }
  },
  invite: {
    founding: {
      title: "Membres fondateurs",
      body: "Avant le premier cycle, tu invites directement. Ensuite, chaque nouveau membre passe par un vote.",
      add: "Inviter un membre",
      nameLabel: "Nom",
      phoneLabel: "Son num\xE9ro de t\xE9l\xE9phone",
      phoneHelp: "Le lien ne marchera qu\u2019avec ce num\xE9ro. Les autres membres ne le verront pas.",
      create: "Cr\xE9er le lien",
      progress_one: "{{count}} membre sur 3 minimum",
      progress_other: "{{count}} membres sur 3 minimum",
      ready: "Le groupe peut d\xE9marrer.",
      statusPending: "Invitation envoy\xE9e, expire {{date}}",
      statusExpired: "Invitation expir\xE9e",
      statusJoined: "A rejoint le groupe",
      newLink: "Nouveau lien"
    },
    approved: {
      title: "Inviter {{name}}",
      body: "Le vote pour ajouter {{name}} est adopt\xE9. Cr\xE9e le lien et envoie-le."
    },
    shareMessage: "{{inviter}} t\u2019invite dans la njangi \xAB\xA0{{group}}\xA0\xBB sur NjangiTrust. Ouvre ce lien sur ton t\xE9l\xE9phone (valable 72\xA0h)\xA0: {{url}}",
    landing: {
      title: "{{inviter}} t\u2019invite dans {{group}}",
      facts: {
        members_one: "{{count}} membre",
        members_other: "{{count}} membres",
        contribution: "{{amount}} par tour, {{frequency}}",
        nextRound: "Prochain tour\xA0: {{date}}",
        notStarted: "Le premier cycle n\u2019a pas commenc\xE9."
      },
      rulesTitle: "Les r\xE8gles du groupe",
      rulesNote: "En rejoignant, tu acceptes ces r\xE8gles. Elles ne changent que par vote.",
      join: "Rejoindre {{group}}",
      haveAccount: "J\u2019ai d\xE9j\xE0 un compte",
      activeFromNextCycle: "Tu deviendras membre actif au prochain cycle, le {{date}}. En attendant, tu peux lire le groupe et le registre.",
      expired: "Cette invitation a expir\xE9. Demande un nouveau lien \xE0 {{inviter}}.",
      used: "Cette invitation a d\xE9j\xE0 servi. Si c\u2019est toi, connecte-toi.",
      wrongPhone: "Ce lien est li\xE9 \xE0 un autre num\xE9ro. Utilise le num\xE9ro qui a re\xE7u l\u2019invitation, ou demande un nouveau lien.",
      invalid: "Ce lien n\u2019est pas valide. V\xE9rifie le message re\xE7u.",
      joined: "Tu as rejoint {{group}}."
    }
  },
  startCycle: {
    title: "D\xE9marrer le cycle",
    soonTitle: "Bient\xF4t disponible",
    soonBody: "Le d\xE9marrage du cycle arrive avec les paiements Mobile Money, dans une prochaine mise \xE0 jour. Tes membres sont pr\xEAts\xA0: rien n\u2019est perdu.",
    body_one: "{{count}} membre actif. L\u2019ordre des tours sera tir\xE9 au sort et v\xE9rifiable par tous.",
    body_other: "{{count}} membres actifs. L\u2019ordre des tours sera tir\xE9 au sort et v\xE9rifiable par tous.",
    needMore_one: "Il manque {{count}} membre pour d\xE9marrer (3 minimum).",
    needMore_other: "Il manque {{count}} membres pour d\xE9marrer (3 minimum).",
    pendingInvites_one: "{{count}} invitation n\u2019a pas encore \xE9t\xE9 accept\xE9e. Les membres qui rejoignent apr\xE8s le d\xE9marrage attendront le cycle suivant.",
    pendingInvites_other: "{{count}} invitations n\u2019ont pas encore \xE9t\xE9 accept\xE9es. Les membres qui rejoignent apr\xE8s le d\xE9marrage attendront le cycle suivant.",
    drawn: "Ordre tir\xE9 au sort. B\xE9n\xE9ficiaire du tour 1\xA0: {{name}}."
  },
  // Njangi tab: the agent (spec 1.4, Part 4)
  agent: {
    header: {
      a11y: "\xC9tat du tour. Touche pour ouvrir la caisse.",
      round: "Tour {{round}} sur {{total}}",
      beneficiary: "B\xE9n\xE9ficiaire\xA0: {{name}}",
      beneficiaryYou: "B\xE9n\xE9ficiaire\xA0: toi",
      contribution: "Ta cotisation\xA0: {{status}}",
      status: {
        toPay: "\xE0 payer",
        paid: "pay\xE9e",
        late: "en retard",
        processing: "en attente de {{operator}}"
      },
      payoutOpenYou: "Ton argent est disponible",
      payoutLockedYou: "Retrait possible {{date}}",
      biddingOpen: "Ench\xE8res ouvertes jusqu\u2019\xE0 {{date}}",
      notStarted: "Le cycle n\u2019a pas commenc\xE9",
      notStartedMembers_one: "{{count}} membre, 3 minimum",
      notStartedMembers_other: "{{count}} membres, 3 minimum",
      pendingActivation: "Tu es membre actif au prochain cycle",
      left: "Tu as quitt\xE9 ce groupe",
      withdrawalsPaused: "Retraits en pause pour le groupe"
    },
    greeting: {
      firstRun: "Bonjour {{name}}. Je suis Njangi, l\u2019assistant de {{group}}. Je peux payer ta cotisation, te dire o\xF9 en est le tour, pr\xE9parer un vote ou r\xE9sumer le groupe.",
      firstRunTrust: "Je pr\xE9pare, tu confirmes\xA0: rien ne bouge sans ton accord.",
      firstRunPrompt: "Par quoi veux-tu commencer\xA0?",
      morning: "Bonjour {{name}}.",
      evening: "Bonsoir {{name}}.",
      owes: "Ta cotisation du tour {{round}} ({{amount}}) est \xE0 payer avant {{date}}.",
      late: "Ta cotisation du tour {{round}} est en retard. Avec l\u2019amende, tu dois {{amount}}.",
      paid: "Tu es \xE0 jour pour le tour {{round}}. B\xE9n\xE9ficiaire\xA0: {{name}}, {{date}}.",
      beneficiarySoon: "C\u2019est ton tour\xA0! Ton versement sera disponible {{date}}.",
      payoutOpen: "Ton versement du tour {{round}} est disponible\xA0: {{amount}}.",
      votesWaiting_one: "{{count}} vote attend ta voix.",
      votesWaiting_other: "{{count}} votes attendent ta voix.",
      unread_one: "{{count}} message non lu dans le groupe.",
      unread_other: "{{count}} messages non lus dans le groupe.",
      notStartedAdmin: "Le groupe compte {{count}} membres. Invite les fondateurs, puis d\xE9marre le cycle.",
      notStartedMember: "Le cycle n\u2019a pas encore commenc\xE9. Je te pr\xE9viens d\xE8s le premier tour.",
      withdrawalsPaused: "Les retraits du groupe sont en pause\xA0: la v\xE9rification du jour a trouv\xE9 un \xE9cart. Tes paiements restent possibles.",
      left: "Tu as quitt\xE9 {{group}}. Je peux encore t\u2019envoyer tes relev\xE9s ou l\u2019export de tes donn\xE9es."
    },
    chips: {
      pay: "Payer ma cotisation",
      payNow: "Payer maintenant",
      howMuch: "Je dois combien\xA0?",
      whoUnpaid: "Qui n\u2019a pas pay\xE9\xA0?",
      whyFine: "Pourquoi une amende\xA0?",
      myTurn: "C\u2019est quand mon tour\xA0?",
      fund: "Combien dans la caisse\xA0?",
      openVotes: "Quels votes sont ouverts\xA0?",
      openVotesCount_one: "Voir le vote ouvert",
      openVotesCount_other: "Voir les {{count}} votes ouverts",
      withdraw: "Retirer mon argent",
      payoutDetail: "Le d\xE9tail de mon versement",
      whenPayout: "Quand je re\xE7ois\xA0?",
      missed: "Qu\u2019est-ce que j\u2019ai rat\xE9\xA0?",
      whyPaused: "Pourquoi les retraits sont bloqu\xE9s\xA0?",
      loansToDecide_one: "{{count}} pr\xEAt \xE0 d\xE9cider",
      loansToDecide_other: "{{count}} pr\xEAts \xE0 d\xE9cider",
      scheduleMeeting: "Planifier une r\xE9union",
      inviteMember: "Inviter un membre",
      startCycle: "D\xE9marrer le cycle",
      whenCanWithdraw: "Quand puis-je retirer\xA0?",
      checkIn: "Signaler ma pr\xE9sence",
      nextInstallment: "Mon prochain remboursement",
      borrow: "Je peux emprunter combien\xA0?",
      statement: "Mon relev\xE9 du mois",
      placeBid: "Miser pour ce tour",
      a11yLabel: "Suggestion\xA0: {{label}}",
      groupLabel: "Suggestions"
    },
    composer: {
      placeholder: "\xC9cris \xE0 Njangi\u2026",
      send: "Envoyer",
      tooLong: "Message trop long\xA0: 1\u202F000 caract\xE8res au plus."
    },
    typing: "Njangi \xE9crit\u2026",
    activity: {
      default: "Je v\xE9rifie\u2026",
      get_my_overview: "Je regarde ta situation\u2026",
      get_round: "Je v\xE9rifie le tour\u2026",
      list_unpaid: "Je v\xE9rifie qui a pay\xE9\u2026",
      get_payout_breakdown: "Je r\xE9cup\xE8re le d\xE9tail du versement\u2026",
      get_funds: "Je v\xE9rifie la caisse\u2026",
      get_ledger: "Je cherche dans le registre\u2026",
      get_rules: "Je relis les r\xE8gles\u2026",
      explain_rule: "Je relis la r\xE8gle\u2026",
      list_members: "Je regarde les membres\u2026",
      get_member: "Je regarde ce profil\u2026",
      list_proposals: "Je regarde les votes\u2026",
      get_proposal: "Je regarde ce vote\u2026",
      list_loans: "Je regarde les pr\xEAts\u2026",
      get_loan_quote: "Je pr\xE9pare une simulation de pr\xEAt\u2026",
      list_bids: "Je regarde les ench\xE8res\u2026",
      get_solidarity: "Je v\xE9rifie la caisse de secours\u2026",
      get_meeting: "Je regarde la r\xE9union\u2026",
      summarize_unread: "Je lis les messages du groupe\u2026",
      search_chat: "Je cherche dans le groupe\u2026",
      list_my_groups: "Je regarde tes groupes\u2026",
      get_statement: "Je pr\xE9pare ton relev\xE9\u2026",
      export_ledger: "Je pr\xE9pare l\u2019export du registre\u2026",
      get_my_payment_number: "Je r\xE9cup\xE8re ton num\xE9ro de paiement\u2026",
      get_notifications: "Je regarde tes notifications\u2026",
      get_agent_history: "Je regarde mon historique\u2026",
      set_language: "Je change la langue\u2026",
      set_notification_prefs: "Je r\xE8gle tes notifications\u2026",
      switch_group: "Je change de groupe\u2026",
      mark_chat_read: "Je marque le groupe comme lu\u2026",
      prepareAction: "Je pr\xE9pare la carte \xE0 confirmer\u2026",
      draft_minutes: "Je r\xE9dige le brouillon du proc\xE8s-verbal\u2026"
    },
    errors: {
      failed: "Je n\u2019ai pas pu terminer. Reformule ta demande, plus simplement.",
      notSent: "Message non envoy\xE9. V\xE9rifie ta connexion, puis touche R\xE9essayer.",
      rateLimited: "Tu as envoy\xE9 beaucoup de messages en peu de temps. Tu pourras m\u2019\xE9crire \xE0 nouveau \xE0 {{time}}. Tous les \xE9crans de l\u2019app restent disponibles.",
      unavailable: "Njangi ne r\xE9pond pas pour le moment. R\xE9essaie dans quelques minutes, ou utilise les \xE9crans de l\u2019app.",
      interrupted: "R\xE9ponse interrompue. Touche R\xE9essayer pour la relancer."
    },
    privateFromGroup: {
      label: "Depuis le groupe",
      a11y: "Tu as \xE9crit dans le groupe\xA0: {{text}}"
    },
    group: {
      privateReply: "Je t\u2019ai r\xE9pondu en priv\xE9, {{name}}.",
      caption: "Assistant",
      mentionHint: "\xC9cris @njangi pour poser une question \xE0 Njangi devant le groupe."
    },
    results: {
      paymentSuccess: "Paiement de {{amount}}\xA0: r\xE9ussi, r\xE9f. {{ref}}.",
      paymentFailed: "Paiement de {{amount}}\xA0: refus\xE9 par {{operator}}.",
      paymentExpired: "Paiement de {{amount}}\xA0: pas de r\xE9ponse de {{operator}}. Je te pr\xE9viens s\u2019il arrive dans les 24\xA0h.",
      withdrawalSuccess: "Retrait de {{amount}}\xA0: envoy\xE9 sur ton num\xE9ro {{number}}, r\xE9f. {{ref}}.",
      withdrawalFailed: "Retrait de {{amount}}\xA0: non effectu\xE9. Ton argent reste disponible.",
      voteRecorded: "Vote \xAB\xA0{{choice}}\xA0\xBB enregistr\xE9\xA0: {{title}}.",
      voteRecordedSecret: "Vote secret enregistr\xE9\xA0: {{title}}.",
      proposalCreated: "Proposition publi\xE9e\xA0: {{title}}. Vote ouvert jusqu\u2019au {{date}}.",
      loanRequested: "Demande de pr\xEAt de {{amount}} envoy\xE9e \xE0 l\u2019admin.",
      loanRequestedVote: "Demande de pr\xEAt de {{amount}} soumise au vote des membres.",
      loanDisbursed: "Pr\xEAt de {{amount}} envoy\xE9 sur ton num\xE9ro {{number}}, r\xE9f. {{ref}}.",
      bidPlaced: "Ench\xE8re de {{amount}} enregistr\xE9e pour le tour {{round}}. Elle reste secr\xE8te jusqu\u2019\xE0 la cl\xF4ture.",
      numberChanged: "Num\xE9ro de paiement chang\xE9. Retraits possibles \xE0 partir du {{date}}.",
      generic: "{{title}}\xA0: fait.",
      cancelled: "Annul\xE9. Rien n\u2019a \xE9t\xE9 fait.",
      expired: "Expir\xE9. Rien n\u2019a \xE9t\xE9 fait."
    },
    dateSeparator: {
      today: "Aujourd\u2019hui",
      yesterday: "Hier"
    },
    loadOlder: "Messages plus anciens",
    panel: {
      title: "Ce tour",
      todo: "\xC0 faire",
      nothingToDo: "Rien \xE0 faire pour le moment."
    },
    a11y: {
      agentMessage: "Njangi\xA0: {{text}}",
      ownMessage: "Toi\xA0: {{text}}",
      streaming: "Njangi r\xE9pond",
      activity: "Njangi\xA0: {{text}}"
    }
  },
  notificationPrefill: {
    reminderDue: "Tu dois {{amount}} pour le tour {{round}}. Payer maintenant\xA0?",
    reminderLate: "Ta cotisation du tour {{round}} est en retard. Avec l\u2019amende, tu dois {{amount}}. Payer maintenant\xA0?",
    yourTurnSoon: "Tu es b\xE9n\xE9ficiaire du tour {{round}}. Ton versement sera disponible {{date}}.",
    payoutOpen: "Ton versement du tour {{round}} est disponible\xA0: {{amount}}. Retirer maintenant\xA0?",
    fineAssessed: "Une amende de {{amount}} a \xE9t\xE9 ajout\xE9e pour le tour {{round}}. Tu veux la payer, ou comprendre pourquoi\xA0?",
    installmentDue: "Ton remboursement de {{amount}} est d\xFB {{date}}. Payer maintenant\xA0?",
    voteReminder: "Le vote \xAB\xA0{{title}}\xA0\xBB se termine {{date}}. Tu veux voter\xA0?",
    loanDecision: "L\u2019admin a r\xE9pondu \xE0 ta demande de pr\xEAt de {{amount}}.",
    statementReady: "Ton relev\xE9 de {{month}} est pr\xEAt.",
    missed: "Il y a {{count}} messages non lus dans le groupe. Je te les r\xE9sume\xA0?"
  },
  // Confirmation, PIN sheet, information cards (spec 1.5, 4.5)
  confirmation: {
    pinRequired: "Code PIN requis",
    a11y: {
      card: "Carte de confirmation\xA0: {{title}}",
      total: "Total\xA0: {{words}}",
      line: "{{label}}\xA0: {{words}}"
    },
    buttons: {
      cancel: "Annuler",
      change: "Modifier",
      retry: "R\xE9essayer",
      prepareAgain: "Pr\xE9parer \xE0 nouveau",
      viewLedger: "Voir dans le registre",
      close: "Fermer"
    },
    lines: {
      contribution: "Cotisation, tour {{round}}",
      solidarity: "Caisse de secours",
      fine: "Amende, tour {{round}}",
      fineMeeting: "Amende d\u2019absence, r\xE9union du {{date}}",
      loanInstallment: "Remboursement de pr\xEAt, {{n}} sur {{total}}",
      bid: "Ench\xE8re gagn\xE9e, tour {{round}}",
      shortfallShare: "Part de remboursement pour {{name}}",
      total: "Total",
      withdrawAmount: "Montant retir\xE9",
      fee: "Frais {{operator}}",
      feeEstimated: "Frais estim\xE9s",
      youReceive: "Tu re\xE7ois",
      fromBalance: "Pris sur ton solde",
      principal: "Montant emprunt\xE9",
      interest: "Int\xE9r\xEAts, {{percent}}\xA0% sur {{months}} mois",
      totalDue: "Total \xE0 rembourser",
      installments_one: "{{count}} remboursement de {{amount}}",
      installments_other: "{{count}} remboursements de {{amount}}",
      lastInstallment: "dernier\xA0: {{amount}}",
      bidAmount: "Ta mise",
      supportAmount: "Montant demand\xE9",
      recipient: "Pour",
      event: "\xC9v\xE9nement",
      current: "Actuellement",
      proposed: "Propos\xE9",
      threshold: "Seuil",
      closes: "Cl\xF4ture",
      newNumber: "Nouveau num\xE9ro",
      meetingDate: "Date",
      meetingPlace: "Lieu",
      message: "Message"
    },
    notes: {
      operatorRequest: "Tu recevras une demande {{operator}} sur {{number}}.",
      exactAmount: "Tu seras d\xE9bit\xE9 exactement de ce montant, sans frais en plus.",
      oldestFirst: "Le tour le plus ancien est propos\xE9 en premier. Touche Modifier pour choisir.",
      withdrawalTo: "Envoi sur ton num\xE9ro {{operator}} {{number}}.",
      holdUntil: "Retraits bloqu\xE9s jusqu\u2019au {{date}}.",
      feeBorne: "Les frais sont pay\xE9s par celui qui re\xE7oit l\u2019argent.",
      voteFinal: "Un vote ne peut pas \xEAtre chang\xE9.",
      voteSecret: "Vote secret\xA0: personne ne conna\xEEtra ton choix, m\xEAme l\u2019admin.",
      threshold: "Il faudra {{needed}} oui sur {{eligible}} membres.",
      loanAdmin: "L\u2019admin d\xE9cide sous 72\xA0h. Sans d\xE9cision, la demande expire.",
      loanAdminVote: "Comme tu es admin, ta demande passe par un vote des membres.",
      bidSealed: "Ta mise reste secr\xE8te jusqu\u2019\xE0 la cl\xF4ture, {{date}}.",
      numberHold: "Retraits et pr\xEAts vers ce num\xE9ro possibles apr\xE8s {{hours}} heures.",
      numberAllGroups: "S\u2019applique \xE0 tous tes groupes. Les admins seront pr\xE9venus, sans les chiffres.",
      deleteAnonymised: "Ton nom et tes num\xE9ros seront anonymis\xE9s. Les op\xE9rations du registre restent.",
      expiresSoon: "Expire dans {{duration}}.",
      leaveAtCycleEnd: "Tu gardes tes obligations et tes droits jusqu\u2019au {{date}}.",
      earlyExitSettlement: "Si le vote passe, le r\xE8glement suit la r\xE8gle de d\xE9part en cours de cycle."
    },
    processing: {
      payment: "En attente de ta validation {{operator}}\u2026",
      paymentHelp: "Valide la demande sur ton t\xE9l\xE9phone avec ton code {{operator}}. Tu peux quitter cet \xE9cran\xA0: je te pr\xE9viens d\xE8s que c\u2019est confirm\xE9.",
      withdrawal: "Envoi vers ton num\xE9ro {{number}}\u2026",
      generic: "En cours\u2026",
      stillWaiting: "Toujours en attente de {{operator}}. Ne relance pas le paiement."
    },
    pendingLate: {
      title: "Pas encore de r\xE9ponse de {{operator}}",
      body: "Si tu as valid\xE9, on continue de v\xE9rifier pendant 24\xA0h et on te pr\xE9vient. Ne relance pas le paiement."
    },
    expired: {
      title: "Expir\xE9",
      body: "Cette demande n\u2019a pas \xE9t\xE9 confirm\xE9e dans les 10 minutes. Rien n\u2019a \xE9t\xE9 fait."
    },
    cancelled: {
      title: "Annul\xE9",
      body: "Rien n\u2019a \xE9t\xE9 fait."
    },
    failed: {
      insufficientBalance: {
        title: "Paiement refus\xE9 par {{operator}}",
        body: "V\xE9rifie ton solde, puis r\xE9essaie."
      },
      declined: {
        title: "Paiement non valid\xE9",
        body: "La demande n\u2019a pas \xE9t\xE9 valid\xE9e sur ton t\xE9l\xE9phone. R\xE9essaie quand tu es pr\xEAt."
      },
      operatorTimeout: {
        title: "Pas de r\xE9ponse de {{operator}}",
        body: "La demande n\u2019a pas \xE9t\xE9 valid\xE9e \xE0 temps. Rien n\u2019a \xE9t\xE9 d\xE9bit\xE9. R\xE9essaie."
      },
      providerUnavailable: {
        title: "Service de paiement indisponible",
        body: "Rien n\u2019a \xE9t\xE9 d\xE9bit\xE9. R\xE9essaie dans quelques minutes."
      },
      invalidNumber: {
        title: "Num\xE9ro refus\xE9 par {{operator}}",
        body: "V\xE9rifie ton num\xE9ro de paiement dans Moi, puis r\xE9essaie."
      },
      disbursementFailed: {
        title: "Envoi non effectu\xE9",
        body: "L\u2019op\xE9rateur n\u2019a pas pu envoyer l\u2019argent. Il reste disponible dans la caisse. R\xE9essaie plus tard."
      },
      situationChanged: {
        title: "La situation a chang\xE9",
        body: "Les montants ne sont plus les m\xEAmes depuis la pr\xE9paration. Pr\xE9pare une nouvelle carte."
      },
      alreadyPaid: {
        title: "D\xE9j\xE0 pay\xE9",
        body: "Cette cotisation est d\xE9j\xE0 r\xE9gl\xE9e. Rien n\u2019a \xE9t\xE9 d\xE9bit\xE9."
      },
      holdActive: {
        title: "Retraits en attente",
        body: "Ton num\xE9ro de paiement a chang\xE9 r\xE9cemment. Retraits possibles \xE0 partir du {{date}}."
      },
      withdrawalsPaused: {
        title: "Retraits en pause",
        body: "La v\xE9rification du jour a trouv\xE9 un \xE9cart. Les retraits reprennent d\xE8s la correction."
      },
      limitExceeded: {
        title: "Au-dessus de la limite",
        body: "Le maximum possible est {{amount}}. Pr\xE9pare une nouvelle carte avec ce montant."
      },
      voteClosed: {
        title: "Vote clos",
        body: "Ce vote s\u2019est termin\xE9 avant ta confirmation."
      },
      alreadyVoted: {
        title: "Tu as d\xE9j\xE0 vot\xE9",
        body: "Un vote ne peut pas \xEAtre chang\xE9."
      },
      notEligible: {
        title: "Action impossible",
        body: "{{reason}}"
      },
      generic: {
        title: "\xC9chec",
        body: "Rien n\u2019a \xE9t\xE9 fait. R\xE9essaie dans un instant."
      }
    },
    actions: {
      pay: { title: "Payer ta cotisation", button: "Payer {{amount}}", done: "Pay\xE9" },
      payDebts: { title: "Payer tes dettes", button: "Payer {{amount}}", done: "Pay\xE9" },
      repayLoan: {
        title: "Rembourser ton pr\xEAt",
        button: "Rembourser {{amount}}",
        done: "Rembours\xE9"
      },
      withdraw: { title: "Retirer ton argent", button: "Retirer {{amount}}", done: "Retir\xE9" },
      requestLoan: { title: "Demander un pr\xEAt", button: "Demander {{amount}}", done: "Demand\xE9" },
      approveLoan: { title: "Approuver le pr\xEAt", button: "Approuver {{amount}}", done: "Approuv\xE9" },
      rejectLoan: { title: "Refuser le pr\xEAt", button: "Refuser", done: "Refus\xE9" },
      placeBid: { title: "Miser pour le tour {{round}}", button: "Miser {{amount}}", done: "Mis\xE9" },
      raiseBid: { title: "Augmenter ta mise", button: "Miser {{amount}}", done: "Mis\xE9" },
      voteYes: { title: "Voter oui", button: "Voter oui", done: "Vot\xE9" },
      voteNo: { title: "Voter non", button: "Voter non", done: "Vot\xE9" },
      propose: { title: "Proposer\xA0: {{title}}", button: "Proposer", done: "Propos\xE9" },
      requestSolidarity: {
        title: "Demander un soutien",
        button: "Demander {{amount}}",
        done: "Demand\xE9"
      },
      requestEarlyExit: {
        title: "Demander \xE0 partir maintenant",
        button: "Demander",
        done: "Demand\xE9"
      },
      announceLeave: {
        title: "Quitter \xE0 la fin du cycle",
        button: "Annoncer mon d\xE9part",
        done: "Annonc\xE9"
      },
      addAgendaItem: {
        title: "Ajouter un point \xE0 l\u2019ordre du jour",
        button: "Ajouter",
        done: "Ajout\xE9"
      },
      checkIn: {
        title: "Signaler ta pr\xE9sence",
        button: "Je suis l\xE0",
        done: "Pr\xE9sence enregistr\xE9e"
      },
      sendExcuse: { title: "Envoyer une excuse", button: "Envoyer", done: "Envoy\xE9" },
      postToGroup: { title: "Publier dans le groupe", button: "Publier", done: "Publi\xE9" },
      scheduleMeeting: { title: "Planifier une r\xE9union", button: "Planifier", done: "Planifi\xE9" },
      markAttendance: {
        title: "Enregistrer une pr\xE9sence",
        button: "Enregistrer",
        done: "Enregistr\xE9"
      },
      publishMinutes: { title: "Publier le proc\xE8s-verbal", button: "Publier", done: "Publi\xE9" },
      postAnnouncement: { title: "Publier une annonce", button: "Publier", done: "Publi\xE9" },
      createInvite: { title: "Cr\xE9er une invitation", button: "Cr\xE9er le lien", done: "Cr\xE9\xE9" },
      startCycle: { title: "D\xE9marrer le cycle {{cycle}}", button: "D\xE9marrer", done: "D\xE9marr\xE9" },
      hideMessage: { title: "Masquer ce message", button: "Masquer", done: "Masqu\xE9" },
      changePaymentNumber: {
        title: "Changer ton num\xE9ro de paiement",
        button: "Changer le num\xE9ro",
        done: "Chang\xE9"
      },
      deleteAccount: {
        title: "Supprimer ton compte",
        button: "Supprimer mon compte",
        done: "Supprim\xE9"
      }
    }
  },
  pinSheet: {
    title: "Confirme avec ton code PIN",
    subtitle: "{{action}}",
    digitsA11y: "{{count}} chiffres saisis sur 6",
    key: "{{digit}}",
    delete: "Effacer",
    wrong_one: "Code PIN incorrect. Il te reste {{count}} essai.",
    wrong_other: "Code PIN incorrect. Il te reste {{count}} essais.",
    locked: "Trop d\u2019essais. R\xE9essaie \xE0 {{time}}.",
    forgot: "Code PIN oubli\xE9\xA0?",
    keyboardHint: "Tu peux aussi taper ton code au clavier.",
    checking: "V\xE9rification\u2026"
  },
  infoCards: {
    paymentNumber: {
      title: "Ton num\xE9ro de paiement",
      since: "Actif depuis le {{date}}",
      hold: "Retraits vers ce num\xE9ro possibles \xE0 partir du {{date}}.",
      onlyYou: "Ce num\xE9ro n\u2019appara\xEEt en entier que pour toi.",
      change: "Changer",
      copy: "Copier"
    },
    statement: {
      title: "Relev\xE9\xA0: {{period}}",
      meta: "PDF, {{size}}",
      code: "Code de v\xE9rification\xA0: {{code}}",
      open: "Ouvrir",
      share: "Partager",
      preparing: "Pr\xE9paration du relev\xE9\u2026"
    },
    ledgerExport: {
      title: "Registre complet\xA0: {{group}}",
      metaCsv_one: "Tableur CSV, {{count}} op\xE9ration",
      metaCsv_other: "Tableur CSV, {{count}} op\xE9rations",
      metaJson_one: "Donn\xE9es JSON, {{count}} op\xE9ration",
      metaJson_other: "Donn\xE9es JSON, {{count}} op\xE9rations",
      masked: "Les num\xE9ros de t\xE9l\xE9phone sont masqu\xE9s.",
      download: "T\xE9l\xE9charger",
      share: "Partager"
    },
    inviteLink: {
      title: "Invitation pour {{name}}",
      validity: "Valable 72\xA0h, jusqu\u2019au {{date}}. Une seule utilisation, li\xE9e \xE0 son num\xE9ro.",
      shareWhatsApp: "Envoyer par WhatsApp",
      copyLink: "Copier le lien",
      share: "Partager"
    },
    pinResetLink: {
      title: "Lien pour {{name}}",
      validity: "Valable 30 minutes, une seule fois."
    }
  },
  // Groupe tab: chat (spec 1.5, 4.9)
  chat: {
    composer: {
      placeholder: "\xC9cris un message\u2026",
      attach: "Joindre un fichier",
      send: "Envoyer",
      voice: "Maintiens pour enregistrer une note vocale",
      voiceTap: "Enregistrer une note vocale",
      mention: "Mentionner un membre"
    },
    attachMenu: {
      title: "Joindre",
      photo: "Photo de la galerie",
      camera: "Prendre une photo",
      video: "Vid\xE9o",
      document: "Document PDF"
    },
    voice: {
      recording: "Enregistrement {{duration}}",
      slideToCancel: "Glisse \xE0 gauche pour annuler",
      releaseToSend: "Rel\xE2che pour envoyer",
      stopAndSend: "Arr\xEAter et envoyer",
      cancel: "Annuler l\u2019enregistrement",
      tooShort: "Note trop courte. Maintiens le bouton pendant que tu parles.",
      maxReached: "3 minutes atteintes. La note est pr\xEAte \xE0 envoyer.",
      play: "Lire la note vocale",
      pause: "Mettre en pause",
      speed: "Vitesse {{speed}}",
      speeds: {
        x1: "1\xD7",
        x15: "1,5\xD7",
        x2: "2\xD7"
      },
      a11y: "Note vocale de {{name}}, {{duration}}",
      a11yOwn: "Ta note vocale, {{duration}}",
      position: "{{elapsed}} sur {{duration}}"
    },
    media: {
      photo: "Photo",
      video: "Vid\xE9o",
      document: "Document",
      tapToDownload: "Touche pour t\xE9l\xE9charger, {{size}}",
      downloading: "T\xE9l\xE9chargement\u2026",
      wifiOnly: "T\xE9l\xE9chargement automatique sur Wi-Fi uniquement",
      photoA11y: "Photo envoy\xE9e par {{name}}",
      videoA11y: "Vid\xE9o de {{name}}, {{duration}}",
      documentA11y: "Document {{file}}, {{size}}",
      open: "Ouvrir",
      sendCaption: "Ajouter une l\xE9gende"
    },
    message: {
      deleted: "Message supprim\xE9",
      deletedOwn: "Tu as supprim\xE9 ce message",
      hidden: "Message masqu\xE9 par l\u2019admin",
      queued: "En attente de connexion",
      failed: "Non envoy\xE9. Touche pour r\xE9essayer.",
      replyTo: "R\xE9ponse \xE0 {{name}}",
      replyToYou: "R\xE9ponse \xE0 toi",
      cancelReply: "Annuler la r\xE9ponse",
      delete: "Supprimer pour tout le monde",
      deleteConfirm: "Supprimer ce message pour tout le monde\xA0? Son fichier sera aussi supprim\xE9.",
      hide: "Masquer (admin)",
      hideReason: "Motif, visible dans le journal de l\u2019admin",
      copyText: "Copier le texte",
      mentionYou: "{{name}} parle de toi",
      a11y: "{{name}}, {{time}}\xA0: {{text}}",
      a11yOwn: "Toi, {{time}}\xA0: {{text}}"
    },
    newMessages_one: "{{count}} nouveau message",
    newMessages_other: "{{count}} nouveaux messages",
    jumpToLatest: "Aller aux derniers messages",
    typing: "{{name}} \xE9crit\u2026",
    typingMany: "Plusieurs membres \xE9crivent\u2026",
    summarize: {
      banner_one: "{{count}} message non lu",
      banner_other: "{{count}} messages non lus",
      action: "R\xE9sumer",
      a11y: "Demander \xE0 Njangi de r\xE9sumer les messages non lus"
    },
    pinned: {
      label: "Annonce \xE9pingl\xE9e",
      by: "Par {{name}}, le {{date}}",
      showAll: "Voir les annonces"
    },
    empty: "Aucun message pour le moment. Dis bonjour au groupe, ou pose une question \xE0 @njangi.",
    leftReadOnly: "Tu as quitt\xE9 ce groupe. Le fil n\u2019est plus disponible.",
    pendingActivationNote: "Tu peux lire et \xE9crire. Tes cotisations commencent au prochain cycle.",
    system: {
      paymentReceived: "{{name}} a pay\xE9 la cotisation du tour {{round}}.",
      paymentReceivedLate: "{{name}} a pay\xE9 la cotisation du tour {{round}}, en retard.",
      roundOpened: "Tour {{round}} ouvert. B\xE9n\xE9ficiaire\xA0: {{name}}. Paiement avant {{date}}.",
      roundComplete: "Tour {{round}}\xA0: tout le monde a pay\xE9.",
      payoutOpen: "Tour {{round}}\xA0: versement disponible pour {{name}}.",
      voteOpened: "Vote ouvert\xA0: {{title}}.",
      votePassed: "Vote adopt\xE9\xA0: {{title}}. {{yes}} oui, {{no}} non.",
      voteRejected: "Vote rejet\xE9\xA0: {{title}}. {{yes}} oui, {{no}} non.",
      voteExpired: "Vote clos sans atteindre le seuil\xA0: {{title}}.",
      ruleApplied: "Nouvelle r\xE8gle \xE0 partir du tour {{round}}\xA0: {{rule}}.",
      memberJoined: "{{name}} a rejoint le groupe.",
      memberActive: "{{name}} devient membre actif au cycle {{cycle}}.",
      memberLeaving: "{{name}} quittera le groupe \xE0 la fin du cycle.",
      memberLeft: "{{name}} a quitt\xE9 le groupe.",
      memberRemoved: "{{name}} ne fait plus partie du groupe, apr\xE8s un vote.",
      adminChanged: "{{name}} est maintenant l\u2019admin du groupe.",
      numberUpdated: "{{name}} a mis \xE0 jour son num\xE9ro de paiement.",
      pinReset: "{{name}} a r\xE9initialis\xE9 son code PIN. Ses retraits attendent {{hours}}\xA0h.",
      cycleStarted: "Cycle {{cycle}} d\xE9marr\xE9. Ordre tir\xE9 au sort, v\xE9rifiable dans le registre.",
      cycleClosed: "Cycle {{cycle}} termin\xE9.",
      fundDistributed: "Caisse g\xE9n\xE9rale partag\xE9e\xA0: {{amount}} par membre \xE9ligible.",
      solidarityRequested: "Demande de soutien pour {{name}} ({{event}}). Vote ouvert.",
      solidarityPaid: "Soutien de {{amount}} vers\xE9 \xE0 {{name}}.",
      meetingScheduled: "R\xE9union pr\xE9vue {{date}}, {{place}}.",
      agendaReady: "Ordre du jour pr\xEAt pour la r\xE9union {{date}}.",
      minutesPublished: "Proc\xE8s-verbal publi\xE9\xA0: r\xE9union du {{date}}.",
      minutesCorrected: "Proc\xE8s-verbal corrig\xE9, version {{version}}\xA0: r\xE9union du {{date}}.",
      announcement: "Nouvelle annonce \xE9pingl\xE9e par l\u2019admin.",
      withdrawalsPaused: "Retraits en pause\xA0: la v\xE9rification du jour a trouv\xE9 un \xE9cart. Les paiements restent possibles.",
      withdrawalsResumed: "Retraits r\xE9tablis\xA0: la v\xE9rification est conforme.",
      biddingClosed: "Ench\xE8res du tour {{round}} closes. B\xE9n\xE9ficiaire\xA0: {{name}}."
    }
  },
  // Caisse tab: ring, round, funds, records, members (spec 1.2, 1.4, R5, R14)
  caisse: {
    segments: {
      tour: "Tour",
      fund: "Caisse",
      solidarity: "Secours",
      ledger: "Registre"
    },
    segmentsA11y: "Sections de la caisse",
    tour: {
      beneficiary: "{{name}} re\xE7oit {{date}}",
      beneficiaryYou: "Tu re\xE7ois {{date}}",
      payoutOpen: "Versement disponible pour {{name}} depuis {{date}}",
      payoutOpenYou: "Ton versement est disponible",
      deadline: "Paiement avant {{date}}",
      deadlinePassed: "D\xE9lai pass\xE9 depuis {{date}}",
      paidSection: "Pay\xE9 ({{count}})",
      unpaidSection: "\xC0 payer ({{count}})",
      late: "en retard",
      pending: "en attente",
      onTime: "\xE0 temps",
      payButton: "Payer {{amount}}",
      youPaid: "Tu as pay\xE9 le {{date}}",
      breakdown: "D\xE9tail du versement",
      biddingNote: "Mode ench\xE8res\xA0: le b\xE9n\xE9ficiaire est connu \xE0 la cl\xF4ture, {{date}}.",
      biddingOpen: "Voir les ench\xE8res",
      noCycle: "Le cycle n\u2019a pas encore commenc\xE9.",
      noCycleAdmin: "Le cycle n\u2019a pas encore commenc\xE9. Invite au moins 3 membres, puis d\xE9marre-le.",
      allPaid: "Tout le monde a pay\xE9 ce tour.",
      nobodyPaid: "Personne n\u2019a encore pay\xE9 ce tour.",
      previousRounds: "Tours pr\xE9c\xE9dents",
      roundPicker: "Choisir un tour"
    },
    breakdown: {
      title: "D\xE9tail du tour {{round}}",
      gross: "Cotisations re\xE7ues",
      fees: "Frais Mobile Money",
      deductions: "Retenues automatiques",
      deductionFine: "Amende, tour {{round}}",
      deductionInstallment: "Remboursement de pr\xEAt, {{n}} sur {{total}}",
      deductionBid: "Ench\xE8re gagn\xE9e",
      net: "Net pour {{name}}",
      netYou: "Net pour toi",
      withdrawn: "D\xE9j\xE0 retir\xE9",
      remaining: "Reste \xE0 retirer",
      locked: "Bloqu\xE9 jusqu\u2019au {{date}}",
      pendingContributions_one: "{{count}} cotisation pas encore re\xE7ue\xA0: {{amount}}",
      pendingContributions_other: "{{count}} cotisations pas encore re\xE7ues\xA0: {{amount}}",
      feeNote: "Les frais sont pay\xE9s par celui qui re\xE7oit l\u2019argent.",
      autoSettlementNote: "\xC0 l\u2019ouverture du versement, les dettes \xE9chues sont r\xE9gl\xE9es d\u2019abord, les plus anciennes en premier.",
      lateNote: "Une cotisation pay\xE9e apr\xE8s le versement va quand m\xEAme au b\xE9n\xE9ficiaire de ce tour."
    },
    fund: {
      title: "Caisse g\xE9n\xE9rale",
      balance: "Solde",
      availableForLoans: "Disponible pour les pr\xEAts",
      reserved: "R\xE9serv\xE9 aux membres",
      reservedHelp: "Argent qui appartient \xE0 des membres ou \xE0 la caisse de secours. Il n\u2019est jamais pr\xEAt\xE9.",
      sources: "Aliment\xE9e par les amendes, les int\xE9r\xEAts des pr\xEAts et les ench\xE8res.",
      distribution: "Partag\xE9e \xE0 la fin du cycle entre les membres \xE9ligibles.",
      noDistribution: "Pas de partage en fin de cycle\xA0: la caisse continue au cycle suivant.",
      loansInProgress: "Pr\xEAts en cours",
      requestLoan: "Demander un pr\xEAt",
      yourLimit: "Ton plafond\xA0: {{amount}}",
      emptyLoans: "Aucun pr\xEAt en cours.",
      emptyLoansCta: "Tu peux emprunter jusqu\u2019\xE0 {{amount}}.",
      loansToDecide_one: "{{count}} demande \xE0 d\xE9cider",
      loansToDecide_other: "{{count}} demandes \xE0 d\xE9cider"
    },
    solidarity: {
      title: "Caisse de secours",
      balance: "Solde",
      perRound: "{{amount}} par membre et par tour",
      requests: "Demandes",
      request: "Demander un soutien",
      empty: "Aucune demande. La caisse de secours aide un membre lors d\u2019un deuil, d\u2019une naissance, d\u2019une maladie ou d\u2019un mariage.",
      off: "La caisse de secours est d\xE9sactiv\xE9e. Propose un changement de r\xE8gle pour l\u2019activer.",
      carriesOver: "Elle n\u2019est pas partag\xE9e en fin de cycle\xA0: elle continue.",
      requestRow: "{{name}}, {{event}}",
      statuses: {
        OPEN: "Vote en cours",
        PASSED: "Accept\xE9, envoi en cours",
        PAID: "Vers\xE9",
        REJECTED: "Refus\xE9",
        EXPIRED: "Expir\xE9",
        FAILED: "Envoi \xE9chou\xE9"
      },
      events: {
        DEUIL: "Deuil",
        NAISSANCE: "Naissance",
        MALADIE: "Maladie",
        MARIAGE: "Mariage",
        AUTRE: "Autre"
      }
    },
    ledger: {
      title: "Registre",
      intro: "Chaque franc du groupe, dans l\u2019ordre. Rien ne peut \xEAtre modifi\xE9 ni effac\xE9.",
      filters: {
        all: "Tout",
        payments: "Paiements",
        payouts: "Versements et retraits",
        loans: "Pr\xEAts",
        fines: "Amendes",
        solidarity: "Secours",
        decisions: "D\xE9cisions",
        member: "Membre",
        period: "P\xE9riode",
        allMembers: "Tous les membres"
      },
      export: "Exporter",
      exportTitle: "Exporter le registre",
      exportCsv: "Tableur (CSV)",
      exportJson: "Donn\xE9es (JSON)",
      exportHelp: "Toutes les op\xE9rations, \xE9critures et empreintes. Les num\xE9ros sont masqu\xE9s.",
      empty: "Aucune op\xE9ration pour ces filtres. Retire un filtre pour tout voir.",
      emptyAll: "Le registre est vide. La premi\xE8re op\xE9ration appara\xEEtra au premier paiement.",
      rowA11y: "{{date}}, {{description}}, {{amount}}, r\xE9f\xE9rence {{ref}}",
      loadMore: "Op\xE9rations plus anciennes",
      shortRef: "n\xB0\xA0{{seq}}",
      types: {
        PAYMENT_RECEIVED: "Paiement re\xE7u",
        FINE_ASSESSED: "Amende",
        BID_ASSESSED: "Ench\xE8re gagn\xE9e",
        AUTO_SETTLEMENT: "Retenue automatique",
        WITHDRAWAL_COMPLETED: "Retrait",
        LOAN_DISBURSED: "Pr\xEAt vers\xE9",
        SOLIDARITY_DISBURSED: "Soutien vers\xE9",
        LEAVER_REFUND: "Remboursement de d\xE9part",
        FUND_DISTRIBUTION: "Partage de la caisse",
        REVERSAL: "Annulation",
        EVENT: "D\xE9cision"
      }
    },
    entry: {
      title: "Op\xE9ration n\xB0\xA0{{seq}}",
      date: "Date",
      type: "Type",
      description: "Description",
      amount: "Montant",
      member: "Membre",
      round: "Tour",
      operatorRef: "R\xE9f\xE9rence op\xE9rateur",
      feeSource: "Origine des frais",
      feeSources: {
        PROVIDER: "Annonc\xE9s par l\u2019op\xE9rateur",
        SCHEDULE: "Bar\xE8me configur\xE9"
      },
      postings: "\xC9critures",
      postingsHelp: "Chaque op\xE9ration s\u2019\xE9quilibre\xA0: la somme des \xE9critures fait z\xE9ro.",
      postingsSum: "Somme des \xE9critures\xA0: 0",
      accounts: {
        cash: "Argent chez l\u2019op\xE9rateur",
        payable: "D\xFB \xE0 {{name}}",
        receivable: "Dette de {{name}}",
        fundGeneral: "Caisse g\xE9n\xE9rale",
        fundSolidarity: "Caisse de secours"
      },
      hash: "Empreinte",
      prevHash: "Empreinte pr\xE9c\xE9dente",
      hashHelp: "Chaque op\xE9ration est li\xE9e \xE0 la pr\xE9c\xE9dente par son empreinte. Une modification casserait la cha\xEEne et serait d\xE9tect\xE9e.",
      copyHash: "Copier l\u2019empreinte",
      related: {
        title: "Li\xE9 \xE0",
        payment: "Voir le paiement",
        proposal: "Voir le vote",
        loan: "Voir le pr\xEAt",
        meeting: "Voir la r\xE9union",
        reversedBy: "Annul\xE9e par l\u2019op\xE9ration n\xB0\xA0{{seq}}",
        reverses: "Annule l\u2019op\xE9ration n\xB0\xA0{{seq}}"
      },
      eventNoPostings: "D\xE9cision enregistr\xE9e sans mouvement d\u2019argent.",
      drawSeed: "Graine du tirage"
    },
    dailyCheck: {
      ok: "V\xE9rification du jour\xA0: conforme, {{time}}. Registre intact.",
      warning: "V\xE9rification du jour\xA0: petit \xE9cart en cours de contr\xF4le, {{time}}. Les retraits restent possibles.",
      alert: "V\xE9rification du jour\xA0: \xE9cart d\xE9tect\xE9, {{time}}. Retraits en pause.",
      notYet: "V\xE9rification du jour\xA0: pr\xE9vue \xE0 06:00.",
      stale: "V\xE9rification du jour\xA0: pas encore faite. Derni\xE8re\xA0: {{date}}.",
      a11yOk: "V\xE9rification du jour conforme \xE0 {{time}}. Registre intact.",
      details: "Voir le d\xE9tail",
      sheet: {
        title: "V\xE9rification du jour",
        ranAt: "Faite le {{date}}",
        providerBalance: "Solde chez l\u2019op\xE9rateur",
        ledgerCash: "Argent selon le registre",
        inFlight: "Op\xE9rations en cours",
        difference: "\xC9cart",
        chain: "Cha\xEEne du registre",
        chainOk: "Intacte",
        chainBroken: "Interrompue \xE0 l\u2019op\xE9ration n\xB0\xA0{{seq}}",
        invariants: "R\xE8gles de la caisse",
        invariantsOk: "Toutes respect\xE9es",
        okBody: "Le registre correspond exactement \xE0 l\u2019argent d\xE9tenu chez l\u2019op\xE9rateur.",
        alertWhat: "Ce qui se passe",
        alertBody: "Le registre ne correspond pas \xE0 l\u2019argent d\xE9tenu chez l\u2019op\xE9rateur. Par s\xE9curit\xE9, tous les retraits du groupe sont en pause jusqu\u2019\xE0 la correction.",
        alertPayments: "Tes paiements restent possibles et sont enregistr\xE9s normalement.",
        alertNext: "L\u2019\xE9quipe NjangiTrust est pr\xE9venue. Tu recevras une notification \xE0 la reprise des retraits.",
        warningBody: "Un petit \xE9cart vient souvent d\u2019une op\xE9ration encore en cours chez l\u2019op\xE9rateur. Il est rev\xE9rifi\xE9 automatiquement."
      }
    }
  },
  ring: {
    a11y: {
      summary: "Tour {{round}} sur {{total}}. B\xE9n\xE9ficiaire\xA0: {{name}}. {{collected}} collect\xE9s sur {{target}}.",
      paidCount_one: "{{count}} membre a pay\xE9.",
      paidCount_other: "{{count}} membres ont pay\xE9.",
      unpaidCount_one: "{{count}} n\u2019a pas encore pay\xE9.",
      unpaidCount_other: "{{count}} n\u2019ont pas encore pay\xE9.",
      lateCount_one: "Dont {{count}} en retard.",
      lateCount_other: "Dont {{count}} en retard.",
      complete: "Tour complet\xA0: tout le monde a pay\xE9.",
      hint: "Touche deux fois pour voir la liste des membres.",
      keyboardHint: "Fl\xE8ches pour passer d\u2019un membre \xE0 l\u2019autre, Entr\xE9e pour ouvrir son profil.",
      dot: "{{name}}, {{status}}",
      contributionLanded: "{{name}} a pay\xE9.",
      roundCompleted: "Tour complet."
    },
    dotStatus: {
      paid: "a pay\xE9",
      unpaid: "n\u2019a pas encore pay\xE9",
      late: "en retard",
      pending: "paiement en attente",
      beneficiary: "b\xE9n\xE9ficiaire du tour",
      served: "a d\xE9j\xE0 re\xE7u son tour"
    },
    center: {
      of: "sur {{target}}",
      complete: "Tour complet",
      notStarted: "Pas encore commenc\xE9"
    },
    legend: {
      paid: "A pay\xE9",
      unpaid: "Pas encore pay\xE9",
      late: "En retard",
      beneficiary: "B\xE9n\xE9ficiaire",
      served: "A d\xE9j\xE0 re\xE7u"
    }
  },
  memberProfile: {
    a11y: "Profil de {{name}}",
    thisRound: "Ce tour",
    roundStatus: {
      paid: "A pay\xE9, {{date}}",
      paidLate: "A pay\xE9 en retard, {{date}}",
      unpaid: "N\u2019a pas encore pay\xE9",
      late: "En retard",
      pending: "Paiement en attente",
      beneficiary: "B\xE9n\xE9ficiaire de ce tour",
      notActive: "Pas de cotisation ce cycle"
    },
    turn: "Son tour",
    turnValue: "Tour {{round}}, {{date}}",
    servedValue: "A re\xE7u au tour {{round}}",
    biddingTurn: "Mode ench\xE8res\xA0: pas encore servi dans ce cycle",
    reliability: "Fiabilit\xE9",
    memberSince: "Membre depuis {{date}}",
    left: "A quitt\xE9 le groupe le {{date}}",
    previous: "Membre pr\xE9c\xE9dent",
    next: "Membre suivant",
    positionA11y: "{{position}} sur {{total}} dans l\u2019ordre des tours"
  },
  reliability: {
    value: "{{onTime}} sur {{due}} \xE0 temps",
    score: "{{score}}\xA0%",
    a11y: "Fiabilit\xE9 {{score}} pour cent\xA0: {{onTime}} \xE9ch\xE9ances sur {{due}} pay\xE9es \xE0 temps",
    newMember: "Nouveau membre",
    newMemberHelp: "Moins de 3 \xE9ch\xE9ances pass\xE9es\xA0: pas encore de score.",
    formula: {
      title: "Comment la fiabilit\xE9 est calcul\xE9e",
      body: "On regarde les {{window}} derni\xE8res \xE9ch\xE9ances pass\xE9es dans ce groupe\xA0: chaque cotisation (avec sa caisse de secours) et chaque remboursement de pr\xEAt.",
      equation: "Fiabilit\xE9 = \xE9ch\xE9ances pay\xE9es \xE0 temps \xF7 \xE9ch\xE9ances dues \xD7 100, arrondi.",
      onTimeRule: "Un paiement compte \xE0 temps s\u2019il a \xE9t\xE9 lanc\xE9 avant la date limite, m\xEAme si l\u2019op\xE9rateur confirme apr\xE8s.",
      privacy: "Le score ne sert que dans ce groupe. Il n\u2019est jamais partag\xE9 ailleurs.",
      example: "Exemple\xA0: {{onTime}} sur {{due}} \xE0 temps = {{score}}\xA0%."
    }
  },
  members: {
    title: "Membres",
    count_one: "{{count}} membre",
    count_other: "{{count}} membres",
    search: "Chercher un membre",
    rotationOrder: "Dans l\u2019ordre des tours",
    position: "Tour {{round}}",
    leaving: "Part \xE0 la fin du cycle",
    empty: "Aucun membre ne correspond.",
    noPhones: "Les num\xE9ros des membres ne sont jamais affich\xE9s."
  },
  withdraw: {
    title: "Ton versement du tour {{round}}",
    titleGeneric: "Retirer ton argent",
    available: "Disponible",
    availableA11y: "Disponible\xA0: {{words}}",
    breakdown: "Comment ce montant est calcul\xE9",
    amountLabel: "Montant \xE0 retirer",
    all: "Tout retirer",
    fee: "Frais estim\xE9s",
    youReceive: "Tu re\xE7ois",
    fromBalance: "Pris sur ton solde",
    to: "Sur ton num\xE9ro {{operator}} {{number}}",
    min: "Le minimum est de 100 FCFA.",
    max: "Tu peux retirer au plus {{amount}}.",
    partialNote: "Tu peux retirer en plusieurs fois. Ce que tu laisses reste r\xE9serv\xE9 pour toi.",
    prepare: "Continuer",
    hold: "Retraits en attente jusqu\u2019au {{date}}, apr\xE8s ton changement de num\xE9ro.",
    paused: "Retraits en pause pour tout le groupe\xA0: la v\xE9rification du jour a trouv\xE9 un \xE9cart.",
    inProgress: "Un retrait est d\xE9j\xE0 en cours. Attends sa fin pour en lancer un autre.",
    nothing: "Rien \xE0 retirer pour le moment.",
    nothingTurn: "Ton tour\xA0: tour {{round}}, {{date}}.",
    locked: "Ton versement sera disponible {{date}}."
  },
  solidarityRequest: {
    title: "Demander un soutien",
    recipient: "Pour qui\xA0?",
    me: "Pour moi",
    other: "Pour un autre membre",
    member: "Membre",
    event: "\xC9v\xE9nement",
    amount: "Montant",
    max: "Au plus {{amount}}, le solde de la caisse de secours.",
    note: "Note",
    notePlaceholder: "Quelques mots pour le groupe",
    noteHelp: "Visible par les membres du groupe.",
    vote: "La demande passe par un vote \xE0 la majorit\xE9, ouvert {{duration}}.",
    prepare: "Pr\xE9parer la demande",
    fundEmpty: "La caisse de secours est vide pour le moment."
  },
  // Votes tab and proposals (spec 1.4, R11)
  votes: {
    title: "Votes",
    open: "Ouverts",
    closed: "Clos",
    propose: "Proposer",
    emptyOpen: "Aucun vote ouvert. Propose un changement de r\xE8gle ou un nouveau membre.",
    emptyClosed: "Aucun vote clos pour le moment.",
    beforeCycleTitle: "Les votes commencent avec le premier cycle",
    beforeCycleBodyAdmin: "Avant le premier cycle, tu r\xE8gles le groupe directement\xA0: invite les membres fondateurs, puis d\xE9marre le cycle. Ensuite, chaque changement passe par un vote.",
    beforeCycleBodyMember: "Avant le premier cycle, l\u2019admin r\xE8gle le groupe directement. D\xE8s que le cycle d\xE9marre, chaque changement passe par un vote.",
    card: {
      proposer: "Propos\xE9 par {{name}}",
      proposerYou: "Propos\xE9 par toi",
      timeLeft: "Cl\xF4ture dans {{duration}}",
      progress: "{{yes}} oui sur {{needed}} requis",
      noCount: "{{count}} non",
      secretBadge: "Vote secret",
      participation: "{{voted}} membres sur {{eligible}} ont vot\xE9",
      participationNote: "Les totaux s\u2019affichent \xE0 la cl\xF4ture.",
      yes: "Oui",
      no: "Non",
      yourVote: {
        notVoted: "Tu n\u2019as pas encore vot\xE9",
        yes: "Tu as vot\xE9 oui",
        no: "Tu as vot\xE9 non",
        secret: "Tu as vot\xE9. Ton choix reste secret.",
        notEligible: "Tu ne votes pas sur cette proposition",
        excludedTarget: "Cette proposition te concerne\xA0: tu ne votes pas.",
        excludedProposer: "Tu as fait cette demande\xA0: tu ne votes pas.",
        excludedAdmin: "Pr\xEAt de l\u2019admin\xA0: l\u2019admin ne vote pas.",
        joinedAfter: "Tu n\u2019\xE9tais pas membre actif \xE0 l\u2019ouverture du vote."
      },
      result: {
        PASSED: "Adopt\xE9",
        REJECTED: "Rejet\xE9",
        EXPIRED: "Expir\xE9"
      },
      tally: "{{yes}} oui, {{no}} non, {{none}} sans vote",
      effect: {
        round: "Appliqu\xE9 au tour {{round}}",
        cycle: "Appliqu\xE9 au cycle {{cycle}}",
        immediate: "Appliqu\xE9 le {{date}}",
        pending: "S\u2019appliquera au tour {{round}}",
        pendingCycle: "S\u2019appliquera au cycle {{cycle}}",
        inviteCreated: "Invitation cr\xE9\xE9e",
        none: "Aucun changement"
      },
      a11yProgress: "{{yes}} oui sur {{needed}} n\xE9cessaires, {{eligible}} votants"
    },
    threshold: {
      majority: "Majorit\xE9\xA0: {{needed}} oui sur {{eligible}}",
      twoThirds: "Deux tiers\xA0: {{needed}} oui sur {{eligible}}",
      rotation: "Majorit\xE9, et chaque membre d\xE9plac\xE9 doit voter oui",
      closesEarly: "Le vote se termine d\xE8s que le seuil est atteint, ou ne peut plus l\u2019\xEAtre.",
      countsEligible: "Le seuil compte tous les votants, pas seulement ceux qui ont vot\xE9."
    },
    detail: {
      reason: "Motif",
      details: "D\xE9tails",
      eligible_one: "{{count}} votant",
      eligible_other: "{{count}} votants",
      excluded: "{{name}} ne vote pas sur cette proposition",
      closesAt: "Cl\xF4ture {{date}}",
      openedAt: "Ouvert {{date}}",
      votesList: "Votes",
      notYetVoted: "Pas encore vot\xE9",
      secretExplain: "Vote secret\xA0: les choix ne sont li\xE9s \xE0 personne, m\xEAme dans la base de donn\xE9es. Seule la participation s\u2019affiche jusqu\u2019\xE0 la cl\xF4ture.",
      ledgerLink: "Voir la d\xE9cision dans le registre"
    },
    types: {
      RULE_CHANGE: "Changement de r\xE8gle",
      MEMBER_ADD: "Nouveau membre",
      MEMBER_REMOVE: "Exclusion d\u2019un membre",
      ROTATION_CHANGE: "Changement d\u2019ordre",
      ADMIN_CHANGE: "Changement d\u2019admin",
      EARLY_EXIT: "D\xE9part en cours de cycle",
      ADMIN_LOAN: "Pr\xEAt de l\u2019admin",
      SOLIDARITY_PAYOUT: "Soutien de la caisse de secours",
      FINE_WAIVER: "Annulation d\u2019amende",
      LEDGER_CORRECTION: "Correction du registre"
    },
    titles: {
      ruleChange: "{{rule}}\xA0: {{from}} \u2192 {{to}}",
      memberAdd: "Ajouter {{name}}",
      memberRemove: "Exclure {{name}}",
      rotationSwap: "\xC9changer les tours\xA0: {{a}} et {{b}}",
      adminChange: "{{name}} comme admin",
      earlyExit: "D\xE9part de {{name}} en cours de cycle",
      adminLoan: "Pr\xEAt de {{amount}} pour l\u2019admin, {{name}}",
      solidarity: "Soutien de {{amount}} pour {{name}}, {{event}}",
      fineWaiver: "Annuler l\u2019amende du tour {{round}} pour {{name}}",
      ledgerCorrection: "Corriger l\u2019op\xE9ration n\xB0\xA0{{seq}}"
    }
  },
  newProposal: {
    title: "Nouvelle proposition",
    chooseType: "Que veux-tu proposer\xA0?",
    typeHelp: {
      RULE_CHANGE: "Changer une r\xE8gle\xA0: montant, amende, dur\xE9e des votes\u2026",
      MEMBER_ADD: "Faire entrer une nouvelle personne au prochain cycle.",
      MEMBER_REMOVE: "Exclure un membre. Vote secret.",
      ROTATION_CHANGE: "\xC9changer les tours de deux membres.",
      ADMIN_CHANGE: "Choisir un nouvel admin. Vote secret.",
      EARLY_EXIT: "Quitter le groupe avant la fin du cycle.",
      FINE_WAIVER: "Annuler une amende.",
      LEDGER_CORRECTION: "Corriger une op\xE9ration du registre par une \xE9criture d\u2019annulation.",
      SOLIDARITY_PAYOUT: "Demander un soutien de la caisse de secours."
    },
    reason: "Motif",
    reasonPlaceholder: "Explique en une ou deux phrases pourquoi",
    reasonHelp: "Visible par tous les membres.",
    preview: "Il faudra {{needed}} oui sur {{eligible}} membres ({{kind}}).",
    previewKinds: {
      majority: "majorit\xE9",
      twoThirds: "deux tiers"
    },
    window: "Vote ouvert pendant {{duration}}.",
    prepare: "Pr\xE9parer la proposition",
    rule: {
      label: "R\xE8gle",
      current: "Valeur actuelle\xA0: {{value}}",
      newValue: "Nouvelle valeur",
      range: "Entre {{min}} et {{max}}.",
      outOfRange: "Valeur hors limites\xA0: entre {{min}} et {{max}}.",
      same: "C\u2019est d\xE9j\xE0 la valeur actuelle.",
      alreadyOpen: "Un vote est d\xE9j\xE0 ouvert sur cette r\xE8gle. Attends sa cl\xF4ture.",
      effectNextRound: "Appliqu\xE9 au tour suivant si le vote passe.",
      effectNextCycle: "Appliqu\xE9 au cycle suivant si le vote passe."
    },
    memberAdd: {
      name: "Nom de la personne",
      phone: "Son num\xE9ro de t\xE9l\xE9phone",
      phoneHelp: "Sert uniquement \xE0 cr\xE9er l\u2019invitation. Les membres ne le verront pas.",
      effect: "Si le vote passe, l\u2019admin cr\xE9e l\u2019invitation. La personne devient active au prochain cycle."
    },
    memberRemove: {
      member: "Membre concern\xE9",
      note: "Vote secret. La personne concern\xE9e ne vote pas. Le r\xE8glement suit la r\xE8gle de d\xE9part."
    },
    rotation: {
      first: "Premier membre",
      second: "Second membre",
      note: "Les deux membres doivent voter oui.",
      served: "{{name}} a d\xE9j\xE0 re\xE7u son tour dans ce cycle."
    },
    admin: {
      member: "Nouvel admin",
      note: "Vote secret. Prend effet d\xE8s l\u2019adoption."
    },
    fineWaiver: {
      fine: "Amende \xE0 annuler",
      note: "La personne concern\xE9e ne vote pas. Si le vote passe, une \xE9criture d\u2019annulation est ajout\xE9e au registre."
    },
    ledgerCorrection: {
      seq: "Op\xE9ration \xE0 corriger",
      correction: "Correction demand\xE9e",
      note: "Rien n\u2019est effac\xE9\xA0: une annulation et une \xE9criture corrig\xE9e sont ajout\xE9es au registre."
    },
    earlyExit: {
      note: "Tu ne votes pas. Si tu n\u2019as pas encore re\xE7u ton tour, tes cotisations du cycle te sont rembours\xE9es. Sinon, tes cotisations restantes restent dues.",
      cycleEndAlternative: "Tu peux aussi partir \xE0 la fin du cycle, sans vote."
    }
  },
  // Loans, bidding, meetings (R7, R8, R15)
  loans: {
    title: "Pr\xEAts",
    request: {
      title: "Demander un pr\xEAt",
      limit: "Ton plafond\xA0: {{amount}}",
      limitHelp: "{{factor}} fois tes cotisations pay\xE9es dans ce cycle, dans la limite de ce que la caisse peut pr\xEAter.",
      amount: "Montant",
      amountA11y: "Montant du pr\xEAt, {{words}}",
      months: "Dur\xE9e",
      monthsOption_one: "{{count}} mois",
      monthsOption_other: "{{count}} mois",
      breakdownTitle: "Ce que tu rembourseras",
      schedule: "\xC9ch\xE9ancier",
      scheduleRow: "Tour {{round}}, {{date}}",
      prepare: "Pr\xE9parer la demande",
      adminDecides: "L\u2019admin d\xE9cide sous 72\xA0h."
    },
    notEligible: {
      activeLoan: "Tu as d\xE9j\xE0 un pr\xEAt en cours. Rembourse-le avant d\u2019en demander un autre.",
      overdueDebt: "Tu as une dette en retard. R\xE8gle-la d\u2019abord.",
      leaving: "Tu quittes le groupe\xA0: tu ne peux plus emprunter.",
      zeroLimit: "Ton plafond est de 0 FCFA pour l\u2019instant. Il augmente avec chaque cotisation pay\xE9e dans le cycle.",
      fundEmpty: "La caisse g\xE9n\xE9rale n\u2019a rien de disponible \xE0 pr\xEAter pour le moment.",
      notActive: "Seuls les membres actifs peuvent emprunter."
    },
    mine: {
      title: "Mon pr\xEAt",
      none: "Aucun pr\xEAt en cours.",
      nextInstallment: "Prochain remboursement\xA0: {{amount}}, {{date}}",
      remaining: "Reste \xE0 rembourser",
      repayNow: "Rembourser maintenant",
      repayEarlyNote: "Rembourser plus t\xF4t est possible. Les int\xE9r\xEAts restent ceux fix\xE9s \xE0 l\u2019accord.",
      autoSettlementNote: "Quand tu re\xE7ois ton tour, les remboursements \xE9chus sont pris sur ton versement.",
      overdue: "Remboursement en retard depuis {{date}}",
      carriesOver: "Un pr\xEAt non rembours\xE9 \xE0 la fin du cycle reste d\xFB au cycle suivant, sans part du partage de la caisse.",
      paidRow: "Pay\xE9 le {{date}}",
      dueRow: "\xC0 payer {{date}}"
    },
    status: {
      REQUESTED: "En attente de d\xE9cision",
      APPROVED: "Approuv\xE9, envoi en cours",
      REJECTED: "Refus\xE9",
      DISBURSED: "En cours de remboursement",
      REPAID: "Rembours\xE9",
      OVERDUE: "En retard",
      EXPIRED: "Expir\xE9 sans d\xE9cision"
    },
    rejectedReason: "Motif de l\u2019admin\xA0: {{reason}}",
    queue: {
      title: "Pr\xEAts \xE0 d\xE9cider",
      empty: "Aucune demande de pr\xEAt en attente.",
      requestedAt: "Demand\xE9 {{date}}",
      expiresAt: "Sans d\xE9cision, la demande expire {{date}}.",
      reliability: "Fiabilit\xE9",
      debts: "Dettes",
      noDebts: "Aucune dette",
      contributionsPaid: "Cotisations pay\xE9es ce cycle",
      approve: "Approuver",
      reject: "Refuser",
      reasonLabel: "Motif",
      reasonHelp: "Visible par le membre.",
      reasonRequired: "Indique un motif pour refuser.",
      ownLoan: "Ta propre demande passe par un vote des membres. Tu ne peux pas la d\xE9cider."
    }
  },
  bidding: {
    title: "Ench\xE8res du tour {{round}}",
    explain: "Ench\xE8re secr\xE8te\xA0: personne ne voit les mises avant la cl\xF4ture. La plus haute gagne\xA0; \xE0 \xE9galit\xE9, la premi\xE8re arriv\xE9e.",
    closesAt: "Cl\xF4ture {{date}}",
    minBid: "Minimum {{amount}}",
    yourBid: "Ta mise\xA0: {{amount}}",
    yourBidAt: "Plac\xE9e {{date}}",
    noBid: "Tu n\u2019as pas encore mis\xE9.",
    bidsCount_one: "{{count}} ench\xE8re plac\xE9e",
    bidsCount_other: "{{count}} ench\xE8res plac\xE9es",
    amountLabel: "Ta mise",
    place: "Miser",
    raise: "Augmenter ma mise",
    mustBeHigher: "Ta nouvelle mise doit d\xE9passer {{amount}}.",
    belowMin: "La mise minimale est {{amount}}.",
    notEligible: "Tu as d\xE9j\xE0 re\xE7u ton tour dans ce cycle\xA0: tu ne mises pas.",
    lastRound: "Dernier tour\xA0: {{name}} est b\xE9n\xE9ficiaire sans ench\xE8re.",
    winnerDebt: "La mise gagnante est retenue sur le versement du gagnant et va \xE0 la caisse g\xE9n\xE9rale.",
    results: {
      title: "R\xE9sultats",
      winner: "{{name}} gagne avec {{amount}}",
      winnerYou: "Tu gagnes avec {{amount}}",
      draw: "Aucune ench\xE8re\xA0: b\xE9n\xE9ficiaire tir\xE9 au sort, {{name}}.",
      allBids: "Toutes les mises",
      bidRow: "{{name}}, {{time}}",
      tieNote: "\xC0 \xE9galit\xE9, la mise arriv\xE9e en premier gagne."
    }
  },
  meetings: {
    title: "R\xE9unions",
    next: "Prochaine r\xE9union",
    none: "Aucune r\xE9union pr\xE9vue.",
    noneAdmin: "Aucune r\xE9union pr\xE9vue. Planifie la prochaine.",
    schedule: "Planifier une r\xE9union",
    when: "{{date}}",
    place: "Lieu",
    agenda: {
      title: "Ordre du jour",
      pending: "L\u2019ordre du jour sera pr\xEAt 24\xA0h avant la r\xE9union.",
      auto: "Ajout\xE9 automatiquement",
      byMember: "Ajout\xE9 par {{name}}",
      add: "Ajouter un point",
      addPlaceholder: "Ce que tu veux aborder",
      autoItems: {
        round: "Tour {{round}}\xA0: b\xE9n\xE9ficiaire {{name}}, {{paid}} sur {{total}} ont pay\xE9",
        unpaid: "Cotisations non pay\xE9es\xA0: {{names}}",
        votes_one: "{{count}} vote ouvert",
        votes_other: "{{count}} votes ouverts",
        installments: "Remboursements de pr\xEAt \xE0 venir",
        solidarity: "Demandes de soutien en cours"
      }
    },
    checkIn: {
      button: "Je suis l\xE0",
      window: "Pointage ouvert de {{start}} \xE0 {{end}}.",
      notOpen: "Le pointage ouvre 1\xA0h avant la r\xE9union.",
      closed: "Le pointage est ferm\xE9.",
      done: "Pr\xE9sence enregistr\xE9e \xE0 {{time}}."
    },
    excuse: {
      button: "Envoyer une excuse",
      placeholder: "Motif de ton absence",
      sent: "Excuse envoy\xE9e le {{date}}.",
      tooLate: "Les excuses se font avant le d\xE9but de la r\xE9union."
    },
    attendance: {
      title: "Pr\xE9sences",
      present: "Pr\xE9sents ({{count}})",
      excused: "Excus\xE9s ({{count}})",
      absent: "Absents ({{count}})",
      unmarked: "Non renseign\xE9s ({{count}})",
      markPresent: "Pr\xE9sence",
      markAbsent: "Absence",
      fineNote: "Amende d\u2019absence\xA0: {{amount}}, pour les absences sans excuse.",
      rowStatus: {
        present: "Pr\xE9sence, {{time}}",
        excused: "Absence excus\xE9e",
        absent: "Absence",
        unmarked: "Non renseign\xE9"
      }
    },
    minutes: {
      title: "Proc\xE8s-verbal",
      draft: "Brouillon",
      generate: "Pr\xE9parer le brouillon avec Njangi",
      generating: "Njangi r\xE9dige le brouillon\u2026",
      notes: "Tes notes",
      notesPlaceholder: "D\xE9cisions, remarques, points \xE0 reprendre\u2026",
      edit: "Modifier le brouillon",
      publish: "Publier le proc\xE8s-verbal",
      publishNote: "Une fois publi\xE9, le proc\xE8s-verbal ne peut plus \xEAtre modifi\xE9. Une correction se publie comme une nouvelle version, avec un motif.",
      published: "Publi\xE9 le {{date}}",
      version: "Version {{version}}",
      correct: "Publier une correction",
      correctionReason: "Motif de la correction",
      notPublished: "Le proc\xE8s-verbal n\u2019est pas encore publi\xE9.",
      draftOnlyAdmin: "Seul l\u2019admin voit le brouillon.",
      sections: {
        dateAndPlace: "Date et lieu",
        present: "Pr\xE9sents",
        excused: "Excus\xE9s",
        absent: "Absents",
        items: "Points abord\xE9s",
        money: "Argent re\xE7u",
        votes: "R\xE9sultats des votes",
        nextMeeting: "Prochaine r\xE9union"
      }
    },
    form: {
      title: "Planifier une r\xE9union",
      date: "Date",
      time: "Heure",
      place: "Lieu ou lien",
      placePlaceholder: "Par exemple chez Carine, Bonamoussadi, ou un lien de visio"
    }
  },
  // Moi tab and settings (spec 1.4, R13, Part 7)
  moi: {
    title: "Moi",
    situation: "Ma situation dans {{group}}",
    toPay: "\xC0 payer",
    toPayValue: "{{amount}} avant {{date}}",
    upToDate: "\xC0 jour",
    available: "Disponible",
    availableAction: "Retirer",
    locked: "Bloqu\xE9 jusqu\u2019au {{date}}",
    holdUntil: "Retraits en attente jusqu\u2019au {{date}}",
    myTurn: "Mon tour",
    myTurnValue: "Tour {{round}}, {{date}}",
    myTurnServed: "Re\xE7u au tour {{round}}",
    myTurnBidding: "Mode ench\xE8res\xA0: mise pour obtenir un tour",
    debts: "Mes dettes",
    noDebts: "Aucune dette",
    loan: "Mon pr\xEAt",
    noLoan: "Aucun pr\xEAt",
    reliability: "Ma fiabilit\xE9",
    paymentNumber: "Num\xE9ro de paiement",
    paymentNumberChange: "Changer",
    statements: "Relev\xE9s",
    groups: "Mes groupes",
    settingsTitle: "R\xE9glages",
    language: "Langue",
    notifications: "Notifications",
    security: "S\xE9curit\xE9",
    privacy: "Confidentialit\xE9",
    agentHistory: "Historique de l\u2019assistant",
    logout: "Se d\xE9connecter",
    version: "Version {{version}}",
    allGroupsTotal: "Tous mes groupes\xA0: {{amount}} \xE0 payer ce mois"
  },
  paymentNumber: {
    title: "Changer de num\xE9ro de paiement",
    current: "Num\xE9ro actuel",
    newLabel: "Nouveau num\xE9ro",
    operator: "Op\xE9rateur",
    detected: "D\xE9tect\xE9\xA0: {{operator}}. Corrige si besoin.",
    holdWarning: "Par s\xE9curit\xE9, les retraits et les pr\xEAts vers ce nouveau num\xE9ro attendront {{hours}} heures. Tes paiements ne sont pas concern\xE9s.",
    allGroups: "Le changement s\u2019applique \xE0 tous tes groupes.",
    inProgress: "Les op\xE9rations d\xE9j\xE0 en cours gardent l\u2019ancien num\xE9ro.",
    notify: "Les admins et les membres de tes groupes seront pr\xE9venus, sans les chiffres.",
    same: "C\u2019est d\xE9j\xE0 ton num\xE9ro de paiement.",
    prepare: "Continuer",
    history: "Anciens num\xE9ros",
    historyHelp: "Visible uniquement par toi.",
    historyRow: "{{from}} au {{to}}",
    done: "Num\xE9ro chang\xE9. Retraits possibles \xE0 partir du {{date}}."
  },
  statements: {
    title: "Relev\xE9s",
    generate: "G\xE9n\xE9rer un relev\xE9",
    periodTitle: "Quelle p\xE9riode\xA0?",
    periods: {
      month: "Un mois",
      cycle: "Un cycle",
      custom: "Dates au choix"
    },
    month: "Mois",
    cycle: "Cycle",
    from: "Du",
    to: "Au",
    names: {
      month: "{{month}}",
      cycle: "Cycle {{cycle}}",
      custom: "Du {{from}} au {{to}}"
    },
    generating: "Pr\xE9paration du relev\xE9\u2026",
    ready: "Relev\xE9 pr\xEAt",
    rowMeta: "Cr\xE9\xE9 le {{date}}, PDF {{size}}",
    verificationCode: "Code de v\xE9rification\xA0: {{code}}",
    verifyHelp: "Une institution peut v\xE9rifier ce relev\xE9 sur {{url}}.",
    contents: "Contient tes cotisations, versements, retraits, pr\xEAts, amendes, frais, la caisse de secours et ta fiabilit\xE9.",
    empty: "Aucun relev\xE9 pour le moment. Le relev\xE9 du mois arrive automatiquement le 1er \xE0 7\xA0h.",
    leftMember: "Tu as quitt\xE9 ce groupe\xA0: tes relev\xE9s restent disponibles."
  },
  groupSettings: {
    title: "R\xE9glages du groupe",
    adminOnly: "R\xE9serv\xE9 \xE0 l\u2019admin",
    rules: "R\xE8gles",
    rulesHelp: "Les r\xE8gles ne changent que par vote, admin compris.",
    rulesVersion: "Version {{version}}, depuis le tour {{round}}",
    proposeChange: "Proposer un changement",
    openRuleVote: "Vote en cours\xA0: {{title}}",
    members: "Membres et r\xF4les",
    invites: "Invitations",
    inviteFounding: "Inviter un membre fondateur",
    inviteApproved_one: "{{count}} membre accept\xE9 par vote \xE0 inviter",
    inviteApproved_other: "{{count}} membres accept\xE9s par vote \xE0 inviter",
    noInvites: "Aucune invitation en attente.",
    inviteNeedsVote: "Depuis le premier cycle, un nouveau membre passe par un vote. Propose-le dans Votes.",
    meetings: "R\xE9unions",
    announcements: "Annonces",
    newAnnouncement: "Nouvelle annonce",
    announcementPlaceholder: "Ce que tout le groupe doit savoir",
    announcementNote: "L\u2019annonce est \xE9pingl\xE9e en haut du groupe.",
    loansQueue: "Pr\xEAts \xE0 d\xE9cider",
    pinResets: "Demandes de nouveau code PIN",
    startCycle: "D\xE9marrer le cycle",
    adminLimits: "L\u2019admin ne peut ni changer les r\xE8gles, ni d\xE9placer de l\u2019argent, ni voir les num\xE9ros des membres.",
    memberViewNote: "Tu vois les r\xE8gles. Seul l\u2019admin g\xE8re les invitations, les r\xE9unions et les annonces."
  },
  privacy: {
    title: "Confidentialit\xE9",
    consent: "Mon consentement",
    consentValue: "Accept\xE9 le {{date}}, version {{version}}",
    readPolicy: "Lire la politique de confidentialit\xE9",
    whatOthersSee: "Ce que les autres membres voient",
    whatOthersSeeBody: "Ton nom, tes paiements dans le registre, ta fiabilit\xE9 et tes votes non secrets. Jamais tes num\xE9ros.",
    export: {
      title: "Exporter mes donn\xE9es",
      body: "Un fichier avec ton profil, tes paiements, tes votes non secrets et ton historique de l\u2019assistant.",
      action: "Pr\xE9parer l\u2019export",
      preparing: "Pr\xE9paration de l\u2019export\u2026",
      ready: "Ton export est pr\xEAt."
    },
    delete: {
      title: "Supprimer mon compte",
      conditions: "Possible seulement si tu n\u2019as plus d\u2019obligation ni d\u2019argent dans aucun groupe.",
      what: "Ton nom et tes num\xE9ros seront anonymis\xE9s. Les op\xE9rations du registre restent, car le groupe en a besoin pour ses comptes.",
      blocked: "Tu as encore des obligations ou de l\u2019argent dans {{group}}. R\xE8gle-les, ou annonce ton d\xE9part \xE0 la fin du cycle.",
      leaveInstead: "Quitter \xE0 la fin du cycle",
      action: "Supprimer mon compte",
      done: "Ton compte est supprim\xE9."
    },
    screenshots: "Les captures d\u2019\xE9cran sont bloqu\xE9es sur les \xE9crans de code PIN et d\u2019argent."
  },
  agentHistory: {
    title: "Historique de l\u2019assistant",
    help: "Ce que Njangi a consult\xE9, pr\xE9par\xE9 ou fait pour toi. Cette liste n\u2019est visible que par toi, pas m\xEAme par l\u2019admin.",
    empty: "Njangi n\u2019a encore rien fait pour toi.",
    filters: {
      all: "Tout",
      actions: "Actions",
      reads: "Consultations"
    },
    status: {
      looked: "Consult\xE9",
      prepared: "Pr\xE9par\xE9",
      confirmed: "Confirm\xE9 par toi",
      done: "Fait",
      cancelled: "Annul\xE9",
      expired: "Expir\xE9",
      failed: "\xC9chec",
      refused: "Refus\xE9 par les r\xE8gles"
    },
    tools: {
      get_my_overview: "Ta situation",
      get_round: "\xC9tat du tour",
      list_unpaid: "Membres qui n\u2019ont pas pay\xE9",
      get_payout_breakdown: "D\xE9tail du versement",
      get_funds: "Caisses",
      get_ledger: "Registre",
      get_rules: "R\xE8gles",
      explain_rule: "Explication d\u2019une r\xE8gle",
      list_members: "Membres",
      get_member: "Profil d\u2019un membre",
      list_proposals: "Votes",
      get_proposal: "D\xE9tail d\u2019un vote",
      list_loans: "Pr\xEAts",
      get_loan_quote: "Simulation de pr\xEAt",
      list_bids: "Ench\xE8res",
      get_solidarity: "Caisse de secours",
      get_meeting: "R\xE9union",
      summarize_unread: "R\xE9sum\xE9 du groupe",
      search_chat: "Recherche dans le groupe",
      list_my_groups: "Tes groupes",
      get_statement: "Relev\xE9",
      export_ledger: "Export du registre",
      get_my_payment_number: "Ton num\xE9ro de paiement",
      get_notifications: "Notifications",
      get_agent_history: "Historique",
      set_language: "Langue",
      set_notification_prefs: "R\xE9glages des notifications",
      switch_group: "Changement de groupe",
      mark_chat_read: "Groupe marqu\xE9 comme lu",
      pay: "Paiement de cotisation",
      pay_debts: "Paiement de dettes",
      withdraw: "Retrait",
      request_loan: "Demande de pr\xEAt",
      repay_loan: "Remboursement de pr\xEAt",
      decide_loan: "D\xE9cision de pr\xEAt",
      place_bid: "Ench\xE8re",
      propose_rule_change: "Proposition de r\xE8gle",
      propose_member_add: "Proposition de nouveau membre",
      propose_member_removal: "Proposition d\u2019exclusion",
      propose_rotation_change: "Proposition de changement d\u2019ordre",
      propose_admin_change: "Proposition de changement d\u2019admin",
      propose_fine_waiver: "Proposition d\u2019annulation d\u2019amende",
      propose_ledger_correction: "Proposition de correction du registre",
      request_early_exit: "Demande de d\xE9part",
      announce_leave_at_cycle_end: "D\xE9part en fin de cycle",
      cast_vote: "Vote",
      request_solidarity: "Demande de soutien",
      add_agenda_item: "Point \xE0 l\u2019ordre du jour",
      check_in: "Pr\xE9sence en r\xE9union",
      send_absence_excuse: "Excuse d\u2019absence",
      post_to_group: "Message dans le groupe",
      schedule_meeting: "R\xE9union planifi\xE9e",
      mark_attendance: "Pr\xE9sences",
      draft_minutes: "Brouillon de proc\xE8s-verbal",
      publish_minutes: "Publication du proc\xE8s-verbal",
      post_announcement: "Annonce",
      create_invite: "Invitation",
      start_cycle: "D\xE9marrage du cycle",
      hide_message: "Message masqu\xE9",
      change_payment_number: "Changement de num\xE9ro",
      delete_my_account: "Suppression du compte"
    }
  },
  language: {
    title: "Langue",
    fr: "Fran\xE7ais",
    en: "English",
    followPhone: "Langue du t\xE9l\xE9phone",
    note: "Njangi te r\xE9pondra aussi dans cette langue."
  },
  security: {
    title: "S\xE9curit\xE9",
    changePin: "Changer mon code PIN",
    currentPin: "Entre ton code PIN actuel",
    newPin: "Choisis ton nouveau code PIN",
    confirmPin: "Confirme ton nouveau code PIN",
    pinChanged: "Code PIN chang\xE9.",
    logoutEverywhere: "Se d\xE9connecter partout",
    logoutEverywhereHelp: "D\xE9connecte tous tes appareils, celui-ci compris. Utile si tu as perdu un t\xE9l\xE9phone."
  },
  session: {
    logout: {
      title: "Se d\xE9connecter\xA0?",
      body: "Tu devras entrer ton num\xE9ro et ton code PIN pour revenir.",
      confirm: "Se d\xE9connecter"
    },
    logoutEverywhere: {
      title: "Se d\xE9connecter partout\xA0?",
      body: "Tous tes appareils seront d\xE9connect\xE9s, celui-ci compris.",
      confirm: "Se d\xE9connecter partout",
      done: "Tous tes appareils sont d\xE9connect\xE9s."
    }
  }
};

// ../../packages/shared/src/i18n/index.ts
var I18N_NAMESPACE = "translation";
var resources = {
  fr: { [I18N_NAMESPACE]: uiFr },
  en: { [I18N_NAMESPACE]: uiEn }
};

// src/lib/texts.ts
function ui(select, params = {}) {
  return bilingual({ fr: select(uiFr), en: select(uiEn) }, params);
}

// src/lib/errors.ts
var AppError = class extends Error {
  constructor(code, status, text, details) {
    super(code);
    this.code = code;
    this.status = status;
    this.text = text;
    this.details = details;
  }
  code;
  status;
  text;
  details;
  name = "AppError";
  toBody() {
    return {
      code: this.code,
      messageFr: this.text.fr,
      messageEn: this.text.en,
      ...this.details ? { details: this.details } : {}
    };
  }
};
function defineErrors(definitions2) {
  return (code, options = {}) => {
    const def = definitions2[code];
    if (!def) throw new Error(`Unknown error code ${code}`);
    return new AppError(code, def.status, bilingual(def.text, options.params), options.details);
  };
}
var commonError = defineErrors({
  VALIDATION_FAILED: { status: 400, text: commonErrorTexts.VALIDATION_FAILED },
  INVALID_JSON: { status: 400, text: commonErrorTexts.INVALID_JSON },
  PAYLOAD_TOO_LARGE: { status: 413, text: commonErrorTexts.PAYLOAD_TOO_LARGE },
  UNSUPPORTED_MEDIA_TYPE: { status: 415, text: commonErrorTexts.UNSUPPORTED_MEDIA_TYPE },
  UNAUTHENTICATED: { status: 401, text: commonErrorTexts.UNAUTHENTICATED },
  FORBIDDEN: { status: 403, text: commonErrorTexts.FORBIDDEN },
  NOT_FOUND: { status: 404, text: commonErrorTexts.NOT_FOUND },
  ROUTE_NOT_FOUND: { status: 404, text: commonErrorTexts.ROUTE_NOT_FOUND },
  RATE_LIMITED: { status: 429, text: commonErrorTexts.RATE_LIMITED },
  CSRF_HEADER_MISSING: { status: 403, text: commonErrorTexts.CSRF_HEADER_MISSING },
  ORIGIN_NOT_ALLOWED: { status: 403, text: commonErrorTexts.ORIGIN_NOT_ALLOWED },
  CONFLICT: { status: 409, text: commonErrorTexts.CONFLICT },
  INTERNAL: { status: 500, text: commonErrorTexts.INTERNAL },
  SERVICE_UNAVAILABLE: { status: 503, text: commonErrorTexts.SERVICE_UNAVAILABLE }
});

// src/modules/auth/auth.errors.ts
var authError = defineErrors({
  PIN_TOO_WEAK: { status: 400, text: authErrorTexts.PIN_TOO_WEAK },
  PIN_SAME_AS_OLD: { status: 400, text: authErrorTexts.PIN_SAME_AS_OLD },
  PHONE_ALREADY_REGISTERED: { status: 409, text: authErrorTexts.PHONE_ALREADY_REGISTERED },
  CONSENT_OUTDATED: { status: 409, text: authErrorTexts.CONSENT_OUTDATED },
  OPERATOR_REQUIRED: { status: 400, text: authErrorTexts.OPERATOR_REQUIRED },
  INVALID_CREDENTIALS: { status: 401, text: authErrorTexts.INVALID_CREDENTIALS },
  INVALID_CREDENTIALS_LAST_ATTEMPT: { status: 401, text: authErrorTexts.INVALID_CREDENTIALS_LAST_ATTEMPT },
  LOGIN_LOCKED: { status: 429, text: authErrorTexts.LOGIN_LOCKED },
  SESSION_INVALID: { status: 401, text: authErrorTexts.SESSION_INVALID },
  SESSION_REUSED: { status: 401, text: authErrorTexts.SESSION_REUSED },
  PIN_REQUIRED: { status: 400, text: authErrorTexts.PIN_REQUIRED },
  PIN_INCORRECT: { status: 403, text: authErrorTexts.PIN_INCORRECT },
  PIN_INCORRECT_LAST_ATTEMPT: { status: 403, text: authErrorTexts.PIN_INCORRECT_LAST_ATTEMPT },
  PIN_LOCKED: { status: 429, text: authErrorTexts.PIN_LOCKED },
  PIN_RESET_LINK_INVALID: { status: 410, text: authErrorTexts.PIN_RESET_LINK_INVALID },
  PIN_RESET_PHONE_MISMATCH: { status: 400, text: authErrorTexts.PIN_RESET_PHONE_MISMATCH },
  PIN_RESET_NOT_FOUND: { status: 404, text: authErrorTexts.PIN_RESET_NOT_FOUND },
  PIN_RESET_NOT_ALLOWED: { status: 403, text: authErrorTexts.PIN_RESET_NOT_ALLOWED },
  PIN_RESET_LINK_NOT_YET: { status: 409, text: authErrorTexts.PIN_RESET_LINK_NOT_YET },
  PIN_RESET_NONE_PENDING: { status: 404, text: authErrorTexts.PIN_RESET_NONE_PENDING },
  PIN_RESET_ALREADY_CONFIRMED: { status: 409, text: authErrorTexts.PIN_RESET_ALREADY_CONFIRMED }
});

// src/modules/auth/pin.ts
import argon2 from "argon2";
var OPTIONS = { type: argon2.argon2id, memoryCost: 19456, timeCost: 2, parallelism: 1 };

// src/lib/logger.ts
import { pino } from "pino";

// src/lib/request-context.ts
import { AsyncLocalStorage } from "node:async_hooks";
import { randomUUID } from "node:crypto";
var storage = new AsyncLocalStorage();
function currentContext() {
  return storage.getStore();
}
function runAsSystem(fn) {
  return storage.run({ requestId: randomUUID() }, fn);
}

// src/lib/redact.ts
var REDACTED = "[redacted]";
var SENSITIVE_SUFFIXES = [
  "pin",
  "pinhash",
  "password",
  "secret",
  "token",
  "tokenhash",
  "authorization",
  "cookie",
  "apikey",
  "phone",
  "phonehash",
  "phonesnapshot",
  "paymentnumber",
  "signature",
  "link",
  "phonenumber",
  "mobile"
];
var SENSITIVE_EXACT = /* @__PURE__ */ new Set(["number", "sig", "msisdn", "tel"]);
var PHONE_LIKE_NUMBER = /^(237)?6\d{8}$/;
function isSensitiveKey(key) {
  const k = key.toLowerCase().replace(/[-_]/g, "");
  return SENSITIVE_EXACT.has(k) || SENSITIVE_SUFFIXES.some((suffix) => k.endsWith(suffix));
}
var UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
var JWT = /\beyJ[\w-]{5,}\.[\w-]{5,}\.[\w-]{5,}/g;
var BEARER = /\bBearer\s+[\w.~+/=-]+/gi;
var OPAQUE_TOKEN = /[A-Za-z0-9_-]{40,}/g;
function redactText(text) {
  if (UUID.test(text)) return text;
  return maskPhonesInText(
    text.replace(JWT, "[jwt]").replace(BEARER, "Bearer [redacted]").replace(OPAQUE_TOKEN, "[token]"),
    []
  );
}
var MAX_DEPTH = 8;
var MAX_ITEMS = 100;
function redactValue(value, depth, seen) {
  if (typeof value === "string") return redactText(value);
  if (typeof value === "number" && PHONE_LIKE_NUMBER.test(String(value))) return REDACTED;
  if (value === null || typeof value !== "object") return value;
  if (value instanceof Date) return value;
  if (seen.has(value)) return "[circular]";
  if (depth >= MAX_DEPTH) return "[nested]";
  seen.add(value);
  if (value instanceof Error) {
    const err = value;
    return {
      type: err.name,
      message: redactText(err.message),
      ...typeof err.code === "string" || typeof err.code === "number" ? { code: err.code } : {},
      ...typeof err.status === "number" ? { status: err.status } : {},
      ...err.stack ? { stack: redactText(err.stack) } : {}
    };
  }
  if (Array.isArray(value)) {
    return value.slice(0, MAX_ITEMS).map((item) => redactValue(item, depth + 1, seen));
  }
  const out = {};
  for (const [key, inner] of Object.entries(value)) {
    out[key] = isSensitiveKey(key) ? REDACTED : redactValue(inner, depth + 1, seen);
  }
  return out;
}
function redact(value) {
  return redactValue(value, 0, /* @__PURE__ */ new WeakSet());
}

// src/lib/logger.ts
function defaultLevel() {
  if (process.env.LOG_LEVEL) return process.env.LOG_LEVEL;
  return process.env.NODE_ENV === "test" ? "silent" : "info";
}
var testLogLines = [];
var destination = process.env.NODE_ENV === "test" ? { write: (line) => void testLogLines.push(line) } : void 0;
var logger = pino(
  {
    level: defaultLevel(),
    base: { service: "njangitrust-api" },
    timestamp: pino.stdTimeFunctions.isoTime,
    messageKey: "msg",
    mixin() {
      const context = currentContext();
      if (!context) return {};
      return {
        reqId: context.requestId,
        ...context.userId ? { userId: context.userId } : {}
      };
    },
    formatters: {
      log: (object) => redact(object)
    },
    hooks: {
      // The message string is not part of the object above; redact it too.
      logMethod(args3, method) {
        const cleaned = args3.map((arg) => typeof arg === "string" ? redactText(arg) : arg);
        method.apply(this, cleaned);
      }
    }
  },
  destination
);
function componentLogger(component) {
  return logger.child({ component });
}

// src/lib/after-commit.ts
var log = componentLogger("after-commit");
var AfterCommit = class {
  effects = [];
  add(effect) {
    this.effects.push(effect);
  }
  /** Runs every effect in order. A failing effect is logged and never undoes the commit. */
  async run() {
    for (const effect of this.effects.splice(0)) {
      try {
        await effect();
      } catch (error) {
        log.error({ err: error }, "after-commit effect failed");
      }
    }
  }
};

// src/lib/crypto.ts
import {
  createCipheriv,
  createDecipheriv,
  createHash,
  createHmac,
  hkdfSync,
  randomBytes,
  randomUUID as randomUUID2,
  timingSafeEqual
} from "node:crypto";
function randomToken(bytes = 32) {
  return randomBytes(bytes).toString("base64url");
}
function sha256Hex(value) {
  return createHash("sha256").update(value, "utf8").digest("hex");
}
function safeEqual(a, b) {
  const left = Buffer.from(a, "utf8");
  const right = Buffer.from(b, "utf8");
  if (left.length !== right.length) return false;
  return timingSafeEqual(left, right);
}
var derivedKeys = /* @__PURE__ */ new Map();
function derivedKey(secret2, purpose) {
  const cacheKey = `${purpose}:${sha256Hex(secret2)}`;
  let key = derivedKeys.get(cacheKey);
  if (!key) {
    key = Buffer.from(hkdfSync("sha256", secret2, "njangitrust", purpose, 32));
    derivedKeys.set(cacheKey, key);
  }
  return key;
}
function hashLinkToken(token) {
  return sha256Hex(`njangitrust-link:${token}`);
}
var SEAL_VERSION = "v1";
function sealKey() {
  const env = getEnv();
  return derivedKey(env.HASH_SECRET ?? env.JWT_REFRESH_SECRET, "action-seal");
}
function openJson(sealed) {
  const [version, iv, tag, body] = sealed.split(".");
  if (version !== SEAL_VERSION || !iv || !tag || body === void 0)
    throw new Error("Malformed sealed value");
  const decipher = createDecipheriv("aes-256-gcm", sealKey(), Buffer.from(iv, "base64url"));
  decipher.setAuthTag(Buffer.from(tag, "base64url"));
  const text = Buffer.concat([
    decipher.update(Buffer.from(body, "base64url")),
    decipher.final()
  ]).toString("utf8");
  return JSON.parse(text);
}

// src/http/rate-limit.ts
import { RateLimiterMemory, RateLimiterRes } from "rate-limiter-flexible";
var testScale = 1;
function postgresLimiter(policy2, points) {
  const prefix = `njangi:rl:${policy2.name}:`;
  const durationMs = policy2.durationSeconds * 1e3;
  const blockMs = (policy2.blockSeconds ?? 0) * 1e3;
  const read = async (key) => {
    const rows = await getPrisma().$queryRawUnsafe(
      'SELECT "consumed", "expiresAt" AS "expires", "blockedUntil" AS "blocked" FROM "RateLimitRecord" WHERE "key" = $1',
      prefix + key
    );
    const row = rows[0];
    if (!row) return null;
    const now = Date.now();
    if (row.expires.getTime() <= now && (!row.blocked || row.blocked.getTime() <= now)) return null;
    return { consumedPoints: row.consumed, remainingPoints: Math.max(0, points - row.consumed), msBeforeNext: Math.max(0, (row.blocked?.getTime() ?? row.expires.getTime()) - now) };
  };
  return {
    get: read,
    delete: async (key) => {
      await getPrisma().$executeRawUnsafe('DELETE FROM "RateLimitRecord" WHERE "key" = $1', prefix + key);
    },
    block: async (key, seconds) => {
      const now = /* @__PURE__ */ new Date();
      const until = new Date(now.getTime() + seconds * 1e3);
      await getPrisma().$executeRawUnsafe(`INSERT INTO "RateLimitRecord" ("key", "consumed", "expiresAt", "blockedUntil", "updatedAt") VALUES ($1, $2, $3, $3, NOW()) ON CONFLICT ("key") DO UPDATE SET "consumed" = $2, "expiresAt" = $3, "blockedUntil" = $3, "updatedAt" = NOW()`, prefix + key, points, until);
    },
    consume: async (key) => {
      const now = /* @__PURE__ */ new Date();
      const expires = new Date(now.getTime() + durationMs);
      const rows = await getPrisma().$queryRawUnsafe(
        `INSERT INTO "RateLimitRecord" ("key", "consumed", "expiresAt", "updatedAt") VALUES ($1, 1, $2, NOW()) ON CONFLICT ("key") DO UPDATE SET "consumed" = CASE WHEN "RateLimitRecord"."expiresAt" <= NOW() AND ("RateLimitRecord"."blockedUntil" IS NULL OR "RateLimitRecord"."blockedUntil" <= NOW()) THEN 1 ELSE "RateLimitRecord"."consumed" + 1 END, "expiresAt" = CASE WHEN "RateLimitRecord"."expiresAt" <= NOW() AND ("RateLimitRecord"."blockedUntil" IS NULL OR "RateLimitRecord"."blockedUntil" <= NOW()) THEN $2 ELSE "RateLimitRecord"."expiresAt" END, "blockedUntil" = CASE WHEN "RateLimitRecord"."blockedUntil" <= NOW() THEN NULL ELSE "RateLimitRecord"."blockedUntil" END, "updatedAt" = NOW() RETURNING "consumed", "expiresAt" AS "expires", "blockedUntil" AS "blocked"`,
        prefix + key,
        expires
      );
      const row = rows[0];
      if (!row) throw new Error("Rate-limit upsert returned no record");
      const waitMs = Math.max(0, (row.blocked?.getTime() ?? row.expires.getTime()) - Date.now());
      if (row.blocked && row.blocked.getTime() > Date.now() || row.consumed > points) throw new RateLimiterRes(waitMs, row.consumed);
      if (row.consumed === points && blockMs > 0) await getPrisma().$executeRawUnsafe(`UPDATE "RateLimitRecord" SET "blockedUntil" = NOW() + ($2 * INTERVAL '1 millisecond'), "expiresAt" = GREATEST("expiresAt", NOW() + ($2 * INTERVAL '1 millisecond')) WHERE "key" = $1`, prefix + key, blockMs);
      return { consumedPoints: row.consumed, remainingPoints: Math.max(0, points - row.consumed), msBeforeNext: waitMs };
    }
  };
}
function lazyLimiter(policy2, options = {}) {
  let limiter;
  let scale = testScale;
  return { policy: policy2, get() {
    if (!limiter || scale !== testScale) {
      const points = policy2.points * (options.scaled ? testScale : 1);
      limiter = process.env.NODE_ENV === "production" ? postgresLimiter(policy2, points) : new RateLimiterMemory({ keyPrefix: `njangi:rl:${policy2.name}`, points, duration: policy2.durationSeconds, blockDuration: policy2.blockSeconds ?? 0 });
      scale = testScale;
    }
    return limiter;
  }, resetAllForTests() {
    limiter = void 0;
  } };
}
var floodLimits = {
  global: lazyLimiter({ name: "global-ip", points: 600, durationSeconds: 60 }, { scaled: true }),
  auth: lazyLimiter({ name: "auth-ip", points: 30, durationSeconds: 300 }, { scaled: true }),
  refresh: lazyLimiter({ name: "refresh-ip", points: 120, durationSeconds: 300 }, { scaled: true })
};

// src/realtime/emitter.ts
var io = null;
var supabasePublisher = null;
var recorders = /* @__PURE__ */ new Set();
var userRoom = (userId) => `user:${userId}`;
var groupRoom = (groupId) => `group:${groupId}`;
function emit(room, event, payload5) {
  for (const recorder of recorders) recorder.push({ room, event, payload: payload5 });
  if (supabasePublisher) {
    void supabasePublisher.broadcast(room, event, payload5);
  }
  if (!io || supabasePublisher) return;
  io.to(room).emit(event, payload5);
}
function emitToUser(userId, event, payload5) {
  emit(userRoom(userId), event, payload5);
}
function emitToGroup(groupId, event, payload5) {
  emit(groupRoom(groupId), event, payload5);
}
function leaveGroupRoom(userId, groupId) {
  io?.in(userRoom(userId)).socketsLeave(groupRoom(groupId));
}

// src/modules/audit/audit.service.ts
async function audit(entry2, db = getPrisma()) {
  const context = entry2.system ? void 0 : currentContext();
  await db.auditLog.create({
    data: {
      action: entry2.action,
      actorUserId: entry2.system ? null : entry2.actorUserId ?? context?.userId ?? null,
      groupId: entry2.groupId ?? null,
      target: entry2.target ?? null,
      details: redact(entry2.details ?? {}),
      deviceId: context?.deviceId ?? null,
      requestId: context?.requestId ?? null
    }
  });
}

// src/dto/time.ts
function iso(date) {
  return date.toISOString();
}
function isoOrNull(date) {
  return date ? date.toISOString() : null;
}

// ../../packages/shared/src/contracts/groups.ts
import { z as z5 } from "zod";
var int = z5.number().int();
var monthlyAnchorKindSchema = z5.enum(["DAY_OF_MONTH", "LAST_WEEKDAY", "NTH_WEEKDAY"]);
var monthlyAnchorSchema = z5.discriminatedUnion("kind", [
  z5.strictObject({ kind: z5.literal("DAY_OF_MONTH"), day: int }),
  z5.strictObject({ kind: z5.literal("LAST_WEEKDAY"), weekday: int }),
  z5.strictObject({ kind: z5.literal("NTH_WEEKDAY"), nth: int, weekday: int })
]);
var payoutTimeSchema = z5.strictObject({
  hour: int,
  minute: int,
  monthlyAnchor: monthlyAnchorSchema
});
var ruleSetParamsSchema = z5.strictObject({
  contributionAmount: int,
  solidarityContribution: int,
  frequency: z5.enum(["WEEKLY", "BIWEEKLY", "MONTHLY"]),
  payoutTime: payoutTimeSchema,
  lateFine: int,
  rotationMode: z5.enum(["FIXED", "BIDDING"]),
  minBid: int,
  loanRatePermille: int,
  loanMaxMonths: int,
  loanLimitFactorPermille: int,
  numberChangeHoldHours: int,
  voteWindowHours: int,
  solidarityVoteWindowHours: int,
  meetingAbsenceFine: int,
  distributeFundAtCycleEnd: z5.boolean(),
  reliabilityWindow: int
});
var ruleSetInputSchema = ruleSetParamsSchema.omit({ payoutTime: true }).partial();
var createGroupRequestSchema = z5.strictObject({
  name: nameSchema(80),
  /** First payout date and time; must be in the future. */
  firstPayoutAt: instantSchema,
  /** Monthly groups: how the payout day repeats (DECISIONS Q1). Default DAY_OF_MONTH. */
  monthlyAnchor: monthlyAnchorKindSchema.optional(),
  rules: ruleSetInputSchema.optional()
});
var groupSchema = z5.strictObject({
  id: uuidSchema,
  name: z5.string(),
  status: groupStatusSchema,
  firstPayoutAt: instantSchema,
  memberCount: int,
  createdAt: instantSchema
});
var myMembershipSchema = z5.strictObject({
  membershipId: uuidSchema,
  role: membershipRoleSchema,
  status: membershipStatusSchema
});
var groupCreatedSchema = z5.strictObject({ group: groupSchema, me: myMembershipSchema });
var groupOverviewSchema = z5.strictObject({
  group: groupSchema,
  me: myMembershipSchema,
  rulesVersion: int
});
var publicMemberSchema = z5.strictObject({
  membershipId: uuidSchema,
  name: z5.string(),
  role: membershipRoleSchema,
  status: membershipStatusSchema,
  isMe: z5.boolean(),
  joinedAt: instantSchema
});
var adminMemberSchema = publicMemberSchema.extend({
  activeFromCycle: int.nullable(),
  leftAt: instantSchema.nullable()
});
var membersResponseSchema = z5.strictObject({
  members: z5.array(z5.union([adminMemberSchema, publicMemberSchema]))
});
var ruleSetSchema = z5.strictObject({
  version: int,
  params: ruleSetParamsSchema,
  effectiveFromRoundId: uuidSchema.nullable(),
  createdAt: instantSchema
});
var rulesResponseSchema = z5.strictObject({ ruleSet: ruleSetSchema });

// ../../packages/shared/src/contracts/pending-actions.ts
import { z as z6 } from "zod";
var actionLevelSchema = z6.enum(["L1", "L2"]);
var actionOriginSchema = z6.enum(["AGENT", "UI"]);
var pendingActionStatusSchema = z6.enum([
  "PENDING",
  "CONFIRMED",
  "CANCELLED",
  "EXPIRED",
  "DONE",
  "FAILED"
]);
var previewLineSchema = z6.strictObject({ label: bilingualSchema, amount: fcfaSchema });
var actionPreviewSchema = z6.strictObject({
  /** Verb plus object: "Payer ta cotisation". */
  title: bilingualSchema,
  lines: z6.array(previewLineSchema),
  /** Bold total line; null when the action moves no money. */
  total: fcfaSchema.nullable(),
  /** Label of the total line ("Pris sur ton solde", copy key confirmation.lines.fromBalance); null or absent: "Total". */
  totalLabel: bilingualSchema.nullable().optional(),
  notes: z6.array(bilingualSchema),
  /** Repeats the verb and amount: "Payer 11 000 FCFA". */
  confirmLabel: bilingualSchema
});
var pendingActionSchema = z6.strictObject({
  id: uuidSchema,
  type: z6.string(),
  level: actionLevelSchema,
  status: pendingActionStatusSchema,
  origin: actionOriginSchema,
  groupId: uuidSchema.nullable(),
  preview: actionPreviewSchema,
  /** L2 actions ask for the member's PIN after the tap (R13.2). */
  requiresPin: z6.boolean(),
  expiresAt: instantSchema,
  createdAt: instantSchema,
  result: z6.strictObject({ ref: z6.string().nullable(), summary: bilingualSchema.nullable() }).nullable(),
  /** `key` names the designer's card: confirmation.failed.<key> (`generic` when none fits). */
  failure: z6.strictObject({
    code: z6.string(),
    key: z6.string(),
    messageFr: z6.string(),
    messageEn: z6.string()
  }).nullable()
});
var pendingActionResponseSchema = z6.strictObject({ action: pendingActionSchema });
var confirmActionRequestSchema = z6.strictObject({ pin: pinSchema.optional() });
var actionResultDataSchema = z6.discriminatedUnion("type", [
  z6.strictObject({
    type: z6.literal("INVITE_CREATE"),
    inviteId: uuidSchema,
    /** The one-time link to share; returned once, never stored. */
    link: z6.string(),
    expiresAt: instantSchema
  }),
  z6.strictObject({
    type: z6.literal("PIN_RESET_APPROVE"),
    approved: z6.boolean(),
    link: z6.string().optional(),
    /** D14: the link works only from this time (24 hours after approval)… */
    linkUsableFrom: instantSchema.optional(),
    /** …and for 30 minutes after that. */
    linkExpiresAt: instantSchema.optional()
  })
]);
var confirmActionResponseSchema = z6.strictObject({
  action: pendingActionSchema,
  data: actionResultDataSchema.nullable()
});
var pendingActionCreatedSchema = z6.strictObject({ action: pendingActionSchema });

// src/dto/failure-keys.ts
var keys = /* @__PURE__ */ new Map([
  ["ACTION_CHANGED", "situationChanged"],
  ["PROPOSAL_CLOSED", "voteClosed"],
  ["ALREADY_VOTED", "alreadyVoted"],
  ["NOT_ELIGIBLE_VOTER", "notEligible"],
  ["ADMIN_ONLY", "notEligible"],
  ["NOT_ACTIVE_MEMBER", "notEligible"],
  ["MEMBERSHIP_ENDED", "notEligible"],
  ["GROUP_FULL", "notEligible"],
  ["PROPOSAL_REQUIRED", "notEligible"],
  ["PROPOSAL_NOT_PASSED", "notEligible"],
  ["INVITE_ALREADY_PENDING", "notEligible"],
  ["PIN_RESET_NOT_FOUND", "notEligible"],
  ["PIN_RESET_ALREADY_CONFIRMED", "notEligible"]
]);
function failureKeyOf(code) {
  return keys.get(code) ?? "generic";
}

// src/dto/pending-actions.ts
function parseBilingual(value) {
  const parsed = bilingualSchema.safeParse(value);
  return parsed.success ? parsed.data : null;
}
function resultOf(action) {
  if (action.status !== "DONE" && action.status !== "CONFIRMED") return null;
  if (!action.resultRef && !action.resultSummary) return null;
  return { ref: action.resultRef, summary: parseBilingual(action.resultSummary) };
}
function failureOf(action) {
  if (!action.failureCode) return null;
  const text = parseBilingual(action.failureText);
  return {
    code: action.failureCode,
    key: failureKeyOf(action.failureCode),
    messageFr: text?.fr ?? "",
    messageEn: text?.en ?? ""
  };
}
function toPendingActionUpdate(action) {
  return {
    id: action.id,
    status: action.status,
    result: resultOf(action),
    failure: failureOf(action)
  };
}

// src/dto/action-results.ts
import { z as z7 } from "zod";
var invite = z7.object({ inviteId: z7.string(), link: z7.string(), expiresAt: z7.string() });
var pinReset = z7.object({
  approved: z7.boolean(),
  link: z7.string().optional(),
  linkUsableFrom: z7.string().optional(),
  linkExpiresAt: z7.string().optional()
});

// ../../packages/rules/src/money/amounts.ts
function assertFcfa2(value, label = "amount") {
  if (!Number.isSafeInteger(value)) {
    throw new RangeError(`${label} must be a whole number of FCFA; got ${String(value)}`);
  }
}
function assertNonNegativeFcfa(value, label = "amount") {
  assertFcfa2(value, label);
  if (value < 0) throw new RangeError(`${label} must not be negative; got ${value}`);
}
function toSafeInteger(value, label = "value") {
  if (value > BigInt(Number.MAX_SAFE_INTEGER) || value < BigInt(Number.MIN_SAFE_INTEGER)) {
    throw new RangeError(`${label} is outside the safe integer range`);
  }
  return Number(value);
}
function checkInteger(value, label) {
  if (!Number.isSafeInteger(value)) throw new RangeError(`${label} must be an integer`);
  return value;
}
function roundHalfUpDiv(numerator, denominator) {
  const n = typeof numerator === "bigint" ? numerator : BigInt(checkInteger(numerator, "numerator"));
  const d = typeof denominator === "bigint" ? denominator : BigInt(checkInteger(denominator, "denominator"));
  if (d <= 0n) throw new RangeError("denominator must be positive");
  if (n < 0n) throw new RangeError("numerator must not be negative");
  return toSafeInteger((2n * n + d) / (2n * d), "roundHalfUpDiv");
}

// ../../packages/rules/src/crypto/sha256.ts
var K = new Uint32Array([
  1116352408,
  1899447441,
  3049323471,
  3921009573,
  961987163,
  1508970993,
  2453635748,
  2870763221,
  3624381080,
  310598401,
  607225278,
  1426881987,
  1925078388,
  2162078206,
  2614888103,
  3248222580,
  3835390401,
  4022224774,
  264347078,
  604807628,
  770255983,
  1249150122,
  1555081692,
  1996064986,
  2554220882,
  2821834349,
  2952996808,
  3210313671,
  3336571891,
  3584528711,
  113926993,
  338241895,
  666307205,
  773529912,
  1294757372,
  1396182291,
  1695183700,
  1986661051,
  2177026350,
  2456956037,
  2730485921,
  2820302411,
  3259730800,
  3345764771,
  3516065817,
  3600352804,
  4094571909,
  275423344,
  430227734,
  506948616,
  659060556,
  883997877,
  958139571,
  1322822218,
  1537002063,
  1747873779,
  1955562222,
  2024104815,
  2227730452,
  2361852424,
  2428436474,
  2756734187,
  3204031479,
  3329325298
]);

// ../../packages/rules/src/time/douala.ts
var HOUR_MS = 36e5;
var DAY_MS = 24 * HOUR_MS;
var DOUALA_UTC_OFFSET_HOURS = 1;
var OFFSET_MS = DOUALA_UTC_OFFSET_HOURS * HOUR_MS;
function assertDate(at, label = "date") {
  const ms = at instanceof Date ? at.getTime() : Number.NaN;
  if (!Number.isFinite(ms)) throw new RangeError(`${label} must be a valid Date`);
  return ms;
}
function addHours(at, hours) {
  if (!Number.isSafeInteger(hours)) throw new RangeError("hours must be an integer");
  return new Date(assertDate(at) + hours * HOUR_MS);
}
function toDoualaLocal(at) {
  const shifted = new Date(assertDate(at) + OFFSET_MS);
  return {
    year: shifted.getUTCFullYear(),
    month: shifted.getUTCMonth() + 1,
    day: shifted.getUTCDate(),
    hour: shifted.getUTCHours(),
    minute: shifted.getUTCMinutes(),
    second: shifted.getUTCSeconds(),
    millisecond: shifted.getUTCMilliseconds(),
    weekday: shifted.getUTCDay()
  };
}

// ../../packages/rules/src/time/windows.ts
var VOTE_REMINDER_BEFORE_HOURS = 24;
function voteClosesAt(opensAt, windowHours) {
  return addHours(opensAt, windowHours);
}
function voteReminderAt(closesAt) {
  return addHours(closesAt, -VOTE_REMINDER_BEFORE_HOURS);
}

// ../../packages/rules/src/ruleset/factor.ts
function formatLimitFactor(permille, lang) {
  if (!Number.isSafeInteger(permille) || permille < 0) {
    throw new RangeError("the factor is a whole, non-negative number of permille");
  }
  const units = (permille - permille % 1e3) / 1e3;
  const decimals = String(permille % 1e3).padStart(3, "0").replace(/0+$/, "");
  return decimals ? `${units}${lang === "fr" ? "," : "."}${decimals}` : String(units);
}

// ../../packages/rules/src/ruleset/params.ts
var PARAMETER_SPECS = {
  contributionAmount: { kind: "integer", min: 500, max: 1e6, takesEffect: "NEXT_ROUND" },
  solidarityContribution: { kind: "integer", min: 0, max: 5e4, takesEffect: "NEXT_ROUND" },
  frequency: { kind: "enum", values: ["WEEKLY", "BIWEEKLY", "MONTHLY"], takesEffect: "NEXT_ROUND" },
  // D13.1: a frequency or payout-time change re-dates the remaining rounds (rescheduleFromRound).
  payoutTime: { kind: "payoutTime", takesEffect: "NEXT_ROUND" },
  lateFine: { kind: "integer", min: 0, max: 5e4, takesEffect: "NEXT_ROUND" },
  rotationMode: { kind: "enum", values: ["FIXED", "BIDDING"], takesEffect: "NEXT_ROUND" },
  minBid: { kind: "integer", min: 0, max: 1e6, takesEffect: "NEXT_ROUND" },
  loanRatePermille: { kind: "integer", min: 0, max: 100, takesEffect: "NEXT_ROUND" },
  loanMaxMonths: { kind: "integer", min: 1, max: 6, takesEffect: "NEXT_ROUND" },
  loanLimitFactorPermille: { kind: "integer", min: 0, max: 3e3, takesEffect: "NEXT_ROUND" },
  numberChangeHoldHours: { kind: "integer", min: 0, max: 168, takesEffect: "NEXT_ROUND" },
  voteWindowHours: { kind: "integer", min: 24, max: 168, takesEffect: "NEXT_ROUND" },
  solidarityVoteWindowHours: { kind: "integer", min: 12, max: 72, takesEffect: "NEXT_ROUND" },
  meetingAbsenceFine: { kind: "integer", min: 0, max: 5e4, takesEffect: "NEXT_ROUND" },
  distributeFundAtCycleEnd: { kind: "boolean", takesEffect: "NEXT_ROUND" },
  reliabilityWindow: { kind: "integer", min: 6, max: 24, takesEffect: "NEXT_ROUND" }
};
var PARAMETER_ORDER = Object.keys(PARAMETER_SPECS).sort();
var DEFAULT_RULE_SET = Object.freeze({
  contributionAmount: 1e4,
  solidarityContribution: 1e3,
  frequency: "MONTHLY",
  payoutTime: { hour: 18, minute: 0, monthlyAnchor: { kind: "LAST_WEEKDAY", weekday: 6 } },
  lateFine: 1e3,
  rotationMode: "FIXED",
  minBid: 500,
  loanRatePermille: 50,
  loanMaxMonths: 3,
  loanLimitFactorPermille: 1e3,
  numberChangeHoldHours: 48,
  voteWindowHours: 72,
  solidarityVoteWindowHours: 24,
  meetingAbsenceFine: 0,
  distributeFundAtCycleEnd: true,
  reliabilityWindow: 12
});
var isInt = (v, min, max) => typeof v === "number" && Number.isSafeInteger(v) && v >= min && v <= max;
function validAnchor(a) {
  if (!a || typeof a !== "object") return false;
  const anchor = a;
  switch (anchor.kind) {
    case "DAY_OF_MONTH":
      return isInt(anchor.day, 1, 31);
    case "LAST_WEEKDAY":
      return isInt(anchor.weekday, 0, 6);
    case "NTH_WEEKDAY":
      return isInt(anchor.nth, 1, 4) && isInt(anchor.weekday, 0, 6);
    default:
      return false;
  }
}
function validPayoutTime(v) {
  if (!v || typeof v !== "object") return false;
  const t = v;
  return isInt(t.hour, 0, 23) && isInt(t.minute, 0, 59) && validAnchor(t.monthlyAnchor);
}
function validateParameter(parameter, value) {
  if (!Object.prototype.hasOwnProperty.call(PARAMETER_SPECS, parameter)) {
    return { ok: false, code: "UNKNOWN_PARAMETER", parameter };
  }
  const name = parameter;
  const spec = PARAMETER_SPECS[name];
  switch (spec.kind) {
    case "integer":
      if (typeof value !== "number" || !Number.isSafeInteger(value)) {
        return { ok: false, code: "INVALID_VALUE", parameter: name };
      }
      if (value < spec.min || value > spec.max) {
        return {
          ok: false,
          code: "VALUE_OUT_OF_RANGE",
          parameter: name,
          min: spec.min,
          max: spec.max
        };
      }
      return { ok: true };
    case "enum":
      return typeof value === "string" && spec.values.includes(value) ? { ok: true } : { ok: false, code: "INVALID_VALUE", parameter: name };
    case "boolean":
      return typeof value === "boolean" ? { ok: true } : { ok: false, code: "INVALID_VALUE", parameter: name };
    case "payoutTime":
      return validPayoutTime(value) ? { ok: true } : { ok: false, code: "INVALID_VALUE", parameter: name };
  }
}
function validateRuleSet(params) {
  for (const name of PARAMETER_ORDER) {
    const result = validateParameter(name, params[name]);
    if (!result.ok) return result;
  }
  for (const key of Object.keys(params)) {
    if (!Object.prototype.hasOwnProperty.call(PARAMETER_SPECS, key)) {
      return { ok: false, code: "UNKNOWN_PARAMETER", parameter: key };
    }
  }
  return { ok: true };
}

// ../../packages/rules/src/ruleset/rule-change.ts
function ruleChangeTakesEffect(parameter) {
  return PARAMETER_SPECS[parameter].takesEffect;
}
function sameValue(a, b) {
  if (a && b && typeof a === "object" && typeof b === "object") {
    const ka = Object.keys(a).sort();
    const kb = Object.keys(b).sort();
    if (ka.length !== kb.length || ka.some((k, i) => k !== kb[i])) return false;
    return ka.every(
      (k) => sameValue(a[k], b[k])
    );
  }
  return a === b;
}
function validateRuleChange(input2) {
  const keys2 = Object.keys(input2.changes).sort();
  if (keys2.length === 0) return { ok: false, code: "EMPTY_RULE_CHANGE" };
  const effects = [];
  for (const key of keys2) {
    const value = input2.changes[key];
    const check3 = validateParameter(key, value);
    if (!check3.ok) return check3;
    const name = key;
    if (sameValue(input2.current[name], value))
      return { ok: false, code: "NO_CHANGE", parameter: name };
    if (input2.openRuleChangeParameters.includes(name)) {
      return { ok: false, code: "RULE_CHANGE_ALREADY_OPEN", parameter: name };
    }
    effects.push({
      parameter: name,
      from: input2.current[name],
      to: value,
      takesEffect: ruleChangeTakesEffect(name)
    });
  }
  return { ok: true, effects };
}
function applyRuleChange(current, changes) {
  const next = { ...current, ...changes };
  const check3 = validateRuleSet(next);
  if (!check3.ok) throw new RangeError(`invalid rule set: ${check3.code}`);
  return next;
}

// ../../packages/rules/src/rotation/cycle.ts
var MIN_MEMBERS_TO_START = 3;
var MAX_MEMBERS = 50;
function canStartCycle(activeMemberCount) {
  if (activeMemberCount < MIN_MEMBERS_TO_START) {
    return {
      ok: false,
      code: "NOT_ENOUGH_MEMBERS",
      minimum: MIN_MEMBERS_TO_START,
      count: activeMemberCount
    };
  }
  if (activeMemberCount > MAX_MEMBERS) {
    return { ok: false, code: "TOO_MANY_MEMBERS", maximum: MAX_MEMBERS, count: activeMemberCount };
  }
  return { ok: true };
}

// ../../packages/rules/src/rotation/rotation-change.ts
function positionsChanged(oldOrder, newOrder) {
  const changed = /* @__PURE__ */ new Set();
  const length = Math.max(oldOrder.length, newOrder.length);
  for (let i = 0; i < length; i++) {
    const before = oldOrder[i];
    const after = newOrder[i];
    if (before === after) continue;
    if (before !== void 0) changed.add(before);
    if (after !== void 0) changed.add(after);
  }
  return [...changed].sort();
}
function applyRotationSwap(rotation, first, second) {
  const i = rotation.indexOf(first);
  const j = rotation.indexOf(second);
  if (i < 0 || j < 0) throw new RangeError("both members must be in the rotation");
  const next = [...rotation];
  next[i] = second;
  next[j] = first;
  return next;
}
function validateRotationSwap(input2) {
  if (input2.first === input2.second) return { ok: false, code: "SAME_MEMBER" };
  for (const id of [input2.first, input2.second]) {
    const position = input2.rotation.indexOf(id);
    if (position < 0) return { ok: false, code: "NOT_IN_ROTATION", membershipId: id };
    if (position + 1 <= input2.currentRound) {
      return { ok: false, code: "ROTATION_POSITION_ALREADY_SERVED", membershipId: id };
    }
  }
  const newOrder = applyRotationSwap(input2.rotation, input2.first, input2.second);
  return { ok: true, newOrder, mustApprove: positionsChanged(input2.rotation, newOrder) };
}

// ../../packages/rules/src/fees/fee-schedule.ts
var MOCK_FEE_SCHEDULE = Object.freeze({
  collection: [{ upTo: null, fixed: 100, ratePermille: 0 }],
  disbursement: [{ upTo: null, fixed: 500, ratePermille: 0 }]
});
function tierFee(tier, amount) {
  return tier.fixed + roundHalfUpDiv(BigInt(amount) * BigInt(tier.ratePermille), 1000n);
}
function scheduleFee(schedule, kind, amount) {
  assertNonNegativeFcfa(amount);
  const tiers = kind === "COLLECTION" ? schedule.collection : schedule.disbursement;
  const tier = tiers.find((t) => t.upTo === null || amount <= t.upTo);
  if (!tier) throw new RangeError("the fee schedule has no tier for this amount");
  return tierFee(tier, amount);
}

// ../../packages/rules/src/ledger/shapes.ts
var MANY = Number.MAX_SAFE_INTEGER;

// ../../packages/rules/src/ledger/hash-chain.ts
var TRANSACTION_FIELDS = [
  "id",
  "groupId",
  "seq",
  "type",
  "occurredAt",
  "roundId",
  "membershipId",
  "refType",
  "refId",
  "descriptionFr",
  "descriptionEn",
  "metadata",
  "postings",
  "prevHash",
  "hash"
];

// ../../packages/rules/src/ledger/inflight-checks.ts
var IN_FLIGHT_TYPES = [
  "DISBURSEMENT_SENT",
  "WITHDRAWAL_COMPLETED",
  "LOAN_DISBURSED",
  "SOLIDARITY_DISBURSED",
  "DISBURSEMENT_RETURNED"
];
var DISBURSEMENT_TYPES = [...IN_FLIGHT_TYPES, "DISBURSEMENT_REFUNDED"];

// ../../packages/rules/src/votes/proposals.ts
var rule = (r) => ({
  proposer: "ANY_MEMBER",
  secret: false,
  excluded: "NONE",
  movedMembersMustApprove: false,
  window: "STANDARD",
  ...r
});
var PROPOSAL_RULES = {
  // D13.1: every parameter from the next round, rotation mode and frequency included.
  RULE_CHANGE: rule({ threshold: "TWO_THIRDS", takesEffect: "NEXT_ROUND" }),
  // The invite is created at once; the new member is active from the next cycle (R12.1).
  MEMBER_ADD: rule({ threshold: "MAJORITY", takesEffect: "NEXT_CYCLE" }),
  MEMBER_REMOVE: rule({
    threshold: "MAJORITY",
    secret: true,
    excluded: "TARGET",
    takesEffect: "SETTLEMENT"
  }),
  ROTATION_CHANGE: rule({
    threshold: "MAJORITY",
    movedMembersMustApprove: true,
    takesEffect: "NEXT_ROUND"
  }),
  ADMIN_CHANGE: rule({ threshold: "MAJORITY", secret: true, takesEffect: "IMMEDIATELY" }),
  EARLY_EXIT: rule({
    proposer: "LEAVING_MEMBER",
    threshold: "MAJORITY",
    excluded: "REQUESTER",
    takesEffect: "SETTLEMENT"
  }),
  ADMIN_LOAN: rule({
    proposer: "ADMIN_LOAN_REQUEST",
    threshold: "MAJORITY",
    excluded: "ADMIN",
    takesEffect: "IMMEDIATELY"
  }),
  SOLIDARITY_PAYOUT: rule({
    threshold: "MAJORITY",
    takesEffect: "IMMEDIATELY",
    window: "SOLIDARITY"
  }),
  FINE_WAIVER: rule({
    threshold: "MAJORITY",
    excluded: "FINED_MEMBER",
    takesEffect: "IMMEDIATELY"
  }),
  LEDGER_CORRECTION: rule({ threshold: "TWO_THIRDS", takesEffect: "IMMEDIATELY" })
};
function eligibleVoters(input2) {
  const needsExclusion = PROPOSAL_RULES[input2.type].excluded !== "NONE";
  if (needsExclusion && !input2.excludedMembershipId) {
    throw new RangeError(`${input2.type} needs the member excluded from the vote`);
  }
  const excluded = needsExclusion ? input2.excludedMembershipId : null;
  return input2.activeMembershipIds.filter((id) => id !== excluded);
}
function proposalWindowHours(type, params) {
  return PROPOSAL_RULES[type].window === "SOLIDARITY" ? params.solidarityVoteWindowHours : params.voteWindowHours;
}
function canPropose(input2) {
  const proposer = PROPOSAL_RULES[input2.type].proposer;
  if (proposer === "ADMIN_LOAN_REQUEST")
    return { ok: false, code: "CREATED_BY_ADMIN_LOAN_REQUEST" };
  if (proposer === "LEAVING_MEMBER" && input2.subjectMembershipId !== input2.proposerMembershipId) {
    return { ok: false, code: "ONLY_THE_LEAVING_MEMBER" };
  }
  return { ok: true };
}

// ../../packages/rules/src/votes/tally.ts
function thresholdCount(kind, eligibleCount) {
  if (!Number.isSafeInteger(eligibleCount) || eligibleCount < 0)
    throw new RangeError("invalid voter count");
  if (kind === "MAJORITY") return (eligibleCount - eligibleCount % 2) / 2 + 1;
  const twice = 2 * eligibleCount;
  return (twice + (3 - twice % 3) % 3) / 3;
}
function tallyProposal(input2) {
  const required = thresholdCount(input2.thresholdKind, input2.eligibleCount);
  const counts = [input2.yes, input2.no];
  if (counts.some((c) => !Number.isSafeInteger(c) || c < 0) || input2.yes + input2.no > input2.eligibleCount) {
    throw new RangeError("more votes than eligible voters");
  }
  const remaining = input2.eligibleCount - input2.yes - input2.no;
  const approvals = input2.mustApprove;
  const approved = !approvals || approvals.yes >= approvals.required;
  if (input2.yes >= required && approved) return { status: "PASSED", required, remaining };
  if (input2.yes + remaining < required || approvals && approvals.no > 0) {
    return { status: "REJECTED", required, remaining };
  }
  if (assertDate(input2.now, "now") >= assertDate(input2.closesAt, "closesAt")) {
    return { status: "EXPIRED", required, remaining };
  }
  return { status: "OPEN", required, remaining };
}
function validateVote(input2) {
  if (input2.status !== "OPEN" || assertDate(input2.now, "now") >= assertDate(input2.closesAt, "closesAt")) {
    return { ok: false, code: "PROPOSAL_CLOSED" };
  }
  if (!input2.eligibleVoterIds.includes(input2.voterId))
    return { ok: false, code: "NOT_ELIGIBLE_VOTER" };
  if (input2.alreadyVoted) return { ok: false, code: "ALREADY_VOTED" };
  return { ok: true };
}

// ../../packages/rules/src/ledger/verify-export.ts
var KNOWN_FIELDS = new Set(TRANSACTION_FIELDS);

// ../../packages/rules/src/solidarity/solidarity.ts
var SOLIDARITY_EVENTS = ["DEUIL", "NAISSANCE", "MALADIE", "MARIAGE", "AUTRE"];
function validateSolidarityRequest(input2) {
  if (!SOLIDARITY_EVENTS.includes(input2.event)) return { ok: false, code: "UNKNOWN_EVENT" };
  if (!input2.recipientIsMember) return { ok: false, code: "RECIPIENT_NOT_MEMBER" };
  if (!Number.isSafeInteger(input2.amount) || input2.amount <= 0)
    return { ok: false, code: "INVALID_AMOUNT" };
  assertNonNegativeFcfa(input2.solidarityFundBalance, "solidarityFundBalance");
  assertNonNegativeFcfa(input2.pendingSolidarityPayouts, "pendingSolidarityPayouts");
  const balance = Math.max(0, input2.solidarityFundBalance - input2.pendingSolidarityPayouts);
  if (input2.amount > balance) return { ok: false, code: "ABOVE_SOLIDARITY_FUND", balance };
  const feeEstimate = scheduleFee(input2.feeSchedule, "DISBURSEMENT", input2.amount);
  const recipientReceives = input2.amount - feeEstimate;
  if (recipientReceives <= 0) return { ok: false, code: "AMOUNT_NOT_ABOVE_FEE", feeEstimate };
  return { ok: true, amount: input2.amount, feeEstimate, recipientReceives };
}

// ../../packages/rules/src/membership/joining.ts
function canInvite(input2) {
  if (input2.memberCount >= MAX_MEMBERS)
    return { ok: false, code: "GROUP_FULL", maximum: MAX_MEMBERS };
  if (input2.firstCycleStarted && !input2.memberAddPassed)
    return { ok: false, code: "MEMBER_ADD_VOTE_REQUIRED" };
  return { ok: true };
}
function canAnnounceLeave(status) {
  if (status === "LEAVING") return { ok: false, code: "ALREADY_LEAVING" };
  if (status !== "ACTIVE") return { ok: false, code: "NOT_ACTIVE_MEMBER" };
  return { ok: true };
}

// ../../packages/rules/src/registry/texts-definitions.ts
function entry(id, title, en, fr, topics) {
  const section = id.startsWith("R") ? id.split(".")[0] : "3";
  return { id, section, title, text: { fr, en }, topics };
}
var GENERAL = { fr: "D\xE9finitions et conventions", en: "Definitions and conventions" };
var DEFINITIONS = [
  entry(
    "3.1",
    GENERAL,
    "Group (njangi): members, a rule set, and a sequence of cycles. Cycle: a sequence of rounds in which every active member is beneficiary exactly once. Round: a period with a payment deadline (dueAt) and a payout time (payoutAt). Beneficiary: the member who receives the round's contributions. Pot: all contributions for a round; contributions always go to that round's beneficiary, even when paid late. General fund: group money from fines, loan interest and winning bids, used for loans and shared at cycle end. Solidarity fund: separate group money for members' life events, paid out by vote. Payable: money the group holds for a member (unwithdrawn payout, refund, fund share), reserved for that member only. Receivable (debt): money a member owes the general fund (fine, loan, winning bid). Eligible voters: active members at the moment a proposal is created, minus any exclusions for that proposal type.",
    "Groupe (njangi) : des membres, un ensemble de r\xE8gles et une suite de cycles. Cycle : une suite de tours o\xF9 chaque membre actif est b\xE9n\xE9ficiaire exactement une fois. Tour : une p\xE9riode avec une date limite de paiement (dueAt) et une heure de versement (payoutAt). B\xE9n\xE9ficiaire : le membre qui re\xE7oit les cotisations du tour. Cagnotte : toutes les cotisations d'un tour ; elles reviennent toujours au b\xE9n\xE9ficiaire de ce tour, m\xEAme pay\xE9es en retard. Caisse g\xE9n\xE9rale : l'argent du groupe venant des amendes, des int\xE9r\xEAts des pr\xEAts et des ench\xE8res gagnantes, utilis\xE9 pour les pr\xEAts et partag\xE9 en fin de cycle. Caisse de secours : un argent s\xE9par\xE9 du groupe pour les \xE9v\xE9nements de vie des membres, vers\xE9 par vote. Solde \xE0 retirer : l'argent que le groupe garde pour un membre (versement non retir\xE9, remboursement, part de caisse), r\xE9serv\xE9 \xE0 ce seul membre. Cr\xE9ance (dette) : l'argent qu'un membre doit \xE0 la caisse g\xE9n\xE9rale (amende, pr\xEAt, ench\xE8re gagnante). Votants : les membres actifs au moment o\xF9 une proposition est cr\xE9\xE9e, moins les exclusions pr\xE9vues pour ce type de proposition.",
    [
      "definition",
      "d\xE9finition",
      "glossaire",
      "glossary",
      "cycle",
      "tour",
      "round",
      "beneficiaire",
      "beneficiary",
      "pot",
      "cagnotte",
      "payable",
      "solde",
      "receivable",
      "creance",
      "dette",
      "debt",
      "votants",
      "eligible voters"
    ]
  ),
  entry(
    "3.2",
    GENERAL,
    "Every parameter below is part of the group's rule set. The creator sets the initial values when creating the group; after that, each one changes only through a RULE_CHANGE vote (R11). contributionAmount: default 10 000 FCFA, 500 to 1 000 000. solidarityContribution: 1 000 FCFA per round (0 turns the solidarity fund off), 0 to 50 000. frequency: monthly; weekly, every two weeks or monthly. payoutTime: set at creation (example: last Saturday of the month, 18:00). Payment deadline (dueAt): 24 hours before payoutAt, fixed. lateFine: 1 000 FCFA, 0 to 50 000. rotationMode: FIXED (draw), FIXED or BIDDING. minBid: 500 FCFA, 0 to 1 000 000. loanRatePermille (monthly): 50 (5% per month), 0 to 100. loanMaxMonths: 3, 1 to 6. loanLimitFactor: 1.0, 0 to 3. numberChangeHoldHours: 48, 0 to 168. voteWindowHours: 72, 24 to 168. solidarityVoteWindowHours: 24, 12 to 72. meetingAbsenceFine: 0 (off), 0 to 50 000. distributeFundAtCycleEnd: yes, yes or no. reliabilityWindow: last 12 due payments, 6 to 24.",
    "Chaque param\xE8tre ci-dessous fait partie des r\xE8gles du groupe. Le cr\xE9ateur fixe les valeurs de d\xE9part en cr\xE9ant le groupe ; ensuite, chacun ne change que par un vote RULE_CHANGE (R11). Cotisation (contributionAmount) : 10 000 FCFA par d\xE9faut, de 500 \xE0 1 000 000. Caisse de secours (solidarityContribution) : 1 000 FCFA par tour (0 d\xE9sactive la caisse de secours), de 0 \xE0 50 000. Fr\xE9quence : mensuelle ; hebdomadaire, toutes les deux semaines ou mensuelle. Heure de versement (payoutTime) : fix\xE9e \xE0 la cr\xE9ation (exemple : dernier samedi du mois, 18 h). Date limite de paiement (dueAt) : 24 heures avant le versement, fixe. Amende de retard (lateFine) : 1 000 FCFA, de 0 \xE0 50 000. Mode d'ordre (rotationMode) : FIXED (tirage au sort), FIXED ou BIDDING (ench\xE8re). Ench\xE8re minimale (minBid) : 500 FCFA, de 0 \xE0 1 000 000. Taux du pr\xEAt en pour mille par mois (loanRatePermille) : 50 (5 % par mois), de 0 \xE0 100. Dur\xE9e maximale d'un pr\xEAt (loanMaxMonths) : 3 mois, de 1 \xE0 6. Coefficient de plafond de pr\xEAt (loanLimitFactor) : 1,0, de 0 \xE0 3. Blocage apr\xE8s changement de num\xE9ro (numberChangeHoldHours) : 48 heures, de 0 \xE0 168. Dur\xE9e d'un vote (voteWindowHours) : 72 heures, de 24 \xE0 168. Dur\xE9e d'un vote de secours (solidarityVoteWindowHours) : 24 heures, de 12 \xE0 72. Amende d'absence en r\xE9union (meetingAbsenceFine) : 0 (d\xE9sactiv\xE9e), de 0 \xE0 50 000. Partage de la caisse g\xE9n\xE9rale en fin de cycle (distributeFundAtCycleEnd) : oui, oui ou non. Fen\xEAtre de fiabilit\xE9 (reliabilityWindow) : les 12 derniers paiements dus, de 6 \xE0 24.",
    [
      "parametres",
      "parameters",
      "regles du groupe",
      "rule set",
      "defaut",
      "default",
      "montant de la cotisation",
      "contribution amount",
      "frequence",
      "frequency",
      "heure de versement",
      "payout time",
      "taux",
      "interest rate",
      "plafond",
      "limit",
      "duree du vote",
      "vote window",
      "blocage",
      "hold"
    ]
  ),
  entry(
    "3.3",
    GENERAL,
    "Amounts are integers in FCFA. No floating-point arithmetic anywhere in money code. Proportional splits use the largest remainder method: floor every share, then give the remaining francs one by one to the shares with the largest fractional parts. Ties go in this fixed order: contribution, shortfall, solidarity, debt; then by rotation order for members. Interest is rounded half up to the nearest franc. dueAt and payoutAt are computed in Africa/Douala time and stored in UTC.",
    "Les montants sont des nombres entiers de FCFA. Aucun calcul \xE0 virgule dans le code qui touche \xE0 l'argent. Les r\xE9partitions au prorata utilisent la m\xE9thode des plus forts restes : on arrondit chaque part \xE0 l'entier inf\xE9rieur, puis on donne les francs restants un par un aux parts qui ont les plus grandes d\xE9cimales. En cas d'\xE9galit\xE9, l'ordre est fixe : cotisation, compensation, caisse de secours, dette ; puis l'ordre des tours pour les membres. Les int\xE9r\xEAts sont arrondis au franc le plus proche, la moiti\xE9 vers le haut. La date limite et l'heure de versement sont calcul\xE9es \xE0 l'heure de Douala et enregistr\xE9es en UTC.",
    [
      "arrondi",
      "rounding",
      "plus forts restes",
      "largest remainder",
      "repartition",
      "split",
      "francs",
      "heure de douala",
      "time zone",
      "fuseau",
      "entier",
      "integer"
    ]
  )
];

// ../../packages/rules/src/registry/texts-r1-r3.ts
var R1 = { fr: "Groupe et r\xF4les", en: "Group and roles" };
var R2 = { fr: "Cycles et ordre des tours", en: "Cycles and rotation" };
var R3 = { fr: "Cotisations", en: "Contributions" };
var RULES_R1_R3 = [
  entry(
    "R1.1",
    R1,
    "A group has exactly one admin, initially its creator. It needs at least 3 active members to start a cycle and can have up to 50.",
    "Un groupe a exactement un administrateur, au d\xE9part son cr\xE9ateur. Il faut au moins 3 membres actifs pour d\xE9marrer un cycle, et un groupe peut compter jusqu'\xE0 50 membres.",
    [
      "admin",
      "administrateur",
      "createur",
      "creator",
      "membres",
      "members",
      "taille",
      "size",
      "demarrer",
      "start cycle"
    ]
  ),
  entry(
    "R1.2",
    R1,
    "The admin can: start the first cycle, approve or reject loans (never their own), schedule meetings, mark attendance, publish minutes, post announcements, create invites (founding members, then members approved by vote), and hide abusive chat messages (logged).",
    "L'administrateur peut : d\xE9marrer le premier cycle, approuver ou refuser les pr\xEAts (jamais le sien), planifier les r\xE9unions, noter les pr\xE9sences, publier les proc\xE8s-verbaux, publier des annonces, cr\xE9er des invitations (membres fondateurs, puis membres approuv\xE9s par vote) et masquer les messages abusifs du chat (action journalis\xE9e).",
    [
      "admin",
      "administrateur",
      "pouvoirs",
      "powers",
      "role",
      "approuver",
      "approve",
      "invitation",
      "invite",
      "annonce",
      "announcement",
      "masquer",
      "hide"
    ]
  ),
  entry(
    "R1.3",
    R1,
    "The admin cannot: change rules, move money, change anyone's payment number, see anyone's phone number, edit the ledger, or see anyone's agent conversations.",
    "L'administrateur ne peut pas : changer les r\xE8gles, d\xE9placer de l'argent, changer le num\xE9ro de paiement de quelqu'un, voir le num\xE9ro de t\xE9l\xE9phone de quelqu'un, modifier le registre, ni voir les conversations de quelqu'un avec l'assistant.",
    ["admin", "administrateur", "interdit", "cannot", "limites", "limits", "role"]
  ),
  entry(
    "R1.4",
    R1,
    "The admin changes only through an ADMIN_CHANGE vote (R11).",
    "L'administrateur ne change que par un vote ADMIN_CHANGE (R11).",
    ["admin", "administrateur", "changer admin", "change admin", "admin change"]
  ),
  entry(
    "R1.5",
    R1,
    "Every member who joins sees the group's current rules before accepting and accepts them by joining.",
    "Chaque nouveau membre voit les r\xE8gles actuelles du groupe avant d'accepter, et les accepte en rejoignant le groupe.",
    ["rejoindre", "join", "accepter", "accept", "regles", "rules", "nouveau membre", "new member"]
  ),
  entry(
    "R1.6",
    R1,
    "Before the first cycle starts, the admin invites the founding members directly, without a vote. From the first cycle on, new members join only through a MEMBER_ADD vote (R12.1).",
    "Avant le d\xE9but du premier cycle, l'administrateur invite directement les membres fondateurs, sans vote. \xC0 partir du premier cycle, les nouveaux membres n'entrent que par un vote MEMBER_ADD (R12.1).",
    [
      "fondateurs",
      "founding",
      "invitation",
      "invite",
      "ajouter",
      "add member",
      "nouveau membre",
      "new member"
    ]
  ),
  entry(
    "R2.1",
    R2,
    "A cycle has as many rounds as active members when it starts. Each member is beneficiary exactly once per cycle.",
    "Un cycle compte autant de tours que de membres actifs \xE0 son d\xE9marrage. Chaque membre est b\xE9n\xE9ficiaire exactement une fois par cycle.",
    ["cycle", "tours", "rounds", "beneficiaire", "beneficiary", "nombre de tours"]
  ),
  entry(
    "R2.2",
    R2,
    "Round dates: round k's payoutAt is the cycle's first payout time plus (k \u2212 1) times the frequency. dueAt is 24 hours before payoutAt.",
    "Dates des tours : le versement (payoutAt) du tour k a lieu \xE0 l'heure du premier versement du cycle plus (k \u2212 1) fois la fr\xE9quence. La date limite de paiement (dueAt) est 24 heures avant le versement.",
    [
      "dates",
      "date limite",
      "deadline",
      "echeance",
      "versement",
      "payout",
      "quand",
      "when",
      "frequence",
      "frequency",
      "heure"
    ]
  ),
  entry(
    "R2.3",
    R2,
    'In FIXED mode the order is drawn when the cycle starts, and anyone can verify the draw: seed = SHA-256(groupId + "|" + cycleNumber + "|" + latest ledger hash at draw time). Sort the active membership IDs ascending, then shuffle them with Fisher\u2013Yates: for i from n \u2212 1 down to 1, swap item i with item j, where j = parseInt(SHA-256(seed + "|" + i).slice(0, 12), 16) mod (i + 1). The seed and the resulting order are recorded in an EVENT ledger entry and posted in the chat.',
    `En mode FIXED, l'ordre est tir\xE9 au sort au d\xE9marrage du cycle, et tout le monde peut v\xE9rifier le tirage : graine = SHA-256(groupId + "|" + num\xE9ro du cycle + "|" + dernier hash du registre au moment du tirage). On trie les identifiants des membres actifs par ordre croissant, puis on les m\xE9lange avec Fisher\u2013Yates : pour i de n \u2212 1 jusqu'\xE0 1, on \xE9change l'\xE9l\xE9ment i avec l'\xE9l\xE9ment j, o\xF9 j = parseInt(SHA-256(graine + "|" + i).slice(0, 12), 16) mod (i + 1). La graine et l'ordre obtenu sont enregistr\xE9s dans une \xE9criture EVENT du registre et publi\xE9s dans le chat.`,
    [
      "tirage",
      "draw",
      "ordre",
      "order",
      "rotation",
      "tirage au sort",
      "verifier",
      "verify",
      "graine",
      "seed",
      "mon tour",
      "my turn"
    ]
  ),
  entry(
    "R2.4",
    R2,
    "The order changes only through a ROTATION_CHANGE vote (R11).",
    "L'ordre ne change que par un vote ROTATION_CHANGE (R11).",
    ["ordre", "order", "rotation", "echanger", "swap", "changer ordre", "mon tour", "my turn"]
  ),
  entry(
    "R2.5",
    R2,
    "BIDDING mode is described in R8.",
    "Le mode ench\xE8re (BIDDING) est d\xE9crit dans la r\xE8gle R8.",
    ["enchere", "bidding", "mode"]
  ),
  entry(
    "R3.1",
    R3,
    "When a round opens, every active member, the beneficiary included, owes contributionAmount (CONTRIBUTION obligation) and, if enabled, solidarityContribution (SOLIDARITY obligation).",
    "\xC0 l'ouverture d'un tour, chaque membre actif, b\xE9n\xE9ficiaire compris, doit la cotisation (contributionAmount, obligation CONTRIBUTION) et, si elle est activ\xE9e, la contribution \xE0 la caisse de secours (solidarityContribution, obligation SOLIDARITY).",
    [
      "cotisation",
      "contribution",
      "combien",
      "how much",
      "dois",
      "owe",
      "caisse de secours",
      "solidarity"
    ]
  ),
  entry(
    "R3.2",
    R3,
    "Members pay the exact amounts owed. There are no partial payments of an obligation.",
    "Les membres paient exactement les montants dus. Il n'y a pas de paiement partiel d'une obligation.",
    ["paiement partiel", "partial payment", "montant exact", "exact amount", "payer", "pay"]
  ),
  entry(
    "R3.3",
    R3,
    "A member can pay the current round and any overdue rounds. When several are open, the confirmation card proposes the oldest first, and the member can change it.",
    "Un membre peut payer le tour en cours et tous les tours en retard. Quand plusieurs sont ouverts, la carte de confirmation propose d'abord le plus ancien, et le membre peut changer ce choix.",
    ["retard", "overdue", "plus ancien", "oldest", "payer", "pay", "quel tour", "which round"]
  ),
  entry(
    "R3.4",
    R3,
    "Contribution money for round r always goes to round r's beneficiary, even if paid after the payout.",
    "La cotisation du tour r revient toujours au b\xE9n\xE9ficiaire du tour r, m\xEAme si elle est pay\xE9e apr\xE8s le versement.",
    [
      "retard",
      "late",
      "beneficiaire",
      "beneficiary",
      "cotisation",
      "contribution",
      "apres le versement"
    ]
  ),
  entry(
    "R3.5",
    R3,
    "A payment is on time if its PaymentIntent was created before dueAt and later succeeded, even if the operator confirms it after dueAt.",
    "Un paiement est \xE0 temps si sa demande de paiement a \xE9t\xE9 cr\xE9\xE9e avant la date limite (dueAt) et a ensuite r\xE9ussi, m\xEAme si l'op\xE9rateur le confirme apr\xE8s la date limite.",
    ["a temps", "on time", "retard", "late", "date limite", "deadline", "confirmation"]
  ),
  entry(
    "R3.6",
    R3,
    "Several obligations can be paid together in one Mobile Money request (for example contribution + solidarity + an overdue fine). The member approves once on their phone.",
    "Plusieurs obligations peuvent \xEAtre pay\xE9es ensemble en une seule demande Mobile Money (par exemple cotisation + caisse de secours + une amende en retard). Le membre valide une seule fois sur son t\xE9l\xE9phone.",
    ["ensemble", "together", "plusieurs", "several", "mobile money", "payer", "pay"]
  )
];

// ../../packages/rules/src/registry/texts-r4-r5.ts
var R4 = { fr: "Frais", en: "Fees" };
var R5 = {
  fr: "Versements, r\xE8glement automatique et retraits",
  en: "Payouts, auto-settlement and withdrawals"
};
var RULES_R4_R5 = [
  entry(
    "R4.1",
    R4,
    "Principle: whoever receives the money bears the fee. This is how the beneficiary pays the fees of their round.",
    "Principe : celui qui re\xE7oit l'argent supporte les frais. C'est ainsi que le b\xE9n\xE9ficiaire paie les frais de son tour.",
    ["frais", "fees", "fee", "qui paie", "who pays"]
  ),
  entry(
    "R4.2",
    R4,
    "Collection fee on a payment is split across its parts in proportion to their amounts (largest remainder, 3.3): contribution part: borne by that round's beneficiary; shortfall part (R12.3): borne by the leaver receiving it; solidarity part: borne by the solidarity fund; debt part (fines, loan installments, bids): borne by the general fund. Exception: a correction debt (money already paid out whose payment was reversed) is repaid with the fee on top, so the group gets back exactly what it lost; any difference with the actual fee is absorbed by the general fund.",
    "Les frais de collecte d'un paiement sont r\xE9partis entre ses parts au prorata de leurs montants (plus forts restes, 3.3) : part cotisation : \xE0 la charge du b\xE9n\xE9ficiaire du tour ; part de compensation (R12.3) : \xE0 la charge du membre sortant qui la re\xE7oit ; part caisse de secours : \xE0 la charge de la caisse de secours ; part dette (amendes, \xE9ch\xE9ances de pr\xEAt, ench\xE8res) : \xE0 la charge de la caisse g\xE9n\xE9rale. Exception : une dette de correction (argent d\xE9j\xE0 vers\xE9 dont le paiement a \xE9t\xE9 annul\xE9) se rembourse frais compris, pour que le groupe r\xE9cup\xE8re exactement ce qu'il a perdu ; tout \xE9cart avec les frais r\xE9els est absorb\xE9 par la caisse g\xE9n\xE9rale.",
    ["frais", "fees", "frais de collecte", "collection fee", "repartition", "split"]
  ),
  entry(
    "R4.3",
    R4,
    "Disbursement fee is borne by the person receiving the disbursement. The amount plus the estimated fee must fit in what is available, and is set aside in the ledger as soon as the money is sent. If the actual fee differs from the estimate, the difference is absorbed by the general fund and shown in the entry that records the operator's confirmation. If the operator later cancels a completed payout, the money goes back where it came from; any fee the operator keeps is borne by the general fund.",
    "Les frais d'envoi sont \xE0 la charge de la personne qui re\xE7oit l'argent. Le montant plus les frais estim\xE9s doivent tenir dans ce qui est disponible, et sont mis de c\xF4t\xE9 dans le registre d\xE8s l'envoi de l'argent. Si les frais r\xE9els diff\xE8rent de l'estimation, la diff\xE9rence est absorb\xE9e par la caisse g\xE9n\xE9rale et appara\xEEt dans l'\xE9criture qui enregistre la confirmation de l'op\xE9rateur. Si l'op\xE9rateur annule plus tard un envoi d\xE9j\xE0 confirm\xE9, l'argent retourne d'o\xF9 il venait ; les frais que l'op\xE9rateur garde sont \xE0 la charge de la caisse g\xE9n\xE9rale.",
    [
      "frais",
      "fees",
      "frais de retrait",
      "withdrawal fee",
      "frais envoi",
      "disbursement fee",
      "estimation",
      "estimate"
    ]
  ),
  entry(
    "R4.4",
    R4,
    "Fees come from the provider's response when available, otherwise from the configured fee schedule. Each ledger entry records which.",
    "Les frais viennent de la r\xE9ponse du prestataire de paiement quand elle les donne, sinon du bar\xE8me configur\xE9. Chaque \xE9criture du registre indique leur origine.",
    ["frais", "fees", "bareme", "fee schedule", "operateur", "provider"]
  ),
  entry(
    "R4.5",
    R4,
    "Members are debited exactly the amount shown on the confirmation card, never a fee on top. The app MUST NOT go live with a provider whose fee model breaks this.",
    "Les membres sont d\xE9bit\xE9s exactement du montant affich\xE9 sur la carte de confirmation, jamais de frais en plus. L'application ne doit pas \xEAtre mise en service avec un prestataire dont le mod\xE8le de frais ne respecte pas cette r\xE8gle.",
    ["frais", "fees", "debite", "charged", "montant affiche", "confirmation card"]
  ),
  entry(
    "R5.1",
    R5,
    "Each confirmed contribution for round r immediately credits the beneficiary's payable with its net amount (amount minus its fee share).",
    "Chaque cotisation confirm\xE9e pour le tour r cr\xE9dite imm\xE9diatement le solde du b\xE9n\xE9ficiaire de son montant net (montant moins sa part de frais).",
    ["versement", "payout", "credit", "solde", "balance", "net", "beneficiaire", "beneficiary"]
  ),
  entry(
    "R5.2",
    R5,
    "Credits for round r are locked until round r's payoutAt. From then on they can be withdrawn. Contributions that arrive after payoutAt can be withdrawn as soon as they arrive.",
    "Les cr\xE9dits du tour r sont bloqu\xE9s jusqu'au versement du tour r (payoutAt). Ensuite, ils peuvent \xEAtre retir\xE9s. Les cotisations qui arrivent apr\xE8s le versement peuvent \xEAtre retir\xE9es d\xE8s leur arriv\xE9e.",
    [
      "bloque",
      "locked",
      "versement",
      "payout",
      "quand retirer",
      "when withdraw",
      "retrait",
      "withdrawal"
    ]
  ),
  entry(
    "R5.3",
    R5,
    "Auto-settlement. At payoutAt, and whenever a member's payable is credited (locked or not), the member's debts that are due are paid from the payable first, oldest first: winning bid, fines, due or overdue loan installments. Installments that are not yet due are never taken. Debts are taken whole: if the next one is larger than what is left, nothing more is taken, and an amount equal to the debts still due stays unavailable for withdrawal until they are covered.",
    "R\xE8glement automatique. Au versement, et chaque fois que le solde d'un membre est cr\xE9dit\xE9 (bloqu\xE9 ou non), ses dettes \xE9chues sont d'abord pay\xE9es avec ce solde, de la plus ancienne \xE0 la plus r\xE9cente : ench\xE8re gagnante, amendes, \xE9ch\xE9ances de pr\xEAt \xE9chues ou en retard. Les \xE9ch\xE9ances pas encore \xE9chues ne sont jamais pr\xE9lev\xE9es. Les dettes sont prises en entier : si la suivante d\xE9passe ce qui reste, rien de plus n'est pris, et un montant \xE9gal aux dettes encore dues reste indisponible au retrait jusqu'\xE0 ce qu'elles soient couvertes.",
    [
      "reglement automatique",
      "auto settlement",
      "deduction",
      "prelevement",
      "dettes",
      "debts",
      "versement",
      "payout",
      "pourquoi moins",
      "why less"
    ]
  ),
  entry(
    "R5.4",
    R5,
    'A withdrawal can only be made by the member, only to their own active payment number, for any amount from 100 FCFA up to what is available (2.5, "Available to withdraw"). Partial withdrawals are allowed. One withdrawal at a time per member. A withdrawal in progress appears at once in the ledger as money on its way; if the operator fails, it comes back to the payable of the member and due debts are taken from it first.',
    "Seul le membre peut faire un retrait, uniquement vers son propre num\xE9ro de paiement actif, pour tout montant de 100 FCFA jusqu'\xE0 ce qui est disponible (2.5, \xAB disponible au retrait \xBB). Les retraits partiels sont permis. Un seul retrait \xE0 la fois par membre. Un retrait en cours appara\xEEt aussit\xF4t dans le registre comme de l'argent en route ; si l'op\xE9rateur \xE9choue, il revient sur le solde du membre et les dettes \xE9chues y sont d'abord pr\xE9lev\xE9es.",
    [
      "retrait",
      "retirer",
      "withdraw",
      "withdrawal",
      "minimum",
      "disponible",
      "available",
      "retrait partiel",
      "partial"
    ]
  ),
  entry(
    "R5.5",
    R5,
    "Withdrawals are blocked when: the member's payment number changed or their PIN was reset less than numberChangeHoldHours ago (R13.5); the daily reconciliation is in ALERT state, which includes the money held at the operator no longer covering what is reserved for members, round pots, the solidarity fund and payouts on their way. All withdrawals in the group pause until the problem is resolved (for reserved money, as soon as it is covered again), and every member is told why.",
    "Les retraits sont bloqu\xE9s quand : le num\xE9ro de paiement du membre a chang\xE9 ou son PIN a \xE9t\xE9 r\xE9initialis\xE9 il y a moins de numberChangeHoldHours (R13.5) ; la v\xE9rification quotidienne est en \xE9tat ALERTE, ce qui comprend le cas o\xF9 l'argent d\xE9tenu chez l'op\xE9rateur ne couvre plus ce qui est r\xE9serv\xE9 aux membres, aux cagnottes des tours, \xE0 la caisse de secours et aux versements en route. Tous les retraits du groupe sont alors suspendus jusqu'\xE0 la r\xE9solution du probl\xE8me (pour l'argent r\xE9serv\xE9, d\xE8s qu'il est de nouveau couvert), et chaque membre est inform\xE9 de la raison.",
    [
      "retrait bloque",
      "withdrawal blocked",
      "blocage",
      "hold",
      "alerte",
      "alert",
      "verification",
      "reconciliation",
      "retrait",
      "withdrawal"
    ]
  ),
  entry(
    "R5.6",
    R5,
    "Money left in a payable stays reserved for that member. It is never lent and never used for anything else.",
    "L'argent laiss\xE9 sur le solde d'un membre lui reste r\xE9serv\xE9. Il n'est jamais pr\xEAt\xE9 ni utilis\xE9 \xE0 autre chose.",
    ["reserve", "reserved", "solde", "balance", "securite", "safe", "argent garde"]
  )
];

// ../../packages/rules/src/registry/texts-r6-r10.ts
var R6 = { fr: "Amendes", en: "Fines" };
var R7 = { fr: "Pr\xEAts", en: "Loans" };
var R8 = { fr: "Mode ench\xE8re", en: "Bidding mode (ench\xE8re)" };
var R9 = {
  fr: "Caisse g\xE9n\xE9rale et partage en fin de cycle",
  en: "General fund and end-of-cycle distribution"
};
var R10 = { fr: "Caisse de secours", en: "Solidarity fund (caisse de secours)" };
var RULES_R6_R10 = [
  entry(
    "R6.1",
    R6,
    "At dueAt, every member who still has an unpaid CONTRIBUTION or SOLIDARITY obligation for the round (with no on-time PaymentIntent in progress, R3.5) gets one fine of lateFine. One fine per member per round, however many of their obligations are late.",
    "\xC0 la date limite (dueAt), chaque membre qui a encore une obligation CONTRIBUTION ou SOLIDARITY impay\xE9e pour le tour (sans demande de paiement \xE0 temps en cours, R3.5) re\xE7oit une amende de lateFine. Une seule amende par membre et par tour, quel que soit le nombre de ses obligations en retard.",
    [
      "amende",
      "fine",
      "retard",
      "late",
      "pourquoi amende",
      "why fine",
      "penalite",
      "penalty",
      "date limite",
      "deadline"
    ]
  ),
  entry(
    "R6.2",
    R6,
    "A loan installment unpaid at its dueAt gets one fine of lateFine. Exception: if the borrower is that round's beneficiary and their locked payout for the round already covers the installment, there is no fine; it is settled at payoutAt (R5.3).",
    "Une \xE9ch\xE9ance de pr\xEAt impay\xE9e \xE0 sa date limite re\xE7oit une amende de lateFine. Exception : si l'emprunteur est le b\xE9n\xE9ficiaire de ce tour et que son versement bloqu\xE9 pour le tour couvre d\xE9j\xE0 l'\xE9ch\xE9ance, il n'y a pas d'amende ; elle est r\xE9gl\xE9e au versement (R5.3).",
    ["amende", "fine", "echeance", "installment", "pret", "loan", "retard", "late"]
  ),
  entry(
    "R6.3",
    R6,
    "If meetingAbsenceFine is above zero, members marked absent without an excuse sent before the meeting starts get that fine when the meeting closes.",
    "Si meetingAbsenceFine est sup\xE9rieur \xE0 z\xE9ro, les membres not\xE9s absents sans excuse envoy\xE9e avant le d\xE9but de la r\xE9union re\xE7oivent cette amende \xE0 la cl\xF4ture de la r\xE9union.",
    ["amende", "fine", "absence", "absent", "reunion", "meeting", "excuse"]
  ),
  entry(
    "R6.4",
    R6,
    "Fines go to the general fund. A fine can only be cancelled through a FINE_WAIVER vote.",
    "Les amendes vont \xE0 la caisse g\xE9n\xE9rale. Une amende ne peut \xEAtre annul\xE9e que par un vote FINE_WAIVER.",
    [
      "amende",
      "fine",
      "annuler amende",
      "cancel fine",
      "waiver",
      "caisse generale",
      "general fund"
    ]
  ),
  entry(
    "R7.1",
    R7,
    "Eligible: an active member who is not leaving, has no active loan and has no overdue debt.",
    "Peut emprunter : un membre actif qui ne quitte pas le groupe, sans pr\xEAt en cours et sans dette en retard.",
    ["pret", "loan", "emprunter", "borrow", "eligible", "droit", "qui peut"]
  ),
  entry(
    "R7.2",
    R7,
    "Limit = the smaller of: loanLimitFactor \xD7 contributions the member has paid in the current cycle \u2212 principal still outstanding; available for loans (2.5).",
    "Plafond = le plus petit de : loanLimitFactor \xD7 cotisations pay\xE9es par le membre dans le cycle en cours \u2212 capital encore d\xFB ; le disponible pour les pr\xEAts (2.5).",
    [
      "pret",
      "loan",
      "plafond",
      "limit",
      "combien emprunter",
      "how much borrow",
      "maximum",
      "emprunter",
      "borrow"
    ]
  ),
  entry(
    "R7.3",
    R7,
    "Terms: principal P for T months (1 to loanMaxMonths). Interest I = round half up (P \xD7 loanRatePermille / 1000 \xD7 T). The estimated disbursement fee is added. Total due = P + I + fee. It is repaid in T installments of floor(total / T), the last one taking the remainder, due at the dueAt of the next T rounds in a monthly group; in a weekly or two-weekly group, installment k is due at the first round dueAt on or after the approval date plus k months. An installment that falls after the end of the cycle is due at a round of the next cycle: it gets its date when that cycle starts.",
    "Conditions : un capital P sur T mois (de 1 \xE0 loanMaxMonths). Int\xE9r\xEAts I = arrondi, la moiti\xE9 vers le haut, de (P \xD7 loanRatePermille / 1000 \xD7 T). Les frais d'envoi estim\xE9s s'ajoutent. Total d\xFB = P + I + frais. Il est rembours\xE9 en T \xE9ch\xE9ances de l'entier inf\xE9rieur de (total / T), la derni\xE8re prenant le reste, dues \xE0 la date limite des T tours suivants dans un groupe mensuel ; dans un groupe hebdomadaire ou \xE0 quinzaine, l'\xE9ch\xE9ance k est due \xE0 la premi\xE8re date limite de tour qui tombe au plus t\xF4t \xE0 la date d'approbation plus k mois. Une \xE9ch\xE9ance qui tombe apr\xE8s la fin du cycle est due \xE0 un tour du cycle suivant : elle re\xE7oit sa date quand ce cycle commence.",
    [
      "pret",
      "loan",
      "interets",
      "interest",
      "taux",
      "rate",
      "echeances",
      "installments",
      "remboursement",
      "repayment",
      "conditions",
      "terms",
      "mois",
      "months"
    ]
  ),
  entry(
    "R7.4",
    R7,
    "The admin approves or rejects with a reason. The approval card shows the member's reliability score and debts. A request from the admin goes to an ADMIN_LOAN vote instead (the admin can't vote on it). Requests not decided within 72 hours expire.",
    "L'administrateur approuve ou refuse avec une raison. La carte d'approbation montre le score de fiabilit\xE9 et les dettes du membre. Une demande de l'administrateur passe plut\xF4t par un vote ADMIN_LOAN (l'administrateur ne peut pas y voter). Les demandes non d\xE9cid\xE9es en 72 heures expirent.",
    [
      "pret",
      "loan",
      "approbation",
      "approval",
      "admin",
      "refus",
      "reject",
      "expire",
      "pret admin",
      "admin loan"
    ]
  ),
  entry(
    "R7.5",
    R7,
    "The principal is sent to the borrower's payment number (hold rules R5.5 apply).",
    "Le capital est envoy\xE9 au num\xE9ro de paiement de l'emprunteur (les r\xE8gles de blocage R5.5 s'appliquent).",
    ["pret", "loan", "envoi", "disbursement", "numero", "number", "blocage", "hold"]
  ),
  entry(
    "R7.6",
    R7,
    "Installments are paid like contributions, by request, or are taken by auto-settlement (R5.3).",
    "Les \xE9ch\xE9ances se paient comme les cotisations, par demande de paiement, ou sont pr\xE9lev\xE9es par le r\xE8glement automatique (R5.3).",
    ["echeance", "installment", "rembourser", "repay", "pret", "loan"]
  ),
  entry(
    "R7.7",
    R7,
    "Repaying early is allowed. Interest is fixed at approval and does not change.",
    "Le remboursement anticip\xE9 est permis. Les int\xE9r\xEAts sont fix\xE9s \xE0 l'approbation et ne changent pas.",
    [
      "remboursement anticipe",
      "early repayment",
      "rembourser",
      "repay",
      "interets",
      "interest",
      "pret",
      "loan"
    ]
  ),
  entry(
    "R7.8",
    R7,
    "A loan still unpaid at the end of the cycle stays as debt into the next cycle. The member is not eligible for the fund distribution (R9.3) while it is unpaid.",
    "Un pr\xEAt encore impay\xE9 \xE0 la fin du cycle reste une dette dans le cycle suivant. Le membre n'a pas droit au partage de la caisse g\xE9n\xE9rale (R9.3) tant qu'il n'est pas rembours\xE9.",
    ["pret", "loan", "fin de cycle", "cycle end", "dette", "debt", "partage", "distribution"]
  ),
  entry(
    "R8.1",
    R8,
    "BIDDING mode is turned on or off by RULE_CHANGE and applies from the next round: the members not yet served bid for it. Turning it off draws the remaining order among the members not yet served (R2.3 method).",
    "Le mode ench\xE8re s'active ou se d\xE9sactive par un vote RULE_CHANGE et s'applique \xE0 partir du tour suivant : les membres pas encore servis misent pour ce tour. Le d\xE9sactiver tire au sort l'ordre restant parmi les membres pas encore servis (m\xE9thode de R2.3).",
    ["enchere", "bidding", "mode", "activer", "enable"]
  ),
  entry(
    "R8.2",
    R8,
    "For each round, the eligible members are the active members not yet served in this cycle. Each can place one sealed bid of at least minBid, and can raise it until bidding closes. Nobody sees others' bids before the close.",
    "Pour chaque tour, peuvent miser les membres actifs pas encore servis dans ce cycle. Chacun peut placer une ench\xE8re cach\xE9e d'au moins minBid, et peut l'augmenter jusqu'\xE0 la cl\xF4ture. Personne ne voit les ench\xE8res des autres avant la cl\xF4ture.",
    ["enchere", "bid", "miser", "cachee", "sealed", "augmenter", "raise", "minimum"]
  ),
  entry(
    "R8.3",
    R8,
    "Bidding closes at the round's dueAt. The highest bid wins. Between equal bids, the one that reached that amount first wins. If there are no bids, a verifiable draw picks the beneficiary among the eligible members, using the R2.3 method with seed = SHA-256(groupId | cycle | round | latest ledger hash).",
    "Les ench\xE8res se ferment \xE0 la date limite du tour. La plus haute ench\xE8re gagne. Entre deux ench\xE8res \xE9gales, gagne celle qui a atteint ce montant en premier. S'il n'y a aucune ench\xE8re, un tirage v\xE9rifiable d\xE9signe le b\xE9n\xE9ficiaire parmi les membres qui pouvaient miser, avec la m\xE9thode de R2.3 et la graine SHA-256(groupId | cycle | tour | dernier hash du registre).",
    ["enchere", "bid", "gagnant", "winner", "egalite", "tie", "cloture", "close", "tirage", "draw"]
  ),
  entry(
    "R8.4",
    R8,
    "In the last round only one member is eligible; they are the beneficiary without bidding.",
    "Au dernier tour, un seul membre peut encore recevoir ; il est b\xE9n\xE9ficiaire sans ench\xE8re.",
    ["enchere", "bid", "dernier tour", "last round"]
  ),
  entry(
    "R8.5",
    R8,
    "The winning bid becomes a debt to the general fund (BID_ASSESSED) and is taken by auto-settlement at payout.",
    "L'ench\xE8re gagnante devient une dette envers la caisse g\xE9n\xE9rale (BID_ASSESSED) et est pr\xE9lev\xE9e par le r\xE8glement automatique au versement.",
    ["enchere", "bid", "dette", "debt", "caisse generale", "general fund", "prelevement"]
  ),
  entry(
    "R8.6",
    R8,
    "All bids of a round are published after the close.",
    "Toutes les ench\xE8res d'un tour sont publi\xE9es apr\xE8s la cl\xF4ture.",
    ["enchere", "bid", "publiees", "published", "resultats", "results"]
  ),
  entry(
    "R9.1",
    R9,
    "Money in: fines, loan interest, winning bids. Fee differences (R4.3) and fees on debt payments (R4.2) are taken from it.",
    "Entr\xE9es : amendes, int\xE9r\xEAts des pr\xEAts, ench\xE8res gagnantes. Les \xE9carts de frais (R4.3) et les frais sur les paiements de dettes (R4.2) y sont pris.",
    ["caisse generale", "general fund", "entrees", "money in", "fonds"]
  ),
  entry(
    "R9.2",
    R9,
    "Money out: loans, leaver refunds (R12.3), the end-of-cycle distribution. Never round pots or member payables.",
    "Sorties : pr\xEAts, remboursements des membres sortants (R12.3), partage de fin de cycle. Jamais les cagnottes des tours ni les soldes des membres.",
    ["caisse generale", "general fund", "sorties", "money out", "fonds"]
  ),
  entry(
    "R9.3",
    R9,
    "At cycle close, if distributeFundAtCycleEnd is Yes: the distributable amount X is the fund's balance minus debts still owed to it (only money actually collected). X is shared equally among members who were active for the whole cycle and have no outstanding debt. Each share is floor(X / n). The remainder stays in the fund for the next cycle.",
    "\xC0 la cl\xF4ture du cycle, si distributeFundAtCycleEnd vaut Oui : le montant \xE0 partager X est le solde de la caisse g\xE9n\xE9rale moins les dettes encore dues \xE0 la caisse (seulement l'argent r\xE9ellement encaiss\xE9). X est partag\xE9 \xE0 parts \xE9gales entre les membres actifs pendant tout le cycle et sans dette. Chaque part vaut l'entier inf\xE9rieur de (X / n). Le reste demeure dans la caisse pour le cycle suivant.",
    [
      "partage",
      "distribution",
      "fin de cycle",
      "cycle end",
      "caisse generale",
      "general fund",
      "part",
      "share"
    ]
  ),
  entry(
    "R9.4",
    R9,
    "Members who left before the end of the cycle are not included.",
    "Les membres partis avant la fin du cycle ne sont pas inclus.",
    ["partage", "distribution", "depart", "left", "sortant"]
  ),
  entry(
    "R10.1",
    R10,
    "Fed by the solidarityContribution of each member each round.",
    "Aliment\xE9e par la contribution solidarityContribution de chaque membre \xE0 chaque tour.",
    ["caisse de secours", "solidarity fund", "secours", "solidarity", "contribution"]
  ),
  entry(
    "R10.2",
    R10,
    "Any member can request support for themselves or another member, for an event: deuil, naissance, maladie, mariage or autre. The amount can't exceed the fund's balance. A note is optional and visible only to the group.",
    "Tout membre peut demander un soutien pour lui-m\xEAme ou pour un autre membre, pour un \xE9v\xE9nement : deuil, naissance, maladie, mariage ou autre. Le montant ne peut pas d\xE9passer le solde de la caisse. Une note est facultative et visible seulement par le groupe.",
    [
      "caisse de secours",
      "solidarity",
      "soutien",
      "support",
      "demande",
      "request",
      "deuil",
      "naissance",
      "maladie",
      "mariage"
    ]
  ),
  entry(
    "R10.3",
    R10,
    "Requests go to a SOLIDARITY_PAYOUT vote (majority, solidarityVoteWindowHours). If passed, the money is sent to the recipient's payment number; the recipient bears the fee. If a payment that fed the fund is later reversed by the operator after the money was paid out, the most recent recipient owes the missing amount, never more than the payout they received; any rest is owed by the previous recipient, and so on; if none remains, by the member whose payment was reversed.",
    "Les demandes passent par un vote SOLIDARITY_PAYOUT (majorit\xE9, solidarityVoteWindowHours). Si le vote passe, l'argent est envoy\xE9 au num\xE9ro de paiement du b\xE9n\xE9ficiaire du soutien, qui supporte les frais. Si un paiement qui a aliment\xE9 la caisse est ensuite annul\xE9 par l'op\xE9rateur alors que l'argent a d\xE9j\xE0 \xE9t\xE9 vers\xE9, le dernier b\xE9n\xE9ficiaire doit la somme manquante, jamais plus que le soutien re\xE7u ; le reste est d\xFB par le b\xE9n\xE9ficiaire pr\xE9c\xE9dent, et ainsi de suite ; s'il n'en reste aucun, par le membre dont le paiement a \xE9t\xE9 annul\xE9.",
    ["caisse de secours", "solidarity", "vote", "versement", "payout", "frais", "fees"]
  ),
  entry(
    "R10.4",
    R10,
    "The fund's balance and every payout are public in the ledger.",
    "Le solde de la caisse de secours et chaque versement sont publics dans le registre.",
    ["caisse de secours", "solidarity", "solde", "balance", "public", "registre"]
  ),
  entry(
    "R10.5",
    R10,
    "The solidarity fund is not distributed at cycle end; it carries over.",
    "La caisse de secours n'est pas partag\xE9e en fin de cycle ; elle est report\xE9e.",
    ["caisse de secours", "solidarity", "fin de cycle", "cycle end", "report", "carry over"]
  )
];

// ../../packages/rules/src/registry/texts-r11-r15.ts
var R11 = { fr: "Votes et gouvernance", en: "Votes and governance" };
var R12 = {
  fr: "Arriv\xE9e, d\xE9part et exclusion des membres",
  en: "Members joining, leaving, removal"
};
var R13 = { fr: "Num\xE9ros de paiement", en: "Payment numbers" };
var R14 = { fr: "Score de fiabilit\xE9", en: "Reliability score" };
var R15 = { fr: "R\xE9unions", en: "Meetings" };
var RULES_R11_R15 = [
  entry(
    "R11.1",
    R11,
    "Proposal types. RULE_CHANGE: any member, two-thirds, not secret, takes effect from the next round for every parameter: a frequency or payout-time change re-dates the remaining rounds; a switch to bidding lets the members not yet served bid for the next round; a switch to a fixed order draws the remaining order among the members not yet served (R2.3 method, seed recorded). MEMBER_ADD: any member, majority, not secret; the invite is created and the new member is active from the next cycle. MEMBER_REMOVE: any member, majority with the target excluded, secret; settlement per R12.3. ROTATION_CHANGE: any member, majority and every member whose position changes must vote yes, not secret; next round. ADMIN_CHANGE: any member, majority, secret; immediately. EARLY_EXIT: the leaving member, majority with the requester excluded, not secret; settlement per R12.3. ADMIN_LOAN: created by an admin loan request, majority with the admin excluded, not secret; immediately. SOLIDARITY_PAYOUT: any member, majority, not secret; immediately (24 h window). FINE_WAIVER: any member, majority with the fined member excluded, not secret; immediately (REVERSAL). LEDGER_CORRECTION: any member, two-thirds, not secret; immediately (REVERSAL plus corrected entry).",
    "Types de propositions. RULE_CHANGE : tout membre, deux tiers, vote public, s'applique \xE0 partir du tour suivant pour tous les param\xE8tres : un changement de fr\xE9quence ou d'heure de versement redate les tours restants ; le passage aux ench\xE8res permet aux membres pas encore servis de miser pour le tour suivant ; le passage \xE0 un ordre fixe tire au sort l'ordre restant parmi les membres pas encore servis (m\xE9thode de R2.3, graine enregistr\xE9e). MEMBER_ADD : tout membre, majorit\xE9, vote public ; l'invitation est cr\xE9\xE9e et le nouveau membre est actif \xE0 partir du cycle suivant. MEMBER_REMOVE : tout membre, majorit\xE9 sans la personne vis\xE9e, vote secret ; r\xE8glement selon R12.3. ROTATION_CHANGE : tout membre, majorit\xE9 et chaque membre dont la place change doit voter oui, vote public ; au tour suivant. ADMIN_CHANGE : tout membre, majorit\xE9, vote secret ; imm\xE9diatement. EARLY_EXIT : le membre qui part, majorit\xE9 sans le demandeur, vote public ; r\xE8glement selon R12.3. ADMIN_LOAN : cr\xE9\xE9e par une demande de pr\xEAt de l'administrateur, majorit\xE9 sans l'administrateur, vote public ; imm\xE9diatement. SOLIDARITY_PAYOUT : tout membre, majorit\xE9, vote public ; imm\xE9diatement (vote de 24 h). FINE_WAIVER : tout membre, majorit\xE9 sans le membre sanctionn\xE9, vote public ; imm\xE9diatement (\xE9criture d'annulation REVERSAL). LEDGER_CORRECTION : tout membre, deux tiers, vote public ; imm\xE9diatement (annulation REVERSAL plus \xE9criture corrig\xE9e).",
    [
      "vote",
      "proposition",
      "proposal",
      "types",
      "changer une regle",
      "rule change",
      "exclusion",
      "removal",
      "ajouter un membre",
      "add member",
      "admin",
      "secret",
      "quand applique",
      "takes effect"
    ]
  ),
  entry(
    "R11.2",
    R11,
    "Thresholds count against eligible voters, not votes cast. Majority = floor(n / 2) + 1. Two-thirds = ceil(2n / 3).",
    "Les seuils se comptent sur les votants possibles, pas sur les votes exprim\xE9s. Majorit\xE9 = l'entier inf\xE9rieur de (n / 2) + 1. Deux tiers = l'entier sup\xE9rieur de (2n / 3).",
    [
      "seuil",
      "threshold",
      "majorite",
      "majority",
      "deux tiers",
      "two thirds",
      "combien de oui",
      "how many votes",
      "vote"
    ]
  ),
  entry(
    "R11.3",
    R11,
    "A proposal stays open for voteWindowHours (solidarity: solidarityVoteWindowHours). It closes early as soon as the threshold is reached or can no longer be reached.",
    "Une proposition reste ouverte pendant voteWindowHours (caisse de secours : solidarityVoteWindowHours). Elle se ferme plus t\xF4t d\xE8s que le seuil est atteint ou ne peut plus l'\xEAtre.",
    ["vote", "duree", "window", "cloture", "close", "fin du vote", "quand"]
  ),
  entry(
    "R11.4",
    R11,
    "One vote per member, and a vote can't be changed once cast.",
    "Un vote par membre, et un vote ne peut plus \xEAtre chang\xE9 une fois exprim\xE9.",
    ["vote", "changer mon vote", "change my vote", "un vote"]
  ),
  entry(
    "R11.5",
    R11,
    'For secret proposals, the system records that a member voted and adds their choice to a counter; nothing links a choice to a member. While the vote is open, only participation is shown ("6 membres ont vot\xE9"), so nobody can match a change in the totals to a voter. Yes and no totals appear when it closes. Nobody, admin and agent included, can find out how someone voted.',
    "Pour les votes secrets, le syst\xE8me enregistre qu'un membre a vot\xE9 et ajoute son choix \xE0 un compteur ; rien ne relie un choix \xE0 un membre. Tant que le vote est ouvert, seule la participation est affich\xE9e (\xAB 6 membres ont vot\xE9 \xBB), pour que personne ne puisse relier une \xE9volution des totaux \xE0 un votant. Les totaux de oui et de non apparaissent \xE0 la cl\xF4ture. Personne, ni l'administrateur ni l'assistant, ne peut savoir comment quelqu'un a vot\xE9.",
    [
      "vote secret",
      "secret vote",
      "secret",
      "qui a vote",
      "who voted",
      "anonyme",
      "anonymous",
      "participation"
    ]
  ),
  entry(
    "R11.6",
    R11,
    "Only one open RULE_CHANGE per parameter at a time.",
    "Une seule proposition RULE_CHANGE ouverte \xE0 la fois par param\xE8tre.",
    ["changer une regle", "rule change", "proposition", "parametre", "parameter", "en cours"]
  ),
  entry(
    "R11.7",
    R11,
    "Rule values must stay within the allowed ranges (3.2); proposals outside them are refused.",
    "Les valeurs des r\xE8gles doivent rester dans les plages autoris\xE9es (3.2) ; les propositions hors plage sont refus\xE9es.",
    ["changer une regle", "rule change", "plage", "range", "limite", "refuse", "valeur", "value"]
  ),
  entry(
    "R11.8",
    R11,
    "Every result is posted in the chat and recorded as an EVENT in the ledger. Passed proposals are applied automatically.",
    "Chaque r\xE9sultat est publi\xE9 dans le chat et enregistr\xE9 comme EVENT dans le registre. Les propositions adopt\xE9es sont appliqu\xE9es automatiquement.",
    ["resultat", "result", "vote", "applique", "applied", "registre"]
  ),
  entry(
    "R12.1",
    R12,
    "Joining. After a MEMBER_ADD passes, the admin creates the invite (2.10). The new member can read the chat and ledger at once and becomes active, with obligations, from the next cycle.",
    "Arriv\xE9e. Apr\xE8s l'adoption d'un MEMBER_ADD, l'administrateur cr\xE9e l'invitation (2.10). Le nouveau membre peut lire le chat et le registre tout de suite et devient actif, avec ses obligations, \xE0 partir du cycle suivant.",
    ["nouveau membre", "new member", "rejoindre", "join", "invitation", "invite", "ajouter", "add"]
  ),
  entry(
    "R12.2",
    R12,
    "Leaving at cycle end. Any member can announce they will leave at the end of the cycle. They keep all obligations and rights until then, then leave at cycle close.",
    "D\xE9part en fin de cycle. Tout membre peut annoncer qu'il partira \xE0 la fin du cycle. Il garde toutes ses obligations et tous ses droits jusque-l\xE0, puis part \xE0 la cl\xF4ture du cycle.",
    ["quitter", "leave", "depart", "partir", "fin de cycle", "cycle end"]
  ),
  entry(
    "R12.3",
    R12,
    "Leaving mid-cycle (EARLY_EXIT passed) or removal (MEMBER_REMOVE passed). Already served this cycle: the member's contributions for the remaining rounds stay owed to those rounds' beneficiaries. They remain as debts, reminders continue, and any payment goes to those beneficiaries. Not yet served: their future obligations are cancelled and their round is removed, so the cycle has one round fewer. They are refunded R = the contributions they paid this cycle: 1. The general fund pays as much as is available for loans (2.5): LEAVER_REFUND of F = min(R, available). 2. The shortfall R \u2212 F is split equally among the remaining active members (largest remainder, in rotation order) as SHORTFALL_SHARE obligations due at the next round's dueAt. Each payment credits the leaver's payable as it arrives. 3. The leaver's whole remaining loan balance becomes due at the exit, and auto-settlement first takes the debts the leaver still has from the refund and payable, before any withdrawal (R5.3).",
    "D\xE9part en cours de cycle (EARLY_EXIT adopt\xE9) ou exclusion (MEMBER_REMOVE adopt\xE9). D\xE9j\xE0 servi dans ce cycle : ses cotisations pour les tours restants restent dues aux b\xE9n\xE9ficiaires de ces tours. Elles restent des dettes, les rappels continuent, et tout paiement va \xE0 ces b\xE9n\xE9ficiaires. Pas encore servi : ses obligations futures sont annul\xE9es et son tour est supprim\xE9, le cycle compte donc un tour de moins. Il est rembours\xE9 de R = les cotisations qu'il a pay\xE9es dans ce cycle : 1. La caisse g\xE9n\xE9rale paie autant que le disponible pour les pr\xEAts (2.5) : remboursement LEAVER_REFUND de F = min(R, disponible). 2. Le manque R \u2212 F est r\xE9parti \xE0 parts \xE9gales entre les membres actifs restants (plus forts restes, dans l'ordre des tours) en obligations SHORTFALL_SHARE dues \xE0 la date limite du tour suivant. Chaque paiement cr\xE9dite le solde du membre sortant d\xE8s son arriv\xE9e. 3. Tout le solde restant de son pr\xEAt devient d\xFB au d\xE9part, et le r\xE8glement automatique prend d'abord les dettes du membre sortant sur son remboursement et son solde, avant tout retrait (R5.3).",
    [
      "depart",
      "leave",
      "quitter",
      "sortie anticipee",
      "early exit",
      "exclusion",
      "removal",
      "remboursement",
      "refund",
      "compensation",
      "shortfall"
    ]
  ),
  entry(
    "R12.4",
    R12,
    "A member who has left keeps access to their statements and their data export only.",
    "Un membre parti garde seulement l'acc\xE8s \xE0 ses relev\xE9s et \xE0 l'export de ses donn\xE9es.",
    ["parti", "left", "acces", "access", "releve", "statement", "export"]
  ),
  entry(
    "R13.1",
    R13,
    "Each member has one active payment number: MTN or Orange, Cameroon, 9 digits starting with 6, stored as +2376XXXXXXXX. It can differ from the login phone.",
    "Chaque membre a un seul num\xE9ro de paiement actif : MTN ou Orange, au Cameroun, 9 chiffres commen\xE7ant par 6, enregistr\xE9 sous la forme +2376XXXXXXXX. Il peut \xEAtre diff\xE9rent du t\xE9l\xE9phone de connexion.",
    [
      "numero de paiement",
      "payment number",
      "numero",
      "number",
      "mtn",
      "orange",
      "telephone",
      "phone"
    ]
  ),
  entry(
    "R13.2",
    R13,
    "Only the member can change their own number, from the Moi tab or through the agent. No SMS code is needed. The change is confirmed like any Level 2 action: one tap and the member's own app PIN.",
    "Seul le membre peut changer son propre num\xE9ro, depuis l'onglet Moi ou avec l'assistant. Aucun code SMS n'est n\xE9cessaire. Le changement se confirme comme toute action de niveau 2 : une touche et le PIN de l'application du membre.",
    ["changer numero", "change number", "numero de paiement", "payment number", "pin"]
  ),
  entry(
    "R13.3",
    R13,
    "The new number takes effect immediately for all future collections and disbursements in all the member's groups. Operations already in progress keep the old number.",
    "Le nouveau num\xE9ro s'applique tout de suite \xE0 toutes les collectes et tous les envois futurs, dans tous les groupes du membre. Les op\xE9rations d\xE9j\xE0 en cours gardent l'ancien num\xE9ro.",
    ["nouveau numero", "new number", "numero de paiement", "payment number", "en cours"]
  ),
  entry(
    "R13.4",
    R13,
    'Notifications go to the member, to the admin of each of their groups, and as a system message in each group: "Carine a mis \xE0 jour son num\xE9ro de paiement." No digits are shown.',
    "Les notifications vont au membre, \xE0 l'administrateur de chacun de ses groupes, et en message syst\xE8me dans chaque groupe : \xAB Carine a mis \xE0 jour son num\xE9ro de paiement. \xBB Aucun chiffre n'est affich\xE9.",
    ["notification", "numero de paiement", "payment number", "changement", "change"]
  ),
  entry(
    "R13.5",
    R13,
    "Withdrawals, loan disbursements and solidarity payouts to the new number wait numberChangeHoldHours (48 h by default; a group can set 0 by vote). Payments from the member are not affected.",
    "Les retraits, les envois de pr\xEAt et les versements de la caisse de secours vers le nouveau num\xE9ro attendent numberChangeHoldHours (48 h par d\xE9faut ; un groupe peut le mettre \xE0 0 par vote). Les paiements du membre ne sont pas concern\xE9s.",
    [
      "blocage",
      "hold",
      "48 heures",
      "48 hours",
      "retrait bloque",
      "withdrawal blocked",
      "numero de paiement",
      "payment number"
    ]
  ),
  entry(
    "R13.6",
    R13,
    "Old numbers are kept in the member's history for audit, visible only to the member.",
    "Les anciens num\xE9ros sont gard\xE9s dans l'historique du membre pour le contr\xF4le, visibles seulement par le membre.",
    ["ancien numero", "old number", "historique", "history"]
  ),
  entry(
    "R13.7",
    R13,
    "Nobody else, admin included, can set or change a member's number. The agent can only change the number of the member it is talking to.",
    "Personne d'autre, administrateur compris, ne peut d\xE9finir ou changer le num\xE9ro d'un membre. L'assistant ne peut changer que le num\xE9ro du membre avec qui il parle.",
    [
      "numero de paiement",
      "payment number",
      "changer numero",
      "change number",
      "admin",
      "autre membre"
    ]
  ),
  entry(
    "R14.1",
    R14,
    "Score = round(100 \xD7 on-time items / due items) over the member's last reliabilityWindow due items in this group whose due date has passed. An item is a round's contribution (with its solidarity contribution, counted together as one item) or a loan installment.",
    "Score = arrondi de (100 \xD7 \xE9l\xE9ments pay\xE9s \xE0 temps / \xE9l\xE9ments dus) sur les reliabilityWindow derniers \xE9l\xE9ments dus du membre dans ce groupe dont la date limite est pass\xE9e. Un \xE9l\xE9ment est la cotisation d'un tour (avec sa contribution \xE0 la caisse de secours, compt\xE9es ensemble comme un seul \xE9l\xE9ment) ou une \xE9ch\xE9ance de pr\xEAt.",
    ["fiabilite", "reliability", "score", "a temps", "on time"]
  ),
  entry(
    "R14.2",
    R14,
    'With fewer than 3 due items, the member shows "Nouveau membre" instead of a score.',
    "Avec moins de 3 \xE9l\xE9ments dus, le membre affiche \xAB Nouveau membre \xBB \xE0 la place d'un score.",
    ["fiabilite", "reliability", "nouveau membre", "new member", "score"]
  ),
  entry(
    "R14.3",
    R14,
    'The score is visible to all group members with the raw counts ("11 sur 12 \xE0 temps"). Tapping it shows the formula. Nothing else goes into it, and it is never shared with other groups.',
    "Le score est visible par tous les membres du groupe avec les nombres bruts (\xAB 11 sur 12 \xE0 temps \xBB). Le toucher affiche la formule. Rien d'autre n'entre dans ce score, et il n'est jamais partag\xE9 avec d'autres groupes.",
    ["fiabilite", "reliability", "score", "visible", "formule", "formula"]
  ),
  entry(
    "R15.1",
    R15,
    "The admin schedules meetings (date, time, place or link).",
    "L'administrateur planifie les r\xE9unions (date, heure, lieu ou lien).",
    ["reunion", "meeting", "planifier", "schedule"]
  ),
  entry(
    "R15.2",
    R15,
    "24 hours before, the agenda is generated: the round's beneficiary and status, unpaid members, open votes, loan installments due, solidarity requests, and items added by members.",
    "24 heures avant, l'ordre du jour est g\xE9n\xE9r\xE9 : le b\xE9n\xE9ficiaire et l'\xE9tat du tour, les membres qui n'ont pas pay\xE9, les votes ouverts, les \xE9ch\xE9ances de pr\xEAt dues, les demandes de secours et les points ajout\xE9s par les membres.",
    ["ordre du jour", "agenda", "reunion", "meeting"]
  ),
  entry(
    "R15.3",
    R15,
    "Check-in is open from 1 hour before to 2 hours after the start. Members check in themselves, or the admin marks them. Members can send an excuse before the start.",
    "L'\xE9margement est ouvert de 1 heure avant \xE0 2 heures apr\xE8s le d\xE9but. Les membres pointent eux-m\xEAmes leur pr\xE9sence, ou l'administrateur les note. Les membres peuvent envoyer une excuse avant le d\xE9but.",
    ["presence", "check in", "emargement", "excuse", "reunion", "meeting"]
  ),
  entry(
    "R15.4",
    R15,
    "After the meeting, the agent drafts the minutes from the agenda, attendance, votes, payments and events during the meeting, and the admin's typed notes. The admin edits and publishes. Published minutes can't be edited; a correction is published as a new version with a reason. Each publication is recorded as an EVENT with the minutes' hash.",
    "Apr\xE8s la r\xE9union, l'assistant r\xE9dige le proc\xE8s-verbal \xE0 partir de l'ordre du jour, des pr\xE9sences, des votes, des paiements et des \xE9v\xE9nements pendant la r\xE9union, et des notes de l'administrateur. L'administrateur le corrige et le publie. Un proc\xE8s-verbal publi\xE9 ne peut plus \xEAtre modifi\xE9 ; une correction est publi\xE9e comme nouvelle version avec une raison. Chaque publication est enregistr\xE9e comme EVENT avec le hash du proc\xE8s-verbal.",
    ["proces verbal", "minutes", "reunion", "meeting", "publication", "correction"]
  ),
  entry(
    "R15.5",
    R15,
    "Absence fines apply if enabled (R6.3).",
    "Les amendes d'absence s'appliquent si elles sont activ\xE9es (R6.3).",
    ["absence", "amende", "fine", "reunion", "meeting"]
  )
];

// ../../packages/rules/src/registry/registry.ts
var RULE_REGISTRY = [
  ...DEFINITIONS,
  ...RULES_R1_R3,
  ...RULES_R4_R5,
  ...RULES_R6_R10,
  ...RULES_R11_R15
];
var BY_ID = new Map(RULE_REGISTRY.map((r) => [r.id, r]));
var COMBINING_MARKS = new RegExp(
  `[${String.fromCharCode(768)}-${String.fromCharCode(879)}]`,
  "g"
);

// src/dto/notifications.ts
function toNotification(n) {
  return {
    id: n.id,
    groupId: n.groupId,
    category: n.category,
    title: { fr: n.titleFr, en: n.titleEn },
    body: { fr: n.bodyFr, en: n.bodyEn },
    deepLink: n.deepLink,
    readAt: isoOrNull(n.readAt),
    createdAt: iso(n.createdAt)
  };
}
function toMessage(m) {
  const removed = m.deletedAt !== null || m.hiddenByAdminAt !== null;
  const system = bilingualSchema.safeParse(m.systemText);
  return {
    id: m.id,
    groupId: m.groupId,
    kind: m.kind,
    text: removed ? null : m.text,
    systemText: system.success ? system.data : null,
    author: m.author ? { membershipId: m.author.id, name: m.author.user.name } : null,
    createdAt: iso(m.createdAt)
  };
}

// src/jobs/registry.ts
var definitions = /* @__PURE__ */ new Map();
var repeatables = /* @__PURE__ */ new Map();
var NAME = /^[a-z][A-Za-z]*(\.[a-z][A-Za-z]*)+$/;
function registerJob(definition) {
  if (!NAME.test(definition.name)) throw new Error(`Invalid job name ${definition.name}`);
  if (definitions.has(definition.name))
    throw new Error(`Job ${definition.name} is already registered`);
  definitions.set(definition.name, definition);
}
function registerRepeatable(job) {
  if (!definitions.has(job.name)) throw new Error(`Register the processor of ${job.name} first`);
  repeatables.set(job.id, job);
}
function repeatableJobs() {
  return [...repeatables.values()];
}
function getJobDefinition(name) {
  return definitions.get(name);
}

// src/jobs/dispatch.ts
var log2 = componentLogger("jobs");
var scheduler = null;
var running = /* @__PURE__ */ new Set();
function runInBackground(name, fn) {
  const task = new Promise((resolve) => setImmediate(resolve)).then(() => runAsSystem(fn)).catch((error) => log2.error({ err: error, job: name }, "background job failed")).finally(() => running.delete(task));
  running.add(task);
}
async function dispatchJob(name, data, options) {
  const definition = getJobDefinition(name);
  if (!definition) throw new Error(`Unknown job ${name}`);
  const at = options.at ?? clock.now();
  if (scheduler) {
    await scheduler(name, data, at, options.jobId);
    return;
  }
  if (at.getTime() <= clock.nowMs()) {
    runInBackground(name, () => definition.process({ data, name, id: options.jobId }));
  }
}

// src/modules/notifications/notifications.service.ts
async function createNotifications(inputs, effects, db = getPrisma()) {
  for (const input2 of inputs) {
    const row = await db.notification.create({
      data: {
        userId: input2.userId,
        groupId: input2.groupId ?? null,
        category: input2.category,
        titleFr: input2.title.fr,
        titleEn: input2.title.en,
        bodyFr: input2.body.fr,
        bodyEn: input2.body.en,
        deepLink: input2.deepLink ?? null
      }
    });
    effects.add(() => emitToUser(row.userId, "notification.created", toNotification(row)));
    effects.add(
      () => dispatchJob("notifications.push", { notificationId: row.id }, { jobId: `push-${row.id}` })
    );
  }
}

// src/modules/notifications/delivery-rules.ts
function inQuietHours(minute, start, end) {
  if (start === end) return false;
  return start < end ? minute >= start && minute < end : minute >= start || minute < end;
}
function shouldPush(input2) {
  if (input2.category === "SECURITY") return true;
  if (input2.prefs.mutedCategories.includes(input2.category)) return false;
  const local = toDoualaLocal(input2.now);
  return !inQuietHours(
    local.hour * 60 + local.minute,
    input2.prefs.quietStartMinute,
    input2.prefs.quietEndMinute
  );
}

// src/modules/notifications/push-sender.ts
import { randomUUID as randomUUID3 } from "node:crypto";
import Expo from "expo-server-sdk";
function errorCode(e) {
  return e.details?.error ?? "ExpoError";
}
var ExpoPushSender = class {
  expo;
  constructor(accessToken) {
    this.expo = new Expo(accessToken ? { accessToken } : {});
  }
  async send(messages) {
    const results = [];
    const prepared = messages.map((m) => ({
      to: m.to,
      title: m.title,
      body: m.body,
      data: m.data,
      sound: "default",
      priority: "high"
    }));
    for (const chunk of this.expo.chunkPushNotifications(prepared)) {
      try {
        const tickets = await this.expo.sendPushNotificationsAsync(chunk);
        for (const t of tickets)
          results.push(
            t.status === "ok" ? { ok: true, ticketId: t.id } : { ok: false, error: errorCode(t) }
          );
      } catch {
        for (let i = 0; i < chunk.length; i += 1) results.push({ ok: false, error: "SendFailed" });
      }
    }
    return results;
  }
  async receipts(ticketIds) {
    const out = /* @__PURE__ */ new Map();
    for (const chunk of this.expo.chunkPushNotificationReceiptIds([...ticketIds])) {
      try {
        const receipts = await this.expo.getPushNotificationReceiptsAsync(chunk);
        for (const [id, r] of Object.entries(receipts))
          out.set(id, r.status === "ok" ? { ok: true } : { ok: false, error: errorCode(r) });
      } catch {
      }
    }
    return out;
  }
};
var RecordingPushSender = class {
  sent = [];
  /** Tokens the fake service answers with DeviceNotRegistered. */
  unregistered = /* @__PURE__ */ new Set();
  send(messages) {
    this.sent.push(...messages);
    return Promise.resolve(
      messages.map(
        (m) => this.unregistered.has(m.to) ? { ok: false, error: "DeviceNotRegistered" } : { ok: true, ticketId: randomUUID3() }
      )
    );
  }
  receipts(ticketIds) {
    return Promise.resolve(new Map(ticketIds.map((id) => [id, { ok: true }])));
  }
};
var sender;
function getPushSender() {
  sender ??= process.env.NODE_ENV === "test" ? new RecordingPushSender() : new ExpoPushSender(getEnv().EXPO_ACCESS_TOKEN);
  return sender;
}

// src/modules/notifications/push.service.ts
var RECEIPT_DELAY_MS = 15 * 60 * 1e3;
function forget(deviceIds) {
  if (deviceIds.length === 0) return Promise.resolve();
  return getPrisma().device.updateMany({
    where: { id: { in: deviceIds } },
    data: { expoPushToken: null, revokedAt: clock.now() }
  });
}
async function pushNotification(notificationId) {
  const prisma = getPrisma();
  const claimed = await prisma.notification.updateMany({
    where: { id: notificationId, pushStatus: "NOT_SENT", pushTickets: { none: {} } },
    data: { pushStatus: "QUEUED" }
  });
  if (claimed.count !== 1) return "NOT_SENT";
  const n = await prisma.notification.findUniqueOrThrow({
    where: { id: notificationId },
    include: {
      user: {
        select: {
          language: true,
          deletedAt: true,
          notificationPrefs: true,
          devices: {
            where: { revokedAt: null, expoPushToken: { not: null } },
            select: { id: true, expoPushToken: true }
          }
        }
      }
    }
  });
  const prefs = n.user.notificationPrefs ?? {
    mutedCategories: [],
    quietStartMinute: 1260,
    quietEndMinute: 420
  };
  const devices = n.user.devices;
  if (n.user.deletedAt || devices.length === 0 || !shouldPush({ category: n.category, prefs, now: clock.now() })) {
    await prisma.notification.update({ where: { id: n.id }, data: { pushStatus: "NOT_SENT" } });
    return "NOT_SENT";
  }
  const fr = n.user.language === "fr";
  const results = await getPushSender().send(
    devices.map((d) => ({
      to: d.expoPushToken,
      title: fr ? n.titleFr : n.titleEn,
      body: fr ? n.bodyFr : n.bodyEn,
      data: { notificationId: n.id, deepLink: n.deepLink }
    }))
  );
  await prisma.pushTicket.createMany({
    data: results.map((r, i) => ({
      notificationId: n.id,
      deviceId: devices[i].id,
      status: r.ok ? "OK" : "ERROR",
      ticketId: r.ok ? r.ticketId : null,
      error: r.ok ? null : r.error
    }))
  });
  await forget(
    results.flatMap((r, i) => !r.ok && r.error === "DeviceNotRegistered" ? [devices[i].id] : [])
  );
  const sent = results.some((r) => r.ok);
  await prisma.notification.update({
    where: { id: n.id },
    data: {
      pushStatus: sent ? "SENT" : "FAILED",
      pushTicketId: results.find((r) => r.ok && "ticketId" in r)?.ticketId ?? null
    }
  });
  return sent ? "SENT" : "FAILED";
}
async function checkPushReceipts(now = clock.now()) {
  const prisma = getPrisma();
  const tickets = await prisma.pushTicket.findMany({
    where: {
      status: "OK",
      checkedAt: null,
      ticketId: { not: null },
      createdAt: { lte: new Date(now.getTime() - RECEIPT_DELAY_MS) }
    },
    select: { id: true, ticketId: true, deviceId: true, notificationId: true },
    take: 1e3
  });
  if (tickets.length === 0) return 0;
  const receipts = await getPushSender().receipts(tickets.map((t) => t.ticketId));
  const gone = [];
  for (const t of tickets) {
    const r = receipts.get(t.ticketId);
    if (!r) continue;
    await prisma.pushTicket.update({
      where: { id: t.id },
      data: { status: r.ok ? "DELIVERED" : "FAILED", error: r.ok ? null : r.error, checkedAt: now }
    });
    if (r.ok)
      await prisma.notification.update({
        where: { id: t.notificationId },
        data: { pushStatus: "DELIVERED" }
      });
    else if (r.error === "DeviceNotRegistered") gone.push(t.deviceId);
  }
  await forget(gone);
  return receipts.size;
}

// src/modules/notifications/notifications.jobs.ts
var reminderSources = [];
async function sendDueReminders(now = clock.now()) {
  let sent = 0;
  for (const source2 of reminderSources) {
    const reminders = await source2(now);
    const effects = new AfterCommit();
    await createNotifications(reminders, effects);
    await effects.run();
    sent += reminders.length;
  }
  return sent;
}
function registerNotificationJobs() {
  registerJob({
    name: "notifications.push",
    concurrency: 5,
    process: (job) => pushNotification(job.data.notificationId)
  });
  registerJob({ name: "notifications.receipts", process: () => checkPushReceipts() });
  registerRepeatable({
    id: "notifications.receipts.every15",
    name: "notifications.receipts",
    pattern: "*/15 * * * *"
  });
  registerJob({ name: "reminders.send", process: () => sendDueReminders() });
  registerRepeatable({ id: "reminders.hourly", name: "reminders.send", pattern: "0 * * * *" });
}

// src/modules/auth/lockout.ts
import { RateLimiterRes as RateLimiterRes2 } from "rate-limiter-flexible";
var MAX_PIN_ATTEMPTS = 5;
var LOCK_SECONDS = 15 * 60;
var policy = (name) => ({
  name,
  points: MAX_PIN_ATTEMPTS,
  durationSeconds: LOCK_SECONDS,
  blockSeconds: LOCK_SECONDS
});
var loginAttempts = lazyLimiter(policy("login-pin"));
var actionPinAttempts = lazyLimiter(policy("action-pin"));
var resetLinkAttempts = lazyLimiter(policy("reset-link"));

// src/modules/chat/chat.service.ts
async function postSystemMessage(groupId, text, effects, db = getPrisma()) {
  const row = await db.message.create({
    data: { groupId, kind: "SYSTEM", systemText: { fr: text.fr, en: text.en } }
  });
  effects.add(() => emitToGroup(groupId, "message.created", toMessage({ ...row, author: null })));
}

// src/permissions/policies.ts
var GROUP_POLICIES = {
  "group.read": "reader",
  "group.members.read": "reader",
  "group.rules.read": "reader",
  "group.rounds.read": "reader",
  "group.ledger.read": "reader",
  "group.ledger.export": "reader",
  "group.funds.read": "reader",
  "group.proposals.read": "reader",
  "group.loans.read": "reader",
  "group.bids.read": "reader",
  "group.solidarity.read": "reader",
  "group.meetings.read": "reader",
  "group.chat.read": "reader",
  "group.realtime.join": "reader",
  "group.chat.post": "participant",
  "group.media.upload": "participant",
  "group.proposals.create": "participant",
  "group.votes.cast": "participant",
  "group.payments.create": "participant",
  "group.loans.request": "participant",
  "group.bids.place": "participant",
  "group.solidarity.request": "participant",
  "group.meetings.checkIn": "participant",
  "group.meetings.excuse": "participant",
  "group.meetings.agendaAdd": "participant",
  "group.leave": "participant",
  /** Confirming a PIN reset: the admin, or for the admin's own reset two members (D8). */
  "group.pinResets.review": "participant",
  "group.withdrawals.create": "anyMember",
  "group.statements.own": "anyMember",
  "group.invites.create": "admin",
  "group.invites.read": "admin",
  "group.cycles.start": "admin",
  "group.loans.decide": "admin",
  "group.meetings.schedule": "admin",
  "group.meetings.attendanceMark": "admin",
  "group.minutes.draft": "admin",
  "group.minutes.publish": "admin",
  "group.announcements.post": "admin",
  "group.chat.hide": "admin"
};
var OWNER_ACTIONS = [
  "pendingAction.read",
  "pendingAction.confirm",
  "pendingAction.cancel",
  "user.self.read",
  "user.self.update",
  "notification.read",
  "agent.history.read"
];

// src/permissions/can.ts
var ALLOW = { allowed: true };
var deny = (reason2) => ({ allowed: false, reason: reason2 });
var READ_STATUSES = /* @__PURE__ */ new Set(["INVITED", "ACTIVE", "LEAVING"]);
var ACT_STATUSES = /* @__PURE__ */ new Set(["ACTIVE", "LEAVING"]);
var ENDED_STATUSES = /* @__PURE__ */ new Set(["LEFT", "REMOVED"]);
function isOwnerAction(action) {
  return OWNER_ACTIONS.includes(action);
}
function decideGroup(actor, audience, groupStatus) {
  const m = actor.membership;
  if (!m) return deny("NOT_A_MEMBER");
  if (audience === "anyMember") return ALLOW;
  if (ENDED_STATUSES.has(m.status)) return deny("MEMBERSHIP_ENDED");
  if (audience === "reader") return READ_STATUSES.has(m.status) ? ALLOW : deny("NOT_ACTIVE_MEMBER");
  if (groupStatus === "CLOSED") return deny("GROUP_CLOSED");
  if (!ACT_STATUSES.has(m.status)) return deny("NOT_ACTIVE_MEMBER");
  if (audience === "admin" && m.role !== "ADMIN") return deny("ADMIN_ONLY");
  return ALLOW;
}
function can(actor, action, resource) {
  if (isOwnerAction(action)) {
    if (resource.kind !== "owned") return deny("WRONG_RESOURCE");
    return resource.ownerUserId === actor.userId ? ALLOW : deny("NOT_OWNER");
  }
  if (resource.kind !== "group") return deny("WRONG_RESOURCE");
  return decideGroup(actor, GROUP_POLICIES[action], resource.status);
}

// ../../packages/shared/src/i18n/server/groups.ts
var groupErrorTexts = {
  GROUP_NOT_FOUND: {
    fr: "Ce groupe est introuvable, ou tu n\u2019en fais pas partie.",
    en: "This group was not found, or you are not a member."
  },
  MEMBERSHIP_ENDED: {
    fr: "Tu ne fais plus partie de ce groupe. Tu gardes l\u2019acc\xE8s \xE0 tes relev\xE9s et \xE0 l\u2019export de tes donn\xE9es.",
    en: "You are no longer a member of this group. You keep access to your statements and your data export."
  },
  ADMIN_ONLY: {
    fr: "Seul l\u2019admin du groupe peut faire cette action.",
    en: "Only the group admin can do this."
  },
  NOT_ACTIVE_MEMBER: {
    fr: "Tu pourras faire cette action quand tu seras membre actif du groupe, au d\xE9but du prochain cycle.",
    en: "You can do this once you are an active member of the group, from the start of the next cycle."
  },
  GROUP_CLOSED: {
    fr: "Ce groupe est ferm\xE9. Tu peux encore consulter son registre.",
    en: "This group is closed. You can still read its records."
  },
  FIRST_PAYOUT_IN_PAST: {
    fr: "La date du premier versement doit \xEAtre dans le futur. Choisis une date \xE0 venir.",
    en: "The first payout date must be in the future. Choose an upcoming date."
  },
  NOT_LAST_WEEKDAY_OF_MONTH: {
    fr: "Cette date n\u2019est pas le dernier jour de ce type dans le mois. Choisis une autre date ou un autre rep\xE8re mensuel.",
    en: "This date is not the last such weekday of the month. Choose another date or another monthly pattern."
  },
  FIFTH_WEEKDAY_NOT_ALLOWED: {
    fr: "Un 5e jour de la semaine n\u2019existe pas tous les mois. Choisis \xAB dernier jour du mois \xBB ou une date fixe.",
    en: "A 5th weekday does not exist every month. Choose \u201Clast of the month\u201D or a fixed date."
  },
  RULE_VALUE_OUT_OF_RANGE: {
    fr: "La r\xE8gle \xAB {{rule}} \xBB doit \xEAtre comprise entre {{min}} et {{max}}.",
    en: "The rule \u201C{{rule}}\u201D must be between {{min}} and {{max}}."
  },
  RULE_VALUE_INVALID: {
    fr: "La valeur de la r\xE8gle \xAB {{rule}} \xBB n\u2019est pas valable. Corrige-la puis r\xE9essaie.",
    en: "The value of the rule \u201C{{rule}}\u201D is not valid. Fix it and try again."
  },
  RULE_UNKNOWN: {
    fr: "La r\xE8gle \xAB {{rule}} \xBB n\u2019existe pas. Mets l\u2019application \xE0 jour.",
    en: "The rule \u201C{{rule}}\u201D does not exist. Update the app."
  },
  GROUP_FULL: {
    fr: "Le groupe a atteint {{max}} membres, le maximum possible.",
    en: "The group has reached {{max}} members, the maximum."
  },
  PROPOSAL_REQUIRED: {
    fr: "Le premier cycle a commenc\xE9 : un nouveau membre doit d\u2019abord \xEAtre accept\xE9 par un vote. Propose son ajout dans l\u2019onglet Votes.",
    en: "The first cycle has started: a new member must first be accepted by a vote. Propose adding them in the Votes tab."
  },
  PROPOSAL_NOT_PASSED: {
    fr: "Cette proposition n\u2019est pas adopt\xE9e. L\u2019invitation sera possible quand le vote l\u2019aura accept\xE9e.",
    en: "This proposal has not passed. The invite will be possible once the vote accepts it."
  },
  PROPOSAL_PHONE_MISMATCH: {
    fr: "Ce num\xE9ro n\u2019est pas celui de la proposition adopt\xE9e. V\xE9rifie le num\xE9ro de la personne.",
    en: "This number is not the one in the passed proposal. Check the person\u2019s number."
  },
  PROPOSAL_ALREADY_USED: {
    fr: "Cette proposition a d\xE9j\xE0 servi : la personne a rejoint le groupe.",
    en: "This proposal has already been used: the person has joined the group."
  },
  INVITE_ALREADY_PENDING: {
    fr: "Une invitation encore valable existe d\xE9j\xE0 pour cette personne. Attends son expiration avant d\u2019en cr\xE9er une autre.",
    en: "A valid invite already exists for this person. Wait until it expires before creating another one."
  },
  INVITE_NOT_FOUND: {
    fr: "Cette invitation est introuvable. Demande un nouveau lien \xE0 l\u2019admin du groupe.",
    en: "This invite was not found. Ask the group admin for a new link."
  },
  INVITE_EXPIRED: {
    fr: "Cette invitation a expir\xE9. Demande un nouveau lien \xE0 l\u2019admin du groupe.",
    en: "This invite has expired. Ask the group admin for a new link."
  },
  INVITE_USED: {
    fr: "Cette invitation a d\xE9j\xE0 \xE9t\xE9 utilis\xE9e. Demande un nouveau lien \xE0 l\u2019admin si besoin.",
    en: "This invite has already been used. Ask the admin for a new link if needed."
  },
  INVITE_PHONE_MISMATCH: {
    fr: "Ce lien d\u2019invitation est li\xE9 \xE0 un autre num\xE9ro. Utilise le num\xE9ro que l\u2019admin a invit\xE9.",
    en: "This invite link is tied to another number. Use the number the admin invited."
  },
  CYCLE_START_UNAVAILABLE: {
    fr: "Le d\xE9marrage du cycle n\u2019est pas encore disponible. R\xE9essaie apr\xE8s la prochaine mise \xE0 jour.",
    en: "Starting the cycle is not available yet. Try again after the next update."
  },
  CYCLE_ALREADY_STARTED: {
    fr: "Le premier cycle a d\xE9j\xE0 commenc\xE9.",
    en: "The first cycle has already started."
  },
  ALREADY_MEMBER: {
    fr: "Tu fais d\xE9j\xE0 partie de ce groupe.",
    en: "You are already a member of this group."
  }
};
var inviteActionTexts = {
  noteFounding: {
    fr: "{{name}} rejoindra le groupe comme membre fondateur.",
    en: "{{name}} will join the group as a founding member."
  },
  noteNextCycle: {
    fr: "{{name}} pourra lire le groupe d\xE8s son arriv\xE9e et deviendra membre actif au prochain cycle.",
    en: "{{name}} can read the group right away and becomes an active member next cycle."
  },
  noteLink: {
    fr: "Le lien sert une seule fois, pendant 72 h, et seulement avec le num\xE9ro que tu as saisi.",
    en: "The link works once, for 72 hours, and only with the number you entered."
  }
};

// src/permissions/permission-errors.ts
var permissionError = defineErrors({
  GROUP_NOT_FOUND: { status: 404, text: groupErrorTexts.GROUP_NOT_FOUND },
  MEMBERSHIP_ENDED: { status: 403, text: groupErrorTexts.MEMBERSHIP_ENDED },
  NOT_ACTIVE_MEMBER: { status: 403, text: groupErrorTexts.NOT_ACTIVE_MEMBER },
  ADMIN_ONLY: { status: 403, text: groupErrorTexts.ADMIN_ONLY },
  GROUP_CLOSED: { status: 409, text: groupErrorTexts.GROUP_CLOSED },
  NOT_FOUND: { status: 404, text: commonErrorTexts.NOT_FOUND },
  FORBIDDEN: { status: 403, text: commonErrorTexts.FORBIDDEN }
});
function denialToError(reason2) {
  switch (reason2) {
    case "NOT_A_MEMBER":
      return permissionError("GROUP_NOT_FOUND");
    case "MEMBERSHIP_ENDED":
      return permissionError("MEMBERSHIP_ENDED");
    case "NOT_ACTIVE_MEMBER":
      return permissionError("NOT_ACTIVE_MEMBER");
    case "ADMIN_ONLY":
      return permissionError("ADMIN_ONLY");
    case "GROUP_CLOSED":
      return permissionError("GROUP_CLOSED");
    case "NOT_OWNER":
      return permissionError("NOT_FOUND");
    case "WRONG_RESOURCE":
      return permissionError("FORBIDDEN");
  }
}

// src/permissions/group-access.ts
var UUID2 = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
async function loadGroupActor(userId, groupId, db = getPrisma()) {
  if (!UUID2.test(groupId)) return { group: null, actor: { userId, membership: null } };
  const group2 = await db.group.findUnique({
    where: { id: groupId },
    select: {
      id: true,
      name: true,
      status: true,
      memberships: { where: { userId }, select: { id: true, role: true, status: true }, take: 1 }
    }
  });
  if (!group2) return { group: null, actor: { userId, membership: null } };
  const { memberships, ...rest } = group2;
  return { group: rest, actor: { userId, membership: memberships[0] ?? null } };
}
async function authorizeGroup(userId, groupId, action, db = getPrisma()) {
  const { group: group2, actor } = await loadGroupActor(userId, groupId, db);
  if (!group2) throw permissionError("GROUP_NOT_FOUND");
  const decision = can(actor, action, { kind: "group", groupId, status: group2.status });
  if (!decision.allowed) throw denialToError(decision.reason);
  return { group: group2, membership: actor.membership, actor };
}

// ../../packages/shared/src/i18n/server/rulesets.ts
var ruleLabels = {
  contributionAmount: { fr: "montant de la cotisation", en: "contribution amount" },
  solidarityContribution: {
    fr: "contribution \xE0 la caisse de secours",
    en: "solidarity contribution"
  },
  frequency: { fr: "fr\xE9quence des tours", en: "round frequency" },
  payoutTime: { fr: "heure du versement", en: "payout time" },
  lateFine: { fr: "amende de retard", en: "late fine" },
  rotationMode: { fr: "mode de rotation", en: "rotation mode" },
  minBid: { fr: "ench\xE8re minimale", en: "minimum bid" },
  loanRatePermille: { fr: "taux mensuel des pr\xEAts (\u2030)", en: "monthly loan rate (\u2030)" },
  loanMaxMonths: { fr: "dur\xE9e maximale des pr\xEAts (mois)", en: "maximum loan length (months)" },
  // Shown as a factor ("1,5 fois les cotisations"): values go through formatLimitFactor.
  loanLimitFactorPermille: {
    fr: "plafond des pr\xEAts (fois les cotisations)",
    en: "loan limit (times contributions)"
  },
  numberChangeHoldHours: {
    fr: "d\xE9lai de s\xE9curit\xE9 apr\xE8s changement de num\xE9ro (heures)",
    en: "security delay after a number change (hours)"
  },
  voteWindowHours: { fr: "dur\xE9e des votes (heures)", en: "vote length (hours)" },
  solidarityVoteWindowHours: {
    fr: "dur\xE9e des votes de secours (heures)",
    en: "solidarity vote length (hours)"
  },
  meetingAbsenceFine: { fr: "amende d\u2019absence aux r\xE9unions", en: "meeting absence fine" },
  distributeFundAtCycleEnd: {
    fr: "partage de la caisse g\xE9n\xE9rale en fin de cycle",
    en: "general fund shared at cycle end"
  },
  reliabilityWindow: { fr: "p\xE9riode du score de fiabilit\xE9", en: "reliability score window" }
};

// src/modules/rulesets/rulesets.errors.ts
var rulesetError = defineErrors({
  RULE_VALUE_OUT_OF_RANGE: { status: 400, text: groupErrorTexts.RULE_VALUE_OUT_OF_RANGE },
  RULE_VALUE_INVALID: { status: 400, text: groupErrorTexts.RULE_VALUE_INVALID },
  RULE_UNKNOWN: { status: 400, text: groupErrorTexts.RULE_UNKNOWN },
  NOT_LAST_WEEKDAY_OF_MONTH: { status: 400, text: groupErrorTexts.NOT_LAST_WEEKDAY_OF_MONTH },
  FIFTH_WEEKDAY_NOT_ALLOWED: { status: 400, text: groupErrorTexts.FIFTH_WEEKDAY_NOT_ALLOWED },
  FIRST_PAYOUT_IN_PAST: { status: 400, text: groupErrorTexts.FIRST_PAYOUT_IN_PAST }
});
function labelOf(parameter) {
  return Object.prototype.hasOwnProperty.call(ruleLabels, parameter) ? ruleLabels[parameter] : { fr: parameter, en: parameter };
}
function parameterRefusalToError(refusal) {
  const details = { parameter: refusal.parameter };
  switch (refusal.code) {
    case "VALUE_OUT_OF_RANGE":
      return rulesetError("RULE_VALUE_OUT_OF_RANGE", {
        params: { rule: labelOf(refusal.parameter), min: refusal.min, max: refusal.max },
        details: { ...details, min: refusal.min, max: refusal.max }
      });
    case "INVALID_VALUE":
      return rulesetError("RULE_VALUE_INVALID", {
        params: { rule: labelOf(refusal.parameter) },
        details
      });
    case "UNKNOWN_PARAMETER":
      return rulesetError("RULE_UNKNOWN", {
        params: { rule: labelOf(refusal.parameter) },
        details
      });
  }
}

// src/modules/rulesets/rulesets.service.ts
async function createRuleSetVersion(db, input2) {
  const check3 = validateRuleSet(input2.params);
  if (!check3.ok) throw parameterRefusalToError(check3);
  return db.ruleSet.create({
    data: {
      groupId: input2.groupId,
      version: input2.version,
      params: input2.params,
      createdByProposalId: input2.createdByProposalId ?? null
    }
  });
}
async function getCurrentRuleSet(groupId, db = getPrisma()) {
  return db.ruleSet.findFirstOrThrow({ where: { groupId }, orderBy: { version: "desc" } });
}
async function getCurrentParams(groupId, db = getPrisma()) {
  const params = (await getCurrentRuleSet(groupId, db)).params;
  const check3 = validateRuleSet(params);
  if (!check3.ok) throw new Error(`Stored rule set of group ${groupId} is invalid: ${check3.code}`);
  return params;
}

// src/modules/auth/pin-reset.constants.ts
var PIN_RESET_REQUEST_TTL_MS = 24 * 60 * 60 * 1e3;
var PIN_RESET_LINK_WAIT_MS = 24 * 60 * 60 * 1e3;
var PIN_RESET_LINK_TTL_MS = 30 * 60 * 1e3;
var PIN_RESET_OWNER_LINK = "/me/pin-reset";

// src/modules/auth/pin-reset.review.ts
var READABLE = ["INVITED", "ACTIVE", "LEAVING"];
async function isAdminAnywhere(db, userId) {
  const count = await db.membership.count({
    where: {
      userId,
      role: "ADMIN",
      status: { in: ["ACTIVE", "LEAVING"] },
      group: { status: { not: "CLOSED" } }
    }
  });
  return count > 0;
}
async function loadReview(reviewerUserId, groupId, pinResetId, db = getPrisma()) {
  const access = await authorizeGroup(reviewerUserId, groupId, "group.pinResets.review", db);
  const reset = await db.pinReset.findUnique({
    where: { id: pinResetId },
    select: {
      id: true,
      userId: true,
      status: true,
      createdAt: true,
      requestExpiresAt: true,
      user: { select: { name: true } },
      approvals: { where: { groupId }, select: { membershipId: true } }
    }
  });
  if (!reset || reset.status !== "REQUESTED" || reset.requestExpiresAt <= clock.now()) {
    throw authError("PIN_RESET_NOT_FOUND");
  }
  const requester = await db.membership.findUnique({
    where: { groupId_userId: { groupId, userId: reset.userId } },
    select: { id: true, role: true, status: true }
  });
  if (!requester || !READABLE.includes(requester.status)) {
    throw authError("PIN_RESET_NOT_FOUND");
  }
  const requesterIsAdmin = await isAdminAnywhere(db, reset.userId);
  if (reset.userId === reviewerUserId) throw authError("PIN_RESET_NOT_ALLOWED");
  if (!requesterIsAdmin && access.membership.role !== "ADMIN")
    throw authError("PIN_RESET_NOT_ALLOWED");
  return {
    pinResetId: reset.id,
    requesterUserId: reset.userId,
    requesterName: reset.user.name,
    requesterMembershipId: requester.id,
    requestedAt: reset.createdAt,
    requestExpiresAt: reset.requestExpiresAt,
    reviewerMembershipId: access.membership.id,
    needed: requesterIsAdmin ? 2 : 1,
    given: reset.approvals.length,
    confirmedByMe: reset.approvals.some((a) => a.membershipId === access.membership.id)
  };
}

// src/modules/auth/access-tokens.ts
import { jwtVerify, SignJWT } from "jose";
var ACCESS_TOKEN_TTL_SECONDS = 15 * 60;

// src/modules/auth/pin-reset.service.ts
var requestsPerPhone = lazyLimiter({
  name: "pin-reset-request",
  points: 3,
  durationSeconds: 86400
});

// src/modules/auth/auth.service.ts
var signupsPerPhone = lazyLimiter({ name: "signup-phone", points: 5, durationSeconds: 86400 });

// src/modules/auth/pin-reset.actions.ts
import { z as z8 } from "zod";

// src/modules/pending-actions/pending-actions.types.ts
function defineActionHandler(handler2) {
  return handler2;
}

// src/modules/pending-actions/registry.ts
var handlers = /* @__PURE__ */ new Map();
function getActionHandler(type) {
  return handlers.get(type);
}

// ../../packages/shared/src/i18n/server/pending-actions.ts
var pendingActionErrorTexts = {
  ACTION_NOT_FOUND: {
    fr: "Cette action est introuvable. Pr\xE9pare-la \xE0 nouveau.",
    en: "This action was not found. Prepare it again."
  },
  ACTION_EXPIRED: {
    fr: "Cette action a expir\xE9 au bout de 10 minutes. Pr\xE9pare-la \xE0 nouveau.",
    en: "This action expired after 10 minutes. Prepare it again."
  },
  ACTION_ALREADY_CONFIRMED: {
    fr: "Cette action a d\xE9j\xE0 \xE9t\xE9 confirm\xE9e. Son r\xE9sultat s\u2019affiche sur la carte.",
    en: "This action was already confirmed. Its result is shown on the card."
  },
  ACTION_CANCELLED: {
    fr: "Cette action a \xE9t\xE9 annul\xE9e. Pr\xE9pare-la \xE0 nouveau si besoin.",
    en: "This action was cancelled. Prepare it again if needed."
  },
  ACTION_NOT_PENDING: {
    fr: "Cette action n\u2019attend plus de confirmation.",
    en: "This action is no longer waiting for confirmation."
  },
  ACTION_CHANGED: {
    fr: "Les d\xE9tails ont chang\xE9 depuis la pr\xE9paration de cette action. Pr\xE9pare-la \xE0 nouveau pour voir la carte \xE0 jour.",
    en: "The details changed since this action was prepared. Prepare it again to see the updated card."
  },
  ACTION_NOT_ALLOWED_NOW: {
    fr: "Cette action n\u2019est plus possible : {{reason}}",
    en: "This action is no longer possible: {{reason}}"
  }
};

// src/modules/pending-actions/pending-actions.errors.ts
var actionError = defineErrors({
  ACTION_NOT_FOUND: { status: 404, text: pendingActionErrorTexts.ACTION_NOT_FOUND },
  ACTION_EXPIRED: { status: 410, text: pendingActionErrorTexts.ACTION_EXPIRED },
  ACTION_ALREADY_CONFIRMED: { status: 409, text: pendingActionErrorTexts.ACTION_ALREADY_CONFIRMED },
  ACTION_CANCELLED: { status: 409, text: pendingActionErrorTexts.ACTION_CANCELLED },
  ACTION_NOT_PENDING: { status: 409, text: pendingActionErrorTexts.ACTION_NOT_PENDING },
  ACTION_CHANGED: { status: 409, text: pendingActionErrorTexts.ACTION_CHANGED }
});

// src/modules/pending-actions/pending-actions.storage.ts
function isSealed(value) {
  return typeof value === "object" && value !== null && typeof value.sealed === "string";
}
function isConfidential(handler2, args3) {
  return handler2.confidential?.(args3) ?? false;
}
function openAction(row) {
  return {
    ...row,
    args: isSealed(row.args) ? openJson(row.args.sealed) : row.args,
    preview: isSealed(row.preview) ? openJson(row.preview.sealed) : row.preview
  };
}
var HOUR_MS2 = 36e5;
var toHour = (at) => new Date(Math.floor(at.getTime() / HOUR_MS2) * HOUR_MS2);
function redactionFor(type, openedArgs, times) {
  const handler2 = getActionHandler(type);
  if (!handler2 || !isConfidential(handler2, openedArgs)) return {};
  if (!handler2.redacted) throw new Error(`Confidential action ${type} must define redacted()`);
  const redacted = handler2.redacted(openedArgs);
  return {
    args: redacted.args,
    preview: redacted.preview,
    // L1: no result text either; the finished card shows its neutral redacted form only.
    resultSummary: prismaNamespace_exports.DbNull,
    // H1: no record id (a vote receipt) and no instant finer than the hour, so a finished card
    // cannot be matched to a change in a proposal's counters or to a job.
    resultRef: null,
    createdAt: toHour(times.createdAt),
    expiresAt: toHour(times.expiresAt),
    confirmedAt: times.confirmedAt ? toHour(times.confirmedAt) : null,
    completedAt: times.completedAt ? toHour(times.completedAt) : null
  };
}
function redactionForRow(row, changes) {
  return redactionFor(row.type, openAction(row).args, {
    createdAt: row.createdAt,
    expiresAt: row.expiresAt,
    confirmedAt: changes.confirmedAt ?? row.confirmedAt,
    completedAt: changes.completedAt ?? row.completedAt
  });
}

// src/modules/pending-actions/pending-actions.service.ts
var ACTION_TTL_MS = 10 * 60 * 1e3;
function announce(action) {
  emitToUser(action.userId, "pendingAction.updated", toPendingActionUpdate(action));
}
async function reload(id) {
  return openAction(await getPrisma().pendingAction.findUniqueOrThrow({ where: { id } }));
}
async function finish(row, status) {
  const completedAt = clock.now();
  const moved = await getPrisma().pendingAction.updateMany({
    where: { id: row.id, status: "PENDING" },
    data: { status, completedAt, ...redactionForRow(row, { completedAt }) }
  });
  return moved.count === 1;
}
async function expireDuePendingActions(now = clock.now()) {
  const due = await getPrisma().pendingAction.findMany({
    where: { status: "PENDING", expiresAt: { lte: now } },
    take: 500
  });
  let expired = 0;
  for (const row of due) {
    if (await finish(row, "EXPIRED")) {
      expired += 1;
      announce(await reload(row.id));
    }
  }
  return expired;
}

// src/modules/auth/pin-reset.actions.ts
var argsSchema = z8.strictObject({ pinResetId: z8.string().uuid(), groupId: z8.string().uuid() });
function previewOf(review) {
  const name = { name: review.requesterName };
  if (review.needed === 1) {
    return {
      title: ui((c) => c.pinReset.admin.title),
      lines: [],
      total: null,
      notes: [ui((c) => c.pinReset.admin.body, name), ui((c) => c.pinReset.admin.linkBody)],
      confirmLabel: ui((c) => c.pinReset.admin.confirm)
    };
  }
  const count = review.given;
  return {
    title: ui((c) => c.pinReset.members.title),
    lines: [],
    total: null,
    notes: [
      ui((c) => c.pinReset.members.body, name),
      ui(
        (c) => count === 1 ? c.pinReset.members.progress_one : c.pinReset.members.progress_other,
        { count }
      )
    ],
    confirmLabel: ui((c) => c.pinReset.members.confirm)
  };
}
var pinResetApproveHandler = defineActionHandler({
  type: "PIN_RESET_APPROVE",
  level: "L2",
  args: argsSchema,
  async prepare(ctx, args3) {
    const review = await loadReview(ctx.userId, args3.groupId, args3.pinResetId, ctx.db);
    if (review.confirmedByMe) throw authError("PIN_RESET_ALREADY_CONFIRMED");
    return previewOf(review);
  },
  async execute(ctx, args3) {
    await ctx.db.$queryRaw`SELECT "id" FROM "PinReset" WHERE "id" = ${args3.pinResetId}::uuid FOR UPDATE`;
    const review = await loadReview(ctx.userId, args3.groupId, args3.pinResetId, ctx.db);
    if (review.confirmedByMe) throw authError("PIN_RESET_ALREADY_CONFIRMED");
    await ctx.db.pinResetApproval.create({
      data: {
        pinResetId: args3.pinResetId,
        groupId: args3.groupId,
        membershipId: review.reviewerMembershipId
      }
    });
    const given = review.given + 1;
    await audit(
      {
        action: "pin.reset.confirmed",
        actorUserId: ctx.userId,
        groupId: args3.groupId,
        target: `PinReset:${args3.pinResetId}`,
        details: { confirmation: given, needed: review.needed }
      },
      ctx.db
    );
    if (given < review.needed) {
      return {
        outcome: "done",
        resultRef: args3.pinResetId,
        summary: ui((c) => c.pinReset.members.waiting),
        data: { approved: false }
      };
    }
    const token = randomToken(32);
    const linkUsableFrom = new Date(ctx.now.getTime() + PIN_RESET_LINK_WAIT_MS);
    const linkExpiresAt = new Date(linkUsableFrom.getTime() + PIN_RESET_LINK_TTL_MS);
    await ctx.db.pinReset.update({
      where: { id: args3.pinResetId },
      data: {
        status: "APPROVED",
        approvedAt: ctx.now,
        approvedInGroupId: args3.groupId,
        tokenHash: hashLinkToken(token),
        linkExpiresAt
      }
    });
    await audit(
      {
        action: "pin.reset.approved",
        actorUserId: ctx.userId,
        groupId: args3.groupId,
        target: `PinReset:${args3.pinResetId}`
      },
      ctx.db
    );
    await createNotifications(
      [
        {
          userId: review.requesterUserId,
          category: "SECURITY",
          title: authTexts.pinResetOwnerApprovedTitle,
          body: bilingual(authTexts.pinResetOwnerApprovedBody, {
            date: {
              fr: formatDateTime(linkUsableFrom, "fr"),
              en: formatDateTime(linkUsableFrom, "en")
            }
          }),
          deepLink: PIN_RESET_OWNER_LINK
        }
      ],
      ctx.effects,
      ctx.db
    );
    const name = { name: review.requesterName };
    return {
      outcome: "done",
      resultRef: args3.pinResetId,
      summary: review.needed === 1 ? ui((c) => c.pinReset.admin.linkTitle, name) : ui((c) => c.pinReset.members.ready, name),
      data: {
        approved: true,
        link: `${getEnv().PUBLIC_APP_URL ?? getEnv().PUBLIC_BASE_URL}/reset-pin/${token}`,
        linkUsableFrom: linkUsableFrom.toISOString(),
        linkExpiresAt: linkExpiresAt.toISOString()
      }
    };
  }
});

// src/modules/groups/groups.service.ts
var COUNTED_STATUSES = ["INVITED", "ACTIVE", "LEAVING"];
function countMembers(groupId, db = getPrisma()) {
  return db.membership.count({ where: { groupId, status: { in: [...COUNTED_STATUSES] } } });
}

// src/modules/groups/groups.actions.ts
import { z as z21 } from "zod";

// ../../packages/shared/src/contracts/proposals.ts
import { z as z9 } from "zod";
var proposalTypeSchema = z9.enum([
  "RULE_CHANGE",
  "MEMBER_ADD",
  "MEMBER_REMOVE",
  "ROTATION_CHANGE",
  "ADMIN_CHANGE",
  "EARLY_EXIT",
  "ADMIN_LOAN",
  "SOLIDARITY_PAYOUT",
  "FINE_WAIVER",
  "LEDGER_CORRECTION"
]);
var proposalStatusSchema = z9.enum(["OPEN", "PASSED", "REJECTED", "EXPIRED"]);
var thresholdKindSchema = z9.enum(["MAJORITY", "TWO_THIRDS"]);
var voteChoiceSchema = z9.enum(["YES", "NO"]);
var ruleChangesSchema = ruleSetParamsSchema.partial();
var reason = textSchema(500);
var createProposalRequestSchema = z9.discriminatedUnion("type", [
  z9.strictObject({
    type: z9.literal("RULE_CHANGE"),
    changes: ruleChangesSchema,
    reason: reason.optional()
  }),
  z9.strictObject({
    type: z9.literal("MEMBER_ADD"),
    name: nameSchema(),
    /** Used only to bind the later invite; stored as a keyed hash, never shown to anyone. */
    phone: phoneSchema,
    reason: reason.optional()
  }),
  z9.strictObject({ type: z9.literal("MEMBER_REMOVE"), membershipId: uuidSchema, reason }),
  z9.strictObject({
    type: z9.literal("ROTATION_CHANGE"),
    /** Two members whose turns are swapped. */
    swap: z9.tuple([uuidSchema, uuidSchema]),
    reason: reason.optional()
  }),
  z9.strictObject({
    type: z9.literal("ADMIN_CHANGE"),
    membershipId: uuidSchema,
    reason: reason.optional()
  }),
  /** The proposer leaves mid-cycle (R12.3). */
  z9.strictObject({ type: z9.literal("EARLY_EXIT"), reason }),
  /** `fineId` is the FINE obligation to cancel. */
  z9.strictObject({ type: z9.literal("FINE_WAIVER"), fineId: uuidSchema, reason }),
  z9.strictObject({
    type: z9.literal("LEDGER_CORRECTION"),
    seq: z9.number().int().min(1),
    /** What is wrong and what the correct entry should be, in the proposer's words. */
    correction: textSchema(1e3),
    reason
  })
]);
var castVoteRequestSchema = z9.strictObject({ choice: voteChoiceSchema });
var memberRef = z9.strictObject({ membershipId: uuidSchema, name: z9.string() });
var proposalSubjectSchema = z9.discriminatedUnion("type", [
  z9.strictObject({
    type: z9.literal("RULE_CHANGE"),
    changes: z9.array(
      z9.strictObject({
        parameter: z9.string(),
        from: z9.unknown(),
        to: z9.unknown(),
        label: bilingualSchema
      })
    )
  }),
  z9.strictObject({ type: z9.literal("MEMBER_ADD"), inviteeName: z9.string() }),
  z9.strictObject({ type: z9.literal("MEMBER_REMOVE"), member: memberRef }),
  z9.strictObject({ type: z9.literal("ROTATION_CHANGE"), swap: z9.tuple([memberRef, memberRef]) }),
  z9.strictObject({ type: z9.literal("ADMIN_CHANGE"), member: memberRef }),
  z9.strictObject({ type: z9.literal("EARLY_EXIT"), member: memberRef }),
  z9.strictObject({
    type: z9.literal("ADMIN_LOAN"),
    member: memberRef,
    amount: z9.number().int(),
    months: z9.number().int()
  }),
  z9.strictObject({
    type: z9.literal("SOLIDARITY_PAYOUT"),
    recipient: memberRef,
    event: z9.enum(["DEUIL", "NAISSANCE", "MALADIE", "MARIAGE", "AUTRE"]),
    amount: z9.number().int(),
    note: z9.string().nullable()
  }),
  z9.strictObject({
    type: z9.literal("FINE_WAIVER"),
    member: memberRef,
    amount: z9.number().int(),
    roundNumber: z9.number().int().nullable()
  }),
  z9.strictObject({
    type: z9.literal("LEDGER_CORRECTION"),
    seq: z9.number().int(),
    correction: z9.string()
  })
]);
var proposalSchema = z9.strictObject({
  id: uuidSchema,
  groupId: uuidSchema,
  type: proposalTypeSchema,
  status: proposalStatusSchema,
  secret: z9.boolean(),
  /** "Ajouter Hervé Kamga", "Amende de retard : 1 000 → 1 500" (designer copy votes.titles). */
  title: bilingualSchema,
  subject: proposalSubjectSchema,
  reason: z9.string().nullable(),
  proposer: memberRef,
  thresholdKind: thresholdKindSchema,
  requiredYes: z9.number().int(),
  eligibleCount: z9.number().int(),
  /** ROTATION_CHANGE: members whose turn moves; each must vote yes. */
  mustApprove: z9.array(memberRef),
  /** How many eligible members have voted. Always visible. */
  participation: z9.number().int(),
  /** Yes and no totals. Null for a secret proposal until it closes (R11.5). */
  tally: z9.strictObject({ yes: z9.number().int(), no: z9.number().int() }).nullable(),
  /** Who voted what, for non-secret proposals only; always null for a secret one. */
  votes: z9.array(z9.strictObject({ member: memberRef, choice: voteChoiceSchema })).nullable(),
  /** The viewer's own vote; for a secret proposal only that they voted. */
  myVote: z9.enum(["YES", "NO", "VOTED"]).nullable(),
  canVote: z9.boolean(),
  opensAt: instantSchema,
  closesAt: instantSchema,
  closedAt: instantSchema.nullable(),
  effect: bilingualSchema.nullable()
});
var proposalResponseSchema = z9.strictObject({ proposal: proposalSchema });
var proposalListSchema = z9.strictObject({ proposals: z9.array(proposalSchema) });
var proposalListQuerySchema = z9.strictObject({
  status: z9.enum(["OPEN", "CLOSED"]).optional()
});

// src/modules/proposals/proposals.actions.ts
import { z as z19 } from "zod";

// ../../packages/shared/src/i18n/server/proposals.ts
var proposalErrorTexts = {
  PROPOSAL_NOT_FOUND: {
    fr: "Cette proposition est introuvable. Actualise l\u2019onglet Votes.",
    en: "This proposal was not found. Refresh the Votes tab."
  },
  PROPOSALS_BEFORE_FIRST_CYCLE: {
    fr: "Avant le premier cycle, l\u2019admin invite directement les membres fondateurs. Les votes commencent avec le premier cycle.",
    en: "Before the first cycle, the admin invites founding members directly. Votes start with the first cycle."
  },
  PROPOSAL_CLOSED: {
    fr: "Ce vote est termin\xE9. Tu peux voir son r\xE9sultat dans l\u2019onglet Votes.",
    en: "This vote is over. You can see its result in the Votes tab."
  },
  NOT_ELIGIBLE_VOTER: {
    fr: "Tu ne votes pas sur cette proposition : seuls les membres actifs au moment o\xF9 elle a \xE9t\xE9 faite votent.",
    en: "You do not vote on this proposal: only members active when it was made can vote."
  },
  ALREADY_VOTED: {
    fr: "Tu as d\xE9j\xE0 vot\xE9 sur cette proposition. Un vote ne peut pas \xEAtre chang\xE9.",
    en: "You already voted on this proposal. A vote cannot be changed."
  },
  PROPOSAL_TYPE_UNAVAILABLE: {
    fr: "Ce type de proposition n\u2019est pas encore disponible. R\xE9essaie apr\xE8s la prochaine mise \xE0 jour.",
    en: "This kind of proposal is not available yet. Try again after the next update."
  },
  PROPOSAL_ALREADY_OPEN: {
    fr: "Un vote du m\xEAme type est d\xE9j\xE0 ouvert pour ce membre. Attends sa cl\xF4ture.",
    en: "A vote of the same kind is already open for this member. Wait until it closes."
  },
  MEMBER_NOT_FOUND: {
    fr: "Ce membre ne fait pas partie du groupe. V\xE9rifie le nom choisi.",
    en: "This member is not in the group. Check the name you chose."
  },
  CANNOT_TARGET_SELF: {
    fr: "Tu ne peux pas faire cette proposition \xE0 ton sujet. Pour partir, demande un d\xE9part en cours de cycle.",
    en: "You cannot make this proposal about yourself. To leave, ask to leave mid-cycle."
  },
  ADMIN_MUST_CHANGE_FIRST: {
    fr: "Cette personne est l\u2019admin. Propose d\u2019abord un changement d\u2019admin.",
    en: "This person is the admin. First propose a change of admin."
  },
  ALREADY_ADMIN: {
    fr: "Cette personne est d\xE9j\xE0 l\u2019admin du groupe.",
    en: "This person is already the group admin."
  },
  ONLY_ACTIVE_MEMBERS: {
    fr: "Seul un membre actif du groupe peut \xEAtre concern\xE9 par cette proposition.",
    en: "Only an active member of the group can be the subject of this proposal."
  },
  ADMIN_LOAN_NOT_PROPOSABLE: {
    fr: "Le vote sur un pr\xEAt de l\u2019admin s\u2019ouvre tout seul quand l\u2019admin demande un pr\xEAt.",
    en: "The vote on an admin loan opens by itself when the admin asks for a loan."
  },
  RULE_CHANGE_EMPTY: {
    fr: "Choisis au moins une r\xE8gle \xE0 changer.",
    en: "Choose at least one rule to change."
  },
  RULE_CHANGE_NO_CHANGE: {
    fr: "La r\xE8gle \xAB {{rule}} \xBB a d\xE9j\xE0 cette valeur. Choisis une autre valeur.",
    en: "The rule \u201C{{rule}}\u201D already has this value. Choose another value."
  },
  RULE_CHANGE_ALREADY_OPEN: {
    fr: "Un vote est d\xE9j\xE0 ouvert sur la r\xE8gle \xAB {{rule}} \xBB. Attends sa cl\xF4ture.",
    en: "A vote on the rule \u201C{{rule}}\u201D is already open. Wait until it closes."
  },
  ROTATION_NOT_STARTED: {
    fr: "L\u2019ordre des b\xE9n\xE9ficiaires existe \xE0 partir du premier cycle.",
    en: "The order of beneficiaries exists from the first cycle on."
  },
  ROTATION_SAME_MEMBER: {
    fr: "Choisis deux membres diff\xE9rents \xE0 \xE9changer.",
    en: "Choose two different members to swap."
  },
  ROTATION_NOT_IN_ROTATION: {
    fr: "Ce membre n\u2019a pas de tour dans ce cycle.",
    en: "This member has no turn in this cycle."
  },
  ROTATION_ALREADY_SERVED: {
    fr: "Ce membre a d\xE9j\xE0 re\xE7u son tour ou le re\xE7oit maintenant : son tour ne peut plus changer.",
    en: "This member has already had their turn or is having it now: it can no longer change."
  },
  FINE_NOT_FOUND: {
    fr: "Cette amende est introuvable dans ce groupe.",
    en: "This fine was not found in this group."
  },
  FINE_NOT_WAIVABLE: {
    fr: "Cette amende est d\xE9j\xE0 annul\xE9e.",
    en: "This fine is already cancelled."
  },
  LEDGER_ENTRY_NOT_CORRECTABLE: {
    fr: "Cette op\xE9ration du registre ne peut pas \xEAtre corrig\xE9e (introuvable, d\xE9j\xE0 corrig\xE9e, ou simple \xE9v\xE9nement).",
    en: "This ledger entry cannot be corrected (not found, already corrected, or a plain event)."
  },
  RECIPIENT_NOT_MEMBER: {
    fr: "Le soutien ne peut aller qu\u2019\xE0 un membre actif du groupe.",
    en: "Support can only go to an active member of the group."
  },
  SOLIDARITY_ABOVE_FUND: {
    fr: "La caisse de secours n\u2019a que {{balance}} disponibles. Demande un montant plus petit.",
    en: "The solidarity fund only has {{balance}} available. Ask for a smaller amount."
  },
  SOLIDARITY_NOT_ABOVE_FEE: {
    fr: "Le montant doit d\xE9passer les frais d\u2019envoi ({{fee}}).",
    en: "The amount must be more than the transfer fee ({{fee}})."
  },
  ALREADY_LEAVING: {
    fr: "Tu as d\xE9j\xE0 annonc\xE9 ton d\xE9part \xE0 la fin du cycle.",
    en: "You have already announced you are leaving at the end of the cycle."
  }
};
var proposalTexts = {
  openedTitle: { fr: "Nouveau vote", en: "New vote" },
  reminderTitle: { fr: "Vote bient\xF4t clos", en: "Vote closing soon" },
  resultTitle: { fr: "R\xE9sultat d\u2019un vote", en: "Vote result" },
  removedTitle: { fr: "Tu ne fais plus partie du groupe", en: "You are no longer in the group" },
  removedBody: {
    fr: "Le groupe {{group}} a vot\xE9 ton exclusion. Tes relev\xE9s et l\u2019export de tes donn\xE9es restent disponibles.",
    en: "The group {{group}} voted to remove you. Your statements and data export remain available."
  },
  adminTitle: { fr: "Tu es l\u2019admin", en: "You are the admin" },
  adminBody: {
    fr: "Le groupe {{group}} t\u2019a choisi comme admin.",
    en: "The group {{group}} chose you as admin."
  },
  leaveTitle: { fr: "Quitter \xE0 la fin du cycle", en: "Leave at the end of the cycle" },
  effectInviteAllowed: {
    fr: "L\u2019admin peut maintenant inviter {{name}}.",
    en: "The admin can now invite {{name}}."
  },
  /** What a finished secret-vote card shows: the choice is erased from the server (R11.5). */
  secretVoteSealed: { fr: "Vote secret", en: "Secret vote" },
  voteWindow: {
    fr: "Le vote dure {{hours}} h, ou se termine d\xE8s que le r\xE9sultat est certain.",
    en: "The vote lasts {{hours}} hours, or ends as soon as the result is certain."
  },
  /** D20.1: a secret vote always runs its full window. */
  voteWindowSecret: {
    fr: "Le vote dure {{hours}} h. Le r\xE9sultat et les totaux sont publi\xE9s \xE0 la fin.",
    en: "The vote lasts {{hours}} hours. The result and the totals are published at the end."
  },
  /** D20.2: what a lock screen shows about a solidarity request (no event, no note). */
  solidarityOpenedBody: {
    fr: "Nouvelle demande de soutien dans {{group}}",
    en: "New support request in {{group}}"
  },
  solidarityReminderBody: {
    fr: "Le vote sur une demande de soutien dans {{group}} se termine bient\xF4t.",
    en: "The vote on a support request in {{group}} ends soon."
  },
  solidarityResultBody: {
    fr: "Le vote sur une demande de soutien dans {{group}} est termin\xE9.",
    en: "The vote on a support request in {{group}} has ended."
  }
};

// src/modules/proposals/proposals.errors.ts
var proposalError = defineErrors({
  PROPOSAL_NOT_FOUND: { status: 404, text: proposalErrorTexts.PROPOSAL_NOT_FOUND },
  PROPOSALS_BEFORE_FIRST_CYCLE: { status: 409, text: proposalErrorTexts.PROPOSALS_BEFORE_FIRST_CYCLE },
  PROPOSAL_CLOSED: { status: 409, text: proposalErrorTexts.PROPOSAL_CLOSED },
  NOT_ELIGIBLE_VOTER: { status: 403, text: proposalErrorTexts.NOT_ELIGIBLE_VOTER },
  ALREADY_VOTED: { status: 409, text: proposalErrorTexts.ALREADY_VOTED },
  PROPOSAL_TYPE_UNAVAILABLE: { status: 409, text: proposalErrorTexts.PROPOSAL_TYPE_UNAVAILABLE },
  PROPOSAL_ALREADY_OPEN: { status: 409, text: proposalErrorTexts.PROPOSAL_ALREADY_OPEN },
  MEMBER_NOT_FOUND: { status: 404, text: proposalErrorTexts.MEMBER_NOT_FOUND },
  CANNOT_TARGET_SELF: { status: 409, text: proposalErrorTexts.CANNOT_TARGET_SELF },
  ADMIN_MUST_CHANGE_FIRST: { status: 409, text: proposalErrorTexts.ADMIN_MUST_CHANGE_FIRST },
  ALREADY_ADMIN: { status: 409, text: proposalErrorTexts.ALREADY_ADMIN },
  ONLY_ACTIVE_MEMBERS: { status: 409, text: proposalErrorTexts.ONLY_ACTIVE_MEMBERS },
  ADMIN_LOAN_NOT_PROPOSABLE: { status: 409, text: proposalErrorTexts.ADMIN_LOAN_NOT_PROPOSABLE },
  RULE_CHANGE_EMPTY: { status: 400, text: proposalErrorTexts.RULE_CHANGE_EMPTY },
  RULE_CHANGE_NO_CHANGE: { status: 409, text: proposalErrorTexts.RULE_CHANGE_NO_CHANGE },
  RULE_CHANGE_ALREADY_OPEN: { status: 409, text: proposalErrorTexts.RULE_CHANGE_ALREADY_OPEN },
  ROTATION_NOT_STARTED: { status: 409, text: proposalErrorTexts.ROTATION_NOT_STARTED },
  ROTATION_SAME_MEMBER: { status: 400, text: proposalErrorTexts.ROTATION_SAME_MEMBER },
  ROTATION_NOT_IN_ROTATION: { status: 409, text: proposalErrorTexts.ROTATION_NOT_IN_ROTATION },
  ROTATION_ALREADY_SERVED: { status: 409, text: proposalErrorTexts.ROTATION_ALREADY_SERVED },
  FINE_NOT_FOUND: { status: 404, text: proposalErrorTexts.FINE_NOT_FOUND },
  FINE_NOT_WAIVABLE: { status: 409, text: proposalErrorTexts.FINE_NOT_WAIVABLE },
  LEDGER_ENTRY_NOT_CORRECTABLE: { status: 409, text: proposalErrorTexts.LEDGER_ENTRY_NOT_CORRECTABLE },
  RECIPIENT_NOT_MEMBER: { status: 409, text: proposalErrorTexts.RECIPIENT_NOT_MEMBER },
  SOLIDARITY_ABOVE_FUND: { status: 409, text: proposalErrorTexts.SOLIDARITY_ABOVE_FUND },
  SOLIDARITY_NOT_ABOVE_FEE: { status: 409, text: proposalErrorTexts.SOLIDARITY_NOT_ABOVE_FEE },
  ALREADY_LEAVING: { status: 409, text: proposalErrorTexts.ALREADY_LEAVING }
});

// src/modules/proposals/proposals.context.ts
async function memberNames(db, groupId) {
  const all = await db.membership.findMany({
    where: { groupId },
    select: { id: true, user: { select: { name: true } } }
  });
  return new Map(all.map((m) => [m.id, m.user.name]));
}
async function activeMembers(db, groupId) {
  const rows = await db.membership.findMany({
    where: { groupId, status: { in: ["ACTIVE", "LEAVING"] } },
    orderBy: { id: "asc" },
    select: { id: true, userId: true, role: true, status: true, user: { select: { name: true } } }
  });
  return rows.map((m) => ({
    id: m.id,
    userId: m.userId,
    role: m.role,
    status: m.status,
    name: m.user.name
  }));
}
async function planContext(db, userId, groupId, now) {
  const access = await authorizeGroup(userId, groupId, "group.proposals.create", db);
  if (access.group.status === "FORMING") throw proposalError("PROPOSALS_BEFORE_FIRST_CYCLE");
  const [members, names, params] = await Promise.all([
    activeMembers(db, groupId),
    memberNames(db, groupId),
    getCurrentParams(groupId, db)
  ]);
  return {
    db,
    now,
    userId,
    group: access.group,
    proposer: access.membership,
    activeMembers: members,
    names,
    params
  };
}

// src/modules/proposals/proposals.notices.ts
var NEUTRAL = {
  opened: proposalTexts.solidarityOpenedBody,
  reminder: proposalTexts.solidarityReminderBody,
  result: proposalTexts.solidarityResultBody
};
function noticeBody(type, moment, group2, detailed) {
  if (type !== "SOLIDARITY_PAYOUT") return detailed;
  return bilingual(NEUTRAL[moment], { group: group2.name });
}

// src/modules/proposals/types/admin-change.ts
import { z as z11 } from "zod";

// src/modules/proposals/types/definition.ts
function defineProposal(definition) {
  return definition;
}
function nameOf(names, membershipId) {
  return names.get(membershipId) ?? "\u2014";
}
function memberRef2(names, membershipId) {
  return { membershipId, name: nameOf(names, membershipId) };
}
function appliedOn(now) {
  return ui((c) => c.votes.card.effect.immediate, {
    date: { fr: formatDateLong(now, "fr"), en: formatDateLong(now, "en") }
  });
}

// src/modules/members/members.actions.ts
import { z as z10 } from "zod";
var leaveError = defineErrors({
  ALREADY_LEAVING: { status: 409, text: proposalErrorTexts.ALREADY_LEAVING },
  ADMIN_MUST_CHANGE_FIRST: { status: 409, text: proposalErrorTexts.ADMIN_MUST_CHANGE_FIRST },
  NOT_ACTIVE_MEMBER: { status: 403, text: groupErrorTexts.NOT_ACTIVE_MEMBER },
  PROPOSALS_BEFORE_FIRST_CYCLE: {
    status: 409,
    text: proposalErrorTexts.PROPOSALS_BEFORE_FIRST_CYCLE
  }
});
var args = z10.strictObject({ groupId: z10.string().uuid() });
async function check(db, userId, groupId) {
  const access = await authorizeGroup(userId, groupId, "group.leave", db);
  if (access.group.status === "FORMING") throw leaveError("PROPOSALS_BEFORE_FIRST_CYCLE");
  if (access.membership.role === "ADMIN") throw leaveError("ADMIN_MUST_CHANGE_FIRST");
  const allowed = canAnnounceLeave(access.membership.status);
  if (!allowed.ok) throw leaveError(allowed.code);
  return access;
}
var leaveAtCycleEndHandler = defineActionHandler({
  type: "LEAVE_AT_CYCLE_END",
  level: "L1",
  args,
  async prepare(ctx, a) {
    await check(ctx.db, ctx.userId, a.groupId);
    return {
      title: ui((c) => c.confirmation.actions.announceLeave.title),
      lines: [],
      total: null,
      notes: [],
      confirmLabel: ui((c) => c.confirmation.actions.announceLeave.button)
    };
  },
  async execute(ctx, a) {
    const access = await check(ctx.db, ctx.userId, a.groupId);
    await ctx.db.membership.update({
      where: { id: access.membership.id },
      data: { status: "LEAVING" }
    });
    const me = await ctx.db.user.findUniqueOrThrow({
      where: { id: ctx.userId },
      select: { name: true }
    });
    await postSystemMessage(
      a.groupId,
      ui((c) => c.chat.system.memberLeaving, { name: me.name }),
      ctx.effects,
      ctx.db
    );
    await audit(
      {
        action: "member.leaving",
        actorUserId: ctx.userId,
        groupId: a.groupId,
        target: `Membership:${access.membership.id}`
      },
      ctx.db
    );
    return {
      outcome: "done",
      resultRef: access.membership.id,
      summary: ui((c) => c.confirmation.actions.announceLeave.done)
    };
  }
});

// src/modules/members/membership-access.ts
function endMembershipAccess(effects, input2) {
  effects.add(() => leaveGroupRoom(input2.userId, input2.groupId));
}

// src/modules/proposals/governance-ports.ts
var log3 = componentLogger("governance");
var loggingLedgerEvents = {
  appendEvent(_tx, input2) {
    log3.warn(
      { groupId: input2.groupId, event: input2.event.event },
      "ledger EVENT not recorded: no ledger port registered"
    );
    return Promise.resolve();
  }
};
var ledgerEvents = loggingLedgerEvents;
var money = null;
var recorders2 = /* @__PURE__ */ new Set();
var recordingLedgerEvents = {
  appendEvent(tx, input2) {
    for (const recorder of recorders2) recorder.push(input2);
    return ledgerEvents.appendEvent(tx, input2);
  }
};
function ledgerEventsPort() {
  return recorders2.size > 0 ? recordingLedgerEvents : ledgerEvents;
}
function moneyPort() {
  return money;
}

// src/modules/proposals/types/membership-end.ts
async function endMembership(ctx, input2) {
  const member = await ctx.tx.membership.findUniqueOrThrow({
    where: { id: input2.membershipId },
    select: { status: true, userId: true }
  });
  if (member.status === "LEFT" || member.status === "REMOVED") return;
  const settles = member.status === "ACTIVE" || member.status === "LEAVING";
  await ctx.tx.membership.update({
    where: { id: input2.membershipId },
    data: { status: input2.reason === "REMOVED" ? "REMOVED" : "LEFT", leftAt: ctx.now }
  });
  if (settles) {
    await moneyPort()?.settleExit(ctx.tx, {
      groupId: ctx.group.id,
      membershipId: input2.membershipId,
      reason: input2.reason,
      proposalId: ctx.proposal.id
    });
  }
  const name = nameOf(ctx.names, input2.membershipId);
  await ledgerEventsPort().appendEvent(ctx.tx, {
    groupId: ctx.group.id,
    event: { event: "MEMBER_LEFT", membershipId: input2.membershipId, reason: input2.reason },
    description: input2.reason === "REMOVED" ? ui((c) => c.chat.system.memberRemoved, { name }) : ui((c) => c.chat.system.memberLeft, { name }),
    membershipId: input2.membershipId,
    refType: "Proposal",
    refId: ctx.proposal.id,
    occurredAt: ctx.now
  });
  await postSystemMessage(
    ctx.group.id,
    input2.reason === "REMOVED" ? ui((c) => c.chat.system.memberRemoved, { name }) : ui((c) => c.chat.system.memberLeft, { name }),
    ctx.effects,
    ctx.tx
  );
  if (input2.reason === "REMOVED") {
    await createNotifications(
      [
        {
          userId: member.userId,
          groupId: ctx.group.id,
          category: "GROUP",
          title: proposalTexts.removedTitle,
          body: bilingual(proposalTexts.removedBody, { group: ctx.group.name })
        }
      ],
      ctx.effects,
      ctx.tx
    );
  }
  endMembershipAccess(ctx.effects, { userId: member.userId, groupId: ctx.group.id });
}
function requireMoneyPort() {
  if (!moneyPort()) throw proposalError("PROPOSAL_TYPE_UNAVAILABLE");
}
async function assertNoOpenProposalAbout(ctx, type, membershipId) {
  const open = await ctx.db.proposal.count({
    where: { groupId: ctx.group.id, type, status: "OPEN", subjectMembershipId: membershipId }
  });
  if (open > 0) throw proposalError("PROPOSAL_ALREADY_OPEN");
}

// src/modules/proposals/types/admin-change.ts
var payload = z11.strictObject({ membershipId: z11.string().uuid() });
var adminChange = defineProposal({
  type: "ADMIN_CHANGE",
  input: payload,
  payload,
  async plan(ctx, args3) {
    const target = ctx.activeMembers.find((m) => m.id === args3.membershipId);
    if (!target) throw proposalError("MEMBER_NOT_FOUND");
    if (target.role === "ADMIN") throw proposalError("ALREADY_ADMIN");
    if (target.status !== "ACTIVE") throw proposalError("ONLY_ACTIVE_MEMBERS");
    await assertNoOpenProposalAbout(ctx, "ADMIN_CHANGE", target.id);
    return {
      payload: args3,
      subjectMembershipId: target.id,
      excludedMembershipId: null,
      mustApprove: [],
      notes: []
    };
  },
  describe(p, names) {
    return {
      title: ui((c) => c.votes.titles.adminChange, { name: nameOf(names, p.membershipId) }),
      subject: { type: "ADMIN_CHANGE", member: memberRef2(names, p.membershipId) }
    };
  },
  async apply(ctx, p) {
    const target = await ctx.tx.membership.findFirst({
      where: { id: p.membershipId, groupId: ctx.group.id, status: { in: ["ACTIVE", "LEAVING"] } },
      select: { id: true, userId: true }
    });
    if (!target) return ui((c) => c.votes.card.effect.none);
    await ctx.tx.membership.updateMany({
      where: { groupId: ctx.group.id, role: "ADMIN", id: { not: target.id } },
      data: { role: "MEMBER" }
    });
    await ctx.tx.membership.update({ where: { id: target.id }, data: { role: "ADMIN" } });
    const name = nameOf(ctx.names, target.id);
    await postSystemMessage(
      ctx.group.id,
      ui((c) => c.chat.system.adminChanged, { name }),
      ctx.effects,
      ctx.tx
    );
    await createNotifications(
      [
        {
          userId: target.userId,
          groupId: ctx.group.id,
          category: "GROUP",
          title: proposalTexts.adminTitle,
          body: bilingual(proposalTexts.adminBody, { group: ctx.group.name }),
          deepLink: `/groups/${ctx.group.id}/settings`
        }
      ],
      ctx.effects,
      ctx.tx
    );
    return appliedOn(ctx.now);
  }
});

// src/modules/proposals/types/member-add.ts
import { z as z12 } from "zod";
var memberAddPayloadSchema = z12.strictObject({
  inviteeName: nameSchema(),
  phoneHash: z12.string().regex(/^[0-9a-f]{64}$/)
});
function readMemberAddPayload(payload5) {
  return memberAddPayloadSchema.parse(payload5);
}
var memberAdd = defineProposal({
  type: "MEMBER_ADD",
  input: memberAddPayloadSchema,
  payload: memberAddPayloadSchema,
  plan(_ctx, input2) {
    return Promise.resolve({
      payload: input2,
      subjectMembershipId: null,
      excludedMembershipId: null,
      mustApprove: [],
      notes: [
        ui((c) => c.newProposal.memberAdd.phoneHelp),
        ui((c) => c.newProposal.memberAdd.effect)
      ]
    });
  },
  describe(payload5) {
    return {
      title: ui((c) => c.votes.titles.memberAdd, { name: payload5.inviteeName }),
      subject: { type: "MEMBER_ADD", inviteeName: payload5.inviteeName }
    };
  },
  apply(_ctx, payload5) {
    return Promise.resolve(
      bilingual(proposalTexts.effectInviteAllowed, { name: payload5.inviteeName })
    );
  }
});

// src/modules/proposals/types/member-exit.ts
import { z as z13 } from "zod";
var memberPayload = z13.strictObject({ membershipId: z13.string().uuid() });
var memberRemove = defineProposal({
  type: "MEMBER_REMOVE",
  input: memberPayload,
  payload: memberPayload,
  async plan(ctx, args3) {
    const target = await ctx.db.membership.findFirst({
      where: {
        id: args3.membershipId,
        groupId: ctx.group.id,
        status: { in: ["INVITED", "ACTIVE", "LEAVING"] }
      },
      select: { id: true, role: true, status: true }
    });
    if (!target) throw proposalError("MEMBER_NOT_FOUND");
    if (target.id === ctx.proposer.id) throw proposalError("CANNOT_TARGET_SELF");
    if (target.role === "ADMIN") throw proposalError("ADMIN_MUST_CHANGE_FIRST");
    if (target.status !== "INVITED") requireMoneyPort();
    await assertNoOpenProposalAbout(ctx, "MEMBER_REMOVE", target.id);
    return {
      payload: args3,
      subjectMembershipId: target.id,
      excludedMembershipId: target.id,
      mustApprove: [],
      notes: [ui((c) => c.newProposal.memberRemove.note)]
    };
  },
  describe(p, names) {
    return {
      title: ui((c) => c.votes.titles.memberRemove, { name: nameOf(names, p.membershipId) }),
      subject: { type: "MEMBER_REMOVE", member: memberRef2(names, p.membershipId) }
    };
  },
  async apply(ctx, p) {
    await endMembership(ctx, { membershipId: p.membershipId, reason: "REMOVED" });
    return appliedOn(ctx.now);
  }
});
var earlyExit = defineProposal({
  type: "EARLY_EXIT",
  input: z13.strictObject({}),
  payload: memberPayload,
  async plan(ctx) {
    if (ctx.proposer.role === "ADMIN") throw proposalError("ADMIN_MUST_CHANGE_FIRST");
    requireMoneyPort();
    await assertNoOpenProposalAbout(ctx, "EARLY_EXIT", ctx.proposer.id);
    return {
      payload: { membershipId: ctx.proposer.id },
      subjectMembershipId: ctx.proposer.id,
      excludedMembershipId: ctx.proposer.id,
      mustApprove: [],
      notes: [ui((c) => c.confirmation.notes.earlyExitSettlement)]
    };
  },
  describe(p, names) {
    return {
      title: ui((c) => c.votes.titles.earlyExit, { name: nameOf(names, p.membershipId) }),
      subject: { type: "EARLY_EXIT", member: memberRef2(names, p.membershipId) }
    };
  },
  async apply(ctx, p) {
    await endMembership(ctx, { membershipId: p.membershipId, reason: "EARLY_EXIT" });
    return appliedOn(ctx.now);
  }
});

// src/modules/proposals/types/money-proposals.ts
import { z as z14 } from "zod";
function amountText(amount) {
  return { fr: formatXAF(amount, "fr"), en: formatXAF(amount, "en") };
}
function port() {
  const p = moneyPort();
  if (!p) throw proposalError("PROPOSAL_TYPE_UNAVAILABLE");
  return p;
}
var adminLoanPayload = z14.strictObject({
  loanId: z14.string().uuid(),
  membershipId: z14.string().uuid(),
  amount: z14.number().int().positive(),
  months: z14.number().int().positive()
});
var adminLoan = defineProposal({
  type: "ADMIN_LOAN",
  input: adminLoanPayload,
  payload: adminLoanPayload,
  plan(ctx, args3) {
    requireMoneyPort();
    if (args3.membershipId !== ctx.proposer.id || ctx.proposer.role !== "ADMIN") {
      throw proposalError("ADMIN_LOAN_NOT_PROPOSABLE");
    }
    return Promise.resolve({
      payload: args3,
      subjectMembershipId: args3.membershipId,
      excludedMembershipId: args3.membershipId,
      mustApprove: [],
      notes: [ui((c) => c.confirmation.notes.loanAdminVote)]
    });
  },
  describe(p, names) {
    return {
      title: ui((c) => c.votes.titles.adminLoan, {
        amount: amountText(p.amount),
        name: nameOf(names, p.membershipId)
      }),
      subject: {
        type: "ADMIN_LOAN",
        member: memberRef2(names, p.membershipId),
        amount: p.amount,
        months: p.months
      }
    };
  },
  async apply(ctx, p) {
    await port().decideAdminLoan(ctx.tx, {
      groupId: ctx.group.id,
      loanId: p.loanId,
      approved: true,
      proposalId: ctx.proposal.id
    });
    return appliedOn(ctx.now);
  },
  async onNotPassed(ctx, p) {
    await moneyPort()?.decideAdminLoan(ctx.tx, {
      groupId: ctx.group.id,
      loanId: p.loanId,
      approved: false,
      proposalId: ctx.proposal.id
    });
  }
});
var fineInput = z14.strictObject({ obligationId: z14.string().uuid() });
var finePayload = fineInput.extend({
  membershipId: z14.string().uuid(),
  amount: z14.number().int(),
  roundNumber: z14.number().int().nullable()
});
var fineWaiver = defineProposal({
  type: "FINE_WAIVER",
  input: fineInput,
  payload: finePayload,
  async plan(ctx, args3) {
    const fine = await port().describeFine(ctx.db, {
      groupId: ctx.group.id,
      obligationId: args3.obligationId
    });
    if (!fine) throw proposalError("FINE_NOT_FOUND");
    if (!fine.waivable) throw proposalError("FINE_NOT_WAIVABLE");
    await assertNoOpenProposalAbout(ctx, "FINE_WAIVER", fine.membershipId);
    return {
      payload: {
        obligationId: args3.obligationId,
        membershipId: fine.membershipId,
        amount: fine.amount,
        roundNumber: fine.roundNumber
      },
      subjectMembershipId: fine.membershipId,
      excludedMembershipId: fine.membershipId,
      mustApprove: [],
      notes: []
    };
  },
  describe(p, names) {
    return {
      title: ui((c) => c.votes.titles.fineWaiver, {
        round: p.roundNumber ?? "\u2014",
        name: nameOf(names, p.membershipId)
      }),
      subject: {
        type: "FINE_WAIVER",
        member: memberRef2(names, p.membershipId),
        amount: p.amount,
        roundNumber: p.roundNumber
      }
    };
  },
  async apply(ctx, p) {
    await port().waiveFine(ctx.tx, {
      groupId: ctx.group.id,
      obligationId: p.obligationId,
      proposalId: ctx.proposal.id
    });
    return appliedOn(ctx.now);
  }
});
var correctionPayload = z14.strictObject({
  seq: z14.number().int().min(1),
  correction: textSchema(1e3)
});
var ledgerCorrection = defineProposal({
  type: "LEDGER_CORRECTION",
  input: correctionPayload,
  payload: correctionPayload,
  async plan(ctx, args3) {
    const entry2 = await port().describeLedgerEntry(ctx.db, {
      groupId: ctx.group.id,
      seq: args3.seq
    });
    if (!entry2?.correctable) throw proposalError("LEDGER_ENTRY_NOT_CORRECTABLE");
    const open = await ctx.db.proposal.count({
      where: {
        groupId: ctx.group.id,
        type: "LEDGER_CORRECTION",
        status: "OPEN",
        payload: { path: ["seq"], equals: args3.seq }
      }
    });
    if (open > 0) throw proposalError("PROPOSAL_ALREADY_OPEN");
    return {
      payload: args3,
      subjectMembershipId: null,
      excludedMembershipId: null,
      mustApprove: [],
      notes: []
    };
  },
  describe(p) {
    return {
      title: ui((c) => c.votes.titles.ledgerCorrection, { seq: p.seq }),
      subject: { type: "LEDGER_CORRECTION", seq: p.seq, correction: p.correction }
    };
  },
  async apply(ctx, p) {
    await port().correctLedger(ctx.tx, {
      groupId: ctx.group.id,
      seq: p.seq,
      correction: p.correction,
      proposalId: ctx.proposal.id
    });
    return appliedOn(ctx.now);
  }
});

// src/modules/proposals/types/rotation-change.ts
import { z as z15 } from "zod";
var payload2 = z15.strictObject({ swap: z15.tuple([z15.string().uuid(), z15.string().uuid()]) });
var REFUSALS = {
  SAME_MEMBER: "ROTATION_SAME_MEMBER",
  NOT_IN_ROTATION: "ROTATION_NOT_IN_ROTATION",
  ROTATION_POSITION_ALREADY_SERVED: "ROTATION_ALREADY_SERVED"
};
var rotationChange = defineProposal({
  type: "ROTATION_CHANGE",
  input: payload2,
  payload: payload2,
  async plan(ctx, args3) {
    const port2 = moneyPort();
    if (!port2) throw proposalError("PROPOSAL_TYPE_UNAVAILABLE");
    const current = await port2.currentRotation(ctx.db, ctx.group.id);
    if (!current) throw proposalError("ROTATION_NOT_STARTED");
    const check3 = validateRotationSwap({
      rotation: current.rotation,
      currentRound: current.currentRound,
      first: args3.swap[0],
      second: args3.swap[1]
    });
    if (!check3.ok) throw proposalError(REFUSALS[check3.code]);
    return {
      payload: args3,
      subjectMembershipId: null,
      excludedMembershipId: null,
      mustApprove: check3.mustApprove,
      notes: [ui((c) => c.votes.threshold.rotation)]
    };
  },
  describe(p, names) {
    return {
      title: ui((c) => c.votes.titles.rotationSwap, {
        a: nameOf(names, p.swap[0]),
        b: nameOf(names, p.swap[1])
      }),
      subject: {
        type: "ROTATION_CHANGE",
        swap: [memberRef2(names, p.swap[0]), memberRef2(names, p.swap[1])]
      }
    };
  },
  async apply(ctx, p) {
    const port2 = moneyPort();
    const current = port2 ? await port2.currentRotation(ctx.tx, ctx.group.id) : null;
    if (!port2 || !current) return ui((c) => c.votes.card.effect.none);
    const check3 = validateRotationSwap({
      rotation: current.rotation,
      currentRound: current.currentRound,
      first: p.swap[0],
      second: p.swap[1]
    });
    if (!check3.ok) return ui((c) => c.votes.card.effect.none);
    await port2.applyRotationChange(ctx.tx, {
      groupId: ctx.group.id,
      newOrder: check3.newOrder,
      proposalId: ctx.proposal.id
    });
    await ledgerEventsPort().appendEvent(ctx.tx, {
      groupId: ctx.group.id,
      event: {
        event: "ROTATION_CHANGED",
        cycleNumber: current.cycleNumber,
        order: check3.newOrder,
        proposalId: ctx.proposal.id
      },
      description: ui((c) => c.votes.types.ROTATION_CHANGE),
      refType: "Proposal",
      refId: ctx.proposal.id,
      occurredAt: ctx.now
    });
    return ui((c) => c.votes.card.effect.pending, { round: current.currentRound + 1 });
  }
});

// src/modules/proposals/types/rule-change.ts
import { z as z16 } from "zod";

// src/modules/rulesets/rule-display.ts
var MONEY = /* @__PURE__ */ new Set([
  "contributionAmount",
  "solidarityContribution",
  "lateFine",
  "minBid",
  "meetingAbsenceFine"
]);
var OFF_AT_ZERO = /* @__PURE__ */ new Set([
  "solidarityContribution",
  "meetingAbsenceFine"
]);
var HOURS = /* @__PURE__ */ new Set([
  "numberChangeHoldHours",
  "voteWindowHours",
  "solidarityVoteWindowHours"
]);
function copyKey(parameter) {
  return parameter === "loanLimitFactorPermille" ? "loanLimitFactor" : parameter;
}
function ruleLabel(parameter) {
  return ui((c) => c.rules[copyKey(parameter)].label);
}
function percent(permille, lang) {
  const whole = Math.floor(permille / 10);
  const tenth = permille % 10;
  return tenth === 0 ? String(whole) : `${whole}${lang === "fr" ? "," : "."}${tenth}`;
}
var pad2 = (n) => String(n).padStart(2, "0");
var plural = (n) => n === 1 ? "one" : "other";
function ruleValue(parameter, value) {
  const v = value;
  if (typeof v === "boolean") return ui((c) => v ? c.rules.values.yes : c.rules.values.no);
  if (typeof v === "number") {
    if (v === 0 && OFF_AT_ZERO.has(parameter)) return ui((c) => c.rules.values.off);
    if (MONEY.has(parameter)) return { fr: formatXAF(v, "fr"), en: formatXAF(v, "en") };
    if (HOURS.has(parameter)) return ui((c) => c.rules.values[`hours_${plural(v)}`], { count: v });
    if (parameter === "loanMaxMonths")
      return ui((c) => c.rules.values[`months_${plural(v)}`], { count: v });
    if (parameter === "reliabilityWindow")
      return ui((c) => c.rules.values[`items_${plural(v)}`], { count: v });
    if (parameter === "loanRatePermille") {
      return ui((c) => c.common.percentPerMonth, {
        percent: { fr: percent(v, "fr"), en: percent(v, "en") }
      });
    }
    if (parameter === "loanLimitFactorPermille") {
      return ui((c) => c.rules.values.factor, {
        factor: { fr: formatLimitFactor(v, "fr"), en: formatLimitFactor(v, "en") }
      });
    }
    return { fr: String(v), en: String(v) };
  }
  if (parameter === "frequency")
    return ui((c) => c.common.frequency[v]);
  if (parameter === "rotationMode")
    return ui((c) => c.common.rotationMode[v]);
  if (parameter === "payoutTime") {
    const t = v;
    const clock2 = `${pad2(t.hour)}:${pad2(t.minute)}`;
    return { fr: clock2, en: clock2 };
  }
  return { fr: String(v), en: String(v) };
}
function ruleChangeTitle(parameter, from, to) {
  return ui((c) => c.votes.titles.ruleChange, {
    rule: ruleLabel(parameter),
    from: ruleValue(parameter, from),
    to: ruleValue(parameter, to)
  });
}

// src/modules/proposals/types/rule-change.ts
var input = z16.strictObject({ changes: ruleChangesSchema });
var payload3 = z16.strictObject({
  changes: ruleChangesSchema,
  /** The values when the proposal was made, for its title. */
  from: ruleChangesSchema
});
function entries(changes) {
  return Object.keys(changes).sort();
}
function joinTitles(titles) {
  return { fr: titles.map((t) => t.fr).join(" ; "), en: titles.map((t) => t.en).join("; ") };
}
async function openParameters(db, groupId) {
  const open = await db.proposal.findMany({
    where: { groupId, type: "RULE_CHANGE", status: "OPEN" },
    select: { payload: true }
  });
  return open.flatMap(
    (p) => Object.keys(p.payload.changes ?? {})
  );
}
var ruleChange = defineProposal({
  type: "RULE_CHANGE",
  input,
  payload: payload3,
  async plan(ctx, args3) {
    const check3 = validateRuleChange({
      current: ctx.params,
      changes: args3.changes,
      openRuleChangeParameters: await openParameters(ctx.db, ctx.group.id)
    });
    if (!check3.ok) {
      switch (check3.code) {
        case "EMPTY_RULE_CHANGE":
          throw proposalError("RULE_CHANGE_EMPTY");
        case "NO_CHANGE":
          throw proposalError("RULE_CHANGE_NO_CHANGE", {
            params: { rule: ruleLabel(check3.parameter) }
          });
        case "RULE_CHANGE_ALREADY_OPEN":
          throw proposalError("RULE_CHANGE_ALREADY_OPEN", {
            params: { rule: ruleLabel(check3.parameter) }
          });
        default:
          throw parameterRefusalToError(check3);
      }
    }
    const from = Object.fromEntries(check3.effects.map((e) => [e.parameter, e.from]));
    return {
      payload: { changes: args3.changes, from },
      subjectMembershipId: null,
      excludedMembershipId: null,
      mustApprove: [],
      notes: [ui((c) => c.newProposal.rule.effectNextRound)]
    };
  },
  describe(p) {
    const changes = entries(p.changes).map((parameter) => {
      const from = p.from[parameter];
      const to = p.changes[parameter];
      return {
        parameter,
        from,
        to,
        label: ruleLabel(parameter),
        title: ruleChangeTitle(parameter, from, to)
      };
    });
    return {
      title: joinTitles(changes.map((c) => c.title)),
      subject: {
        type: "RULE_CHANGE",
        changes: changes.map(({ parameter, from, to, label }) => ({ parameter, from, to, label }))
      }
    };
  },
  async apply(ctx, p) {
    const latest = await getCurrentRuleSet(ctx.group.id, ctx.tx);
    const previous = latest.params;
    const next = applyRuleChange(previous, p.changes);
    const version = latest.version + 1;
    const created = await createRuleSetVersion(ctx.tx, {
      groupId: ctx.group.id,
      version,
      params: next,
      createdByProposalId: ctx.proposal.id
    });
    const placed = await moneyPort()?.applyRuleSet(ctx.tx, {
      groupId: ctx.group.id,
      version,
      previous,
      next,
      proposalId: ctx.proposal.id
    });
    if (placed?.effectiveFromRoundId) {
      await ctx.tx.ruleSet.update({
        where: { id: created.id },
        data: { effectiveFromRoundId: placed.effectiveFromRoundId }
      });
    }
    await ledgerEventsPort().appendEvent(ctx.tx, {
      groupId: ctx.group.id,
      event: { event: "RULE_SET_APPLIED", version, proposalId: ctx.proposal.id },
      description: ui((c) => c.votes.types.RULE_CHANGE),
      refType: "Proposal",
      refId: ctx.proposal.id,
      occurredAt: ctx.now
    });
    const round = placed?.effectiveFromRoundNumber ?? null;
    const titles = entries(p.changes).map(
      (parameter) => ui((c) => c.votes.titles.ruleChange, {
        rule: ruleLabel(parameter),
        from: ruleValue(parameter, p.from[parameter]),
        to: ruleValue(parameter, p.changes[parameter])
      })
    );
    if (round !== null) {
      await postSystemMessage(
        ctx.group.id,
        ui((c) => c.chat.system.ruleApplied, { round, rule: joinTitles(titles) }),
        ctx.effects,
        ctx.tx
      );
      return ui((c) => c.votes.card.effect.pending, { round });
    }
    return ui((c) => c.newProposal.rule.effectNextRound);
  }
});

// ../../packages/shared/src/contracts/solidarity.ts
import { z as z17 } from "zod";
var solidarityEventSchema = z17.enum(["DEUIL", "NAISSANCE", "MALADIE", "MARIAGE", "AUTRE"]);
var solidarityRequestSchema = z17.strictObject({
  /** The member supported; the requester themself or another member (R10.2). */
  recipientMembershipId: uuidSchema,
  event: solidarityEventSchema,
  amount: z17.number().int().positive(),
  /** Optional, visible only to the group. */
  note: textSchema(300).optional()
});
var solidarityRequestItemSchema = z17.strictObject({
  id: uuidSchema,
  proposalId: uuidSchema.nullable(),
  recipient: z17.strictObject({ membershipId: uuidSchema, name: z17.string() }),
  requester: z17.strictObject({ membershipId: uuidSchema, name: z17.string() }),
  event: solidarityEventSchema,
  amount: z17.number().int(),
  note: z17.string().nullable(),
  status: z17.enum(["VOTING", "APPROVED", "REJECTED", "PAID", "FAILED"]),
  createdAt: instantSchema
});
var solidarityRequestListSchema = z17.strictObject({
  /** The fund's balance, from the ledger; null until the money modules report it. */
  fundBalance: z17.number().int().nullable(),
  requests: z17.array(solidarityRequestItemSchema)
});

// src/modules/proposals/types/solidarity-payout.ts
import { z as z18 } from "zod";
var payload4 = z18.strictObject({
  recipientMembershipId: z18.string().uuid(),
  event: solidarityEventSchema,
  amount: z18.number().int().positive(),
  note: textSchema(300).nullable()
});
var solidarityPayout = defineProposal({
  type: "SOLIDARITY_PAYOUT",
  input: payload4,
  payload: payload4,
  async plan(ctx, args3) {
    const port2 = moneyPort();
    if (!port2) throw proposalError("PROPOSAL_TYPE_UNAVAILABLE");
    const recipientIsMember = ctx.activeMembers.some((m) => m.id === args3.recipientMembershipId);
    const fund = await port2.solidarityFund(ctx.db, ctx.group.id);
    const check3 = validateSolidarityRequest({
      amount: args3.amount,
      event: args3.event,
      solidarityFundBalance: fund.balance,
      pendingSolidarityPayouts: fund.pendingPayouts,
      feeSchedule: port2.feeSchedule(),
      recipientIsMember
    });
    if (!check3.ok) {
      switch (check3.code) {
        case "ABOVE_SOLIDARITY_FUND":
          throw proposalError("SOLIDARITY_ABOVE_FUND", {
            params: { balance: amountText(check3.balance) }
          });
        case "AMOUNT_NOT_ABOVE_FEE":
          throw proposalError("SOLIDARITY_NOT_ABOVE_FEE", {
            params: { fee: amountText(check3.feeEstimate) }
          });
        default:
          throw proposalError("RECIPIENT_NOT_MEMBER");
      }
    }
    return {
      payload: args3,
      subjectMembershipId: null,
      excludedMembershipId: null,
      mustApprove: [],
      notes: [ui((c) => c.confirmation.notes.feeBorne)]
    };
  },
  describe(p, names) {
    return {
      title: ui((c) => c.votes.titles.solidarity, {
        amount: amountText(p.amount),
        name: nameOf(names, p.recipientMembershipId),
        event: ui((c2) => c2.caisse.solidarity.events[p.event])
      }),
      subject: {
        type: "SOLIDARITY_PAYOUT",
        recipient: memberRef2(names, p.recipientMembershipId),
        event: p.event,
        amount: p.amount,
        note: p.note
      }
    };
  },
  async afterCreate(tx, proposal, p) {
    await tx.solidarityRequest.create({
      data: {
        groupId: proposal.groupId,
        requesterMembershipId: proposal.proposerMembershipId,
        recipientMembershipId: p.recipientMembershipId,
        event: p.event,
        amount: p.amount,
        note: p.note,
        proposalId: proposal.id,
        status: "VOTING"
      }
    });
  },
  async apply(ctx) {
    const request = await ctx.tx.solidarityRequest.update({
      where: { proposalId: ctx.proposal.id },
      data: { status: "APPROVED" }
    });
    const port2 = moneyPort();
    if (port2)
      await port2.paySolidarity(ctx.tx, {
        groupId: ctx.group.id,
        solidarityRequestId: request.id,
        proposalId: ctx.proposal.id
      });
    return appliedOn(ctx.now);
  },
  async onNotPassed(ctx) {
    await ctx.tx.solidarityRequest.update({
      where: { proposalId: ctx.proposal.id },
      data: { status: "REJECTED" }
    });
  }
});

// src/modules/proposals/types/index.ts
var DEFINITIONS2 = {
  RULE_CHANGE: ruleChange,
  MEMBER_ADD: memberAdd,
  MEMBER_REMOVE: memberRemove,
  ROTATION_CHANGE: rotationChange,
  ADMIN_CHANGE: adminChange,
  EARLY_EXIT: earlyExit,
  ADMIN_LOAN: adminLoan,
  SOLIDARITY_PAYOUT: solidarityPayout,
  FINE_WAIVER: fineWaiver,
  LEDGER_CORRECTION: ledgerCorrection
};
function proposalDefinition(type) {
  return DEFINITIONS2[type];
}

// src/modules/proposals/proposals.create.ts
async function prepareProposal(ctx, type, rawInput, options = {}) {
  const definition = proposalDefinition(type);
  if (!options.system) {
    const allowed = canPropose({
      type,
      proposerMembershipId: ctx.proposer.id,
      subjectMembershipId: type === "EARLY_EXIT" ? ctx.proposer.id : null
    });
    if (!allowed.ok) throw proposalError("ADMIN_LOAN_NOT_PROPOSABLE");
  }
  const plan = await definition.plan(ctx, definition.input.parse(rawInput));
  const eligible = eligibleVoters({
    type,
    activeMembershipIds: ctx.activeMembers.map((m) => m.id),
    excludedMembershipId: plan.excludedMembershipId
  });
  return {
    type,
    definition,
    payload: definition.payload.parse(plan.payload),
    subjectMembershipId: plan.subjectMembershipId,
    mustApprove: plan.mustApprove,
    notes: plan.notes,
    eligible,
    required: thresholdCount(PROPOSAL_RULES[type].threshold, eligible.length),
    windowHours: proposalWindowHours(type, ctx.params),
    title: definition.describe(plan.payload, ctx.names).title
  };
}
function proposalCard(p) {
  const counts = { needed: p.required, eligible: p.eligible.length };
  const threshold = PROPOSAL_RULES[p.type].threshold === "MAJORITY" ? ui((c) => c.votes.threshold.majority, counts) : ui((c) => c.votes.threshold.twoThirds, counts);
  return {
    title: ui((c) => c.confirmation.actions.propose.title, { title: p.title }),
    lines: [],
    total: null,
    notes: [
      threshold,
      bilingual(
        PROPOSAL_RULES[p.type].secret ? proposalTexts.voteWindowSecret : proposalTexts.voteWindow,
        { hours: p.windowHours }
      ),
      ...PROPOSAL_RULES[p.type].secret ? [ui((c) => c.confirmation.notes.voteSecret)] : [],
      ...p.notes
    ],
    confirmLabel: ui((c) => c.confirmation.actions.propose.button)
  };
}
async function openProposal(tx, ctx, p, reason2, effects) {
  const rule2 = PROPOSAL_RULES[p.type];
  const proposal = await tx.proposal.create({
    data: {
      groupId: ctx.group.id,
      type: p.type,
      payload: p.payload,
      reason: reason2,
      proposerMembershipId: ctx.proposer.id,
      subjectMembershipId: p.subjectMembershipId,
      secret: rule2.secret,
      thresholdKind: rule2.threshold,
      eligibleMembershipIds: p.eligible,
      mustApproveMembershipIds: p.mustApprove,
      opensAt: ctx.now,
      closesAt: voteClosesAt(ctx.now, p.windowHours)
    }
  });
  await p.definition.afterCreate?.(tx, proposal, p.payload);
  const opened = ui((c) => c.chat.system.voteOpened, { title: p.title });
  await postSystemMessage(ctx.group.id, opened, effects, tx);
  const voters = ctx.activeMembers.filter(
    (m) => p.eligible.includes(m.id) && m.id !== ctx.proposer.id
  );
  await createNotifications(
    voters.map((v) => ({
      userId: v.userId,
      groupId: ctx.group.id,
      category: "VOTES",
      title: proposalTexts.openedTitle,
      body: noticeBody(p.type, "opened", ctx.group, opened),
      deepLink: `/votes/${proposal.id}`
    })),
    effects,
    tx
  );
  await audit(
    {
      action: "proposal.created",
      actorUserId: ctx.userId,
      groupId: ctx.group.id,
      target: `Proposal:${proposal.id}`,
      details: { type: p.type }
    },
    tx
  );
  effects.add(() => scheduleProposalJobs(proposal));
  return proposal;
}
async function scheduleProposalJobs(proposal) {
  await dispatchJob(
    "votes.close",
    { proposalId: proposal.id },
    { jobId: `close-${proposal.id}`, at: proposal.closesAt }
  );
  const remindAt = voteReminderAt(proposal.closesAt);
  if (remindAt > proposal.opensAt) {
    await dispatchJob(
      "votes.remind",
      { proposalId: proposal.id },
      { jobId: `remind-${proposal.id}`, at: remindAt }
    );
  }
}

// src/modules/proposals/proposals.actions.ts
var proposalArgsSchema = z19.strictObject({
  groupId: z19.string().uuid(),
  type: proposalTypeSchema,
  /** The type's normalised input (ids, keyed hashes; never a raw phone number). */
  input: z19.record(z19.string(), z19.unknown()),
  /** L-2: checked again here, not only at the HTTP edge (spec 2.11). */
  reason: textSchema(500).nullable()
});
var proposalCreateHandler = defineActionHandler({
  type: "PROPOSAL_CREATE",
  level: "L1",
  args: proposalArgsSchema,
  async prepare(ctx, args3) {
    const plan = await planContext(ctx.db, ctx.userId, args3.groupId, ctx.now);
    return proposalCard(await prepareProposal(plan, args3.type, args3.input));
  },
  async execute(ctx, args3) {
    const plan = await planContext(ctx.db, ctx.userId, args3.groupId, ctx.now);
    const prepared = await prepareProposal(plan, args3.type, args3.input);
    const proposal = await openProposal(ctx.db, plan, prepared, args3.reason, ctx.effects);
    return {
      outcome: "done",
      resultRef: proposal.id,
      summary: ui((c) => c.confirmation.actions.propose.done)
    };
  }
});

// src/modules/proposals/votes.actions.ts
import { z as z20 } from "zod";

// src/modules/proposals/proposals.tally.ts
async function mustApproveTally(tx, p) {
  if (p.mustApproveMembershipIds.length === 0) return void 0;
  const ballots = await tx.ballot.findMany({
    where: { proposalId: p.id, membershipId: { in: p.mustApproveMembershipIds } },
    select: { choice: true }
  });
  return {
    required: p.mustApproveMembershipIds.length,
    yes: ballots.filter((b) => b.choice === "YES").length,
    no: ballots.filter((b) => b.choice === "NO").length
  };
}
function announce2(p, status) {
  const open = status === "OPEN";
  emitToGroup(p.groupId, "proposal.updated", {
    id: p.id,
    groupId: p.groupId,
    status,
    participation: p.yesCount + p.noCount,
    tally: open && p.secret ? null : { yes: p.yesCount, no: p.noCount }
  });
}
function announceParticipation(p, participation) {
  emitToGroup(p.groupId, "proposal.updated", {
    id: p.id,
    groupId: p.groupId,
    status: "OPEN",
    participation,
    tally: null
  });
}
async function settleProposal(proposalId, now = clock.now()) {
  const effects = new AfterCommit();
  const status = await getPrisma().$transaction(
    async (tx) => {
      await tx.$queryRaw`SELECT "id" FROM "Proposal" WHERE "id" = ${proposalId}::uuid FOR UPDATE`;
      const p = await tx.proposal.findUniqueOrThrow({ where: { id: proposalId } });
      if (p.status !== "OPEN") return p.status;
      if (p.secret && now < p.closesAt) return "OPEN";
      const at = p.secret ? p.closesAt : now;
      const tally = tallyProposal({
        thresholdKind: p.thresholdKind,
        eligibleCount: p.eligibleMembershipIds.length,
        yes: p.yesCount,
        no: p.noCount,
        mustApprove: await mustApproveTally(tx, p),
        closesAt: p.closesAt,
        now: at
      });
      if (tally.status === "OPEN") {
        effects.add(() => announce2(p, "OPEN"));
        return "OPEN";
      }
      const group2 = await tx.group.findUniqueOrThrow({
        where: { id: p.groupId },
        select: { id: true, name: true }
      });
      const names = await memberNames(tx, p.groupId);
      const definition = proposalDefinition(p.type);
      const payload5 = definition.payload.parse(p.payload);
      const title = definition.describe(payload5, names).title;
      const ctx = { tx, proposal: p, now: at, effects, group: group2, names };
      const effect = tally.status === "PASSED" ? await definition.apply(ctx, payload5) : null;
      if (tally.status !== "PASSED") await definition.onNotPassed?.(ctx, payload5);
      await tx.proposal.update({
        where: { id: p.id },
        data: {
          status: tally.status,
          closedAt: at,
          ...tally.status === "PASSED" ? { appliedAt: at } : {},
          ...effect ? { effect: { fr: effect.fr, en: effect.en } } : {}
        }
      });
      const counts = { title, yes: p.yesCount, no: p.noCount };
      const message = tally.status === "PASSED" ? ui((c) => c.chat.system.votePassed, counts) : tally.status === "REJECTED" ? ui((c) => c.chat.system.voteRejected, counts) : ui((c) => c.chat.system.voteExpired, { title });
      await postSystemMessage(p.groupId, message, effects, tx);
      await ledgerEventsPort().appendEvent(tx, {
        groupId: p.groupId,
        event: {
          event: "VOTE_CLOSED",
          proposalId: p.id,
          proposalType: p.type,
          status: tally.status,
          yes: p.yesCount,
          no: p.noCount,
          eligible: p.eligibleMembershipIds.length
        },
        description: message,
        refType: "Proposal",
        refId: p.id,
        occurredAt: at
      });
      const members = await activeMembers(tx, p.groupId);
      await createNotifications(
        members.map((m) => ({
          userId: m.userId,
          groupId: p.groupId,
          category: "VOTES",
          title: proposalTexts.resultTitle,
          body: noticeBody(p.type, "result", group2, message),
          deepLink: `/votes/${p.id}`
        })),
        effects,
        tx
      );
      await audit(
        {
          action: `proposal.${tally.status.toLowerCase()}`,
          system: true,
          groupId: p.groupId,
          target: `Proposal:${p.id}`
        },
        tx
      );
      const closed = { ...p, status: tally.status };
      effects.add(() => announce2(closed, tally.status));
      return tally.status;
    },
    { timeout: 2e4 }
  );
  await effects.run();
  return status;
}
async function closeDueProposals(now = clock.now()) {
  const due = await getPrisma().proposal.findMany({
    where: { status: "OPEN", closesAt: { lte: now } },
    select: { id: true },
    take: 200
  });
  for (const { id } of due) await settleProposal(id, now);
  return due.length;
}

// src/modules/proposals/votes.actions.ts
var voteArgsSchema = z20.strictObject({
  proposalId: z20.string().uuid(),
  choice: z20.enum(["YES", "NO"]),
  /** Copied from the proposal by the service; a secret vote's card is confidential. */
  secret: z20.boolean()
});
var REFUSALS2 = {
  NOT_ELIGIBLE_VOTER: "NOT_ELIGIBLE_VOTER",
  ALREADY_VOTED: "ALREADY_VOTED",
  PROPOSAL_CLOSED: "PROPOSAL_CLOSED"
};
async function checkVote(ctx, args3, db) {
  const proposal = await db.proposal.findUnique({ where: { id: args3.proposalId } });
  if (!proposal) throw proposalError("PROPOSAL_NOT_FOUND");
  const access = await authorizeGroup(ctx.userId, proposal.groupId, "group.votes.cast", db);
  const receipt = await db.voteReceipt.findUnique({
    where: {
      proposalId_membershipId: { proposalId: proposal.id, membershipId: access.membership.id }
    },
    select: { id: true }
  });
  const check3 = validateVote({
    eligibleVoterIds: proposal.eligibleMembershipIds,
    voterId: access.membership.id,
    alreadyVoted: receipt !== null,
    status: proposal.status,
    closesAt: proposal.closesAt,
    now: ctx.now
  });
  if (!check3.ok) throw proposalError(REFUSALS2[check3.code]);
  if (proposal.secret !== args3.secret) throw proposalError("PROPOSAL_NOT_FOUND");
  return { proposal, membershipId: access.membership.id };
}
var voteCastHandler = defineActionHandler({
  type: "VOTE_CAST",
  level: "L1",
  args: voteArgsSchema,
  async prepare(ctx, args3) {
    const { proposal } = await checkVote(ctx, args3, ctx.db);
    const yes = args3.choice === "YES";
    return {
      title: ui(
        (c) => yes ? c.confirmation.actions.voteYes.title : c.confirmation.actions.voteNo.title
      ),
      lines: [],
      total: null,
      notes: [
        proposalDefinition(proposal.type).describe(
          proposal.payload,
          await memberNames(ctx.db, proposal.groupId)
        ).title,
        ...proposal.secret ? [ui((c) => c.confirmation.notes.voteSecret)] : [],
        ui((c) => c.confirmation.notes.voteFinal)
      ],
      confirmLabel: ui(
        (c) => yes ? c.confirmation.actions.voteYes.button : c.confirmation.actions.voteNo.button
      )
    };
  },
  // R11.5: while pending, the choice is sealed; once finished, only a neutral card remains, so no
  // stored row ever links a secret choice to the member. H1: not even the proposal it was about.
  confidential: (args3) => args3.secret,
  redacted: () => ({
    args: { secret: true },
    preview: {
      title: proposalTexts.secretVoteSealed,
      lines: [],
      total: null,
      notes: [ui((c) => c.confirmation.notes.voteSecret)],
      confirmLabel: proposalTexts.secretVoteSealed
    }
  }),
  async execute(ctx, args3) {
    await ctx.db.$queryRaw`SELECT "id" FROM "Proposal" WHERE "id" = ${args3.proposalId}::uuid FOR UPDATE`;
    const { proposal, membershipId } = await checkVote(ctx, args3, ctx.db);
    const hour = new Date(Math.floor(ctx.now.getTime() / 36e5) * 36e5);
    const receipt = await ctx.db.voteReceipt.create({
      data: { proposalId: proposal.id, membershipId, votedAt: hour, createdAt: hour },
      select: { id: true }
    });
    if (!proposal.secret) {
      await ctx.db.ballot.create({
        data: {
          proposalId: proposal.id,
          membershipId,
          choice: args3.choice,
          castAt: hour,
          createdAt: hour
        }
      });
    }
    await ctx.db.proposal.update({
      where: { id: proposal.id },
      data: args3.choice === "YES" ? { yesCount: { increment: 1 } } : { noCount: { increment: 1 } }
    });
    const participation = proposal.yesCount + proposal.noCount + 1;
    if (proposal.secret) {
      ctx.afterCommit(() => announceParticipation(proposal, participation));
    } else {
      ctx.afterCommit(
        () => dispatchJob(
          "votes.close",
          { proposalId: proposal.id },
          { jobId: `tally-${proposal.id}-${participation}` }
        )
      );
    }
    return {
      outcome: "done",
      resultRef: receipt.id,
      summary: ui(
        (c) => args3.choice === "YES" ? c.confirmation.actions.voteYes.done : c.confirmation.actions.voteNo.done
      )
    };
  }
});

// src/modules/proposals/proposals.jobs.ts
async function remindVoters(proposalId, now = clock.now()) {
  const prisma = getPrisma();
  const effects = new AfterCommit();
  const count = await prisma.$transaction(async (tx) => {
    const claimed = await tx.proposal.updateMany({
      where: { id: proposalId, status: "OPEN", remindedAt: null, closesAt: { gt: now } },
      data: { remindedAt: now }
    });
    if (claimed.count !== 1) return 0;
    const p = await tx.proposal.findUniqueOrThrow({ where: { id: proposalId } });
    const voted = new Set(
      (await tx.voteReceipt.findMany({ where: { proposalId }, select: { membershipId: true } })).map((r) => r.membershipId)
    );
    const members = (await activeMembers(tx, p.groupId)).filter(
      (m) => p.eligibleMembershipIds.includes(m.id) && !voted.has(m.id)
    );
    const definition = proposalDefinition(p.type);
    const title = definition.describe(
      definition.payload.parse(p.payload),
      await memberNames(tx, p.groupId)
    ).title;
    const group2 = await tx.group.findUniqueOrThrow({
      where: { id: p.groupId },
      select: { name: true }
    });
    const body = noticeBody(
      p.type,
      "reminder",
      group2,
      ui((c) => c.notificationPrefill.voteReminder, {
        title,
        date: { fr: formatDateTime(p.closesAt, "fr"), en: formatDateTime(p.closesAt, "en") }
      })
    );
    await createNotifications(
      members.map((m) => ({
        userId: m.userId,
        groupId: p.groupId,
        category: "VOTES",
        title: proposalTexts.reminderTitle,
        body,
        deepLink: `/votes/${p.id}`
      })),
      effects,
      tx
    );
    return members.length;
  });
  await effects.run();
  return count;
}
async function remindDueVoters(now = clock.now()) {
  const open = await getPrisma().proposal.findMany({
    where: { status: "OPEN", remindedAt: null, closesAt: { gt: now } },
    select: { id: true, opensAt: true, closesAt: true },
    take: 500
  });
  let reminded = 0;
  for (const p of open) {
    const at = voteReminderAt(p.closesAt);
    if (at <= now && at > p.opensAt) reminded += await remindVoters(p.id, now);
  }
  return reminded;
}
function registerProposalJobs() {
  registerJob({
    name: "votes.close",
    keepNoHistory: true,
    process: async (job) => {
      if (job.data.proposalId) await settleProposal(job.data.proposalId);
      else await closeDueProposals();
    }
  });
  registerRepeatable({ id: "votes.close.scan", name: "votes.close", pattern: "*/5 * * * *" });
  registerJob({
    name: "votes.remind",
    keepNoHistory: true,
    process: async (job) => {
      if (job.data.proposalId) await remindVoters(job.data.proposalId);
      else await remindDueVoters();
    }
  });
  registerRepeatable({ id: "votes.remind.scan", name: "votes.remind", pattern: "7 * * * *" });
}

// src/modules/groups/groups.actions.ts
var cycleError = defineErrors({
  CYCLE_ALREADY_STARTED: { status: 409, text: groupErrorTexts.CYCLE_ALREADY_STARTED },
  CYCLE_START_UNAVAILABLE: { status: 409, text: groupErrorTexts.CYCLE_START_UNAVAILABLE }
});
var args2 = z21.strictObject({ groupId: z21.string().uuid() });
async function check2(db, userId, groupId) {
  const access = await authorizeGroup(userId, groupId, "group.cycles.start", db);
  if (access.group.status !== "FORMING") throw cycleError("CYCLE_ALREADY_STARTED");
  const active = await db.membership.count({ where: { groupId, status: "ACTIVE" } });
  const allowed = canStartCycle(active);
  if (!allowed.ok) {
    const missing = allowed.code === "NOT_ENOUGH_MEMBERS" ? allowed.minimum - allowed.count : 0;
    throw new AppError(
      allowed.code,
      409,
      ui((c) => missing === 1 ? c.startCycle.needMore_one : c.startCycle.needMore_other, {
        count: missing
      }),
      { count: allowed.count }
    );
  }
  return active;
}
var startCycleHandler = defineActionHandler({
  type: "START_CYCLE",
  level: "L1",
  args: args2,
  async prepare(ctx, a) {
    const active = await check2(ctx.db, ctx.userId, a.groupId);
    const pending = await ctx.db.invite.count({
      where: { groupId: a.groupId, usedAt: null, revokedAt: null, expiresAt: { gt: ctx.now } }
    });
    return {
      title: ui((c) => c.confirmation.actions.startCycle.title, { cycle: 1 }),
      lines: [],
      total: null,
      notes: [
        ui((c) => active === 1 ? c.startCycle.body_one : c.startCycle.body_other, {
          count: active
        }),
        ...pending > 0 ? [
          ui(
            (c) => pending === 1 ? c.startCycle.pendingInvites_one : c.startCycle.pendingInvites_other,
            { count: pending }
          )
        ] : []
      ],
      confirmLabel: ui((c) => c.confirmation.actions.startCycle.button)
    };
  },
  async execute(ctx, a) {
    await check2(ctx.db, ctx.userId, a.groupId);
    const port2 = moneyPort();
    if (!port2) throw cycleError("CYCLE_START_UNAVAILABLE");
    const started = await port2.startCycle(ctx.db, {
      groupId: a.groupId,
      startedByUserId: ctx.userId
    });
    await audit(
      {
        action: "cycle.started",
        actorUserId: ctx.userId,
        groupId: a.groupId,
        target: `Group:${a.groupId}`,
        details: { cycle: started.cycleNumber }
      },
      ctx.db
    );
    return {
      outcome: "done",
      resultRef: a.groupId,
      summary: ui((c) => c.confirmation.actions.startCycle.done)
    };
  }
});

// src/modules/invites/invites.actions.ts
import { z as z22 } from "zod";

// src/modules/invites/invites.errors.ts
var inviteError = defineErrors({
  GROUP_FULL: { status: 409, text: groupErrorTexts.GROUP_FULL },
  GROUP_CLOSED: { status: 409, text: groupErrorTexts.GROUP_CLOSED },
  PROPOSAL_REQUIRED: { status: 409, text: groupErrorTexts.PROPOSAL_REQUIRED },
  PROPOSAL_NOT_PASSED: { status: 409, text: groupErrorTexts.PROPOSAL_NOT_PASSED },
  PROPOSAL_PHONE_MISMATCH: { status: 400, text: groupErrorTexts.PROPOSAL_PHONE_MISMATCH },
  PROPOSAL_ALREADY_USED: { status: 409, text: groupErrorTexts.PROPOSAL_ALREADY_USED },
  INVITE_ALREADY_PENDING: { status: 409, text: groupErrorTexts.INVITE_ALREADY_PENDING },
  INVITE_NOT_FOUND: { status: 404, text: groupErrorTexts.INVITE_NOT_FOUND },
  INVITE_EXPIRED: { status: 410, text: groupErrorTexts.INVITE_EXPIRED },
  INVITE_USED: { status: 410, text: groupErrorTexts.INVITE_USED },
  INVITE_PHONE_MISMATCH: { status: 403, text: groupErrorTexts.INVITE_PHONE_MISMATCH },
  ALREADY_MEMBER: { status: 409, text: groupErrorTexts.ALREADY_MEMBER }
});

// src/modules/invites/invites.actions.ts
var INVITE_TTL_MS = 72 * 60 * 60 * 1e3;
var inviteArgsSchema = z22.strictObject({
  groupId: z22.string().uuid(),
  inviteeName: nameSchema(),
  /** HMAC of the invited phone (lib/crypto hashPhone); the number itself is never stored. */
  phoneHash: z22.string().regex(/^[0-9a-f]{64}$/),
  proposalId: z22.string().uuid().nullable()
});
function openInvitesWhere(groupId, now) {
  return { groupId, usedAt: null, revokedAt: null, expiresAt: { gt: now } };
}
async function checkInvite(ctx, args3, db) {
  const access = await authorizeGroup(ctx.userId, args3.groupId, "group.invites.create", db);
  const firstCycleStarted = access.group.status !== "FORMING";
  const pendingInvites = await db.invite.count({ where: openInvitesWhere(args3.groupId, ctx.now) });
  const memberCount = await countMembers(args3.groupId, db) + pendingInvites;
  if (args3.proposalId) {
    const proposal = await db.proposal.findFirst({
      where: { id: args3.proposalId, groupId: args3.groupId, type: "MEMBER_ADD" },
      select: { status: true, payload: true }
    });
    if (!proposal || proposal.status !== "PASSED") throw inviteError("PROPOSAL_NOT_PASSED");
    if (!safeEqual(readMemberAddPayload(proposal.payload).phoneHash, args3.phoneHash)) {
      throw inviteError("PROPOSAL_PHONE_MISMATCH");
    }
    const previous = await db.invite.findMany({
      where: { proposalId: args3.proposalId },
      select: { usedAt: true, revokedAt: true, expiresAt: true }
    });
    if (previous.some((i) => i.usedAt)) throw inviteError("PROPOSAL_ALREADY_USED");
    if (previous.some((i) => !i.revokedAt && i.expiresAt > ctx.now))
      throw inviteError("INVITE_ALREADY_PENDING");
  } else {
    const samePerson = await db.invite.count({
      where: { ...openInvitesWhere(args3.groupId, ctx.now), phoneHash: args3.phoneHash }
    });
    if (samePerson > 0) throw inviteError("INVITE_ALREADY_PENDING");
  }
  const decision = canInvite({
    firstCycleStarted,
    memberAddPassed: args3.proposalId !== null,
    memberCount
  });
  if (!decision.ok) {
    if (decision.code === "GROUP_FULL")
      throw inviteError("GROUP_FULL", { params: { max: decision.maximum } });
    throw inviteError("PROPOSAL_REQUIRED");
  }
  return { founding: !firstCycleStarted };
}
var inviteCreateHandler = defineActionHandler({
  type: "INVITE_CREATE",
  level: "L1",
  args: inviteArgsSchema,
  async prepare(ctx, args3) {
    const { founding } = await checkInvite(ctx, args3, ctx.db);
    const name = { name: args3.inviteeName };
    return {
      title: ui((c) => c.invite.approved.title, name),
      lines: [],
      total: null,
      notes: [
        bilingual(founding ? inviteActionTexts.noteFounding : inviteActionTexts.noteNextCycle, name),
        ui((c) => c.invite.founding.phoneHelp),
        inviteActionTexts.noteLink
      ],
      confirmLabel: ui((c) => c.confirmation.actions.createInvite.button)
    };
  },
  async execute(ctx, args3) {
    const creator = await authorizeGroup(ctx.userId, args3.groupId, "group.invites.create", ctx.db);
    const token = randomToken(32);
    const expiresAt = new Date(ctx.now.getTime() + INVITE_TTL_MS);
    const invite2 = await ctx.db.invite.create({
      data: {
        groupId: args3.groupId,
        proposalId: args3.proposalId,
        inviteeName: args3.inviteeName,
        phoneHash: args3.phoneHash,
        tokenHash: hashLinkToken(token),
        expiresAt,
        createdByMembershipId: creator.membership.id
      },
      select: { id: true }
    });
    await audit(
      {
        action: "invite.created",
        actorUserId: ctx.userId,
        groupId: args3.groupId,
        target: `Invite:${invite2.id}`,
        details: { founding: args3.proposalId === null }
      },
      ctx.db
    );
    return {
      outcome: "done",
      resultRef: invite2.id,
      summary: ui((c) => c.confirmation.actions.createInvite.done),
      data: {
        inviteId: invite2.id,
        link: `${getEnv().PUBLIC_APP_URL ?? getEnv().PUBLIC_BASE_URL}/invite/${token}`,
        expiresAt: expiresAt.toISOString()
      }
    };
  }
});

// src/modules/invites/invites.service.ts
var phoneAttempts = lazyLimiter({
  name: "invite-phone",
  points: 5,
  durationSeconds: 900,
  blockSeconds: 900
});

// src/modules/pending-actions/pending-actions.jobs.ts
function registerPendingActionJobs() {
  registerJob({
    name: "pendingActions.expire",
    process: async () => ({ expired: await expireDuePendingActions() })
  });
  registerRepeatable({
    id: "pendingActions.expire.everyMinute",
    name: "pendingActions.expire",
    pattern: "* * * * *"
  });
}

// src/modules/register.ts
var jobsRegistered = false;
function registerJobs() {
  if (jobsRegistered) return;
  jobsRegistered = true;
  registerPendingActionJobs();
  registerProposalJobs();
  registerNotificationJobs();
}

// src/jobs/queues.ts
import { randomUUID as randomUUID4 } from "node:crypto";
var log4 = componentLogger("jobs");
var DEFAULT_BATCH_SIZE = 20;
var MAX_BATCH_SIZE = 100;
var LEASE_MS = 6e4;
var MAX_ATTEMPTS = 8;
async function scheduleAt(name, data, at, jobId) {
  if (!getJobDefinition(name)) throw new Error(`Unknown job ${name}`);
  if (!jobId || jobId.length > 200) throw new Error("Invalid job id");
  await getPrisma().$executeRaw`
    INSERT INTO "DeploymentJob" ("id", "name", "jobKey", "payload", "runAt", "status", "attempts", "maxAttempts", "createdAt", "updatedAt")
    VALUES (${randomUUID4()}, ${name}, ${jobId}, ${JSON.stringify(data)}::jsonb, ${at}, 'PENDING', 0, ${Math.min(getJobDefinition(name)?.attempts ?? 3, MAX_ATTEMPTS)}, NOW(), NOW())
    ON CONFLICT ("name", "jobKey") DO UPDATE SET
      "payload" = EXCLUDED."payload", "runAt" = LEAST("DeploymentJob"."runAt", EXCLUDED."runAt"), "updatedAt" = NOW()
    WHERE "DeploymentJob"."status" IN ('PENDING', 'RETRY')`;
}
async function enqueueDueRepeatables(now = /* @__PURE__ */ new Date()) {
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: "Africa/Douala",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
    weekday: "short"
  }).formatToParts(now);
  const values = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  const minute = Number(values.minute);
  const hour = Number(values.hour);
  const day = Number(values.day);
  const month = Number(values.month);
  const weekday = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 }[values.weekday ?? ""];
  const currentMinute = `${values.year}-${values.month}-${values.day}T${values.hour}:${values.minute}`;
  let enqueued = 0;
  for (const repeatable of repeatableJobs()) {
    const fields = repeatable.pattern.trim().split(/\s+/);
    if (fields.length !== 5) throw new Error(`Unsupported cron pattern for ${repeatable.id}`);
    const current = [minute, hour, day, month, weekday];
    const matches = fields.every((field, index) => {
      if (field === "*") return true;
      const step = /^\*\/(\d+)$/.exec(field);
      if (step) return current[index] % Number(step[1]) === 0;
      return field.split(",").some((value) => Number(value) === current[index]);
    });
    if (!matches) continue;
    await scheduleAt(repeatable.name, repeatable.data ?? {}, now, `repeat-${repeatable.id}-${currentMinute}`);
    enqueued++;
  }
  return enqueued;
}
async function claimBatch(limit) {
  const leaseToken = randomUUID4();
  await getPrisma().$executeRaw`
    UPDATE "DeploymentJob" SET "status"='DEAD', "leaseUntil"=NULL, "leaseToken"=NULL, "updatedAt"=NOW()
    WHERE "status"='RUNNING' AND "leaseUntil" < NOW() AND "attempts" >= "maxAttempts"`;
  return getPrisma().$queryRaw`
    WITH candidates AS (
      SELECT "id" FROM "DeploymentJob"
      WHERE (("status" IN ('PENDING', 'RETRY') AND "runAt" <= NOW())
        OR ("status" = 'RUNNING' AND "leaseUntil" < NOW() AND "attempts" < "maxAttempts"))
      ORDER BY "runAt", "createdAt"
      FOR UPDATE SKIP LOCKED LIMIT ${limit}
    )
    UPDATE "DeploymentJob" j SET "status" = 'RUNNING', "leaseUntil" = NOW() + (${LEASE_MS} * INTERVAL '1 millisecond'),
      "leaseToken" = ${leaseToken}, "attempts" = j."attempts" + 1, "updatedAt" = NOW()
    FROM candidates c WHERE j."id" = c."id"
    RETURNING j."id", j."name", j."payload", j."attempts", j."leaseToken"`;
}
async function finish2(job) {
  await getPrisma().$executeRaw`UPDATE "DeploymentJob" SET "status"='SUCCEEDED', "leaseUntil"=NULL, "leaseToken"=NULL, "updatedAt"=NOW() WHERE "id"=${job.id} AND "leaseToken"=${job.leaseToken}`;
}
async function fail(job, error) {
  const message = error instanceof Error ? error.message.slice(0, 1e3) : "Job failed";
  const delay = Math.min(5e3 * 2 ** Math.max(0, job.attempts - 1), 3e5);
  await getPrisma().$executeRaw`
    UPDATE "DeploymentJob" SET "status"=CASE WHEN "attempts" >= "maxAttempts" THEN 'DEAD' ELSE 'RETRY' END,
      "runAt"=NOW() + (${delay} * INTERVAL '1 millisecond'), "leaseUntil"=NULL, "leaseToken"=NULL,
      "lastError"=${message}, "updatedAt"=NOW() WHERE "id"=${job.id} AND "leaseToken"=${job.leaseToken}`;
}
async function processDueJobs(requestedLimit = DEFAULT_BATCH_SIZE) {
  const limit = Math.max(1, Math.min(MAX_BATCH_SIZE, Math.floor(requestedLimit) || DEFAULT_BATCH_SIZE));
  const jobs = await claimBatch(limit);
  let succeeded = 0;
  let failed = 0;
  for (const job of jobs) {
    const definition = getJobDefinition(job.name);
    try {
      if (!definition) throw new Error(`No processor registered for ${job.name}`);
      const payload5 = typeof job.payload === "string" ? JSON.parse(job.payload) : job.payload;
      await definition.process({ data: payload5, name: job.name, id: job.id });
      await finish2(job);
      succeeded++;
    } catch (error) {
      await fail(job, error);
      log4.error({ job: job.name, jobId: job.id, err: error }, "job failed");
      failed++;
    }
  }
  return { claimed: jobs.length, succeeded, failed };
}
var JOB_BATCH_LIMIT = MAX_BATCH_SIZE;

// src/vercel-cron.ts
function authorized(request, secret2) {
  const header = request.headers.authorization;
  if (typeof header !== "string" || !header.startsWith("Bearer ")) return false;
  const supplied = Buffer.from(header.slice(7));
  const expected = Buffer.from(secret2);
  return supplied.length === expected.length && timingSafeEqual2(supplied, expected);
}
async function handler(request, response) {
  if (request.method !== "GET" && request.method !== "POST") {
    response.statusCode = 405;
    response.setHeader("Allow", "GET, POST");
    response.end();
    return;
  }
  const secret2 = getEnv().CRON_SECRET;
  if (!secret2 || !authorized(request, secret2)) {
    response.statusCode = 401;
    response.end();
    return;
  }
  try {
    registerJobs();
    const repeatables2 = await enqueueDueRepeatables();
    const result = await processDueJobs(JOB_BATCH_LIMIT);
    response.statusCode = 200;
    response.setHeader("Content-Type", "application/json");
    response.end(JSON.stringify({ ...result, repeatables: repeatables2 }));
  } catch {
    response.statusCode = 500;
    response.end();
  }
}
export {
  handler as default
};

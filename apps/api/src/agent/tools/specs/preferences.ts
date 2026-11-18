// Spec 4.6 "Preferences (L0, applied immediately)", plus the group channel's private hand-off.
import { z } from 'zod';
import { defineSpec } from '../types';
import { GROUP_ONLY, PRIVATE, s } from './common';

const PREF = { level: 'L0', who: 'member', category: 'account', channels: PRIVATE } as const;
const hhmm = z
  .string()
  .regex(/^([01]\d|2[0-3]):[0-5]\d$/)
  .describe('HH:MM, Douala time.');

export const preferenceSpecs = {
  set_language: defineSpec({
    ...PREF,
    name: 'set_language',
    description: 'Changes the member’s app and assistant language.',
    args: s({ language: z.enum(['fr', 'en']) }),
    example: { language: 'en' },
  }),
  set_notification_prefs: defineSpec({
    ...PREF,
    name: 'set_notification_prefs',
    description:
      'Mutes or unmutes the active group’s chat, changes quiet hours, or mutes notification categories (security alerts can never be muted).',
    args: s({
      muteChat: z.boolean().optional(),
      quietHours: s({ from: hhmm, to: hhmm }).optional(),
      categories: z
        .array(z.enum(['REMINDERS', 'MONEY', 'VOTES', 'GROUP']))
        .max(4)
        .optional()
        .describe('The categories to mute; the others are turned back on.'),
    }),
    example: { muteChat: true },
  }),
  switch_group: defineSpec({
    ...PREF,
    name: 'switch_group',
    description: 'Changes the member’s active group, by its name as given by list_my_groups.',
    args: s({ group: z.string().min(1).max(80) }),
    example: { group: 'Njangi du quartier' },
  }),
  mark_chat_read: defineSpec({
    ...PREF,
    name: 'mark_chat_read',
    category: 'chat',
    needs: 'chat',
    description: 'Marks the active group’s chat as read.',
    args: s({}),
    example: {},
  }),
  reply_privately: defineSpec({
    level: 'L0',
    who: 'member',
    category: 'reading',
    channels: GROUP_ONLY,
    name: 'reply_privately',
    description:
      'Group chat only: use ONLY when the asking member asks about their own personal financial situation (what they personally owe, their personal debts, their personal loan) or asks you to prepare an action/confirmation card. Do NOT call this for greetings, general group questions, or group chat summaries: answer those directly in the group.',
    args: s({}),
    example: {},
  }),
};

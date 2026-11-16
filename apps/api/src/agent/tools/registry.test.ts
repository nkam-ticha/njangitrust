import { readdirSync, readFileSync, statSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import type { AgentCtx } from '../types';
import { ALL_TOOLS, productionRegistry } from './catalogue';
import { runTool } from './execute';
import { argumentsSchema } from './registry';
import { ALL_SPECS } from './specs';

// Spec 4.6, every table, in order.
const SPEC_46 = {
  L0: [
    'get_my_overview',
    'get_round',
    'list_unpaid',
    'get_payout_breakdown',
    'get_funds',
    'get_ledger',
    'get_rules',
    'explain_rule',
    'list_members',
    'get_member',
    'list_proposals',
    'get_proposal',
    'list_loans',
    'get_loan_quote',
    'list_bids',
    'get_solidarity',
    'get_meeting',
    'summarize_unread',
    'search_chat',
    'list_my_groups',
    'get_statement',
    'export_ledger',
    'get_my_payment_number',
    'get_notifications',
    'get_agent_history',
    'set_language',
    'set_notification_prefs',
    'switch_group',
    'mark_chat_read',
    'draft_minutes',
  ],
  L1: [
    'pay',
    'pay_debts',
    'withdraw',
    'request_loan',
    'repay_loan',
    'decide_loan',
    'place_bid',
    'propose_rule_change',
    'propose_member_add',
    'propose_member_removal',
    'propose_rotation_change',
    'propose_admin_change',
    'propose_fine_waiver',
    'propose_ledger_correction',
    'request_early_exit',
    'announce_leave_at_cycle_end',
    'cast_vote',
    'request_solidarity',
    'add_agenda_item',
    'check_in',
    'send_absence_excuse',
    'post_to_group',
    'schedule_meeting',
    'mark_attendance',
    'publish_minutes',
    'post_announcement',
    'create_invite',
    'start_cycle',
    'hide_message',
  ],
  L2: ['change_payment_number', 'delete_my_account'],
};
const GROUP_46 = [
  'get_round',
  'list_unpaid',
  'get_payout_breakdown',
  'get_funds',
  'get_ledger',
  'get_rules',
  'explain_rule',
  'list_members',
  'get_member',
  'list_proposals',
  'get_proposal',
  'list_loans',
  'list_bids',
  'get_solidarity',
  'get_meeting',
];
const ADMIN_46 = [
  'decide_loan',
  'schedule_meeting',
  'mark_attendance',
  'draft_minutes',
  'publish_minutes',
  'post_announcement',
  'create_invite',
  'start_cycle',
  'hide_message',
];
/** Argument names that would let the model choose who acts. */
const ACTOR_FIELDS = [
  'userId',
  'user_id',
  'actorId',
  'actor',
  'memberId',
  'membershipId',
  'callerId',
  'requesterId',
  'asUser',
  'asUserId',
  'onBehalfOf',
  'authorUserId',
  'ownerId',
  'sessionId',
  'token',
  'pin',
];

describe('tool catalogue (spec 4.6)', () => {
  it('has exactly the tools of spec 4.6, at their level, plus the group hand-off', () => {
    const levels = Object.fromEntries(ALL_SPECS.map((s) => [s.name, s.level]));
    for (const [level, names] of Object.entries(SPEC_46)) {
      for (const name of names) expect(levels[name], name).toBe(level);
    }
    const all = [...SPEC_46.L0, ...SPEC_46.L1, ...SPEC_46.L2, 'reply_privately'];
    expect(ALL_SPECS.map((s) => s.name).sort()).toEqual([...all].sort());
  });

  it('binds every spec to exactly one implementation', () => {
    expect(() => productionRegistry()).not.toThrow();
    expect(ALL_TOOLS).toHaveLength(ALL_SPECS.length);
  });

  it('offers in the group chat only the group-visible reading tools and the hand-off', () => {
    const group = ALL_SPECS.filter((s) => s.channels.includes('GROUP')).map((s) => s.name);
    expect(group.sort()).toEqual([...GROUP_46, 'reply_privately'].sort());
    for (const spec of ALL_SPECS.filter((s) => s.channels.includes('GROUP'))) {
      expect(spec.level, spec.name).toBe('L0');
    }
  });

  it('marks the admin tools', () => {
    expect(
      ALL_SPECS.filter((s) => s.who === 'admin')
        .map((s) => s.name)
        .sort(),
    ).toEqual([...ADMIN_46].sort());
  });
});

describe('tool arguments never choose the actor (spec 4.2)', () => {
  it.each(ALL_SPECS.map((s) => [s.name, s] as const))('%s', (_name, spec) => {
    const example = spec.example as Record<string, unknown>;
    expect(spec.args.safeParse(example).success).toBe(true);
    for (const field of ACTOR_FIELDS) {
      expect(spec.args.safeParse({ ...example, [field]: 'someone-else' }).success, field).toBe(
        false,
      );
    }
    const schema = argumentsSchema(spec) as { properties?: Record<string, unknown> };
    for (const key of Object.keys(schema.properties ?? {})) {
      expect(ACTOR_FIELDS.map((f) => f.toLowerCase())).not.toContain(key.toLowerCase());
    }
    expect(schema).toMatchObject({ type: 'object', additionalProperties: false });
  });
});

describe('no path by which the model can confirm (spec 4.5)', () => {
  it('has no tool that confirms, queries or reads raw rows', () => {
    for (const spec of ALL_SPECS) {
      expect(spec.name).not.toMatch(/(^|_)(confirm|sql|query|raw|execute|rows?)(_|$)/);
    }
  });

  it('never imports the confirmation code from the agent or any tool', () => {
    const src = path.resolve(fileURLToPath(new URL('.', import.meta.url)), '../..');
    const files: string[] = [];
    const walk = (dir: string) => {
      for (const entry of readdirSync(dir)) {
        const full = path.join(dir, entry);
        if (statSync(full).isDirectory()) walk(full);
        else if (/\.ts$/.test(entry) && !entry.endsWith('.test.ts')) files.push(full);
      }
    };
    walk(path.join(src, 'agent'));
    for (const dir of readdirSync(path.join(src, 'modules'))) {
      const moduleDir = path.join(src, 'modules', dir);
      if (!statSync(moduleDir).isDirectory()) continue;
      for (const entry of readdirSync(moduleDir)) {
        if (entry.endsWith('.tools.ts')) files.push(path.join(moduleDir, entry));
      }
    }
    expect(files.length).toBeGreaterThan(30);
    for (const file of files) {
      const text = readFileSync(file, 'utf8');
      expect(text, file).not.toMatch(/pending-actions\.confirm|confirmPendingAction|\/confirm['`]/);
    }
  });

  it('gives every action tool only a prepared card to return', () => {
    for (const spec of ALL_SPECS.filter((s) => s.level !== 'L0')) {
      expect(spec.description, spec.name).toMatch(/^(Admin: )?(Bidding mode: )?Prepares/i);
    }
  });
});

describe('tools sent to the model match the role and the channel (spec 4.2, 4.4, 4.8)', () => {
  const registry = productionRegistry();
  const names = (ctx: { channel: 'PRIVATE' | 'GROUP'; role: 'ADMIN' | 'MEMBER' | null }) =>
    registry.toolsFor(ctx).map((t) => t.name);

  it('never sends an admin tool to a member, in any channel', () => {
    for (const channel of ['PRIVATE', 'GROUP'] as const) {
      for (const role of ['MEMBER', null] as const) {
        for (const name of names({ channel, role })) expect(ADMIN_46, name).not.toContain(name);
      }
    }
  });

  it('sends the admin every tool in private, and nothing more than a member in the group', () => {
    expect(names({ channel: 'PRIVATE', role: 'ADMIN' }).sort()).toEqual(
      ALL_SPECS.filter((s) => s.channels.includes('PRIVATE'))
        .map((s) => s.name)
        .sort(),
    );
    expect(names({ channel: 'GROUP', role: 'ADMIN' }).sort()).toEqual(
      names({ channel: 'GROUP', role: 'MEMBER' }).sort(),
    );
  });

  it('sends only L0 group-visible reading tools in the group chat', () => {
    for (const role of ['ADMIN', 'MEMBER'] as const) {
      const sent = registry.toolsFor({ channel: 'GROUP', role });
      expect(sent.map((t) => t.name).sort()).toEqual([...GROUP_46, 'reply_privately'].sort());
      expect(sent.every((t) => t.level === 'L0')).toBe(true);
    }
  });

  it('keeps the same limits when routing narrows the categories', () => {
    const routed = registry.toolsFor({ channel: 'PRIVATE', role: 'MEMBER' }, [
      'meetings',
      'reading',
    ]);
    expect(routed.length).toBeGreaterThan(0);
    for (const tool of routed) {
      expect(['meetings', 'reading']).toContain(tool.category);
      expect(tool.who).toBe('member');
    }
  });

  it('refuses a tool the member was not sent, as if it did not exist', async () => {
    const ctx = { channel: 'PRIVATE', role: 'MEMBER', lang: 'fr' } as AgentCtx;
    const run = await runTool(registry, ctx, { id: 'c1', name: 'start_cycle', arguments: '{}' });
    expect(run.outcome).toEqual({
      status: 'INVALID',
      issues: [{ path: '(tool)', code: 'UNKNOWN_TOOL' }],
    });
    const group = { channel: 'GROUP', role: 'ADMIN', lang: 'fr' } as AgentCtx;
    const pay = await runTool(registry, group, { id: 'c2', name: 'pay', arguments: '{}' });
    expect(pay.status).toBe('INVALID');
  });
});

describe('nothing is kept in process memory between requests (serverless)', () => {
  it('has no module-level Map, Set or array of conversations, turns or traces in the agent', () => {
    const src = path.resolve(fileURLToPath(new URL('.', import.meta.url)), '..');
    const offenders: string[] = [];
    const walk = (dir: string) => {
      for (const entry of readdirSync(dir)) {
        const full = path.join(dir, entry);
        if (statSync(full).isDirectory()) {
          if (!['__tests__', 'evaluation'].includes(entry)) walk(full);
        } else if (
          /\.ts$/.test(entry) &&
          !entry.endsWith('.test.ts') &&
          entry !== 'memory-store.ts'
        ) {
          const text = readFileSync(full, 'utf8');
          // A collection created empty at module level is state that would outlive a request.
          if (/^(export )?(const|let) \w+ = new (Map|Set)(<[^>]*>)?\(\)/m.test(text))
            offenders.push(entry);
          if (/from 'ioredis'|from 'socket\.io'|from 'bullmq'/.test(text)) offenders.push(entry);
        }
      }
    };
    walk(src);
    expect(offenders).toEqual([]);
  });
});

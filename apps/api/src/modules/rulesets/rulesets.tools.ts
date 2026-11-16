// Agent tools for the rules (spec 4.6, 4.9 "Explaining rules"): the group's current values through
// the rulesets service, and the official wording from the rules registry of @njangi/rules.
import { findRules, type ParameterName, type RuleSetParams } from '@njangi/rules';
import { ok } from '../../agent/tools/outcomes';
import { needGroup } from '../../agent/tools/resolve-group';
import { SPECS } from '../../agent/tools/specs';
import { implement } from '../../agent/tools/types';
import { listProposals } from '../proposals';
import { ruleLabel, ruleValue } from './rule-display';
import { readRules } from './rulesets.service';

export const rulesetTools = [
  implement(SPECS.get_rules, async (ctx) => {
    const noGroup = needGroup(ctx);
    if (noGroup) return noGroup;
    const ruleSet = await readRules(ctx.userId, ctx.groupId!);
    const params = ruleSet.params as unknown as RuleSetParams;
    const open = await listProposals(ctx.userId, ctx.groupId!, { status: 'OPEN' });
    return ok({
      version: ruleSet.version,
      rules: (Object.keys(params) as ParameterName[]).map((name) => ({
        rule: ruleLabel(name)[ctx.lang],
        value: ruleValue(name, params[name])[ctx.lang],
      })),
      openRuleChanges: open
        .filter((v) => v.proposal.type === 'RULE_CHANGE')
        .map((v) => ({ id: v.proposal.id, title: v.title[ctx.lang] })),
    });
  }),
  // Pure: the registry holds the text of Part 3 in both languages.
  implement(SPECS.explain_rule, (ctx, a) => {
    const rules = findRules(a.topic, 3);
    return Promise.resolve(
      ok({
        rules: rules.map((r) => ({ id: r.id, section: r.title[ctx.lang], text: r.text[ctx.lang] })),
      }),
    );
  }),
];

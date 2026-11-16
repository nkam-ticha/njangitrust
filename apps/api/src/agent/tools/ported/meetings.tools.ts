// Meeting tools (spec 4.6, 4.9 minutes) through the meetings port; statements and account tools
// through theirs. Each module implements its port and registers it at start-up.
import { agentPorts } from '../../ports';
import { ok, prepared, unavailable } from '../outcomes';
import { needGroup } from '../resolve-group';
import { SPECS } from '../specs';
import { implement } from '../types';

export const meetingTools = [
  implement(SPECS.get_meeting, async (ctx, a) => {
    const port = agentPorts().meetings;
    if (!port) return unavailable('meetings', ctx.lang);
    return needGroup(ctx) ?? ok(await port.get(ctx, a));
  }),
  implement(SPECS.add_agenda_item, async (ctx, a) => {
    const port = agentPorts().meetings;
    if (!port) return unavailable('meetings', ctx.lang);
    return needGroup(ctx) ?? prepared(await port.prepareAgendaItem(ctx, a), ctx.lang);
  }),
  implement(SPECS.check_in, async (ctx, a) => {
    const port = agentPorts().meetings;
    if (!port) return unavailable('meetings', ctx.lang);
    return needGroup(ctx) ?? prepared(await port.prepareCheckIn(ctx, a), ctx.lang);
  }),
  implement(SPECS.send_absence_excuse, async (ctx, a) => {
    const port = agentPorts().meetings;
    if (!port) return unavailable('meetings', ctx.lang);
    return needGroup(ctx) ?? prepared(await port.prepareExcuse(ctx, a), ctx.lang);
  }),
  implement(SPECS.schedule_meeting, async (ctx, a) => {
    const port = agentPorts().meetings;
    if (!port) return unavailable('meetings', ctx.lang);
    return needGroup(ctx) ?? prepared(await port.prepareSchedule(ctx, a), ctx.lang);
  }),
  implement(SPECS.mark_attendance, async (ctx, a) => {
    const port = agentPorts().meetings;
    if (!port) return unavailable('meetings', ctx.lang);
    return needGroup(ctx) ?? prepared(await port.prepareAttendance(ctx, a), ctx.lang);
  }),
  implement(SPECS.draft_minutes, async (ctx, a) => {
    const port = agentPorts().meetings;
    if (!port) return unavailable('meetings', ctx.lang);
    const noGroup = needGroup(ctx);
    if (noGroup) return noGroup;
    const draft = await port.draftMinutes(ctx, a);
    return ok(draft, { card: { type: 'MINUTES_DRAFT', meetingId: a.meetingId } });
  }),
  implement(SPECS.publish_minutes, async (ctx, a) => {
    const port = agentPorts().meetings;
    if (!port) return unavailable('meetings', ctx.lang);
    return needGroup(ctx) ?? prepared(await port.preparePublish(ctx, a), ctx.lang);
  }),
];

export const statementAndAccountTools = [
  implement(SPECS.get_statement, async (ctx, a) => {
    const port = agentPorts().statements;
    if (!port) return unavailable('statements', ctx.lang);
    const noGroup = needGroup(ctx);
    if (noGroup) return noGroup;
    const { statementId, period } = await port.statement(ctx, a);
    return ok({ period, shownAsCard: true }, { card: { type: 'STATEMENT', statementId } });
  }),
  implement(SPECS.change_payment_number, async (ctx, a) => {
    const port = agentPorts().account;
    if (!port) return unavailable('account', ctx.lang);
    return prepared(await port.prepareChangePaymentNumber(ctx, a), ctx.lang);
  }),
  implement(SPECS.delete_my_account, async (ctx) => {
    const port = agentPorts().account;
    if (!port) return unavailable('account', ctx.lang);
    return prepared(await port.prepareDeleteAccount(ctx), ctx.lang);
  }),
];

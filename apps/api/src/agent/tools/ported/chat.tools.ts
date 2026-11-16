// Chat tools (spec 4.6, 4.9) through the chat port, which the chat module implements.
import { agentPorts } from '../../ports';
import { summarizeUnread } from '../../summarize';
import { ok, prepared, unavailable } from '../outcomes';
import { needGroup } from '../resolve-group';
import { SPECS } from '../specs';
import { implement } from '../types';

export const chatTools = [
  implement(SPECS.summarize_unread, async (ctx) => {
    const port = agentPorts().chat;
    if (!port) return unavailable('chat', ctx.lang);
    const noGroup = needGroup(ctx);
    if (noGroup) return noGroup;
    const source = await port.unread(ctx);
    const result = await summarizeUnread(source, ctx.lang);
    // Spec 4.9: the chat is then marked as read.
    await port.markRead(ctx);
    return ok(result);
  }),
  implement(SPECS.search_chat, async (ctx, a) => {
    const port = agentPorts().chat;
    if (!port) return unavailable('chat', ctx.lang);
    return needGroup(ctx) ?? ok(await port.search(ctx, a));
  }),
  implement(SPECS.mark_chat_read, async (ctx) => {
    const port = agentPorts().chat;
    if (!port) return unavailable('chat', ctx.lang);
    const noGroup = needGroup(ctx);
    if (noGroup) return noGroup;
    await port.markRead(ctx);
    return ok({ markedRead: true });
  }),
  implement(SPECS.post_to_group, async (ctx, a) => {
    const port = agentPorts().chat;
    if (!port) return unavailable('chat', ctx.lang);
    return needGroup(ctx) ?? prepared(await port.preparePost(ctx, a), ctx.lang);
  }),
  implement(SPECS.post_announcement, async (ctx, a) => {
    const port = agentPorts().chat;
    if (!port) return unavailable('chat', ctx.lang);
    return needGroup(ctx) ?? prepared(await port.prepareAnnouncement(ctx, a), ctx.lang);
  }),
  implement(SPECS.hide_message, async (ctx, a) => {
    const port = agentPorts().chat;
    if (!port) return unavailable('chat', ctx.lang);
    return needGroup(ctx) ?? prepared(await port.prepareHide(ctx, a), ctx.lang);
  }),
];

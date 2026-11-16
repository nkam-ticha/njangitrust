// The agent's REST routes (spec 2.7 Agent). Validate -> call the agent service -> map. There is no
// route here (or anywhere in the agent) that confirms a PendingAction: only the app's own call to
// POST /v1/pending-actions/:id/confirm does (spec 4.5).
//   GET  /v1/agent/status                  configured or not (bilingual), capabilities
//   POST /v1/agent/messages                a member's message; the reply (also streamed)
//   GET  /v1/agent/conversation            the member's own private conversation
//   GET  /v1/agent/conversations/:id       the same, by id (someone else's: not found)
//   GET  /v1/agent/history                 "Historique de l'assistant", the member's own only
import { Router } from 'express';
import { z } from 'zod';
import { uuidSchema } from '@njangi/shared/contracts/common';
import { agentListQuerySchema, agentMessageRequestSchema } from '@njangi/shared/contracts/agent';
import { actorOf, requireAuth } from '../http/auth';
import { handle } from '../http/validate';
import { agentError } from './errors';
import { getOwnConversation, listAgentHistory } from './history';
import { handleUserMessage } from './service/turns';
import { agentStatus } from './status';

export function agentRoutes(): Router {
  const router = Router();
  router.use(requireAuth());

  router.get(
    '/status',
    handle({}, (_input, _req, res) => {
      res.json(agentStatus());
    }),
  );

  router.post(
    '/messages',
    handle({ body: agentMessageRequestSchema }, async ({ body }, req, res) => {
      const turn = await handleUserMessage(actorOf(req), {
        text: body.text,
        ...(body.groupId !== undefined ? { groupId: body.groupId } : {}),
      });
      res.json({ turn });
    }),
  );

  router.get(
    '/conversation',
    handle({ query: agentListQuerySchema }, async ({ query }, req, res) => {
      const actor = actorOf(req);
      res.json(await getOwnConversation(actor.userId, actor.lang, query));
    }),
  );

  router.get(
    '/conversations/:id',
    handle(
      { params: z.strictObject({ id: uuidSchema }), query: agentListQuerySchema },
      async ({ params, query }, req, res) => {
        const actor = actorOf(req);
        const own = await getOwnConversation(actor.userId, actor.lang, query);
        if (!own.conversation || own.conversation.id !== params.id) {
          throw agentError('AGENT_TURN_NOT_FOUND');
        }
        res.json(own);
      },
    ),
  );

  router.get(
    '/history',
    handle({ query: agentListQuerySchema }, async ({ query }, req, res) => {
      res.json(await listAgentHistory(actorOf(req).userId, query));
    }),
  );

  return router;
}

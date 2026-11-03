// Proposals (spec 2.7):
//   GET  /v1/groups/:groupId/proposals     list
//   POST /v1/groups/:groupId/proposals     returns a PROPOSAL_CREATE card (MEMBER_ADD in Phase 0)
//   GET  /v1/proposals/:id                 one proposal
//   POST /v1/proposals/:id/votes           returns a VOTE_CAST card
import { Router } from 'express';
import { z } from 'zod';
import { uuidSchema } from '@njangi/shared/contracts/common';
import { castVoteRequestSchema, createProposalRequestSchema } from '@njangi/shared/contracts/proposals';
import { actorOf, requireAuth } from '../../http/auth';
import { handle } from '../../http/validate';
import { toPendingAction, toProposal } from '../../dto';
import { getProposal, listProposals, requestProposal, requestVote } from './proposals.service';

const groupParams = z.strictObject({ groupId: uuidSchema });
const idParams = z.strictObject({ id: uuidSchema });

export function proposalGroupRoutes(): Router {
  const router = Router();
  router.use(requireAuth());

  router.get(
    '/:groupId/proposals',
    handle({ params: groupParams }, async ({ params }, req, res) => {
      const views = await listProposals(actorOf(req).userId, params.groupId);
      res.json({ proposals: views.map(toProposal) });
    }),
  );

  router.post(
    '/:groupId/proposals',
    handle({ params: groupParams, body: createProposalRequestSchema }, async ({ params, body }, req, res) => {
      const action = await requestProposal(actorOf(req), params.groupId, body);
      res.status(201).json({ action: toPendingAction(action) });
    }),
  );

  return router;
}

export function proposalRoutes(): Router {
  const router = Router();
  router.use(requireAuth());

  router.get(
    '/:id',
    handle({ params: idParams }, async ({ params }, req, res) => {
      res.json({ proposal: toProposal(await getProposal(actorOf(req).userId, params.id)) });
    }),
  );

  router.post(
    '/:id/votes',
    handle({ params: idParams, body: castVoteRequestSchema }, async ({ params, body }, req, res) => {
      const action = await requestVote(actorOf(req), params.id, body);
      res.status(201).json({ action: toPendingAction(action) });
    }),
  );

  return router;
}

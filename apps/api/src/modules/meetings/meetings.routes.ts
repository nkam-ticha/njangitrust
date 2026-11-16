// Meeting routes (spec 2.7 Meetings, R15). Routes only validate, call the service and map through the
// allowlist mappers. A member's own acts (check-in, excuse, agenda item) act directly; the admin's
// changes (schedule, attendance, close, cancel, publish minutes) return a card to confirm.
//   POST /v1/groups/:groupId/meetings               schedule (card)        GET the group's meetings
//   GET  /v1/meetings/:id                           one meeting
//   POST /v1/meetings/:id/agenda-items | check-in | excuse                 act directly
//   GET  /v1/meetings/:id/attendance                who is present, excused, absent
//   PUT  /v1/meetings/:id/attendance                the admin marks members (card)
//   POST /v1/meetings/:id/close | cancel            (cards)
//   POST /v1/meetings/:id/minutes/draft             a draft for the admin (L0, nothing published)
//   POST /v1/meetings/:id/minutes/publish           publish or correct (card)
//   GET  /v1/meetings/:id/minutes                   the published versions
import { Router } from 'express';
import { z } from 'zod';
import { uuidSchema } from '@njangi/shared/contracts/common';
import {
  addAgendaItemRequestSchema,
  draftMinutesRequestSchema,
  excuseRequestSchema,
  markAttendanceRequestSchema,
  meetingListQuerySchema,
  publishMinutesRequestSchema,
  scheduleMeetingRequestSchema,
} from '@njangi/shared/contracts/meetings';
import { actorOf, requireAuth } from '../../http/auth';
import { handle } from '../../http/validate';
import { toPendingAction } from '../../dto';
import {
  requestCancelMeeting,
  requestCloseMeeting,
  requestMarkAttendance,
  requestPublishMinutes,
  requestScheduleMeeting,
} from './meetings.actions';
import { addAgendaItem, checkIn, listAttendance, sendExcuse } from './meetings.attendance';
import { draftMinutes, listMinutes } from './meetings.minutes';
import { getMeeting, listMeetings } from './meetings.service';

const groupParams = z.strictObject({ groupId: uuidSchema });
const meetingParams = z.strictObject({ meetingId: uuidSchema });

export function meetingsGroupRoutes(): Router {
  const router = Router();
  router.use(requireAuth());

  router.post(
    '/:groupId/meetings',
    handle(
      { params: groupParams, body: scheduleMeetingRequestSchema },
      async ({ params, body }, req, res) => {
        const action = await requestScheduleMeeting(actorOf(req), params.groupId, body);
        res.status(201).json({ action: toPendingAction(action) });
      },
    ),
  );

  router.get(
    '/:groupId/meetings',
    handle(
      { params: groupParams, query: meetingListQuerySchema },
      async ({ params, query }, req, res) => {
        const meetings = await listMeetings(actorOf(req).userId, params.groupId, {
          ...(query.when ? { when: query.when } : {}),
          ...(query.limit ? { limit: query.limit } : {}),
        });
        res.json({ meetings });
      },
    ),
  );

  return router;
}

export function meetingRoutes(): Router {
  const router = Router();
  router.use(requireAuth());

  router.get(
    '/:meetingId',
    handle({ params: meetingParams }, async ({ params }, req, res) => {
      res.json({ meeting: await getMeeting(actorOf(req).userId, params.meetingId) });
    }),
  );

  router.post(
    '/:meetingId/agenda-items',
    handle(
      { params: meetingParams, body: addAgendaItemRequestSchema },
      async ({ params, body }, req, res) => {
        res
          .status(201)
          .json({ meeting: await addAgendaItem(actorOf(req).userId, params.meetingId, body.text) });
      },
    ),
  );

  router.post(
    '/:meetingId/check-in',
    handle({ params: meetingParams }, async ({ params }, req, res) => {
      res.json({ meeting: await checkIn(actorOf(req).userId, params.meetingId) });
    }),
  );

  router.post(
    '/:meetingId/excuse',
    handle(
      { params: meetingParams, body: excuseRequestSchema },
      async ({ params, body }, req, res) => {
        res.json({ meeting: await sendExcuse(actorOf(req).userId, params.meetingId, body.reason) });
      },
    ),
  );

  router.get(
    '/:meetingId/attendance',
    handle({ params: meetingParams }, async ({ params }, req, res) => {
      res.json({ attendance: await listAttendance(actorOf(req).userId, params.meetingId) });
    }),
  );

  router.put(
    '/:meetingId/attendance',
    handle(
      { params: meetingParams, body: markAttendanceRequestSchema },
      async ({ params, body }, req, res) => {
        const action = await requestMarkAttendance(actorOf(req), params.meetingId, body.marks);
        res.status(201).json({ action: toPendingAction(action) });
      },
    ),
  );

  router.post(
    '/:meetingId/close',
    handle({ params: meetingParams }, async ({ params }, req, res) => {
      const action = await requestCloseMeeting(actorOf(req), params.meetingId);
      res.status(201).json({ action: toPendingAction(action) });
    }),
  );

  router.post(
    '/:meetingId/cancel',
    handle({ params: meetingParams }, async ({ params }, req, res) => {
      const action = await requestCancelMeeting(actorOf(req), params.meetingId);
      res.status(201).json({ action: toPendingAction(action) });
    }),
  );

  router.post(
    '/:meetingId/minutes/draft',
    handle(
      { params: meetingParams, body: draftMinutesRequestSchema },
      async ({ params, body }, req, res) => {
        const draft = await draftMinutes(actorOf(req).userId, params.meetingId, body.notes ?? null);
        res.json({ draft: { ...draft, generatedAt: draft.generatedAt.toISOString() } });
      },
    ),
  );

  router.post(
    '/:meetingId/minutes/publish',
    handle(
      { params: meetingParams, body: publishMinutesRequestSchema },
      async ({ params, body }, req, res) => {
        const action = await requestPublishMinutes(actorOf(req), params.meetingId, body);
        res.status(201).json({ action: toPendingAction(action) });
      },
    ),
  );

  router.get(
    '/:meetingId/minutes',
    handle({ params: meetingParams }, async ({ params }, req, res) => {
      res.json({
        meetingId: params.meetingId,
        versions: await listMinutes(actorOf(req).userId, params.meetingId),
      });
    }),
  );

  return router;
}

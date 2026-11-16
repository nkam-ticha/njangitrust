// Test helpers for the agent: an app with the agent routes mounted (until the router wiring), a
// client that scans every response for foreign phone numbers, and a scripted model.
import express, { type Express } from 'express';
import request, { type Response } from 'supertest';
import { normalizeCameroonPhone } from '@njangi/shared';
import { afterEach } from 'vitest';
import { testApp } from '../../../test/helpers/app';
import type { TestUser } from '../../../test/helpers/client';
import { assertNoForeignPhones } from '../../../test/helpers/phone-scanner';
import { errorHandler, notFound } from '../../http/error-handler';
import { useJobScheduler } from '../../jobs/dispatch';
import { registerAgentJobs } from '../agent.jobs';
import { agentRoutes } from '../agent.routes';
import { setAgentConfigForTests } from '../config';
import { agentMessageLimiter } from '../guards/rate-limit';
import { ScriptedLlm, type ScriptedStep, type ScriptFn } from '../llm/scripted';
import { setLlmForTests } from '../llm/provider';
import { resetAgentPortsForTests } from '../ports';

let app: Express | undefined;

/** The API (handlers and jobs registered by testApp) with /v1/agent mounted. */
export function agentApp(): Express {
  if (!app) {
    testApp();
    // The agent's jobs run in this process (tests await settleBackground()), as other suites do.
    useJobScheduler(null);
    registerAgentJobs();
    app = express();
    app.use(express.json());
    app.use('/v1/agent', agentRoutes());
    app.use(notFound());
    app.use(errorHandler());
  }
  return app;
}

export function agentApi(user: TestUser) {
  const allowed = [user.phone, user.paymentNumber].map((p) => normalizeCameroonPhone(p) ?? p);
  const scan = (res: Response, where: string) => {
    assertNoForeignPhones(res.body, allowed, where);
    return res;
  };
  const auth = `Bearer ${user.accessToken}`;
  return {
    get: async (path: string) =>
      scan(await request(agentApp()).get(path).set('Authorization', auth), `GET ${path}`),
    post: async (path: string, body: object) =>
      scan(
        await request(agentApp()).post(path).set('Authorization', auth).send(body),
        `POST ${path}`,
      ),
  };
}

/** The agent configured with a scripted model in place of OpenRouter. */
export function scriptedAgent(script: ScriptedStep[] | ScriptFn): ScriptedLlm {
  const llm = new ScriptedLlm(script);
  setAgentConfigForTests({ configured: true, apiKey: 'test-only', model: 'test/model' });
  setLlmForTests(llm);
  return llm;
}

export function unconfiguredAgent(): void {
  setAgentConfigForTests({ configured: false, apiKey: null, model: null });
  setLlmForTests(null);
}

afterEach(() => {
  setLlmForTests(null);
  setAgentConfigForTests(null);
  agentMessageLimiter.resetAllForTests();
  resetAgentPortsForTests();
});

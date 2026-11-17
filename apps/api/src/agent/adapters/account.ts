// The agent's account port (agent/ports.ts) on the account module: change my payment number, delete
// my account. Each is a card the member confirms with their PIN in the app (origin AGENT, level 2);
// the agent can only act for the member it is talking to (R13.7). The number the member typed is
// sealed in the card and never returned to the model.
import { requestChangePaymentNumber, requestDeleteAccount } from '../../modules/account';
import type { AgentAccountPort } from '../ports';

export const accountAdapter: AgentAccountPort = {
  prepareChangePaymentNumber(ctx, input) {
    return requestChangePaymentNumber(
      { userId: ctx.userId, lang: ctx.lang },
      { number: input.number, ...(input.operator ? { operator: input.operator } : {}) },
      'AGENT',
    );
  },
  prepareDeleteAccount(ctx) {
    return requestDeleteAccount({ userId: ctx.userId, lang: ctx.lang }, 'AGENT');
  },
};

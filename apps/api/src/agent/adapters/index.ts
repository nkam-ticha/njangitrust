// The agent's ports, each on the service behind it.
import { registerAgentPorts } from '../ports';
import { accountAdapter } from './account';
import { chatAdapter } from './chat';
import { meetingsAdapter } from './meetings';
import { moneyAdapter } from './money';
import { statementsAdapter } from './statements';

/** Start-up (modules/register.ts). Safe to call more than once. */
export function registerAgentAdapters(): void {
  registerAgentPorts({
    chat: chatAdapter,
    meetings: meetingsAdapter,
    statements: statementsAdapter,
    money: moneyAdapter,
    account: accountAdapter,
  });
}

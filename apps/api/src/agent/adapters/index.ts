// The agent's ports that have a service behind them today. The account port (change of payment
// number, account deletion) waits for those services; until then its tools answer "not available yet".
import { registerAgentPorts } from '../ports';
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
  });
}

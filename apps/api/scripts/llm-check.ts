// pnpm llm:check: asks every configured model, one by one and alone, to answer a short question
// and to call a tool, and prints for each: the provider, the account, the model, whether it
// answered, how long it took and what it did. Nothing is paid, proposed or changed; no member data
// is sent. Use it after adding or changing a key or a model, before starting the API.
// Run from apps/api: tsx --env-file=.env scripts/llm-check.ts
import { agentConfig } from '../src/agent/config';
import { FailoverLlm } from '../src/agent/llm/failover';
import { buildMembers } from '../src/agent/llm/provider';
import type { LlmRequest } from '../src/agent/llm/types';

const tools = [
  {
    name: 'get_rules',
    description: 'Reads the rules of the member’s group: contribution, fines, loans, votes.',
    parameters: { type: 'object', properties: {}, additionalProperties: false },
  },
  {
    name: 'get_my_overview',
    description: 'Reads what the member owes and when.',
    parameters: { type: 'object', properties: {}, additionalProperties: false },
  },
];

const base: LlmRequest = {
  model: '',
  purpose: 'turn',
  temperature: 0.2,
  tools,
  messages: [
    { role: 'system', content: 'You are Njangi, an assistant. Use a tool when a fact is needed.' },
    { role: 'user', content: 'Quelles sont les règles de mon groupe ?' },
  ],
};

async function main(): Promise<void> {
  const config = agentConfig();
  const members = buildMembers(config);
  if (members.length === 0) {
    console.log('No model is configured: set a key and a model in apps/api/.env (docs/AGENT.md).');
    process.exitCode = 1;
    return;
  }
  console.log(`${members.length} model(s), asked in this order (batch by batch):\n`);
  let failed = 0;
  for (const member of members) {
    const alone = new FailoverLlm([member], { memberTimeoutMs: 30_000 });
    const started = Date.now();
    const label = `${member.label ?? member.name}  ${member.model}`;
    try {
      const first = await alone.chat(base);
      const seconds = ((Date.now() - started) / 1000).toFixed(1);
      const call = first.toolCalls[0];
      if (!call) {
        console.log(`  OK   ${label}  ${seconds}s  answered in text, no tool call`);
        continue;
      }
      // Second step: give the tool's result back, as the runtime does, and expect an answer.
      const second = await alone.chat({
        ...base,
        messages: [
          ...base.messages,
          { role: 'assistant', content: first.text || null, toolCalls: [call], by: member.name },
          {
            role: 'tool',
            toolCallId: call.id,
            content: '{"cotisation":"10 000 FCFA","amende":"1 000 FCFA"}',
          },
        ],
      });
      const total = ((Date.now() - started) / 1000).toFixed(1);
      const good = second.text.trim().length > 0;
      if (!good) failed += 1;
      console.log(
        `  ${good ? 'OK  ' : 'FAIL'} ${label}  ${total}s  tool: ${call.name}, then ${good ? 'answered' : 'no answer'}`,
      );
    } catch (error) {
      failed += 1;
      const code = error instanceof Error ? error.message : 'unknown';
      console.log(`  FAIL ${label}  ${((Date.now() - started) / 1000).toFixed(1)}s  ${code}`);
    }
  }
  console.log(failed === 0 ? '\nAll models work.' : `\n${failed} model(s) did not work.`);
  if (failed > 0) process.exitCode = 1;
}

void main();

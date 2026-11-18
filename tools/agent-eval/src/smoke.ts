// pnpm agent:smoke: the first check after putting a model provider's key and model in the
// API environment. It signs in as a demo member through the real API, sends one harmless message
// to Njangi and prints the reply and the tools the agent called. Nothing is paid, proposed or
// changed. Without a key it prints exactly what to do.
//
// Needs the API running (pnpm dev:api) and the demo data (pnpm demo:seed). AGENT_API_URL overrides
// http://localhost:3000; the demo PIN only works on a development API.
import { ApiFailure, createClient } from '../../demo-seed/src/http';
import { DEMO_PIN, groups, paul } from '../../demo-seed/src/people';

const baseUrl = (process.env.AGENT_API_URL ?? 'http://localhost:3000').replace(/\/$/, '');
const print = (line = '') => process.stdout.write(`${line}\n`);
const api = createClient(baseUrl, print);

const MESSAGE = 'Bonjour Njangi. Quelles sont les règles de mon groupe ?';

const HOW_TO_CONFIGURE = [
  'Njangi is not configured on this API yet. To switch it on, give it at least one provider:',
  '',
  '  1. Create a key at openrouter.ai/keys, console.groq.com/keys or aistudio.google.com/apikey',
  '  2. Choose a model with tool calling (docs/AGENT.md, "Choosing the model")',
  '  3. Add both to apps/api/.env (local) and to the API project on Vercel (production):',
  '       OPENROUTER_API_KEY / OPENROUTER_MODEL, and/or GROQ_API_KEY / GROQ_MODEL,',
  '       and/or GOOGLE_AI_API_KEY / GOOGLE_AI_MODEL (more accounts: OPENROUTER_API_KEYS ...)',
  '  4. Check them:  pnpm llm:check',
  '  5. Restart the API (pnpm dev:api), or redeploy it on Vercel',
  '  6. Run again:  pnpm agent:smoke',
  '  7. Then:       pnpm agent:eval',
].join('\n');

interface Status {
  configured: boolean;
  toolRouting: boolean;
  capabilities: Record<string, boolean>;
}
interface Turn {
  reply: { text: string };
  toolCalls: { name: string; status: string }[];
  actions: unknown[];
  language: string;
}

async function main(): Promise<number> {
  print(`Njangi smoke test against ${baseUrl}`);
  let token: string;
  try {
    const login = await api.post<{ session: { accessToken: string } }>('/v1/auth/login', {
      phone: paul.phone,
      pin: DEMO_PIN,
    });
    token = login.session.accessToken;
  } catch (error) {
    if (error instanceof ApiFailure) {
      print(`Could not sign in as ${paul.name} (${error.code}). Run "pnpm demo:seed" first.`);
    } else {
      print(`The API does not answer at ${baseUrl}. Start it with "pnpm dev:api".`);
    }
    return 1;
  }

  let status: Status;
  try {
    status = await api.get<Status>('/v1/agent/status', token);
  } catch (error) {
    if (error instanceof ApiFailure && error.status === 404) {
      print('This API has no /v1/agent routes yet: the agent is not mounted in the router.');
      print('See the wiring list in .handoff/agent-engineer.md.');
      return 1;
    }
    throw error;
  }
  if (!status.configured) {
    print();
    print(HOW_TO_CONFIGURE);
    return 1;
  }
  const built = Object.entries(status.capabilities)
    .filter(([, on]) => on)
    .map(([name]) => name);
  print(`Configured. Tool routing: ${status.toolRouting ? 'on' : 'off'}.`);
  print(
    `Parts of the app the agent can reach: ${built.length ? built.join(', ') : 'governance only'}.`,
  );

  const { groups: mine } = await api.get<{ groups: { groupId: string; name: string }[] }>(
    '/v1/me/groups',
    token,
  );
  const group = mine.find((g) => g.name === groups[0]!.name) ?? mine[0];
  print();
  print(`${paul.name}: ${MESSAGE}`);
  try {
    const { turn } = await api.post<{ turn: Turn }>(
      '/v1/agent/messages',
      { text: MESSAGE, groupId: group?.groupId ?? null },
      token,
    );
    print(`Njangi: ${turn.reply.text}`);
    print();
    print(
      turn.toolCalls.length
        ? `Tool calls: ${turn.toolCalls.map((c) => `${c.name} (${c.status})`).join(', ')}`
        : 'Tool calls: none',
    );
    print(`Cards to confirm: ${turn.actions.length}. Reply language: ${turn.language}.`);
    print();
    print('The agent answers. Next: pnpm agent:eval');
    return 0;
  } catch (error) {
    if (error instanceof ApiFailure) {
      print(`The agent refused: ${error.code}. ${error.messageEn}`);
      if (error.code === 'AGENT_UNAVAILABLE') {
        const reason = typeof error.details.reason === 'string' ? error.details.reason : 'unknown';
        print(`Reason from the model provider: ${reason}.`);
        print(
          'LLM_AUTH: the key is wrong. LLM_BAD_REQUEST: the model id is wrong or has no tool calling.',
        );
      }
      return 1;
    }
    throw error;
  }
}

main()
  .then((code) => {
    process.exitCode = code;
  })
  .catch((error: unknown) => {
    process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
    process.exitCode = 1;
  });

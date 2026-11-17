# Njangi, the assistant: how it works and how to run it

Njangi is the assistant members talk to in the app (spec Part 4). This guide explains what it does, how to switch it on, how to choose its model, how to check it, and how to add a tool. The code is in `apps/api/src/agent`; the evaluation is in `tools/agent-eval`.

## How it works

A member writes a message. The server builds a short description of who they are (name, role, active group, the time in Douala), adds the last 20 lines of their conversation, and sends this to a language model together with the list of tools that this member may use here. The model answers either with text or with tool calls. The server runs each tool call as the member, gives the result back to the model, and repeats, at most 8 times. The final text goes through a guard and is shown to the member.

Five rules make this safe. They are enforced by code, not by asking the model nicely.

1. **The model acts only through tools, and tools act only as the member.** The acting member comes from the signed-in session. No tool accepts a user id, and unknown arguments are refused.
2. **The model can never confirm anything.** A tool that changes something only prepares a confirmation card (a PendingAction). The member taps the card in the app (and types their PIN for sensitive actions); the app then calls the server directly. There is no tool, route or code path by which the model reaches that confirmation.
3. **The model never receives phone numbers, PINs, tokens or secret votes.** Tools return short, allowlisted data. A phone number in any tool result is masked before it is sent, and again in the reply. The member's own full payment number is shown by the app as a card; the model only learns that the card was shown.
4. **The model does no arithmetic on money.** Amounts and dates arrive already computed by the services and already formatted. The evaluation fails any reply that states an amount or a date the server did not provide.
5. **Everything inside a tool result is data.** Chat messages, names and notes are wrapped so that they cannot pass for instructions.

Tools that depend on a part of the app that is not built yet answer "not available yet", and the model says so. The agent never pretends.

### In the group chat

When a member writes `@njangi` in the group chat, the agent answers in the group with reading tools only. A personal question or a request to act gets the group reply "Je t'ai répondu en privé" and the real answer goes to that member's private conversation.

### Hosting: one request, no memory

The API runs as serverless functions on Vercel with PostgreSQL on Supabase. The agent is written for that:

- **Nothing is kept in memory between requests.** Conversations, the count of messages per member and the "one turn at a time per member" lock all live in PostgreSQL.
- **A turn ends within one request.** A request may last 60 seconds. A turn has a budget of 40 seconds and each model call at most 20 seconds. A turn that runs out of time ends like one that runs out of steps: "Je n'ai pas pu terminer. Reformule ta demande, plus simplement." Cards already prepared are kept.
- **The reply is in the HTTP response.** Streaming is a comfort: text is also pushed to the member's own realtime channel as `agent.delta` (a few times per second, numbered with `seq`), then `agent.done`. If realtime is down, the app still gets the full reply.
- **Follow-ups are jobs.** The sentence the agent says after an action's result, and answers to `@njangi` in the group, run as queued jobs (`agent.actionResult`, `agent.groupMention`). In production the job runner starts every minute, so these can arrive up to a minute later.

## Configuration

Set these in `apps/api/.env` for local work, and in the API project's environment on Vercel for production. Never commit them.

| Variable | Needed | Meaning |
|---|---|---|
| `OPENROUTER_API_KEY` | yes | Your key from openrouter.ai. Without it the agent is off. |
| `OPENROUTER_MODEL` | yes | The model id, written exactly as OpenRouter shows it. |
| `OPENROUTER_BASE_URL` | no | Defaults to `https://openrouter.ai/api/v1`. |
| `AGENT_TOOL_ROUTING` | no | `on` to send the model fewer tools (see below). `off` by default. |

When the key or the model is missing, the rest of the app works normally. `POST /v1/agent/messages` answers 503 `AGENT_NOT_CONFIGURED` with a message in French and English, and `GET /v1/agent/status` says `configured: false`, so the app can show the message instead of the composer.

## First run

1. Start the local services and the API: `pnpm services:start`, then `pnpm dev:api`.
2. Load the demo people and groups: `pnpm demo:seed`.
3. Add `OPENROUTER_API_KEY` and `OPENROUTER_MODEL` to `apps/api/.env` and restart the API.
4. Run `pnpm agent:smoke`. It signs in as the demo member Paul, asks for the group's rules, and prints the reply and the tools that were called. Nothing is paid or changed. If something is missing, it tells you exactly what.
5. Run `pnpm agent:eval`.

## Choosing the model

No model is written in the code: `OPENROUTER_MODEL` decides. Models change quickly, so choose by these criteria (spec 4.11) and let the evaluation decide.

- **Tool calling with many tools.** The agent sends up to about 60 tool definitions. The model must support tool (function) calling on OpenRouter, pick the right tool, and fill arguments that match the schema. This matters most.
- **French and English.** It must answer in the language of the member's last message and use "tu" in French.
- **Following short rules exactly.** It must not invent amounts, must not say an action is done before the result arrives, and must ignore instructions hidden in chat messages.
- **Speed.** A turn must end within 40 seconds, usually with two or three model calls. Prefer a model that starts answering within a few seconds.
- **Cost.** Each message sends the system prompt and the tool list again. Compare the price for input tokens first.

The temperature is fixed at 0.2.

**Before changing the model or the system prompt, run `pnpm agent:eval`. Switch only if every run of every scenario passes.**

If a model that is otherwise good hesitates between tools, set `AGENT_TOOL_ROUTING=on`. A first, short call then sorts the request into categories (reading, payments, loans, governance, meetings, chat, account) and only those tools are sent. Run the evaluation again after turning it on.

## Running the evaluation

The evaluation plays the 30 scenarios of spec 5.4, three times each, against the real agent, the real services and the development database with the demo data. It checks that:

- the expected tools were called and forbidden ones were not;
- every amount, date and time in a reply came from a tool result, a result event, the session block or the member's own message;
- no phone number other than the member's own appears;
- the reply is in the member's language;
- nothing is described as done before its result event;
- what the scenario's own row of the table expects (a refusal, no digits, the hold, the vote).

```
pnpm agent:eval                    # live: the configured model, through OpenRouter
pnpm agent:eval --scripted         # no key needed: a scripted model stands in
pnpm agent:eval --only S05,S13     # some scenarios
pnpm agent:eval --runs 1           # fewer runs while exploring
```

A report is written to `tools/agent-eval/reports/` (not committed). The command exits with an error when any run fails.

**Results.** `PASS`: every run passed. `FAIL`: at least one run failed, with the check and the reason. `SKIPPED`: the scenario needs a part of the app that is not built yet (payments, the chat, statements). A skipped scenario is never a pass, and the summary says `INCOMPLETE` until all 30 run. Scenarios stop being skipped by themselves when their service is registered.

**Scripted mode** checks the harness, the loop, the tools and the guards without a model. The scripted model can only repeat facts the server really sent: when a tool does not return the amount a reply needs, the run fails. It says nothing about how a real model behaves.

**Live mode** makes real calls and costs money: 30 scenarios, three runs, two or three calls each.

Both modes need the database and the demo data, and remove the demo members' own conversations with the agent before each run.

## Adding a tool

1. **Write the spec** in `apps/api/src/agent/tools/specs/` (`reading.ts`, `preferences.ts` or `actions.ts`): name, category, level (`L0` reads or applies a preference, `L1` prepares a card, `L2` a card and the PIN), who (`member` or `admin`), channels, a description for the model, a strict zod schema for the arguments and one example. Never add an argument that says who is acting.
2. **Write the implementation** in the module that owns the service, in `<area>.tools.ts`, with `implement(SPECS.<name>, async (ctx, args) => ...)`. It only calls the service as `ctx.actor` and maps the result through an allowlist. No business logic, no money arithmetic, no database query.
   - A reading tool returns `ok({ ... })` with short, formatted data: amounts with `formatXAF`, dates in Douala time, names, never a phone number.
   - An action tool asks the service to check the request and create a PendingAction, then returns `prepared(action)`. The model receives only the id and a summary.
3. **Add it to the catalogue** in `apps/api/src/agent/tools/catalogue.ts`. The API refuses to start with a spec that has no implementation.
4. **Update the tests.** `tools/registry.test.ts` lists the tools of spec 4.6 by level, channel and role; add the name there. Add a test of the tool as a member, the admin, a member of another group and a member who has left (spec 5.3).
5. **Add texts** in French and English for anything the member may read.
6. **Run** `pnpm test`, then `pnpm agent:eval`. If the tool is one a scenario expects, check the scenario in `tools/agent-eval/src/scenarios/scenarios.json`.

If the service does not exist yet, declare what the tool needs in `apps/api/src/agent/ports.ts` and answer `unavailable(...)` until a port is registered. The chat, meetings, statements, money and account ports are in `apps/api/src/agent/adapters/`.

## Where things are

| Path | What |
|---|---|
| `apps/api/src/agent/prompts/system.md` | The system prompt (spec 4.7). Its version and hash are recorded with every turn. After editing it, copy the text into `system-text.ts` (what the deployed API uses; a test keeps the two equal) and update the version and hash in `index.ts`. |
| `apps/api/src/agent/adapters/` | The agent's ports on the chat, meetings and statements services. |
| `apps/api/src/agent/runtime/turn.ts` | The loop: model, tools, guard, storage, time budget. |
| `apps/api/src/agent/tools/` | Specs, registry (who gets which tool), execution. |
| `apps/api/src/agent/guards/` | Phone masking, data wrapping, redaction, message limit, turn lease. |
| `apps/api/src/agent/service/` | Entry points: a member's message, a group mention, an action's result. |
| `apps/api/src/agent/agent.jobs.ts` | The two queued jobs. |
| `apps/api/src/agent/evaluation/driver.ts` | How the evaluation drives the agent. |
| `tools/agent-eval/` | Scenarios, scripted replies, checks, report, smoke test. |

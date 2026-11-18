// Separate summarisation calls (spec 4.3 rolling summary, 4.9 summarize_unread). The text to sum up
// goes to the model as data, with every phone number masked first (spec 4.3: numbers are never sent
// to the provider); the answer passes the output guard and is never treated as a fact
// source for amounts (those keep coming from tools).
import type { Lang } from '@njangi/shared';
import { agentConfig } from './config';
import { redactForStorage } from './guards/redaction';
import { wrapData } from './guards/wrap';
import { getLlm } from './llm/provider';
import type { LlmClient, LlmRequest } from './llm/types';
import { SUMMARY_PROMPT } from './prompts';
import type { UnreadSource } from './ports';

/** A summary call made by a tool (summarize_unread), outside the turn's own budget. */
const SUMMARY_TIMEOUT_MS = 12_000;

const LANGUAGE_NAME: Record<Lang, string> = { fr: 'French, using "tu"', en: 'English' };

async function summarise(
  llm: LlmClient,
  instruction: string,
  lines: string[],
  lang: Lang,
  signal?: AbortSignal,
): Promise<string> {
  const config = agentConfig();
  const request: LlmRequest = {
    model: config.model ?? 'scripted',
    purpose: 'summary',
    temperature: config.temperature,
    // Room for a reasoning model to think before it writes the few lines asked for.
    maxTokens: 1_500,
    tools: [],
    messages: [
      { role: 'system', content: `${SUMMARY_PROMPT}\nLanguage: ${LANGUAGE_NAME[lang]}.` },
      {
        role: 'user',
        content: `${instruction}\n${wrapData(lines.map((line) => redactForStorage(line)))}`,
      },
    ],
  };
  // A summary is one bounded call inside a turn that must end within one serverless request.
  const response = await llm.chat(request, {
    signal: signal ?? AbortSignal.timeout(SUMMARY_TIMEOUT_MS),
  });
  return redactForStorage(response.text.trim());
}

/** 3 to 8 short lines about the unread chat; media listed by sender, voice notes never transcribed. */
export async function summarizeUnread(
  source: UnreadSource,
  lang: Lang,
  llm: LlmClient | null = getLlm(),
): Promise<{ summary: string; count: number; moreCount: number; media: string[] }> {
  const lines = [
    ...source.messages.map((m) =>
      m.kind === 'TEXT'
        ? `[${m.at}] ${m.author}: ${m.text ?? ''}`
        : `[${m.at}] ${m.author}: (${m.kind.toLowerCase()})`,
    ),
    ...source.events.map((e) => `[event] ${e}`),
  ];
  const base = { count: source.messages.length, moreCount: source.moreCount, media: source.media };
  if (lines.length === 0 || !llm) return { summary: '', ...base };
  const summary = await summarise(
    llm,
    'Summarise these group chat messages for the member in 3 to 8 short lines: decisions, money events, questions addressed to the member. Do not describe media content.',
    lines,
    lang,
  );
  return { summary, ...base };
}

/** The rolling summary of older conversation turns (spec 4.3). */
export async function summarizeConversation(
  previous: string | null,
  lines: string[],
  lang: Lang,
  llm: LlmClient | null = getLlm(),
  signal?: AbortSignal,
): Promise<string | null> {
  if (!llm || lines.length === 0) return previous;
  return summarise(
    llm,
    'Update the summary of this conversation between a member and the assistant in at most 8 short lines: what the member asked, what was prepared or done, what is pending. Keep it factual.',
    [...(previous ? [`Previous summary: ${previous}`] : []), ...lines],
    lang,
    signal,
  );
}

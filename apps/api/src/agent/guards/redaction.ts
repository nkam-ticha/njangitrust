// What the agent stores or logs (spec 4.8 point 7, CLAUDE.md rule 11): conversation text and tool
// arguments without any phone number (not even the member's own), PIN, token or link.
import { redact, redactText } from '../../lib/redact';
import { maskForeignPhones, maskPhonesDeep } from './phone-guard';
import { maskTypedSecrets } from './wrap';

/** Conversation text as stored in AgentMessage.content. */
export function redactForStorage(text: string): string {
  return maskForeignPhones(redactText(maskTypedSecrets(text)));
}

/** Tool arguments as stored in AgentMessage.toolArgsRedacted and the audit log. */
export function redactToolArgs(args: unknown): Record<string, unknown> {
  if (!args || typeof args !== 'object' || Array.isArray(args)) return {};
  return maskPhonesDeep(redact(args as Record<string, unknown>));
}

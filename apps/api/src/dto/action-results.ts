// The one-time result data of a confirmed action (an invite link, a PIN reset link), mapped by
// allowlist per action type (privacy-guard M4). Whatever a handler returns, only these fields of
// the known types leave the server; any other type returns null.
import type { ActionResultData } from '@njangi/shared/contracts/pending-actions';
import { z } from 'zod';

const invite = z.object({ inviteId: z.string(), link: z.string(), expiresAt: z.string() });
const pinReset = z.object({
  approved: z.boolean(),
  link: z.string().optional(),
  linkUsableFrom: z.string().optional(),
  linkExpiresAt: z.string().optional(),
});

export function toActionResultData(
  type: string,
  data: Record<string, unknown> | null,
): ActionResultData | null {
  if (!data) return null;
  switch (type) {
    case 'INVITE_CREATE': {
      const d = invite.parse(data);
      return { type, inviteId: d.inviteId, link: d.link, expiresAt: d.expiresAt };
    }
    case 'PIN_RESET_APPROVE': {
      const d = pinReset.parse(data);
      return {
        type,
        approved: d.approved,
        ...(d.link !== undefined ? { link: d.link } : {}),
        ...(d.linkUsableFrom !== undefined ? { linkUsableFrom: d.linkUsableFrom } : {}),
        ...(d.linkExpiresAt !== undefined ? { linkExpiresAt: d.linkExpiresAt } : {}),
      };
    }
    default:
      return null;
  }
}

// Fields our middleware adds to every Express request.
import type { AuthActor, ClientKind } from '../permissions/actor';

declare global {
  namespace Express {
    interface Request {
      /** Set by the request-id middleware; on every log line. */
      requestId: string;
      /** Parsed by the cookie middleware (only the web refresh cookie is ever read). */
      cookies: Record<string, string>;
      /** `web` when the X-Njangi-Client header says so (D1), otherwise `mobile`. */
      clientKind: ClientKind;
      /** Set by the auth middleware once the access token and session are verified. */
      actor?: AuthActor;
    }
  }
}

export {};

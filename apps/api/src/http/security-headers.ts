// Security headers for a JSON API (helmet) and no caching of personal data.
import helmet from 'helmet';
import type { RequestHandler } from 'express';

export function securityHeaders(options: { production: boolean }): RequestHandler[] {
  return [
    helmet({
      // The API serves JSON and signed files, never pages: nothing may run or frame it.
      contentSecurityPolicy: {
        useDefaults: false,
        directives: { defaultSrc: ["'none'"], frameAncestors: ["'none'"], baseUri: ["'none'"] },
      },
      crossOriginResourcePolicy: { policy: 'same-site' },
      // Invite and reset links carry tokens: never leak a URL through Referer.
      referrerPolicy: { policy: 'no-referrer' },
      strictTransportSecurity: options.production
        ? { maxAge: 31_536_000, includeSubDomains: true }
        : false,
    }),
    (_req, res, next) => {
      res.setHeader('Cache-Control', 'no-store');
      next();
    },
  ];
}

// Resolves the API origin (pure, no React Native import, so it is unit-tested). A phone needs the
// PC's LAN address from EXPO_PUBLIC_API_URL (D21). In a development browser the page's own host
// is used instead, so the PC browser on localhost keeps calling localhost: the API stays same-site
// and the Secure SameSite=Strict refresh cookie keeps working (D1).

const DEFAULT_API_URL = 'http://localhost:3000';
const DEV_HOST =
  /^(localhost|127(\.\d{1,3}){3}|10(\.\d{1,3}){3}|192\.168(\.\d{1,3}){2}|172\.(1[6-9]|2\d|3[01])(\.\d{1,3}){2})$/;
const HTTP_URL = /^(https?:\/\/)([^/:?#]+)(:\d+)?(\/.*)?$/;

export interface ApiUrlContext {
  /** The browser page's hostname (web only). */
  pageHost?: string | undefined;
  /** `__DEV__`: production builds always use the configured URL. */
  dev: boolean;
}

export function resolveApiUrl(configured: unknown, context: ApiUrlContext): string {
  const base = (
    typeof configured === 'string' && configured.trim() !== '' ? configured.trim() : DEFAULT_API_URL
  ).replace(/\/$/, '');
  const pageHost = context.pageHost;
  if (!context.dev || !pageHost || !DEV_HOST.test(pageHost)) return base;
  const match = HTTP_URL.exec(base);
  if (!match || !DEV_HOST.test(match[2] ?? '')) return base;
  return `${match[1]}${pageHost}${match[3] ?? ''}${match[4] ?? ''}`.replace(/\/$/, '');
}

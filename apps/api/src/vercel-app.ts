/**
 * Vercel HTTP-function source. The deployment build bundles this module into
 * `api/index.mjs`, so Node never needs to resolve TypeScript source imports at
 * runtime.
 */
import { createApp } from './app';

export default createApp();

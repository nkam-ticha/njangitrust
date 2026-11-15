// Stable function target for the public /api/cron rewrite. Keeping the public
// endpoint separate avoids a catch-all rewrite ever intercepting job requests.
export { default } from './cron';

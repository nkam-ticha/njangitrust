/**
 * Vercel HTTP-function entry point.
 *
 * The normal server entry point (src/server.ts) owns a long-lived HTTP server,
 * Socket.IO instance and BullMQ workers. Vercel invokes an Express app as a
 * request handler instead, so this file intentionally only exports the app.
 * Realtime sockets and scheduled workers still require a long-lived service.
 */
import { createApp } from '../src/app';

export default createApp();

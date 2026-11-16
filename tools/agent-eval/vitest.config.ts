import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vitest/config';

// Only the harness's own unit tests (checks, scripted replies): they need no database and no key.
// The workspace package resolves from source, so tests run even before `pnpm install` links it.
export default defineConfig({
  test: { include: ['src/**/*.test.ts'], environment: 'node' },
  resolve: {
    alias: {
      '@njangi/shared': fileURLToPath(
        new URL('../../packages/shared/src/index.ts', import.meta.url),
      ),
    },
  },
});

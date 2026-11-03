import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vitest/config';

// Resolves the workspace package from source, so tests run even before `pnpm install` links it.
export default defineConfig({
  resolve: {
    alias: {
      '@njangi/rules': fileURLToPath(new URL('../../packages/rules/src/index.ts', import.meta.url)),
    },
  },
});

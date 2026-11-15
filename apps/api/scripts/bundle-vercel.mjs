import { build } from 'esbuild';
import { existsSync } from 'node:fs';
import { mkdir } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const apiRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const workspaceRoot = resolve(apiRoot, '../..');

/** Bundle workspace source packages, but leave regular npm dependencies for Vercel's Node runtime. */
const workspacePackages = {
  name: 'njangi-workspace-packages',
  setup(buildApi) {
    buildApi.onResolve({ filter: /^@njangi\/(shared|rules)(?:\/|$)/ }, (args) => {
      const [, packageName, suffix = ''] = /^@njangi\/(shared|rules)(.*)$/.exec(args.path) ?? [];
      if (!packageName) return undefined;
      const entry = suffix || '/index';
      const sourceRoot = resolve(workspaceRoot, 'packages', packageName, 'src');
      const file = resolve(sourceRoot, `.${entry}.ts`);
      const directoryIndex = resolve(sourceRoot, `.${entry}`, 'index.ts');
      return { path: existsSync(file) ? file : directoryIndex };
    });
  },
};

await mkdir(resolve(apiRoot, 'api'), { recursive: true });
for (const [entryPoint, outfile] of [
  ['src/vercel-app.ts', 'api/index.mjs'],
  ['src/vercel-cron.ts', 'api/process-jobs.mjs'],
]) {
  await build({
    absWorkingDir: apiRoot,
    entryPoints: [entryPoint],
    outfile,
    bundle: true,
    platform: 'node',
    format: 'esm',
    packages: 'external',
    plugins: [workspacePackages],
  });
}

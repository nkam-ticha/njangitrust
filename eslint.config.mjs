import js from '@eslint/js';
import globals from 'globals';
import reactHooks from 'eslint-plugin-react-hooks';
import tseslint from 'typescript-eslint';

// Syntax that breaks CLAUDE.md rules 1, 2 and 9, reused below.
const noClock = [
  {
    selector: "NewExpression[callee.name='Date'][arguments.length=0]",
    message: 'Read the time through lib/clock (API) or take it as an argument (rules).',
  },
  {
    selector: "CallExpression[callee.object.name='Date'][callee.property.name='now']",
    message: 'Read the time through lib/clock (API) or take it as an argument (rules).',
  },
];
const noRandom = [
  {
    selector: "CallExpression[callee.object.name='Math'][callee.property.name='random']",
    message: 'The rules engine is deterministic; use the verifiable draw (R2.3).',
  },
];
const noFloatMoney = [
  {
    selector: "CallExpression[callee.name='parseFloat']",
    message: 'Money is an integer number of FCFA (CLAUDE.md rule 1).',
  },
  {
    selector: "CallExpression[callee.property.name='toFixed']",
    message: 'Money is an integer number of FCFA; format only with formatXAF.',
  },
];

export default tseslint.config(
  {
    ignores: [
      '**/node_modules/**',
      '**/dist/**',
      '**/coverage/**',
      '**/.expo/**',
      '**/web-build/**',
      // Temporary browser/QA profiles generated during local runs.
      '**/.tmp-*/**',
      'apps/api/prisma/migrations/**',
      'apps/api/generated/**',
      // Bundled Vercel functions are produced from src/ and are validated by the build instead.
      'apps/api/api/**/*.mjs',
      'docs/design/board/**',
      '**/*.config.js',
      // Plain Node helper scripts that run outside any TypeScript project.
      'scripts/**/*.cjs',
    ],
  },
  js.configs.recommended,
  ...tseslint.configs.recommendedTypeChecked,
  {
    languageOptions: {
      parserOptions: { projectService: true, tsconfigRootDir: import.meta.dirname },
    },
    rules: {
      '@typescript-eslint/no-unused-vars': [
        'error',
        { argsIgnorePattern: '^_', varsIgnorePattern: '^_' },
      ],
      '@typescript-eslint/consistent-type-imports': 'error',
      'no-restricted-properties': [
        'error',
        {
          property: '$queryRawUnsafe',
          message: 'Use tagged $queryRaw; never build SQL from strings.',
        },
        {
          property: '$executeRawUnsafe',
          message: 'Use tagged $executeRaw; never build SQL from strings.',
        },
      ],
    },
  },
  {
    files: ['**/*.{js,mjs,cjs}'],
    ...tseslint.configs.disableTypeChecked,
    languageOptions: { globals: globals.node, parserOptions: { projectService: false } },
  },
  {
    files: ['packages/rules/src/**/*.ts'],
    ignores: ['**/*.test.ts'],
    rules: { 'no-restricted-syntax': ['error', ...noClock, ...noRandom, ...noFloatMoney] },
  },
  {
    files: ['apps/api/src/**/*.ts'],
    ignores: ['apps/api/src/lib/clock.ts', '**/*.test.ts'],
    languageOptions: { globals: globals.node },
    rules: {
      'no-console': 'error',
      'no-restricted-syntax': ['error', ...noClock, ...noFloatMoney],
    },
  },
  {
    // Supertest response bodies are untyped; tests assert on them directly.
    files: ['**/*.test.ts', 'apps/api/test/**/*.ts'],
    rules: {
      '@typescript-eslint/no-unsafe-assignment': 'off',
      '@typescript-eslint/no-unsafe-member-access': 'off',
      '@typescript-eslint/no-unsafe-call': 'off',
      '@typescript-eslint/no-unsafe-argument': 'off',
      '@typescript-eslint/no-unsafe-return': 'off',
    },
  },
  {
    files: ['apps/mobile/**/*.{ts,tsx}'],
    plugins: { 'react-hooks': reactHooks },
    rules: {
      ...reactHooks.configs.recommended.rules,
      'no-restricted-syntax': ['error', ...noFloatMoney],
    },
  },
  {
    // React Native loads bundled fonts and images with require().
    files: ['apps/mobile/src/theme/fonts.ts', 'apps/mobile/src/ui/**/assets.ts'],
    rules: { '@typescript-eslint/no-require-imports': 'off' },
  },
);

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
      'apps/api/prisma/migrations/**',
      'docs/design/board/**',
      '**/*.config.js',
    ],
  },
  js.configs.recommended,
  ...tseslint.configs.recommendedTypeChecked,
  {
    languageOptions: {
      parserOptions: { projectService: true, tsconfigRootDir: import.meta.dirname },
    },
    rules: {
      '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_', varsIgnorePattern: '^_' }],
      '@typescript-eslint/consistent-type-imports': 'error',
      'no-restricted-properties': [
        'error',
        { property: '$queryRawUnsafe', message: 'Use tagged $queryRaw; never build SQL from strings.' },
        { property: '$executeRawUnsafe', message: 'Use tagged $executeRaw; never build SQL from strings.' },
      ],
    },
  },
  {
    files: ['**/*.{js,mjs,cjs}'],
    ...tseslint.configs.disableTypeChecked,
    languageOptions: { globals: globals.node },
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
    files: ['apps/mobile/**/*.{ts,tsx}'],
    plugins: { 'react-hooks': reactHooks },
    rules: {
      ...reactHooks.configs.recommended.rules,
      'no-restricted-syntax': ['error', ...noFloatMoney],
    },
  },
);

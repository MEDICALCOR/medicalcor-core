import eslint from '@eslint/js';
import tseslint from 'typescript-eslint';
import prettier from 'eslint-config-prettier';
import jsxA11y from 'eslint-plugin-jsx-a11y';

export default tseslint.config(
  // Global ignores
  {
    ignores: [
      '**/node_modules/**',
      '**/dist/**',
      '**/.turbo/**',
      '**/.trigger/**',
      '**/coverage/**',
      '**/*.test.ts',
      '**/__tests__/**',
      '**/.storybook/**',
      '**/*.stories.tsx',
      'scripts/**', // CLI scripts have different requirements
      'db/**', // Database scripts not in tsconfig
      // Files excluded from tsconfig due to cyclic dependency with @medicalcor/domain
      'packages/core/src/clinical/**',
      'packages/core/src/events/handlers/**',
      'packages/core/src/repositories/**',
      'packages/core/src/security/gdpr/**',
      // Architecture foundation - uses intentional patterns that trigger strict rules
      'packages/core/src/architecture/**',
    ],
  },

  // Base ESLint recommended rules
  eslint.configs.recommended,

  // TypeScript ESLint recommended rules
  ...tseslint.configs.strictTypeChecked,
  ...tseslint.configs.stylisticTypeChecked,

  // Global settings
  {
    languageOptions: {
      parserOptions: {
        projectService: {
          allowDefaultProject: [
            'eslint.config.js',
            'vitest.config.ts',
            'vitest.setup.ts',
            'packages/integrations/vitest.contract.config.ts',
          ],
        },
        tsconfigRootDir: import.meta.dirname,
      },
    },
  },

  // Accessibility rules for JSX (medical apps must be accessible)
  {
    files: ['**/*.tsx', '**/*.jsx'],
    plugins: {
      'jsx-a11y': jsxA11y,
    },
    rules: {
      // Critical for medical applications - must be accessible
      'jsx-a11y/alt-text': 'error',
      'jsx-a11y/anchor-has-content': 'error',
      'jsx-a11y/anchor-is-valid': 'error',
      'jsx-a11y/aria-activedescendant-has-tabindex': 'error',
      'jsx-a11y/aria-props': 'error',
      'jsx-a11y/aria-proptypes': 'error',
      'jsx-a11y/aria-role': 'error',
      'jsx-a11y/aria-unsupported-elements': 'error',
      'jsx-a11y/click-events-have-key-events': 'warn',
      'jsx-a11y/heading-has-content': 'error',
      'jsx-a11y/html-has-lang': 'error',
      'jsx-a11y/iframe-has-title': 'error',
      'jsx-a11y/img-redundant-alt': 'error',
      'jsx-a11y/interactive-supports-focus': 'warn',
      'jsx-a11y/label-has-associated-control': 'error',
      'jsx-a11y/media-has-caption': 'warn',
      'jsx-a11y/mouse-events-have-key-events': 'warn',
      'jsx-a11y/no-access-key': 'error',
      'jsx-a11y/no-autofocus': 'warn',
      'jsx-a11y/no-distracting-elements': 'error',
      'jsx-a11y/no-interactive-element-to-noninteractive-role': 'warn',
      'jsx-a11y/no-noninteractive-element-interactions': 'warn',
      'jsx-a11y/no-noninteractive-element-to-interactive-role': 'warn',
      'jsx-a11y/no-noninteractive-tabindex': 'warn',
      'jsx-a11y/no-redundant-roles': 'error',
      'jsx-a11y/no-static-element-interactions': 'warn',
      'jsx-a11y/role-has-required-aria-props': 'error',
      'jsx-a11y/role-supports-aria-props': 'error',
      'jsx-a11y/scope': 'error',
      'jsx-a11y/tabindex-no-positive': 'error',
    },
  },

  // ==========================================================================
  // Layer Boundary Enforcement: types → core → domain → application →
  //                             infrastructure → integrations → apps
  // Lower packages must never import from higher packages.
  // ==========================================================================

  // Domain layer restrictions (no infrastructure dependencies)
  {
    files: ['packages/domain/src/**/*.ts'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            {
              group: ['@medicalcor/application', '@medicalcor/application/*'],
              message: 'Domain layer cannot import from application layer',
            },
            {
              group: ['@medicalcor/infrastructure', '@medicalcor/infrastructure/*'],
              message: 'Domain layer cannot import from infrastructure layer',
            },
            {
              group: ['@medicalcor/integrations', '@medicalcor/integrations/*'],
              message: 'Domain layer cannot import from integrations layer',
            },
            {
              group: ['pg', 'pg/*'],
              message: 'Domain layer cannot import infrastructure dependencies (pg)',
            },
            {
              group: ['@supabase/supabase-js', '@supabase/*'],
              message: 'Domain layer cannot import infrastructure dependencies (supabase)',
            },
            {
              group: ['openai', 'openai/*'],
              message: 'Domain layer cannot import external SDK dependencies (openai)',
            },
            {
              group: ['fastify', 'fastify/*', '@fastify/*'],
              message: 'Domain layer cannot import HTTP framework dependencies (fastify)',
            },
            {
              group: ['ioredis', 'ioredis/*'],
              message: 'Domain layer cannot import infrastructure dependencies (redis)',
            },
            {
              group: ['@aws-sdk/*'],
              message: 'Domain layer cannot import infrastructure dependencies (AWS SDK)',
            },
          ],
        },
      ],
    },
  },

  // Core layer restrictions
  {
    files: ['packages/core/src/**/*.ts'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            {
              group: ['@medicalcor/domain', '@medicalcor/domain/*'],
              message: 'Core layer cannot import from domain layer',
            },
            {
              group: ['@medicalcor/application', '@medicalcor/application/*'],
              message: 'Core layer cannot import from application layer',
            },
            {
              group: ['@medicalcor/infrastructure', '@medicalcor/infrastructure/*'],
              message: 'Core layer cannot import from infrastructure layer',
            },
            {
              group: ['@medicalcor/integrations', '@medicalcor/integrations/*'],
              message: 'Core layer cannot import from integrations layer',
            },
          ],
        },
      ],
    },
  },

  // Types layer restrictions (foundation - no internal dependencies)
  {
    files: ['packages/types/src/**/*.ts'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            {
              group: ['@medicalcor/*'],
              message:
                'Types layer is the foundation and cannot import from any other @medicalcor package',
            },
          ],
        },
      ],
    },
  },

  // Application layer restrictions
  {
    files: ['packages/application/src/**/*.ts'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            {
              group: ['@medicalcor/infrastructure', '@medicalcor/infrastructure/*'],
              message: 'Application layer cannot import from infrastructure layer',
            },
            {
              group: ['@medicalcor/integrations', '@medicalcor/integrations/*'],
              message: 'Application layer cannot import from integrations layer',
            },
          ],
        },
      ],
    },
  },

  // Custom rules for code quality
  {
    rules: {
      // ===================================================================
      // TypeScript Strict Rules - Domain-Specific Code Quality
      // ===================================================================

      '@typescript-eslint/no-unused-vars': [
        'error',
        {
          argsIgnorePattern: '^_',
          varsIgnorePattern: '^_',
          caughtErrorsIgnorePattern: '^_',
        },
      ],
      '@typescript-eslint/consistent-type-imports': [
        'error',
        { prefer: 'type-imports', fixStyle: 'inline-type-imports' },
      ],
      '@typescript-eslint/no-import-type-side-effects': 'error',
      '@typescript-eslint/explicit-function-return-type': 'off',
      '@typescript-eslint/explicit-module-boundary-types': 'off',

      // STRICT: No any types - use unknown or proper types
      '@typescript-eslint/no-explicit-any': 'error',

      // STRICT: No unsafe member access on any
      '@typescript-eslint/no-unsafe-member-access': 'error',
      '@typescript-eslint/no-unsafe-call': 'error',
      '@typescript-eslint/no-unsafe-return': 'error',
      '@typescript-eslint/no-unsafe-assignment': 'error',
      '@typescript-eslint/no-unsafe-argument': 'error',

      // Non-null assertions should be reviewed carefully
      '@typescript-eslint/no-non-null-assertion': 'warn',

      // Allow defensive runtime checks even if TypeScript thinks they're unnecessary
      // These checks provide runtime safety for edge cases TypeScript can't detect
      '@typescript-eslint/no-unnecessary-condition': 'off',

      '@typescript-eslint/restrict-template-expressions': [
        'error',
        { allowNumber: true, allowBoolean: true },
      ],

      // Prefer nullish coalescing for safer defaults
      '@typescript-eslint/prefer-nullish-coalescing': 'error',

      // Ensure exhaustive switch statements for type safety
      '@typescript-eslint/switch-exhaustiveness-check': 'error',

      // ===================================================================
      // Code Quality & Complexity - Relaxed for Large Service Files
      // ===================================================================

      // Cyclomatic complexity limit (keep functions simple)
      // Increased from 15 to 25 for complex domain logic
      complexity: ['warn', { max: 25 }],

      // Maximum function lines (encourage smaller functions)
      // Increased from 100 to 150 for complex workflows
      'max-lines-per-function': ['warn', { max: 150, skipBlankLines: true, skipComments: true }],

      // Maximum file lines
      // Increased from 500 to 1000 for service aggregation files
      'max-lines': ['warn', { max: 1000, skipBlankLines: true, skipComments: true }],

      // Maximum nesting depth
      'max-depth': ['warn', { max: 4 }],

      // ===================================================================
      // General Quality Rules
      // ===================================================================

      // STRICT: No console.log in production code
      'no-console': ['error', { allow: ['warn', 'error', 'info', 'debug'] }],

      'prefer-const': 'error',
      'no-var': 'error',
      eqeqeq: ['error', 'always'],

      // No debugger statements in production
      'no-debugger': 'error',

      // No alert/confirm/prompt in production
      'no-alert': 'error',

      // Default case is nice but not always needed with exhaustive switches
      'default-case': 'off',

      // Disallow returning values from setters
      'no-setter-return': 'error',

      // ===================================================================
      // Relaxed for Practicality
      // ===================================================================

      '@typescript-eslint/no-confusing-void-expression': 'off',
      '@typescript-eslint/no-misused-promises': ['error', { checksVoidReturn: false }],
      '@typescript-eslint/no-deprecated': 'off',

      // Allow async functions without await (common pattern for route handlers)
      '@typescript-eslint/require-await': 'off',

      // Return-await is stylistic, not required
      '@typescript-eslint/return-await': 'off',
    },
  },

  // ==========================================================================
  // Web App Overrides
  // The web app uses Next.js with server actions that import from monorepo
  // packages. ESLint's projectService has trouble resolving types from
  // workspace packages, causing false positive "error typed value" warnings.
  // TypeScript compilation still verifies type safety via tsc.
  // ==========================================================================
  {
    files: ['apps/web/src/**/*.ts', 'apps/web/src/**/*.tsx'],
    rules: {
      // Relax type-aware rules that produce false positives with monorepo imports
      // Type safety is still enforced by TypeScript compiler (tsc --noEmit)
      '@typescript-eslint/no-unsafe-member-access': 'off',
      '@typescript-eslint/no-unsafe-call': 'off',
      '@typescript-eslint/no-unsafe-return': 'off',
      '@typescript-eslint/no-unsafe-assignment': 'off',
      '@typescript-eslint/no-unsafe-argument': 'off',
      '@typescript-eslint/no-redundant-type-constituents': 'off',
      '@typescript-eslint/restrict-plus-operands': 'off',

      // Keep important rules active
      '@typescript-eslint/no-explicit-any': 'error',
      '@typescript-eslint/no-unused-vars': [
        'error',
        {
          argsIgnorePattern: '^_',
          varsIgnorePattern: '^_',
          caughtErrorsIgnorePattern: '^_',
        },
      ],
    },
  },

  // Prettier compatibility (must be last)
  prettier
);

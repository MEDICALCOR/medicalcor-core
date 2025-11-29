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
      'scripts/**', // CLI scripts have different requirements
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
          allowDefaultProject: ['eslint.config.js', 'vitest.config.ts'],
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

      '@typescript-eslint/restrict-template-expressions': [
        'error',
        { allowNumber: true, allowBoolean: true },
      ],

      // Prefer nullish coalescing for safer defaults
      '@typescript-eslint/prefer-nullish-coalescing': 'error',

      // Ensure exhaustive switch statements for type safety
      '@typescript-eslint/switch-exhaustiveness-check': 'error',

      // ===================================================================
      // Code Quality & Complexity
      // ===================================================================

      // Cyclomatic complexity limit (keep functions simple)
      complexity: ['warn', { max: 15 }],

      // Maximum function lines (encourage smaller functions)
      'max-lines-per-function': [
        'warn',
        { max: 100, skipBlankLines: true, skipComments: true },
      ],

      // Maximum file lines
      'max-lines': [
        'warn',
        { max: 500, skipBlankLines: true, skipComments: true },
      ],

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

      // Require default case in switch
      'default-case': 'warn',

      // Disallow returning values from setters
      'no-setter-return': 'error',

      // ===================================================================
      // Relaxed for Practicality
      // ===================================================================

      '@typescript-eslint/no-confusing-void-expression': 'off',
      '@typescript-eslint/no-misused-promises': ['error', { checksVoidReturn: false }],
      '@typescript-eslint/no-deprecated': 'off',
    },
  },

  // Prettier compatibility (must be last)
  prettier
);

import { defineConfig } from 'vitest/config';
import path from 'path';

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    include: ['**/*.{test,spec}.{js,ts}'],
    exclude: ['**/node_modules/**', '**/dist/**', '**/e2e/**'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json', 'html'],
      // COVERAGE THRESHOLDS - Progressive ratcheting approach
      // Medical/Banking "Platinum" standard requires 80%+ coverage
      // Roadmap:
      //   - Phase 1 (Dec 2025): 70% - Current target
      //   - Phase 2 (Q1 2026):  80% - Medical compliance target
      // See: https://owasp.org/www-project-web-security-testing-guide/
      thresholds: {
        lines: 70,
        functions: 70,
        branches: 60,
        statements: 70,
      },
      exclude: [
        'node_modules/',
        'dist/',
        '**/*.d.ts',
        '**/__tests__/**',
        '**/__mocks__/**',
        '**/vitest.config.ts',
        '**/*.test.ts',
        '**/*.spec.ts',
        '**/coverage/**',
        '**/*.config.*',
        '**/e2e/**',
        '**/mocks/**',
        // Exclude files that are hard to test (infra/external deps)
        '**/index.ts',
        '**/env.ts',
        '**/telemetry.ts',
      ],
    },
    setupFiles: ['./vitest.setup.ts'],
    testTimeout: 10000,
  },
  resolve: {
    alias: {
      // Resolve workspace packages to their source files for testing
      '@medicalcor/types': path.resolve(__dirname, 'packages/types/src/index.ts'),
      '@medicalcor/core/repositories': path.resolve(
        __dirname,
        'packages/core/src/repositories/index.ts'
      ),
      '@medicalcor/core/observability/diagnostics': path.resolve(
        __dirname,
        'packages/core/src/observability/diagnostics.ts'
      ),
      '@medicalcor/core': path.resolve(__dirname, 'packages/core/src/index.ts'),
      '@medicalcor/domain': path.resolve(__dirname, 'packages/domain/src/index.ts'),
      '@medicalcor/infra': path.resolve(__dirname, 'packages/infra/src/index.ts'),
      '@medicalcor/integrations': path.resolve(__dirname, 'packages/integrations/src/index.ts'),
      '@medicalcor/integrations/__mocks__/handlers': path.resolve(
        __dirname,
        'packages/integrations/src/__mocks__/handlers.ts'
      ),
      '@medicalcor/integrations/__mocks__/server': path.resolve(
        __dirname,
        'packages/integrations/src/__mocks__/server.ts'
      ),
      '@medicalcor/application': path.resolve(__dirname, 'packages/application/src/index.ts'),
      '@medicalcor/infrastructure': path.resolve(__dirname, 'packages/infrastructure/src/index.ts'),
      // Resolve Next.js app aliases for testing
      '@': path.resolve(__dirname, 'apps/web/src'),
    },
  },
});

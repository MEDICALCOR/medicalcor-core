import { defineConfig } from 'vitest/config';
import path from 'path';

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    include: ['**/*.{test,spec}.{js,ts}'],
    exclude: ['**/node_modules/**', '**/dist/**', '**/e2e/**', 'tools/**'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json', 'html'],
      // COVERAGE THRESHOLDS - Medical/Banking "Platinum" standard
      // Target: 85%+ coverage for HIPAA/GDPR compliance
      // See: https://owasp.org/www-project-web-security-testing-guide/
      thresholds: {
        lines: 85,
        functions: 85,
        branches: 85,
        statements: 85,
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
      '@medicalcor/core/observability/instrumentation': path.resolve(
        __dirname,
        'packages/core/src/observability/instrumentation.ts'
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

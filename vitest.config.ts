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
      // Current: ~62% -> Target: 80%+ (Medical/Banking "Platinum" standard)
      // Increased from 30% baseline after comprehensive test suite expansion
      thresholds: {
        lines: 75,
        functions: 75,
        branches: 65,
        statements: 75,
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
      '@medicalcor/core': path.resolve(__dirname, 'packages/core/src/index.ts'),
      '@medicalcor/domain': path.resolve(__dirname, 'packages/domain/src/index.ts'),
      '@medicalcor/infra': path.resolve(__dirname, 'packages/infra/src/index.ts'),
      '@medicalcor/integrations': path.resolve(__dirname, 'packages/integrations/src/index.ts'),
      '@medicalcor/application': path.resolve(__dirname, 'packages/application/src/index.ts'),
      '@medicalcor/infrastructure': path.resolve(__dirname, 'packages/infrastructure/src/index.ts'),
      // Resolve Next.js app aliases for testing
      '@': path.resolve(__dirname, 'apps/web/src'),
    },
  },
});

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
      exclude: [
        'node_modules/',
        'dist/',
        '**/*.d.ts',
        '**/__tests__/**',
        '**/__mocks__/**',
        '**/vitest.config.ts',
        '**/*.test.ts',
        '**/*.spec.ts',
      ],
    },
    setupFiles: ['./vitest.setup.ts'],
    testTimeout: 10000,
  },
  resolve: {
    alias: {
      // Resolve workspace packages to their source files for testing
      '@medicalcor/types': path.resolve(__dirname, 'packages/types/src/index.ts'),
      '@medicalcor/core': path.resolve(__dirname, 'packages/core/src/index.ts'),
      '@medicalcor/domain': path.resolve(__dirname, 'packages/domain/src/index.ts'),
      '@medicalcor/infra': path.resolve(__dirname, 'packages/infra/src/index.ts'),
      '@medicalcor/integrations': path.resolve(__dirname, 'packages/integrations/src/index.ts'),
    },
  },
});

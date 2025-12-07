/**
 * Vitest Configuration for Contract Tests
 *
 * Separate configuration for Pact contract tests.
 * Contract tests run independently from unit tests to:
 * 1. Generate Pact contract files (pacts/*.json)
 * 2. Not interfere with MSW server used in regular tests
 * 3. Allow longer timeouts for Pact mock server setup
 */

import { defineConfig } from 'vitest/config';
import path from 'path';

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    include: ['src/__tests__/contracts/**/*.contract.test.ts'],
    // Exclude regular tests
    exclude: ['**/node_modules/**', '**/dist/**'],
    // Contract tests don't need MSW setup
    setupFiles: [],
    // Longer timeout for Pact server startup
    testTimeout: 30000,
    // Run contract tests sequentially to avoid port conflicts
    pool: 'forks',
    poolOptions: {
      forks: {
        singleFork: true,
      },
    },
  },
  resolve: {
    alias: {
      '@medicalcor/types': path.resolve(__dirname, '../../packages/types/src/index.ts'),
      '@medicalcor/core': path.resolve(__dirname, '../../packages/core/src/index.ts'),
      '@medicalcor/domain': path.resolve(__dirname, '../../packages/domain/src/index.ts'),
      '@medicalcor/integrations': path.resolve(__dirname, './src/index.ts'),
    },
  },
});

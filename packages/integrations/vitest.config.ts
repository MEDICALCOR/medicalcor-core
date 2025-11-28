import { defineConfig } from 'vitest/config';
import path from 'path';

export default defineConfig({
  resolve: {
    alias: {
      '@medicalcor/core': path.resolve(__dirname, '../core/dist/index.js'),
      '@medicalcor/domain': path.resolve(__dirname, '../domain/dist/index.js'),
      '@medicalcor/types': path.resolve(__dirname, '../types/dist/index.js'),
    },
  },
  test: {
    environment: 'node',
    include: ['src/__tests__/**/*.test.ts'],
    globals: false,
    testTimeout: 30000,
  },
});

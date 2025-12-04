/**
 * Vitest Setup File
 * Global test configuration and mocks
 */

import { beforeAll, afterEach, afterAll } from 'vitest';
import { server } from './packages/integrations/src/__mocks__/server.js';

// Mock environment variables for tests
process.env.NODE_ENV = 'test';
process.env.LOG_LEVEL = 'silent';

// Start MSW server before all tests
beforeAll(() => {
  server.listen({ onUnhandledRequest: 'bypass' });
});

// Reset handlers after each test (removes any runtime handlers added during tests)
afterEach(() => {
  server.resetHandlers();
});

// Clean up after all tests
afterAll(() => {
  server.close();
});

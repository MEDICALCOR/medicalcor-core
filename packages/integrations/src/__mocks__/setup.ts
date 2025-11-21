/**
 * Vitest Test Setup
 * Configures MSW server for all integration tests
 */

import { beforeAll, afterEach, afterAll } from 'vitest';
import { server } from './server.js';

// Start server before all tests
beforeAll(() => {
  server.listen({ onUnhandledRequest: 'warn' });
});

// Reset handlers after each test
afterEach(() => {
  server.resetHandlers();
});

// Close server after all tests
afterAll(() => {
  server.close();
});

// Re-export server for use in tests
export { server };
export { handlers, testFixtures, createRateLimitedHandler, createFailingHandler } from './handlers.js';

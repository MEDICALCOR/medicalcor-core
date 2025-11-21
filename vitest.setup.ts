import { beforeAll, afterAll, afterEach } from 'vitest';
import { server } from './packages/integrations/src/__mocks__/server.js';

// Start MSW server before all tests
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

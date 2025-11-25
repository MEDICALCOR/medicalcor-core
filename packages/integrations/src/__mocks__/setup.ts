/**
 * MSW Test Utilities
 *
 * Re-exports MSW server and test utilities for use in integration tests.
 * Lifecycle management (beforeAll/afterEach/afterAll) is handled by vitest.setup.ts
 * which is configured as a global setup file in vitest.config.ts.
 *
 * Test files should import from this module:
 * ```typescript
 * import { server, testFixtures, createRateLimitedHandler } from '../__mocks__/setup.js';
 * ```
 *
 * The server instance can be used for per-test handler overrides:
 * ```typescript
 * server.use(
 *   http.post('https://api.example.com/endpoint', () => {
 *     return HttpResponse.json({ custom: 'response' });
 *   })
 * );
 * ```
 */

export { server } from './server.js';
export {
  handlers,
  testFixtures,
  createRateLimitedHandler,
  createFailingHandler,
} from './handlers.js';

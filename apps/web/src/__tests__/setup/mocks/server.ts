/**
 * MSW server setup for Node.js testing environment (Vitest).
 * This server intercepts HTTP requests during tests.
 */
import { setupServer } from 'msw/node';
import { handlers } from './handlers';

/**
 * MSW server instance with default handlers.
 * Use server.use() in individual tests to override handlers.
 *
 * @example
 * ```ts
 * import { server } from '@/__tests__/setup/mocks/server';
 * import { http, HttpResponse } from 'msw';
 *
 * test('handles error state', async () => {
 *   server.use(
 *     http.get('/api/data', () => {
 *       return HttpResponse.json({ error: 'Failed' }, { status: 500 });
 *     })
 *   );
 *   // ... test error handling
 * });
 * ```
 */
export const server = setupServer(...handlers);

// Export handlers for test customization
export { handlers };

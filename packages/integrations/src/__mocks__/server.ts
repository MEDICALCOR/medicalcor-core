import { setupServer } from 'msw/node';
import { handlers } from './handlers.js';

/**
 * MSW Server for Node.js testing
 * Intercepts HTTP requests during tests
 */
export const server = setupServer(...handlers);

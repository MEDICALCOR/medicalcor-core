/**
 * MedicalCor API Server
 *
 * Fastify webhook gateway for WhatsApp and Voice integrations.
 */

import { logger } from '@medicalcor/core';

import { buildApp, validateEnvironment } from './app.js';
import { config } from './config.js';

async function main(): Promise<void> {
  // Validate environment and secrets before building the app
  validateEnvironment();

  const app = await buildApp();

  // Graceful shutdown handlers
  // SECURITY FIX: Use a flag to prevent race condition when multiple signals arrive
  // (e.g., SIGINT followed quickly by SIGTERM)
  let isShuttingDown = false;
  const signals: NodeJS.Signals[] = ['SIGINT', 'SIGTERM'];

  for (const signal of signals) {
    process.on(signal, () => {
      if (isShuttingDown) {
        logger.info({ signal }, 'Shutdown already in progress, ignoring duplicate signal');
        return;
      }
      isShuttingDown = true;
      logger.info({ signal }, 'Received shutdown signal');
      app
        .close()
        .then(() => {
          logger.info('Server closed gracefully');
          process.exit(0);
        })
        .catch((err: unknown) => {
          logger.error({ err }, 'Error during shutdown');
          process.exit(1);
        });
    });
  }

  // Handle uncaught errors
  process.on('uncaughtException', (error) => {
    logger.fatal({ err: error }, 'Uncaught exception');
    process.exit(1);
  });

  process.on('unhandledRejection', (reason) => {
    logger.fatal({ err: reason }, 'Unhandled rejection');
    process.exit(1);
  });

  // Start server
  try {
    const address = await app.listen({
      port: config.server.port,
      host: config.server.host,
    });

    logger.info(
      {
        address,
        env: config.env,
      },
      `MedicalCor API server started`
    );
  } catch (error) {
    logger.fatal({ err: error }, 'Failed to start server');
    process.exit(1);
  }
}

main().catch((error: unknown) => {
  // Use structured logger if available, fallback to console.error only if logger fails
  try {
    logger.fatal({ err: error }, 'Fatal error during startup');
  } catch {
    // Logger failed - use console.error as last resort (allowed by eslint config)
    console.error('Fatal error during startup (logger unavailable):', error);
  }
  process.exit(1);
});

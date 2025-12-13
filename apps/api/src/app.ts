import Fastify from 'fastify';
import cors from '@fastify/cors';
import helmet from '@fastify/helmet';
import swagger from '@fastify/swagger';
import swaggerUi from '@fastify/swagger-ui';
import {
  createLogger,
  generateCorrelationId,
  validateEnv,
  getMissingSecrets,
  logSecretsStatus,
  validateSecretsAtStartup,
  printSetupInstructions,
} from '@medicalcor/core';
import {
  healthRoutes,
  webhookRoutes,
  workflowRoutes,
  aiRoutes,
  diagnosticsRoutes,
  backupRoutes,
  gdprRoutes,
  gdprArticle30Routes,
  metricsRoutes,
  loadTestingRoutes,
  rlsTestRoutes,
  apiDocsRoutes,
  createCognitiveRoutes,
  orchestrationRoutes,
} from './routes/index.js';
import { Pool } from 'pg';
import { createOpenAIClient, createEmbeddingService } from '@medicalcor/integrations';
import { chatgptPluginRoutes } from './routes/chatgpt-plugin.js';
import { instrumentFastify } from '@medicalcor/core/observability/instrumentation';
import { rateLimitPlugin, type RateLimitConfig } from './plugins/rate-limit.js';
import { apiAuthPlugin } from './plugins/api-auth.js';
import { pipedriveSignaturePlugin } from './plugins/verify-pipedrive-signature.js';

/**
 * MedicalCor API - Webhook Gateway
 *
 * This server receives webhooks from external services (WhatsApp, Twilio)
 * and forwards them to Trigger.dev for durable processing.
 */

const logger = createLogger({ name: 'api' });

/**
 * Validate environment and secrets on boot
 * SECURITY: Fail-fast in production if critical secrets are missing
 */
function validateEnvironment(): void {
  const isProduction = process.env.NODE_ENV === 'production';

  try {
    validateEnv(isProduction);
    logger.info('Environment validation passed');
  } catch (error) {
    logger.error({ error }, 'Environment validation failed');
    if (isProduction) {
      process.exit(1);
    }
  }

  // SECURITY: Comprehensive secrets validation at startup
  // In production, this will throw and exit if required secrets are missing
  try {
    const summary = validateSecretsAtStartup({
      failOnMissing: isProduction,
      failOnRecommended: false, // Only warn about recommended secrets
    });

    if (!summary.valid || summary.warnings > 0) {
      // Print setup instructions for missing secrets
      printSetupInstructions(summary);
    }
  } catch (error) {
    logger.error({ error }, 'FATAL: Secrets validation failed');
    process.exit(1);
  }

  // Log secrets status (without revealing values)
  logSecretsStatus(logger);

  // Warn about missing secrets in development
  if (!isProduction) {
    const missing = getMissingSecrets();
    if (missing.length > 0) {
      logger.warn({ missing }, 'Some secrets are not configured (ok for development)');
    }
  }
}

/**
 * SECURITY: Parse and validate CORS origins
 * Only allows specific origins, never wildcard in production
 */
function parseCorsOrigins(): string[] | false {
  const corsOrigin = process.env.CORS_ORIGIN;

  // No CORS configured - disabled (most secure default)
  if (!corsOrigin) return false;

  // SECURITY FIX: Never allow wildcard in any environment
  // This prevents potential data leaks even in development
  if (corsOrigin === '*') {
    if (process.env.NODE_ENV === 'production') {
      throw new Error('SECURITY: CORS_ORIGIN cannot be "*" in production');
    }
    // SECURITY FIX: In development, use explicit localhost origins instead of wildcard
    // This provides security while maintaining developer convenience
    logger.warn('CORS_ORIGIN is "*" - using localhost defaults for development');
    return [
      'http://localhost:3000',
      'http://localhost:3001',
      'http://localhost:5173',
      'http://127.0.0.1:3000',
    ];
  }

  // Parse comma-separated origins and validate each
  const origins = corsOrigin
    .split(',')
    .map((o) => o.trim())
    .filter(Boolean);

  // Validate each origin is a valid URL
  for (const origin of origins) {
    try {
      new URL(origin);
    } catch {
      throw new Error(`SECURITY: Invalid CORS origin: ${origin}`);
    }
  }

  return origins;
}

/**
 * SECURITY: Parse trusted proxy configuration
 * Only trust specific IPs/ranges, never all proxies in production
 */
function parseTrustedProxies(): boolean | string | string[] {
  const trustedProxies = process.env.TRUSTED_PROXIES;

  if (process.env.NODE_ENV !== 'production') {
    // In development, trust all proxies for convenience
    return true;
  }

  // SECURITY: In production, require explicit proxy configuration
  if (!trustedProxies) {
    // Default to common cloud providers' IP ranges or loopback
    return ['127.0.0.1', '10.0.0.0/8', '172.16.0.0/12', '192.168.0.0/16'];
  }

  if (trustedProxies === 'true') return true;
  if (trustedProxies === 'false') return false;

  // Parse comma-separated proxy list
  return trustedProxies
    .split(',')
    .map((p) => p.trim())
    .filter(Boolean);
}

async function buildApp() {
  // SECURITY: Validate CORS configuration before starting
  const corsOrigins = parseCorsOrigins();
  const trustedProxies = parseTrustedProxies();

  const fastify = Fastify({
    logger: {
      level: process.env.LOG_LEVEL ?? 'info',
      // Use custom serializers for PII redaction
      serializers: {
        req(request) {
          return {
            method: request.method,
            url: request.url,
            hostname: request.hostname,
            remoteAddress: request.ip,
            correlationId: request.headers['x-correlation-id'],
          };
        },
        res(reply) {
          return {
            statusCode: reply.statusCode,
          };
        },
      },
    },
    // SECURITY: Only trust specified proxy headers to prevent IP spoofing
    trustProxy: trustedProxies,
  });

  // Add correlation ID to all requests
  fastify.addHook('onRequest', async (request, _reply) => {
    const header = request.headers['x-correlation-id'];
    const correlationId = typeof header === 'string' ? header : generateCorrelationId();
    request.headers['x-correlation-id'] = correlationId;
  });

  // SECURITY: Comprehensive security headers
  await fastify.register(helmet, {
    contentSecurityPolicy: false, // Disable CSP for API (not serving HTML)
    // HSTS - Strict Transport Security (force HTTPS)
    strictTransportSecurity: {
      maxAge: 31536000, // 1 year
      includeSubDomains: true,
      preload: true,
    },
    // Prevent clickjacking
    frameguard: { action: 'deny' },
    // Prevent MIME type sniffing
    noSniff: true,
    // Hide X-Powered-By header
    hidePoweredBy: true,
    // Prevent XSS attacks
    xssFilter: true,
  });

  // OpenAPI/Swagger Documentation
  await fastify.register(swagger, {
    openapi: {
      openapi: '3.1.0',
      info: {
        title: 'MedicalCor API',
        version: '1.0.0',
        description: `
MedicalCor API - Medical CRM & Patient Communication Platform

This API provides:
- **Webhook Gateway**: Receive events from WhatsApp, Twilio, Stripe, and booking systems
- **AI Function Gateway**: Execute AI functions for lead scoring, reply generation, and patient management
- **RAG Search**: Semantic and hybrid search over medical knowledge base
- **Workflow Triggers**: Initiate durable workflows for patient journey automation
- **Health & Diagnostics**: System monitoring and observability

## Authentication
Most endpoints require API key authentication via \`X-API-Key\` header.

## Rate Limits (Aggressive - Cost Control)
- Global: 500 req/min
- WhatsApp Webhooks: 60 req/min
- Voice/Vapi Webhooks: 30 req/min
- Stripe Webhooks: 20 req/min
- Booking/CRM Webhooks: 30 req/min
        `.trim(),
        contact: {
          name: 'MedicalCor Support',
          email: 'support@medicalcor.io',
        },
        license: {
          name: 'Proprietary',
          url: 'https://medicalcor.io/terms',
        },
      },
      servers: [
        {
          url: process.env.API_BASE_URL ?? 'http://localhost:3000',
          description:
            process.env.NODE_ENV === 'production' ? 'Production server' : 'Development server',
        },
      ],
      tags: [
        { name: 'Health', description: 'Health checks and readiness probes' },
        { name: 'Webhooks', description: 'External service webhook endpoints' },
        { name: 'Workflows', description: 'Trigger durable workflows' },
        { name: 'AI', description: 'AI function discovery and execution' },
        { name: 'Diagnostics', description: 'System diagnostics and metrics' },
        { name: 'Metrics', description: 'Prometheus metrics for monitoring' },
        { name: 'Backup', description: 'Backup management operations' },
        { name: 'ChatGPT Plugin', description: 'ChatGPT plugin integration endpoints' },
        { name: 'Documentation', description: 'API documentation portal and OpenAPI spec exports' },
      ],
      components: {
        securitySchemes: {
          ApiKeyAuth: {
            type: 'apiKey',
            in: 'header',
            name: 'X-API-Key',
            description: 'API key for authenticated endpoints',
          },
        },
      },
    },
  });

  // Swagger UI - Interactive API Documentation
  await fastify.register(swaggerUi, {
    routePrefix: '/docs',
    uiConfig: {
      docExpansion: 'list',
      deepLinking: true,
      displayRequestDuration: true,
      filter: true,
      showExtensions: true,
      showCommonExtensions: true,
      syntaxHighlight: {
        activate: true,
        theme: 'monokai',
      },
    },
    uiHooks: {
      onRequest: function (_request, _reply, next) {
        next();
      },
      preHandler: function (_request, _reply, next) {
        next();
      },
    },
    staticCSP: true,
    transformStaticCSP: (header) => header,
    transformSpecification: (swaggerObject) => {
      return swaggerObject;
    },
    transformSpecificationClone: true,
  });

  // SECURITY: CORS configuration with validated origins
  await fastify.register(cors, {
    origin: corsOrigins,
    methods: ['GET', 'POST'],
    credentials: true, // Allow cookies for authenticated requests
  });

  // Rate limiting configuration
  // COST CONTROL: Aggressive rate limits for webhook endpoints to prevent abuse
  const rateLimitConfig: Partial<RateLimitConfig> = {
    useRedis: !!process.env.REDIS_URL,
    redisUrl: process.env.REDIS_URL,
    globalLimit: parseInt(process.env.RATE_LIMIT_GLOBAL ?? '500', 10),
    webhookLimits: {
      whatsapp: parseInt(process.env.RATE_LIMIT_WHATSAPP ?? '60', 10),
      voice: parseInt(process.env.RATE_LIMIT_VOICE ?? '30', 10),
      stripe: parseInt(process.env.RATE_LIMIT_STRIPE ?? '20', 10),
      booking: parseInt(process.env.RATE_LIMIT_BOOKING ?? '30', 10),
      vapi: parseInt(process.env.RATE_LIMIT_VAPI ?? '30', 10),
      crm: parseInt(process.env.RATE_LIMIT_CRM ?? '30', 10),
    },
    allowlist: process.env.RATE_LIMIT_ALLOWLIST?.split(',').filter(Boolean) ?? [],
    addHeaders: process.env.RATE_LIMIT_HEADERS !== 'false',
  };
  await fastify.register(rateLimitPlugin, rateLimitConfig);

  // API Key authentication for protected endpoints
  // SECURITY: All execution endpoints and sensitive diagnostics require API key authentication
  await fastify.register(apiAuthPlugin, {
    apiKeys: process.env.API_SECRET_KEY ? [process.env.API_SECRET_KEY] : [],
    protectedPaths: [
      '/workflows',
      '/webhooks/booking',
      // SECURITY FIX: Protect ALL AI endpoints including discovery endpoints
      // Previously only /ai/execute was protected, leaving /ai/functions, /ai/openai/tools,
      // /ai/anthropic/tools, /ai/categories, and /ai/schema exposed to unauthenticated users.
      // This allowed attackers to enumerate the complete AI API surface.
      '/ai',
      // SECURITY FIX: Protect metrics and diagnostics endpoints
      // These expose sensitive internal information (traces, system resources, metrics)
      '/metrics',
      '/diagnostics',
      // SECURITY FIX: Protect backup endpoints (destructive operations)
      // These allow creating/restoring/deleting database backups
      '/backup',
      // GDPR endpoints require authentication (contains PII export/deletion functionality)
      '/gdpr',
      // Cognitive endpoints expose behavioral insights and patterns (contains PII)
      '/cognitive',
      // Orchestration endpoints manage multi-agent workflows (administrative)
      '/orchestration',
    ],
  });

  // SECURITY FIX: Custom JSON parser that preserves raw body for webhook signature verification
  // This is critical for WhatsApp/Stripe webhooks where signatures are computed against raw bytes
  fastify.addContentTypeParser(
    'application/json',
    { parseAs: 'string' },
    (request, payload, done) => {
      try {
        const rawBody = payload as string;
        // Store raw body on request for signature verification
        // Using type assertion since Fastify's request type doesn't include rawBody
        (request as unknown as { rawBody: string }).rawBody = rawBody;
        // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment -- JSON.parse returns any, but this is expected for webhook payloads
        const parsed = JSON.parse(rawBody);
        done(null, parsed);
      } catch (error) {
        done(error as Error, undefined);
      }
    }
  );

  // Parse URL-encoded bodies (for Twilio webhooks)
  fastify.addContentTypeParser(
    'application/x-www-form-urlencoded',
    { parseAs: 'string' },
    (_request, payload, done) => {
      try {
        const parsed = Object.fromEntries(new URLSearchParams(payload as string));
        done(null, parsed);
      } catch (error) {
        done(error as Error, undefined);
      }
    }
  );

  // Pipedrive webhook signature verification
  // SECURITY: Verifies HMAC-SHA256 signatures on CRM webhooks
  // Must be registered AFTER content type parsers (which set rawBody)
  await fastify.register(pipedriveSignaturePlugin);

  // Instrument Fastify for observability
  instrumentFastify(fastify, {
    serviceName: 'medicalcor-api',
    ignorePaths: ['/health', '/live', '/ready', '/metrics'],
  });

  // Register routes
  await fastify.register(healthRoutes);
  await fastify.register(metricsRoutes);
  await fastify.register(webhookRoutes);
  await fastify.register(workflowRoutes);
  await fastify.register(aiRoutes);
  await fastify.register(diagnosticsRoutes);
  await fastify.register(chatgptPluginRoutes);
  await fastify.register(backupRoutes);
  await fastify.register(gdprRoutes);
  await fastify.register(gdprArticle30Routes);
  await fastify.register(loadTestingRoutes);
  await fastify.register(rlsTestRoutes);
  await fastify.register(apiDocsRoutes);
  await fastify.register(orchestrationRoutes);

  // Cognitive routes - requires database and OpenAI dependencies
  // Only register if required environment variables are present
  if (process.env.DATABASE_URL && process.env.OPENAI_API_KEY) {
    const pool = new Pool({ connectionString: process.env.DATABASE_URL });
    // Type assertions needed as integrations package returns compatible interfaces

    const openai = createOpenAIClient({ apiKey: process.env.OPENAI_API_KEY }) as unknown;

    const embeddings = createEmbeddingService({
      apiKey: process.env.OPENAI_API_KEY,
      model: 'text-embedding-3-small',
    }) as unknown;

    const cognitiveRoutes = createCognitiveRoutes({
      pool,

      openai: openai as Parameters<typeof createCognitiveRoutes>[0]['openai'],

      embeddings: embeddings as Parameters<typeof createCognitiveRoutes>[0]['embeddings'],
    });
    await fastify.register(cognitiveRoutes);
    logger.info('Cognitive routes registered');
  } else {
    logger.warn('Cognitive routes not registered - DATABASE_URL or OPENAI_API_KEY not configured');
  }

  // Global error handler
  fastify.setErrorHandler((error, request, reply) => {
    const correlationId = request.headers['x-correlation-id'];
    const statusCode = (error as { statusCode?: number }).statusCode ?? 500;

    fastify.log.error({ correlationId, err: error }, 'Unhandled error');

    // Return safe error response
    return reply.status(statusCode).send({
      code: 'INTERNAL_ERROR',
      message: 'An unexpected error occurred',
      statusCode,
    });
  });

  // Not found handler
  fastify.setNotFoundHandler((_request, reply) => {
    return reply.status(404).send({
      code: 'NOT_FOUND',
      message: 'Route not found',
      statusCode: 404,
    });
  });

  return fastify;
}

// SECURITY FIX: Removed duplicate start() function and void start() call.
// This module is imported by index.ts which is the proper entry point.
// Having both index.ts and app.ts register signal handlers caused a race condition
// where both handlers would fire on SIGTERM/SIGINT, potentially causing double
// shutdown attempts and process.exit() race conditions.
//
// The proper entry point (index.ts) handles:
// - Signal handler registration (SIGTERM, SIGINT)
// - Graceful shutdown orchestration
// - Server startup

export { buildApp, validateEnvironment };

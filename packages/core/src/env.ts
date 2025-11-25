import { z } from 'zod';

/**
 * Environment Variable Validation
 * Ensures all required secrets are present at boot time
 */

// Base server config
const ServerEnvSchema = z.object({
  NODE_ENV: z.enum(['development', 'staging', 'production']).default('development'),
  PORT: z.string().default('3000').transform(Number),
  HOST: z.string().default('0.0.0.0'),
  LOG_LEVEL: z.enum(['trace', 'debug', 'info', 'warn', 'error', 'fatal']).default('info'),
});

// WhatsApp/360dialog config
const WhatsAppEnvSchema = z.object({
  WHATSAPP_API_KEY: z.string().min(1, 'WhatsApp API key is required'),
  WHATSAPP_VERIFY_TOKEN: z.string().min(1, 'WhatsApp verify token is required'),
  WHATSAPP_PHONE_NUMBER_ID: z.string().optional(),
  WHATSAPP_BUSINESS_ACCOUNT_ID: z.string().optional(),
  WHATSAPP_WEBHOOK_SECRET: z.string().optional(),
});

// Twilio Voice config
const TwilioEnvSchema = z.object({
  TWILIO_ACCOUNT_SID: z.string().min(1, 'Twilio Account SID is required'),
  TWILIO_AUTH_TOKEN: z.string().min(1, 'Twilio Auth Token is required'),
  TWILIO_PHONE_NUMBER: z.string().optional(),
  TWILIO_WEBHOOK_URL: z.string().url().optional(),
});

// Stripe config
const StripeEnvSchema = z.object({
  STRIPE_SECRET_KEY: z.string().min(1, 'Stripe secret key is required'),
  STRIPE_WEBHOOK_SECRET: z.string().min(1, 'Stripe webhook secret is required'),
  STRIPE_PUBLISHABLE_KEY: z.string().optional(),
});

// HubSpot config
const HubSpotEnvSchema = z.object({
  HUBSPOT_ACCESS_TOKEN: z.string().min(1, 'HubSpot access token is required'),
  HUBSPOT_PORTAL_ID: z.string().optional(),
});

// OpenAI config
const OpenAIEnvSchema = z.object({
  OPENAI_API_KEY: z.string().min(1, 'OpenAI API key is required'),
  OPENAI_MODEL: z.string().default('gpt-4o'),
});

// RAG (Retrieval-Augmented Generation) config
const RAGEnvSchema = z.object({
  /** Enable RAG for AI scoring and reply generation */
  RAG_ENABLED: z
    .enum(['true', 'false'])
    .optional()
    .default('true')
    .transform((v) => v === 'true'),
  /** Embedding model: text-embedding-3-small (cost-effective) or text-embedding-3-large (highest quality) */
  RAG_EMBEDDING_MODEL: z
    .enum(['text-embedding-3-small', 'text-embedding-3-large', 'text-embedding-ada-002'])
    .optional()
    .default('text-embedding-3-small'),
  /** Embedding dimensions (1536 for small, up to 3072 for large) */
  RAG_EMBEDDING_DIMENSIONS: z
    .string()
    .optional()
    .transform((v) => (v ? parseInt(v, 10) : 1536)),
  /** Number of results to retrieve (top-K) */
  RAG_RETRIEVAL_TOP_K: z
    .string()
    .optional()
    .transform((v) => (v ? parseInt(v, 10) : 5)),
  /** Minimum similarity threshold (0-1) */
  RAG_SIMILARITY_THRESHOLD: z
    .string()
    .optional()
    .transform((v) => (v ? parseFloat(v) : 0.7)),
  /** Maximum context tokens to include in prompts */
  RAG_MAX_CONTEXT_TOKENS: z
    .string()
    .optional()
    .transform((v) => (v ? parseInt(v, 10) : 2000)),
  /** Weight for semantic search in hybrid mode (0-1) */
  RAG_SEMANTIC_WEIGHT: z
    .string()
    .optional()
    .transform((v) => (v ? parseFloat(v) : 0.7)),
  /** Weight for keyword search in hybrid mode (0-1) */
  RAG_KEYWORD_WEIGHT: z
    .string()
    .optional()
    .transform((v) => (v ? parseFloat(v) : 0.3)),
  /** Enable query logging for analytics */
  RAG_LOG_QUERIES: z
    .enum(['true', 'false'])
    .optional()
    .default('true')
    .transform((v) => v === 'true'),
});

// Trigger.dev config
const TriggerEnvSchema = z.object({
  TRIGGER_SECRET_KEY: z.string().optional(),
  TRIGGER_API_URL: z.string().url().optional(),
});

// Database config
const DatabaseEnvSchema = z.object({
  DATABASE_URL: z.string().url().optional(),
  SUPABASE_URL: z.string().url().optional(),
  SUPABASE_ANON_KEY: z.string().optional(),
  SUPABASE_SERVICE_ROLE_KEY: z.string().optional(),
});

// Redis config with TLS support
const RedisEnvSchema = z.object({
  REDIS_URL: z.string().optional(),
  /** Enable TLS for Redis connection (auto-detected from rediss:// URL) */
  REDIS_TLS: z.enum(['true', 'false']).optional().transform((v) => v === 'true'),
  /** CA certificate for Redis TLS */
  REDIS_CA_CERT: z.string().optional(),
  /** Client certificate for Redis mTLS */
  REDIS_CLIENT_CERT: z.string().optional(),
  /** Client key for Redis mTLS */
  REDIS_CLIENT_KEY: z.string().optional(),
});

// Backup config
const BackupEnvSchema = z.object({
  /** Storage provider: local, s3, gcs, azure */
  BACKUP_STORAGE_PROVIDER: z.enum(['local', 's3', 'gcs', 'azure']).optional().default('local'),
  /** Storage bucket/path */
  BACKUP_STORAGE_BUCKET: z.string().optional(),
  /** Storage region */
  BACKUP_STORAGE_REGION: z.string().optional(),
  /** S3-compatible endpoint URL */
  BACKUP_STORAGE_ENDPOINT: z.string().optional(),
  /** Storage path prefix */
  BACKUP_STORAGE_PREFIX: z.string().optional(),
  /** Encryption key for backups */
  BACKUP_ENCRYPTION_KEY: z.string().optional(),
  /** Enable scheduled backups */
  BACKUP_SCHEDULE_ENABLED: z.enum(['true', 'false']).optional().transform((v) => v === 'true'),
  /** Full backup frequency: hourly, daily, weekly, monthly */
  BACKUP_FULL_FREQUENCY: z.enum(['hourly', 'daily', 'weekly', 'monthly']).optional(),
  /** Incremental backup frequency */
  BACKUP_INCREMENTAL_FREQUENCY: z.enum(['hourly', 'daily', 'weekly', 'monthly']).optional(),
  /** Hourly retention count */
  BACKUP_RETENTION_HOURLY: z.string().optional().transform((v) => (v ? parseInt(v, 10) : undefined)),
  /** Daily retention count */
  BACKUP_RETENTION_DAILY: z.string().optional().transform((v) => (v ? parseInt(v, 10) : undefined)),
  /** Weekly retention count */
  BACKUP_RETENTION_WEEKLY: z.string().optional().transform((v) => (v ? parseInt(v, 10) : undefined)),
  /** Monthly retention count */
  BACKUP_RETENTION_MONTHLY: z.string().optional().transform((v) => (v ? parseInt(v, 10) : undefined)),
  /** Minimum backups to keep */
  BACKUP_MINIMUM_KEEP: z.string().optional().transform((v) => (v ? parseInt(v, 10) : undefined)),
  /** Enable backup compression */
  BACKUP_COMPRESSION: z.enum(['true', 'false']).optional().transform((v) => v !== 'false'),
  /** Enable backup verification */
  BACKUP_VERIFY: z.enum(['true', 'false']).optional().transform((v) => v !== 'false'),
  /** Preferred backup hour (0-23) */
  BACKUP_PREFERRED_HOUR: z.string().optional().transform((v) => (v ? parseInt(v, 10) : undefined)),
  /** Backup timezone */
  BACKUP_TIMEZONE: z.string().optional(),
});

// CORS config
const CorsEnvSchema = z.object({
  CORS_ORIGIN: z.string().optional(),
});

// Full API environment schema
export const ApiEnvSchema = ServerEnvSchema.merge(WhatsAppEnvSchema)
  .merge(TwilioEnvSchema)
  .merge(StripeEnvSchema)
  .merge(HubSpotEnvSchema)
  .merge(OpenAIEnvSchema)
  .merge(RAGEnvSchema)
  .merge(TriggerEnvSchema)
  .merge(DatabaseEnvSchema)
  .merge(RedisEnvSchema)
  .merge(BackupEnvSchema)
  .merge(CorsEnvSchema);

// Partial schema for development (not all secrets required)
export const DevEnvSchema = ServerEnvSchema.merge(
  z.object({
    WHATSAPP_API_KEY: z.string().optional(),
    WHATSAPP_VERIFY_TOKEN: z.string().optional(),
    TWILIO_ACCOUNT_SID: z.string().optional(),
    TWILIO_AUTH_TOKEN: z.string().optional(),
    STRIPE_SECRET_KEY: z.string().optional(),
    STRIPE_WEBHOOK_SECRET: z.string().optional(),
    HUBSPOT_ACCESS_TOKEN: z.string().optional(),
    OPENAI_API_KEY: z.string().optional(),
  })
);

export type ApiEnv = z.infer<typeof ApiEnvSchema>;
export type DevEnv = z.infer<typeof DevEnvSchema>;

/**
 * Validate environment variables
 * @param strict - If true, all secrets are required (production mode)
 */
export function validateEnv(strict = false): ApiEnv | DevEnv {
  const schema = strict ? ApiEnvSchema : DevEnvSchema;

  const result = schema.safeParse(process.env);

  if (!result.success) {
    const errors = result.error.flatten().fieldErrors;
    const errorMessages = Object.entries(errors)
      .map(([field, messages]) => `  ${field}: ${messages.join(', ')}`)
      .join('\n');

    throw new Error(`Environment validation failed:\n${errorMessages}`);
  }

  return result.data;
}

/**
 * Get validated env with type safety
 */
export function getEnv(): ApiEnv | DevEnv {
  const isProduction = process.env.NODE_ENV === 'production';
  return validateEnv(isProduction);
}

/**
 * Check if a specific secret is configured
 */
export function hasSecret(name: string): boolean {
  const value = process.env[name];
  return value !== undefined && value !== '';
}

/**
 * Get list of missing required secrets for production
 */
export function getMissingSecrets(): string[] {
  const required = [
    'WHATSAPP_API_KEY',
    'WHATSAPP_VERIFY_TOKEN',
    'TWILIO_ACCOUNT_SID',
    'TWILIO_AUTH_TOKEN',
    'STRIPE_SECRET_KEY',
    'STRIPE_WEBHOOK_SECRET',
    'HUBSPOT_ACCESS_TOKEN',
    'OPENAI_API_KEY',
  ];

  return required.filter((name) => !hasSecret(name));
}

/**
 * Log secrets status (without revealing values)
 */
export function logSecretsStatus(logger: { info: (msg: string, data?: object) => void }): void {
  const secrets = [
    'WHATSAPP_API_KEY',
    'WHATSAPP_VERIFY_TOKEN',
    'WHATSAPP_WEBHOOK_SECRET',
    'TWILIO_ACCOUNT_SID',
    'TWILIO_AUTH_TOKEN',
    'STRIPE_SECRET_KEY',
    'STRIPE_WEBHOOK_SECRET',
    'HUBSPOT_ACCESS_TOKEN',
    'OPENAI_API_KEY',
    'TRIGGER_SECRET_KEY',
    'DATABASE_URL',
    'REDIS_URL',
  ];

  const status = secrets.reduce<Record<string, string>>((acc, name) => {
    acc[name] = hasSecret(name) ? 'configured' : 'missing';
    return acc;
  }, {});

  logger.info('Secrets status', status);
}

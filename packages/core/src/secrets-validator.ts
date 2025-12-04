/**
 * Secrets Validator
 * Validates all required secrets at boot time
 * SECURITY: Fail-fast to prevent running with missing credentials
 *
 * @module @medicalcor/core/secrets-validator
 */

import { createHash, randomBytes } from 'crypto';
import { createLogger, type Logger } from './logger.js';

const logger: Logger = createLogger({ name: 'secrets-validator' });

/** Secret requirement level */
export type SecretRequirement = 'required' | 'recommended' | 'optional';

/** Secret validation rule */
export interface SecretRule {
  name: string;
  envVar: string;
  requirement: SecretRequirement;
  minLength?: number;
  pattern?: RegExp;
  description: string;
  securityImpact: string;
}

/** Validation result */
export interface SecretValidationResult {
  valid: boolean;
  secret: string;
  envVar: string;
  requirement: SecretRequirement;
  error?: string;
  warning?: string;
}

/** Overall validation summary */
export interface ValidationSummary {
  valid: boolean;
  criticalErrors: number;
  warnings: number;
  results: SecretValidationResult[];
  missingRequired: string[];
  missingRecommended: string[];
}

/**
 * Default secret validation rules for MedicalCor
 */
export const DEFAULT_SECRET_RULES: SecretRule[] = [
  // Critical - Application will not start without these
  {
    name: 'Database URL',
    envVar: 'DATABASE_URL',
    requirement: 'required',
    pattern: /^postgres(ql)?:\/\/.+/,
    description: 'PostgreSQL connection string',
    securityImpact: 'CRITICAL: No database access',
  },
  {
    name: 'API Secret Key',
    envVar: 'API_SECRET_KEY',
    requirement: 'required',
    minLength: 32,
    description: 'Secret key for API authentication',
    securityImpact: 'CRITICAL: API endpoints will reject all requests',
  },

  // Required for core functionality
  {
    name: 'HubSpot Access Token',
    envVar: 'HUBSPOT_ACCESS_TOKEN',
    requirement: 'required',
    pattern: /^pat-[a-z]{2,3}\d?-[a-f0-9-]+$/,
    description: 'HubSpot private app access token',
    securityImpact: 'HIGH: CRM integration will fail',
  },
  {
    name: 'WhatsApp API Key',
    envVar: 'WHATSAPP_API_KEY',
    requirement: 'required',
    minLength: 20,
    description: '360dialog API key for WhatsApp',
    securityImpact: 'HIGH: WhatsApp messaging will fail',
  },
  {
    name: 'WhatsApp Phone Number ID',
    envVar: 'WHATSAPP_PHONE_NUMBER_ID',
    requirement: 'required',
    pattern: /^\d+$/,
    description: 'WhatsApp business phone number ID',
    securityImpact: 'HIGH: WhatsApp messaging will fail',
  },
  {
    name: 'OpenAI API Key',
    envVar: 'OPENAI_API_KEY',
    requirement: 'required',
    pattern: /^sk-(proj-)?[a-zA-Z0-9-_]+$/,
    description: 'OpenAI API key for AI features',
    securityImpact: 'HIGH: AI scoring will fall back to rules-based',
  },

  // Security-related secrets
  {
    name: 'MFA Encryption Key',
    envVar: 'MFA_ENCRYPTION_KEY',
    requirement: 'recommended',
    minLength: 64,
    pattern: /^[a-f0-9]{64}$/i,
    description: '32-byte hex key for MFA secret encryption',
    securityImpact: 'MEDIUM: MFA will not be available',
  },
  {
    name: 'Data Encryption Key',
    envVar: 'DATA_ENCRYPTION_KEY',
    requirement: 'recommended',
    minLength: 64,
    pattern: /^[a-f0-9]{64}$/i,
    description: '32-byte hex key for PHI/PII encryption at rest',
    securityImpact: 'MEDIUM: Sensitive data encryption unavailable',
  },

  // Webhook secrets
  {
    name: 'WhatsApp Webhook Secret',
    envVar: 'WHATSAPP_WEBHOOK_SECRET',
    requirement: 'recommended',
    minLength: 32,
    description: 'HMAC secret for webhook signature verification',
    securityImpact: 'MEDIUM: Webhook signatures not verified',
  },
  {
    name: 'Stripe Webhook Secret',
    envVar: 'STRIPE_WEBHOOK_SECRET',
    requirement: 'recommended',
    pattern: /^whsec_[a-zA-Z0-9]+$/,
    description: 'Stripe webhook signing secret',
    securityImpact: 'MEDIUM: Payment webhooks not verified',
  },

  // Payment processing
  {
    name: 'Stripe Secret Key',
    envVar: 'STRIPE_SECRET_KEY',
    requirement: 'recommended',
    pattern: /^sk_(test|live)_[a-zA-Z0-9]+$/,
    description: 'Stripe API secret key',
    securityImpact: 'MEDIUM: Payment processing unavailable',
  },

  // Background jobs
  {
    name: 'Trigger.dev API Key',
    envVar: 'TRIGGER_API_KEY',
    requirement: 'recommended',
    pattern: /^tr_(dev|prod)_[a-zA-Z0-9]+$/,
    description: 'Trigger.dev project API key',
    securityImpact: 'MEDIUM: Background jobs unavailable',
  },

  // Optional services
  {
    name: 'Vapi API Key',
    envVar: 'VAPI_API_KEY',
    requirement: 'optional',
    minLength: 20,
    description: 'Vapi.ai API key for voice features',
    securityImpact: 'LOW: Voice AI features unavailable',
  },
  {
    name: 'Sentry DSN',
    envVar: 'SENTRY_DSN',
    requirement: 'optional',
    pattern: /^https:\/\/[^@]+@[^.]+\.ingest\.sentry\.io\/.+$/,
    description: 'Sentry error tracking DSN',
    securityImpact: 'LOW: Error tracking unavailable',
  },
  {
    name: 'Redis URL',
    envVar: 'REDIS_URL',
    requirement: 'optional',
    pattern: /^redis(s)?:\/\/.+/,
    description: 'Redis connection URL for caching',
    securityImpact: 'LOW: Distributed caching unavailable',
  },
];

/**
 * Validate a single secret
 */
function validateSecret(rule: SecretRule): SecretValidationResult {
  const value = process.env[rule.envVar];

  // Check if present
  if (!value || value.trim() === '') {
    const result: SecretValidationResult = {
      valid: rule.requirement === 'optional',
      secret: rule.name,
      envVar: rule.envVar,
      requirement: rule.requirement,
    };
    
    // Only add error/warning if defined (exactOptionalPropertyTypes compliance)
    if (rule.requirement !== 'optional') {
      result.error = 'Missing';
    } else {
      result.warning = 'Not configured (optional)';
    }
    
    return result;
  }

  // Check minimum length
  if (rule.minLength && value.length < rule.minLength) {
    return {
      valid: false,
      secret: rule.name,
      envVar: rule.envVar,
      requirement: rule.requirement,
      error: `Too short (min ${rule.minLength} chars, got ${value.length})`,
    };
  }

  // Check pattern
  if (rule.pattern && !rule.pattern.test(value)) {
    return {
      valid: false,
      secret: rule.name,
      envVar: rule.envVar,
      requirement: rule.requirement,
      error: 'Invalid format',
    };
  }

  return {
    valid: true,
    secret: rule.name,
    envVar: rule.envVar,
    requirement: rule.requirement,
  };
}

/**
 * Validate all secrets
 */
export function validateSecrets(
  rules: SecretRule[] = DEFAULT_SECRET_RULES
): ValidationSummary {
  const results: SecretValidationResult[] = [];
  const missingRequired: string[] = [];
  const missingRecommended: string[] = [];
  let criticalErrors = 0;
  let warnings = 0;

  for (const rule of rules) {
    const result = validateSecret(rule);
    results.push(result);

    if (!result.valid) {
      if (rule.requirement === 'required') {
        criticalErrors++;
        missingRequired.push(rule.envVar);
      } else if (rule.requirement === 'recommended') {
        warnings++;
        missingRecommended.push(rule.envVar);
      }
    }
  }

  return {
    valid: criticalErrors === 0,
    criticalErrors,
    warnings,
    results,
    missingRequired,
    missingRecommended,
  };
}

/**
 * Validate secrets at startup and optionally fail
 */
export function validateSecretsAtStartup(options: {
  failOnMissing?: boolean;
  failOnRecommended?: boolean;
  rules?: SecretRule[];
} = {}): ValidationSummary {
  const {
    failOnMissing = true,
    failOnRecommended = false,
    rules = DEFAULT_SECRET_RULES,
  } = options;

  const isProduction = process.env.NODE_ENV === 'production';
  const summary = validateSecrets(rules);

  // Log results
  logger.info({
    environment: process.env.NODE_ENV,
    valid: summary.valid,
    criticalErrors: summary.criticalErrors,
    warnings: summary.warnings,
  }, 'Secrets validation completed');

  // Log details for each issue
  for (const result of summary.results) {
    if (result.error) {
      if (result.requirement === 'required') {
        logger.error({
          secret: result.secret,
          envVar: result.envVar,
          error: result.error,
        }, `CRITICAL: ${result.secret} - ${result.error}`);
      } else if (result.requirement === 'recommended') {
        logger.warn({
          secret: result.secret,
          envVar: result.envVar,
          error: result.error,
        }, `WARNING: ${result.secret} - ${result.error}`);
      }
    }
  }

  // In production, be strict
  if (isProduction) {
    if (summary.criticalErrors > 0 && failOnMissing) {
      const missing = summary.missingRequired.join(', ');
      throw new Error(
        `FATAL: Cannot start in production with missing required secrets: ${missing}`
      );
    }

    if (summary.warnings > 0 && failOnRecommended) {
      const missing = summary.missingRecommended.join(', ');
      throw new Error(
        `FATAL: Cannot start in production with missing recommended secrets: ${missing}`
      );
    }
  }

  // Log summary
  if (summary.valid) {
    if (summary.warnings > 0) {
      logger.warn(
        { missingRecommended: summary.missingRecommended },
        `Secrets validation passed with ${summary.warnings} warnings`
      );
    } else {
      logger.info('All required secrets validated successfully');
    }
  }

  return summary;
}

/**
 * Get a fingerprint of current secrets configuration
 * Useful for debugging without exposing actual values
 */
export function getSecretsFingerprint(): Record<string, string | null> {
  const fingerprints: Record<string, string | null> = {};

  for (const rule of DEFAULT_SECRET_RULES) {
    const value = process.env[rule.envVar];
    if (value) {
      // Create a short fingerprint (first 8 chars of SHA-256)
      const hash = createHash('sha256').update(value).digest('hex');
      fingerprints[rule.envVar] = hash.slice(0, 8);
    } else {
      fingerprints[rule.envVar] = null;
    }
  }

  return fingerprints;
}

/**
 * Generate secure random keys for configuration
 */
export function generateSecureKey(bytes = 32): string {
  return randomBytes(bytes).toString('hex');
}

/**
 * Print setup instructions for missing secrets
 */
export function printSetupInstructions(summary: ValidationSummary): void {
  if (summary.valid && summary.warnings === 0) {
    console.info('\n✅ All secrets are properly configured.\n');
    return;
  }

  console.info('\n' + '='.repeat(60));
  console.info('SECRETS CONFIGURATION REQUIRED');
  console.info('='.repeat(60));

  if (summary.criticalErrors > 0) {
    console.info('\n🔴 REQUIRED (application will not start):');
    for (const envVar of summary.missingRequired) {
      const rule = DEFAULT_SECRET_RULES.find(r => r.envVar === envVar);
      console.info(`  - ${envVar}`);
      if (rule) {
        console.info(`    ${rule.description}`);
        console.info(`    Impact: ${rule.securityImpact}`);
      }
    }
  }

  if (summary.warnings > 0) {
    console.info('\n🟡 RECOMMENDED (some features will be limited):');
    for (const envVar of summary.missingRecommended) {
      const rule = DEFAULT_SECRET_RULES.find(r => r.envVar === envVar);
      console.info(`  - ${envVar}`);
      if (rule) {
        console.info(`    ${rule.description}`);
        console.info(`    Impact: ${rule.securityImpact}`);
      }
    }
  }

  console.info('\n📝 To generate encryption keys, run:');
  console.info('  openssl rand -hex 32');
  console.info('\n' + '='.repeat(60) + '\n');
}

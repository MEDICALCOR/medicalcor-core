'use server';

import { z } from 'zod';

/**
 * Environment Configuration Validation
 * Validates required environment variables for production deployment.
 */

const RequiredEnvSchema = z.object({
  HUBSPOT_ACCESS_TOKEN: z.string().min(1, 'HubSpot access token is required'),
  DATABASE_URL: z.string().url('Invalid database URL format').optional(),
  REDIS_URL: z.string().url('Invalid Redis URL format').optional(),
});

const OptionalEnvSchema = z.object({
  WHATSAPP_API_KEY: z.string().optional(),
  WHATSAPP_CHANNEL_ID: z.string().optional(),
  OPENAI_API_KEY: z.string().optional(),
  STRIPE_SECRET_KEY: z.string().optional(),
  STRIPE_WEBHOOK_SECRET: z.string().optional(),
  TWILIO_ACCOUNT_SID: z.string().optional(),
  TWILIO_AUTH_TOKEN: z.string().optional(),
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
  NEXT_PUBLIC_APP_URL: z.string().url().optional(),
});

const FullEnvSchema = RequiredEnvSchema.merge(OptionalEnvSchema);

export type EnvConfig = z.infer<typeof FullEnvSchema>;

export interface EnvStatus {
  isValid: boolean;
  missing: string[];
  optional: string[];
  configured: string[];
  errors: string[];
}

/**
 * Validates environment configuration
 */
export function validateEnvAction(): EnvStatus {
  const status: EnvStatus = {
    isValid: false,
    missing: [],
    optional: [],
    configured: [],
    errors: [],
  };

  const requiredVars = ['HUBSPOT_ACCESS_TOKEN', 'DATABASE_URL'] as const;
  const optionalVars = [
    'REDIS_URL',
    'WHATSAPP_API_KEY',
    'WHATSAPP_CHANNEL_ID',
    'OPENAI_API_KEY',
    'STRIPE_SECRET_KEY',
    'STRIPE_WEBHOOK_SECRET',
    'TWILIO_ACCOUNT_SID',
    'TWILIO_AUTH_TOKEN',
  ] as const;

  for (const varName of requiredVars) {
    const value = process.env[varName];
    if (!value || value.trim() === '') {
      status.missing.push(varName);
    } else {
      status.configured.push(varName);
    }
  }

  for (const varName of optionalVars) {
    const value = process.env[varName];
    if (!value || value.trim() === '') {
      status.optional.push(varName);
    } else {
      status.configured.push(varName);
    }
  }

  try {
    const envData: Record<string, string | undefined> = {};
    for (const key of [...requiredVars, ...optionalVars]) {
      envData[key] = process.env[key];
    }

    if (status.missing.length === 0) {
      FullEnvSchema.parse(envData);
    }
  } catch (error) {
    if (error instanceof z.ZodError) {
      status.errors = error.errors.map((e) => `${e.path.join('.')}: ${e.message}`);
    }
  }

  const isDev = process.env.NODE_ENV !== 'production';
  status.isValid = isDev
    ? process.env.HUBSPOT_ACCESS_TOKEN !== undefined
    : status.missing.length === 0 && status.errors.length === 0;

  return status;
}

/**
 * Returns masked version of configured secrets for display
 */
export function getEnvSummaryAction(): {
  name: string;
  status: 'configured' | 'missing' | 'optional';
  masked?: string;
}[] {
  const allVars = [
    { name: 'HUBSPOT_ACCESS_TOKEN', required: true },
    { name: 'DATABASE_URL', required: true },
    { name: 'REDIS_URL', required: false },
    { name: 'WHATSAPP_API_KEY', required: false },
    { name: 'OPENAI_API_KEY', required: false },
    { name: 'STRIPE_SECRET_KEY', required: false },
    { name: 'TWILIO_ACCOUNT_SID', required: false },
  ];

  return allVars.map((v) => {
    const value = process.env[v.name];
    if (!value) {
      return {
        name: v.name,
        status: v.required ? ('missing' as const) : ('optional' as const),
      };
    }

    const masked =
      value.length > 8 ? `${value.slice(0, 4)}${'*'.repeat(8)}${value.slice(-4)}` : '********';

    return { name: v.name, status: 'configured' as const, masked };
  });
}

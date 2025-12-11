/**
 * ╔══════════════════════════════════════════════════════════════════════════════╗
 * ║                    ADS CONVERSION TRACKING WORKFLOW                          ║
 * ║                                                                               ║
 * ║  Processes offline conversion events from Pipedrive CRM and sends them to    ║
 * ║  Facebook Conversions API and Google Ads Offline Conversions for             ║
 * ║  closed-loop attribution.                                                    ║
 * ║                                                                               ║
 * ║  Trigger: Pipedrive deal won webhook                                         ║
 * ║  Targets: Facebook CAPI, Google Ads Offline Conversions                      ║
 * ╚══════════════════════════════════════════════════════════════════════════════╝
 */

import { task, logger } from '@trigger.dev/sdk/v3';
import { z } from 'zod';
import crypto from 'crypto';
import {
  createAdsConversionServiceFromEnv,
  createPipedriveClient,
  getPipedriveCredentials,
  PipedriveAdapter,
} from '@medicalcor/integrations';
import { AdsConversionWorkflowPayloadSchema, type AdsConversionWorkflowResult } from '@medicalcor/types';

// =============================================================================
// SCHEMAS
// =============================================================================

/**
 * Payload schema for Pipedrive deal won events
 */
export const PipedriveDealWonPayloadSchema = z.object({
  /** Pipedrive deal ID */
  dealId: z.string(),
  /** Pipedrive person ID */
  personId: z.string(),
  /** Deal value */
  value: z.number().nonnegative(),
  /** Currency code */
  currency: z.string().length(3),
  /** When the deal was won */
  wonAt: z.string().datetime(),
  /** Deal title */
  dealTitle: z.string().optional(),
  /** Correlation ID for tracing */
  correlationId: z.string().optional(),
});

/**
 * Payload schema for direct conversion tracking
 */
export const DirectConversionPayloadSchema = AdsConversionWorkflowPayloadSchema;

// =============================================================================
// WORKFLOWS
// =============================================================================

/**
 * Process a Pipedrive deal won event and send conversions to ad platforms
 *
 * This workflow:
 * 1. Fetches person details from Pipedrive to get attribution data (gclid, fbclid)
 * 2. Sends conversion to Facebook Conversions API (if fbclid or email/phone available)
 * 3. Sends conversion to Google Ads (if gclid available)
 * 4. Returns results for both platforms
 */
export const processPipedriveDealConversion = task({
  id: 'ads-conversion-pipedrive-deal',
  retry: {
    maxAttempts: 3,
    minTimeoutInMs: 2000,
    maxTimeoutInMs: 30000,
    factor: 2,
  },
  run: async (payload: z.infer<typeof PipedriveDealWonPayloadSchema>) => {
    const correlationId = payload.correlationId ?? crypto.randomUUID();

    logger.info('Processing Pipedrive deal conversion', {
      correlationId,
      dealId: payload.dealId,
      personId: payload.personId,
      value: payload.value,
      currency: payload.currency,
    });

    // Step 1: Get Pipedrive client and fetch person details
    const pipedriveCredentials = getPipedriveCredentials();
    if (!pipedriveCredentials) {
      logger.warn('Pipedrive credentials not configured, skipping person lookup', { correlationId });
      return {
        success: false,
        error: 'Pipedrive credentials not configured',
        correlationId,
      };
    }

    const pipedrive = createPipedriveClient(pipedriveCredentials);
    const adapter = new PipedriveAdapter();

    // Step 2: Fetch person to get attribution data
    let attributionData: ReturnType<typeof adapter.extractAdsAttributionData> = null;

    try {
      const person = await pipedrive.getPerson(parseInt(payload.personId, 10));
      if (person) {
        // Parse person data to extract attribution fields
        attributionData = adapter.extractAdsAttributionData({ current: person });
        logger.info('Attribution data extracted from Pipedrive person', {
          correlationId,
          hasGclid: !!attributionData?.gclid,
          hasFbclid: !!attributionData?.fbclid,
          hasEmail: !!attributionData?.email,
          hasPhone: !!attributionData?.phone,
        });
      }
    } catch (error) {
      logger.warn('Failed to fetch person from Pipedrive', {
        correlationId,
        personId: payload.personId,
        error: error instanceof Error ? error.message : 'Unknown error',
      });
    }

    // If no attribution data, we can still try to send to Facebook with email/phone
    if (!attributionData) {
      logger.warn('No attribution data available for conversion tracking', { correlationId });
      return {
        success: false,
        error: 'No attribution data (gclid, fbclid, email, or phone) found for person',
        correlationId,
      };
    }

    // Step 3: Create ads conversion service and send conversion
    const adsService = createAdsConversionServiceFromEnv();
    const availablePlatforms = adsService.getAvailablePlatforms();

    if (availablePlatforms.length === 0) {
      logger.warn('No ads platforms configured', { correlationId });
      return {
        success: false,
        error: 'No ads platforms configured (check Facebook/Google credentials)',
        correlationId,
      };
    }

    logger.info('Sending conversion to ads platforms', {
      correlationId,
      availablePlatforms,
    });

    const result = await adsService.trackConversion({
      source: {
        crm: 'pipedrive',
        entityType: 'deal',
        entityId: payload.dealId,
        eventType: 'deal_won',
      },
      userData: {
        gclid: attributionData.gclid,
        fbclid: attributionData.fbclid,
        fbp: attributionData.fbp,
        email: attributionData.email,
        phone: attributionData.phone,
        firstName: attributionData.firstName,
        lastName: attributionData.lastName,
      },
      value: payload.value,
      currency: payload.currency,
      eventTime: new Date(payload.wonAt),
      correlationId,
    });

    logger.info('Ads conversion tracking completed', {
      correlationId,
      success: result.success,
      platformResults: result.platformResults.map((p) => ({
        platform: p.platform,
        success: p.success,
        eventsMatched: p.eventsMatched,
        error: p.error,
      })),
    });

    return {
      success: result.success,
      correlationId,
      eventIds: result.eventIds,
      platformResults: result.platformResults,
      errors: result.errors,
    };
  },
});

/**
 * Direct conversion tracking workflow
 *
 * Use this when you already have the attribution data and want to send
 * a conversion directly without fetching from Pipedrive.
 */
export const processDirectConversion = task({
  id: 'ads-conversion-direct',
  retry: {
    maxAttempts: 3,
    minTimeoutInMs: 2000,
    maxTimeoutInMs: 30000,
    factor: 2,
  },
  run: async (payload: z.infer<typeof DirectConversionPayloadSchema>): Promise<AdsConversionWorkflowResult> => {
    const correlationId = payload.correlationId ?? crypto.randomUUID();

    logger.info('Processing direct conversion', {
      correlationId,
      source: payload.source,
      platforms: payload.platforms,
      hasGclid: !!payload.userData.gclid,
      hasFbclid: !!payload.userData.fbclid,
    });

    const adsService = createAdsConversionServiceFromEnv();
    const result = await adsService.processWorkflowPayload({
      ...payload,
      correlationId,
    });

    logger.info('Direct conversion completed', {
      correlationId,
      success: result.success,
      eventIds: result.eventIds,
    });

    return result;
  },
});

/**
 * Batch conversion tracking workflow
 *
 * Process multiple conversions in a single workflow run.
 * Useful for historical import or bulk processing.
 */
export const processBatchConversions = task({
  id: 'ads-conversion-batch',
  retry: {
    maxAttempts: 2,
    minTimeoutInMs: 5000,
    maxTimeoutInMs: 60000,
    factor: 2,
  },
  run: async (payload: {
    conversions: z.infer<typeof DirectConversionPayloadSchema>[];
    correlationId?: string;
  }) => {
    const correlationId = payload.correlationId ?? crypto.randomUUID();

    logger.info('Processing batch conversions', {
      correlationId,
      totalConversions: payload.conversions.length,
    });

    const adsService = createAdsConversionServiceFromEnv();
    const results: AdsConversionWorkflowResult[] = [];
    const errors: string[] = [];

    // Process each conversion
    for (let i = 0; i < payload.conversions.length; i++) {
      const conversion = payload.conversions[i];
      if (!conversion) continue;
      const itemCorrelationId = `${correlationId}_${i}`;

      try {
        const result = await adsService.processWorkflowPayload({
          source: conversion.source,
          userData: conversion.userData,
          eventTime: conversion.eventTime,
          platforms: conversion.platforms,
          value: conversion.value,
          currency: conversion.currency,
          customEventName: conversion.customEventName,
          metadata: conversion.metadata,
          correlationId: itemCorrelationId,
        });
        results.push(result);

        if (!result.success) {
          errors.push(...result.errors);
        }

        logger.info('Batch conversion item processed', {
          correlationId,
          itemIndex: i,
          success: result.success,
        });
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : 'Unknown error';
        errors.push(`Conversion ${i}: ${errorMessage}`);
        logger.error('Batch conversion item failed', {
          correlationId,
          itemIndex: i,
          error: errorMessage,
        });
      }
    }

    const successCount = results.filter((r) => r.success).length;
    const failureCount = results.length - successCount;

    logger.info('Batch conversions completed', {
      correlationId,
      totalProcessed: results.length,
      successCount,
      failureCount,
      totalErrors: errors.length,
    });

    return {
      success: failureCount === 0,
      correlationId,
      totalProcessed: results.length,
      successCount,
      failureCount,
      results,
      errors,
    };
  },
});

// =============================================================================
// HELPER TASKS
// =============================================================================

/**
 * Health check for ads conversion platforms
 *
 * Verifies connectivity to Facebook and Google Ads APIs.
 */
export const checkAdsConversionHealth = task({
  id: 'ads-conversion-health-check',
  run: async () => {
    const correlationId = crypto.randomUUID();

    logger.info('Running ads conversion health check', { correlationId });

    const adsService = createAdsConversionServiceFromEnv();
    const availablePlatforms = adsService.getAvailablePlatforms();
    const healthResults = await adsService.healthCheck();

    const results = {
      correlationId,
      timestamp: new Date().toISOString(),
      availablePlatforms,
      platformHealth: healthResults,
      healthy: availablePlatforms.length > 0 &&
        availablePlatforms.every((p) => healthResults[p]?.connected ?? false),
    };

    logger.info('Ads conversion health check completed', results);

    return results;
  },
});

/**
 * GDPR consent verification for voice processing
 */
/* eslint-disable @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-redundant-type-constituents */

import { logger } from '@trigger.dev/sdk/v3';
import type { HubSpotClient, ConsentClient, ConsentCheckResult } from './types.js';

export interface ConsentVerificationResult {
  hasConsent: boolean;
  missingConsents?: string[];
}

/**
 * Verify GDPR consent for voice data processing
 * Returns consent status or throws if verification fails
 */
export async function verifyVoiceConsent(
  consent: ConsentClient | null,
  hubspot: HubSpotClient,
  hubspotContactId: string,
  callSid: string,
  duration: number,
  correlationId: string
): Promise<ConsentVerificationResult> {
  if (!consent) {
    // CRITICAL: Consent service is required for GDPR compliance
    logger.error('Consent service not configured', { correlationId });
    throw new Error('Consent service required for GDPR compliance');
  }

  try {
    const consentCheck: ConsentCheckResult = await consent.hasRequiredConsents(hubspotContactId);

    if (!consentCheck.valid) {
      logger.warn('Missing GDPR consent for voice data processing', {
        contactId: hubspotContactId,
        missingConsents: consentCheck.missing,
        correlationId,
      });

      // Log minimal call metadata (legitimate interest) without transcript
      await hubspot.logCallToTimeline({
        contactId: hubspotContactId,
        callSid,
        duration,
        transcript: '[Transcript not processed - consent required]',
      });

      logger.info('Logged call without transcript processing due to missing consent', {
        correlationId,
      });

      return {
        hasConsent: false,
        missingConsents: consentCheck.missing,
      };
    }

    logger.info('GDPR consent verified for voice processing', { correlationId });
    return { hasConsent: true };
  } catch (err) {
    logger.error('Failed to verify GDPR consent', { err, correlationId });
    // CRITICAL: Fail safe - do not process without consent verification
    throw new Error('Cannot process voice data: consent verification failed');
  }
}

/**
 * GDPR Consent verification for voice transcription
 */
/* eslint-disable @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-redundant-type-constituents */

import { logger } from '@trigger.dev/sdk/v3';
import type { GdprConsentResult } from './types.js';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type HubSpotClient = any;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type ConsentClient = any;

/**
 * Verify GDPR consent for voice data processing
 *
 * @returns GdprConsentResult with consent status and contact ID
 */
export async function verifyGdprConsent(
  hubspot: HubSpotClient | null,
  consent: ConsentClient | null,
  normalizedPhone: string,
  callId: string,
  correlationId: string
): Promise<GdprConsentResult> {
  const result: GdprConsentResult = {
    hasConsent: false,
    hubspotContactId: undefined,
  };

  if (!hubspot) {
    return result;
  }

  try {
    // Look up contact by phone to check consent
    const contact = await hubspot.findContactByPhone(normalizedPhone);
    result.hubspotContactId = contact?.id;

    if (result.hubspotContactId && consent) {
      const consentCheck = await consent.hasRequiredConsents(result.hubspotContactId);
      result.hasConsent = consentCheck.valid;
      result.consentCheckResult = consentCheck;

      if (!result.hasConsent) {
        logger.warn('Missing GDPR consent for voice data processing', {
          callId,
          contactId: result.hubspotContactId,
          missingConsents: consentCheck.missing,
          correlationId,
        });
      } else {
        logger.info('GDPR consent verified for voice transcript processing', {
          callId,
          hubspotContactId: result.hubspotContactId,
          correlationId,
        });
      }
    } else if (!consent) {
      // CRITICAL: Fail safe - if consent service unavailable, do not process personal data
      logger.error('Consent service not available - cannot verify GDPR consent', {
        callId,
        correlationId,
      });
    }
  } catch (err) {
    logger.error('Failed to verify GDPR consent', { err, callId, correlationId });
  }

  return result;
}

/**
 * Log minimal call data when consent is not available
 */
export async function logMinimalCallData(
  hubspot: HubSpotClient | null,
  hubspotContactId: string,
  callId: string,
  duration: number
): Promise<void> {
  if (!hubspot) {
    return;
  }

  await hubspot.logCallToTimeline({
    contactId: hubspotContactId,
    callSid: callId,
    duration,
    transcript: '[Transcript not processed - consent required]',
  });
}

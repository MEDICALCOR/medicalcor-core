/**
 * GDPR Consent verification utilities
 */

import { logger } from '@trigger.dev/sdk/v3';
import type { HubSpotContactResult, ConsentType } from './types.js';

/**
 * CRITICAL GDPR FIX: Helper function to verify contact has valid consent
 * Returns true only if the contact has explicitly consented to the specified type
 *
 * @param contact - HubSpot contact with properties
 * @param consentType - Type of consent to check
 * @returns true if contact has valid consent, false otherwise
 */
export function hasValidConsent(contact: HubSpotContactResult, consentType: ConsentType): boolean {
  const props = contact.properties;

  // Check specific consent property first
  const specificConsentProp = `consent_${consentType}`;
  if (props[specificConsentProp] === 'true') {
    return true;
  }

  // For appointment_reminders, also accept treatment_updates consent
  if (consentType === 'appointment_reminders' && props.consent_treatment_updates === 'true') {
    return true;
  }

  // Do NOT fall back to general marketing consent for medical communications
  // This would violate GDPR's principle of specific consent

  return false;
}

/**
 * Log consent check failure for audit trail
 */
export function logConsentDenied(
  contactId: string,
  consentType: ConsentType,
  correlationId: string
): void {
  logger.info('Message not sent - consent not granted', {
    contactId,
    consentType,
    correlationId,
    reason: 'GDPR_CONSENT_MISSING',
  });
}

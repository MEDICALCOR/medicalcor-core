/**
 * GDPR Consent flow handling for WhatsApp handler
 *
 * Uses loosely typed client interfaces to avoid tight coupling with integration package.
 * This allows the handlers to be tested independently.
 */
/* eslint-disable @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-redundant-type-constituents */

import { logger } from '@trigger.dev/sdk/v3';
import type { ConsentFlowResult } from './types.js';

/**
 * Client types (loosely typed to avoid coupling with integration package)
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type ConsentClient = any;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type WhatsAppClient = any;

/**
 * Consent response from parsing message
 */
interface ConsentResponse {
  granted: boolean;
  consentTypes: string[];
}

/**
 * Record consent from a consent response message
 */
async function recordConsentFromResponse(
  consent: ConsentClient,
  consentResponse: ConsentResponse,
  hubspotContactId: string,
  normalizedPhone: string,
  correlationId: string
): Promise<void> {
  const consentStatus = consentResponse.granted ? 'granted' : 'denied';

  for (const consentType of consentResponse.consentTypes) {
    await consent.recordConsent({
      contactId: hubspotContactId,
      phone: normalizedPhone,
      consentType,
      status: consentStatus,
      source: {
        channel: 'whatsapp',
        method: 'explicit',
        evidenceUrl: null,
        witnessedBy: null,
      },
    });
  }

  logger.info('Consent recorded from message', {
    status: consentStatus,
    types: consentResponse.consentTypes,
    correlationId,
  });
}

/**
 * Send consent confirmation message
 */
async function sendConsentConfirmation(
  whatsapp: WhatsAppClient | null,
  normalizedPhone: string,
  granted: boolean
): Promise<void> {
  if (!whatsapp) {
    return;
  }

  const confirmationMsg = granted
    ? 'Mulțumim! Consimțământul dumneavoastră a fost înregistrat. Putem continua conversația.'
    : 'Am înregistrat preferința dumneavoastră. Nu vă vom mai trimite mesaje promoționale.';

  await whatsapp.sendText({ to: normalizedPhone, text: confirmationMsg });
}

/**
 * Request consent from a new contact
 */
async function requestConsent(
  consent: ConsentClient,
  whatsapp: WhatsAppClient | null,
  hubspotContactId: string,
  normalizedPhone: string,
  correlationId: string
): Promise<void> {
  logger.info('No valid consent found, requesting consent', { correlationId });

  if (!whatsapp) {
    return;
  }

  const consentMessage = consent.generateConsentMessage('ro');
  await whatsapp.sendText({ to: normalizedPhone, text: consentMessage });

  // Record pending consent
  await consent.recordConsent({
    contactId: hubspotContactId,
    phone: normalizedPhone,
    consentType: 'data_processing',
    status: 'pending',
    source: {
      channel: 'whatsapp',
      method: 'explicit',
      evidenceUrl: null,
      witnessedBy: null,
    },
  });

  logger.warn('Processing message without explicit consent - consent requested', {
    correlationId,
  });
}

/**
 * Handle the complete GDPR consent flow
 *
 * @returns ConsentFlowResult indicating if consent was denied or requested
 */
export async function handleConsentFlow(
  consent: ConsentClient | null,
  whatsapp: WhatsAppClient | null,
  messageBody: string,
  hubspotContactId: string | undefined,
  normalizedPhone: string,
  correlationId: string
): Promise<ConsentFlowResult> {
  const result: ConsentFlowResult = {
    consentDenied: false,
    consentRequested: false,
  };

  if (!consent || !hubspotContactId) {
    return result;
  }

  // Parse message for consent response (da/nu/yes/no/stop)
  const consentResponse = consent.parseConsentFromMessage(messageBody) as ConsentResponse | null;

  if (consentResponse) {
    // User is responding to consent request - record their response
    try {
      await recordConsentFromResponse(
        consent,
        consentResponse,
        hubspotContactId,
        normalizedPhone,
        correlationId
      );
      await sendConsentConfirmation(whatsapp, normalizedPhone, consentResponse.granted);

      if (!consentResponse.granted) {
        result.consentDenied = true;
      }
    } catch (err) {
      logger.error('Failed to record consent', { err, correlationId });
    }

    return result;
  }

  // Not a consent response - check if we need to request consent
  try {
    const hasValidConsent = await consent.hasValidConsent(hubspotContactId, 'data_processing');

    if (!hasValidConsent) {
      const existingConsent = await consent.getConsent(hubspotContactId, 'data_processing');

      if (!existingConsent || existingConsent.status === 'pending') {
        await requestConsent(consent, whatsapp, hubspotContactId, normalizedPhone, correlationId);
        result.consentRequested = true;
      }
    }
  } catch (err) {
    logger.error('Failed to check/request consent', { err, correlationId });
  }

  return result;
}

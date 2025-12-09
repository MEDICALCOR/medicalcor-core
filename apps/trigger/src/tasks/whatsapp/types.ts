/**
 * Types for WhatsApp message handler
 *
 * Uses minimal interfaces to avoid tight coupling with integration package types.
 * Functions accept the actual integration types at runtime.
 */

/**
 * Score result from scoring service
 */
export interface ScoreResult {
  score: number;
  classification: 'HOT' | 'WARM' | 'COLD' | 'UNQUALIFIED';
  confidence: number;
  suggestedAction?: string;
}

/**
 * Result from HubSpot contact sync
 */
export interface HubSpotSyncResult {
  contactId: string | undefined;
}

/**
 * Result from consent flow processing
 */
export interface ConsentFlowResult {
  consentDenied: boolean;
  consentRequested: boolean;
}

/**
 * Context passed through handler steps
 */
export interface HandlerContext {
  correlationId: string;
  normalizedPhone: string;
  hubspotContactId: string | undefined;
  contactName: string | undefined;
  messageId: string;
  messageBody: string;
}

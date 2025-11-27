/**
 * Universal Adapters for Plug & Play Architecture
 *
 * This module exports all adapter implementations and factories for the
 * MedicalCor platform's provider-agnostic integration system.
 *
 * The adapter pattern allows switching between providers via environment variables:
 *
 * ```bash
 * # Switch payment provider
 * PAYMENT_PROVIDER=stripe  # or 'netopia', 'euplatesc'
 *
 * # Switch CRM provider
 * CRM_PROVIDER=hubspot     # or 'zoho', 'salesforce'
 *
 * # Switch AI provider
 * AI_PROVIDER=openai       # or 'anthropic', 'azure_openai'
 *
 * # Switch voice provider
 * VOICE_PROVIDER=vapi      # or 'twilio', 'bland'
 * ```
 *
 * Usage:
 * ```typescript
 * import {
 *   PaymentFactory,
 *   CRMFactory,
 *   AIFactory,
 *   VoiceFactory,
 * } from '@medicalcor/integrations/adapters';
 *
 * // Get providers based on environment config
 * const payment = PaymentFactory.getProvider();
 * const crm = CRMFactory.getProvider();
 * const ai = AIFactory.getProvider();
 * const voice = VoiceFactory.getProvider();
 *
 * // Use the universal interfaces
 * await payment.createPaymentLink({ amount: 10000, currency: 'RON' });
 * await crm.syncContact({ phone: '+40712345678' });
 * await ai.chat('You are a helpful assistant', 'Hello!');
 * await voice.makeOutboundCall({ phoneNumber: '+40712345678' });
 * ```
 */

// =============================================================================
// Payment Gateway Adapters
// =============================================================================
export {
  // Implementations
  StripeAdapter,
  createStripeAdapter,
  type StripeAdapterConfig,
  // Factory
  PaymentFactory,
  getPaymentProvider,
  type PaymentFactoryConfig,
} from './payment/index.js';

// =============================================================================
// Voice Provider Adapters
// =============================================================================
export {
  // Implementations
  VapiAdapter,
  createVapiAdapter,
  type VapiAdapterConfig,
  // Factory
  VoiceFactory,
  getVoiceProvider,
  type VoiceFactoryConfig,
} from './voice/index.js';

// =============================================================================
// AI/LLM Provider Adapters
// =============================================================================
export {
  // Implementations
  OpenAIAdapter,
  createOpenAIAdapter,
  type OpenAIAdapterConfig,
  // Factory
  AIFactory,
  getAIProvider,
  type AIFactoryConfig,
} from './ai/index.js';

// =============================================================================
// CRM Provider Adapters
// =============================================================================
export {
  // Implementations
  HubSpotAdapter,
  createHubSpotAdapter,
  type HubSpotAdapterConfig,
  // Factory
  CRMFactory,
  getCRMProvider,
  type CRMFactoryConfig,
} from './crm/index.js';

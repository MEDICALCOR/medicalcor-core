/**
 * Voice Provider Factory
 *
 * Creates the appropriate voice provider adapter based on environment configuration.
 *
 * Environment Variables:
 * - VOICE_PROVIDER: 'vapi' | 'twilio' | 'bland' | 'retell'
 * - Provider-specific keys (e.g., VAPI_API_KEY, VAPI_ASSISTANT_ID)
 */

import type { IVoiceProvider, VoiceProvider } from '@medicalcor/types';
import { VapiAdapter, type VapiAdapterConfig } from './vapi.adapter.js';

export interface VoiceFactoryConfig {
  provider?: VoiceProvider;
  vapi?: VapiAdapterConfig;
  twilio?: {
    accountSid: string;
    authToken: string;
    phoneNumber: string;
  };
  bland?: {
    apiKey: string;
    agentId: string;
  };
  timeoutMs?: number;
  retryConfig?: {
    maxRetries: number;
    baseDelayMs: number;
  };
}

// eslint-disable-next-line @typescript-eslint/no-extraneous-class
export class VoiceFactory {
  private static instance: IVoiceProvider | null = null;

  static getProvider(config?: VoiceFactoryConfig): IVoiceProvider {
    if (VoiceFactory.instance && !config) {
      return VoiceFactory.instance;
    }

    const provider =
      config?.provider ?? (process.env.VOICE_PROVIDER as VoiceProvider | undefined) ?? 'vapi';
    const adapter = VoiceFactory.createAdapter(provider, config);

    if (!config) {
      VoiceFactory.instance = adapter;
    }

    return adapter;
  }

  static createAdapter(provider: VoiceProvider, config?: VoiceFactoryConfig): IVoiceProvider {
    switch (provider) {
      case 'vapi':
        return VoiceFactory.createVapiAdapter(config);

      case 'twilio':
        throw new Error(
          'Twilio Voice adapter not yet implemented. ' +
            'Create a TwilioVoiceAdapter class implementing IVoiceProvider.'
        );

      case 'bland':
        throw new Error(
          'Bland AI adapter not yet implemented. ' +
            'Create a BlandAdapter class implementing IVoiceProvider.'
        );

      case 'retell':
        throw new Error(
          'Retell adapter not yet implemented. ' +
            'Create a RetellAdapter class implementing IVoiceProvider.'
        );

      case 'vonage':
        throw new Error(
          'Vonage Voice adapter not yet implemented. ' +
            'Create a VonageVoiceAdapter class implementing IVoiceProvider.'
        );

      default: {
        const exhaustiveCheck: never = provider;
        throw new Error(`Unknown voice provider: ${String(exhaustiveCheck)}`);
      }
    }
  }

  private static createVapiAdapter(config?: VoiceFactoryConfig): IVoiceProvider {
    if (config?.vapi) {
      if (!config.vapi.apiKey) {
        throw new Error('VAPI_API_KEY not configured');
      }
      return new VapiAdapter(config.vapi);
    }

    const apiKey = process.env.VAPI_API_KEY ?? '';
    if (!apiKey) {
      throw new Error('VAPI_API_KEY not configured');
    }

    return new VapiAdapter({
      apiKey,
      assistantId: process.env.VAPI_ASSISTANT_ID ?? undefined,
      phoneNumberId: process.env.VAPI_PHONE_NUMBER_ID ?? undefined,
      timeoutMs: config?.timeoutMs ?? 30000,
      retryConfig: config?.retryConfig ?? undefined,
    });
  }

  static clearInstance(): void {
    VoiceFactory.instance = null;
  }

  static isProviderAvailable(provider: VoiceProvider): boolean {
    switch (provider) {
      case 'vapi':
        return !!process.env.VAPI_API_KEY;
      case 'twilio':
        return !!(process.env.TWILIO_ACCOUNT_SID && process.env.TWILIO_AUTH_TOKEN);
      case 'bland':
        return !!process.env.BLAND_API_KEY;
      case 'retell':
        return !!process.env.RETELL_API_KEY;
      default:
        return false;
    }
  }
}

export function getVoiceProvider(config?: VoiceFactoryConfig): IVoiceProvider {
  return VoiceFactory.getProvider(config);
}

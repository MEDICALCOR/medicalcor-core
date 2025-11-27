/**
 * CRM Provider Factory
 *
 * Creates the appropriate CRM provider adapter based on environment configuration.
 *
 * Environment Variables:
 * - CRM_PROVIDER: 'hubspot' | 'zoho' | 'salesforce' | 'pipedrive'
 * - Provider-specific keys (e.g., HUBSPOT_ACCESS_TOKEN, ZOHO_REFRESH_TOKEN)
 */

import type { ICRMProvider, CRMProvider } from '@medicalcor/types';
import { HubSpotAdapter, type HubSpotAdapterConfig } from './hubspot.adapter.js';

export interface CRMFactoryConfig {
  provider?: CRMProvider;
  hubspot?: HubSpotAdapterConfig;
  zoho?: {
    clientId: string;
    clientSecret: string;
    refreshToken: string;
  };
  salesforce?: {
    clientId: string;
    clientSecret: string;
    instanceUrl: string;
    refreshToken: string;
  };
  pipedrive?: {
    apiToken: string;
    companyDomain: string;
  };
  timeoutMs?: number;
  retryConfig?: {
    maxRetries: number;
    baseDelayMs: number;
  };
}

// eslint-disable-next-line @typescript-eslint/no-extraneous-class
export class CRMFactory {
  private static instance: ICRMProvider | null = null;

  static getProvider(config?: CRMFactoryConfig): ICRMProvider {
    if (CRMFactory.instance && !config) {
      return CRMFactory.instance;
    }

    const provider =
      config?.provider ?? (process.env.CRM_PROVIDER as CRMProvider | undefined) ?? 'hubspot';
    const adapter = CRMFactory.createAdapter(provider, config);

    if (!config) {
      CRMFactory.instance = adapter;
    }

    return adapter;
  }

  static createAdapter(provider: CRMProvider, config?: CRMFactoryConfig): ICRMProvider {
    switch (provider) {
      case 'hubspot':
        return CRMFactory.createHubSpotAdapter(config);

      case 'zoho':
        throw new Error(
          'Zoho CRM adapter not yet implemented. ' +
            'Create a ZohoAdapter class implementing ICRMProvider.'
        );

      case 'salesforce':
        throw new Error(
          'Salesforce adapter not yet implemented. ' +
            'Create a SalesforceAdapter class implementing ICRMProvider.'
        );

      case 'pipedrive':
        throw new Error(
          'Pipedrive adapter not yet implemented. ' +
            'Create a PipedriveAdapter class implementing ICRMProvider.'
        );

      case 'freshsales':
        throw new Error(
          'Freshsales adapter not yet implemented. ' +
            'Create a FreshsalesAdapter class implementing ICRMProvider.'
        );

      default: {
        const exhaustiveCheck: never = provider;
        throw new Error(`Unknown CRM provider: ${String(exhaustiveCheck)}`);
      }
    }
  }

  private static createHubSpotAdapter(config?: CRMFactoryConfig): ICRMProvider {
    if (config?.hubspot) {
      if (!config.hubspot.accessToken) {
        throw new Error('HUBSPOT_ACCESS_TOKEN not configured');
      }
      return new HubSpotAdapter(config.hubspot);
    }

    const accessToken = process.env.HUBSPOT_ACCESS_TOKEN ?? '';
    if (!accessToken) {
      throw new Error('HUBSPOT_ACCESS_TOKEN not configured');
    }

    return new HubSpotAdapter({
      accessToken,
      portalId: process.env.HUBSPOT_PORTAL_ID ?? undefined,
      timeoutMs: config?.timeoutMs ?? 30000,
      retryConfig: config?.retryConfig ?? undefined,
    });
  }

  static clearInstance(): void {
    CRMFactory.instance = null;
  }

  static isProviderAvailable(provider: CRMProvider): boolean {
    switch (provider) {
      case 'hubspot':
        return !!process.env.HUBSPOT_ACCESS_TOKEN;
      case 'zoho':
        return !!process.env.ZOHO_REFRESH_TOKEN;
      case 'salesforce':
        return !!process.env.SALESFORCE_REFRESH_TOKEN;
      case 'pipedrive':
        return !!process.env.PIPEDRIVE_API_TOKEN;
      case 'freshsales':
        return !!process.env.FRESHSALES_API_KEY;
      default:
        return false;
    }
  }
}

export function getCRMProvider(config?: CRMFactoryConfig): ICRMProvider {
  return CRMFactory.getProvider(config);
}

/**
 * CRM Provider Factory
 * Returns the appropriate CRM adapter based on configuration
 */

import type { ICRMProvider } from '@medicalcor/types';
import { PipedriveAdapter } from './pipedrive.adapter.js';

let crmProviderInstance: ICRMProvider | undefined;

/**
 * Get the configured CRM provider
 * Uses CRM_PROVIDER env var, defaults to 'pipedrive'
 */
export function getCRMProvider(): ICRMProvider {
  if (crmProviderInstance) return crmProviderInstance;

  const providerType = (process.env.CRM_PROVIDER ?? 'pipedrive').toLowerCase();

  switch (providerType) {
    case 'pipedrive':
      crmProviderInstance = new PipedriveAdapter();
      break;
    // Future providers can be added here:
    // case 'hubspot':
    //   crmProviderInstance = new HubSpotAdapter();
    //   break;
    // case 'salesforce':
    //   crmProviderInstance = new SalesforceAdapter();
    //   break;
    default:
      throw new Error(`Unknown CRM Provider: ${providerType}`);
  }

  return crmProviderInstance;
}

/**
 * Reset the singleton instance (useful for testing)
 */
export function resetCRMProvider(): void {
  crmProviderInstance = undefined;
}

/**
 * CRMFactory namespace for backwards compatibility
 * @deprecated Use getCRMProvider() and resetCRMProvider() directly
 */
export const CRMFactory = {
  getProvider: getCRMProvider,
  reset: resetCRMProvider,
};

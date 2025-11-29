/**
 * CRM Provider Factory
 * Returns the appropriate CRM adapter based on configuration
 *
 * Supported providers:
 * - pipedrive (default): Production Pipedrive CRM integration
 * - mock: Test/development mock adapter with configurable scenarios
 *
 * Configuration:
 * - CRM_PROVIDER: 'pipedrive' | 'mock' (default: 'pipedrive')
 * - CRM_MOCK_SCENARIO: 'success' | 'partial' | 'error' | 'slow' | 'flaky' (for mock provider)
 */

import type { ICRMProvider } from '@medicalcor/types';
import { PipedriveAdapter } from './pipedrive.adapter.js';
import { MockCrmAdapter, type MockCrmConfig, type MockCrmScenario } from './mock.adapter.js';

let crmProviderInstance: ICRMProvider | undefined;

/**
 * Parse mock scenario from environment
 */
function getMockScenario(): MockCrmScenario {
  const scenario = process.env.CRM_MOCK_SCENARIO?.toLowerCase();
  const validScenarios: MockCrmScenario[] = ['success', 'partial', 'error', 'slow', 'flaky'];

  if (scenario && validScenarios.includes(scenario as MockCrmScenario)) {
    return scenario as MockCrmScenario;
  }

  return 'success';
}

/**
 * Build mock CRM config from environment variables
 */
function buildMockConfig(): Partial<MockCrmConfig> {
  return {
    scenario: getMockScenario(),
    baseLatencyMs: parseInt(process.env.CRM_MOCK_LATENCY_MS ?? '0', 10),
    errorRate: parseFloat(process.env.CRM_MOCK_ERROR_RATE ?? '0.2'),
    verbose: process.env.CRM_MOCK_VERBOSE === 'true',
  };
}

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

    case 'mock':
      crmProviderInstance = new MockCrmAdapter(buildMockConfig());
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
 * Get the CRM provider with explicit type checking
 * Returns the mock adapter if configured, allowing access to mock-specific methods
 */
export function getMockCRMProvider(): MockCrmAdapter | null {
  const provider = getCRMProvider();
  if (provider instanceof MockCrmAdapter) {
    return provider;
  }
  return null;
}

/**
 * Check if the current CRM provider is the mock adapter
 */
export function isMockCRMProvider(): boolean {
  const provider = getCRMProvider();
  return provider instanceof MockCrmAdapter;
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

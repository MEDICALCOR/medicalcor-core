/**
 * CRM Integration Module
 * Exports CRM adapters and factory
 */

export {
  CRMFactory,
  getCRMProvider,
  resetCRMProvider,
  getMockCRMProvider,
  isMockCRMProvider,
} from './factory.js';

export { PipedriveAdapter } from './pipedrive.adapter.js';

export {
  MockCrmAdapter,
  MockCrmError,
  createMockCrmAdapter,
  createSuccessMockCrm,
  createErrorMockCrm,
  createFlakyMockCrm,
  createSlowMockCrm,
  MockCrmConfigSchema,
  MockCrmScenarioSchema,
  type MockCrmConfig,
  type MockCrmScenario,
  type CrmHealthCheckResult,
} from './mock.adapter.js';

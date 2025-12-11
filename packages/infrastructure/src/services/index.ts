/**
 * @fileoverview External Services Adapters Index
 *
 * Exports all external service adapters for the infrastructure layer.
 * These adapters implement secondary ports defined in the application layer.
 *
 * @module @medicalcor/infrastructure/services
 */

export { GeoIPAdapter, createGeoIPAdapter, createMockGeoIPAdapter } from './GeoIPAdapter.js';

// Note: PipedriveCrmGateway moved to @medicalcor/integrations/crm to respect layer boundaries

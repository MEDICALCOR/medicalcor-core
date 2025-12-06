/**
 * @fileoverview OSAX Adapters Index
 *
 * Exports storage adapters that remain in core.
 * Domain-specific adapters (imaging, financial, resources) have been moved to @medicalcor/integrations.
 *
 * @module core/adapters/osax
 */

// Storage Adapters
export {
  SupabaseStorageAdapterStub,
  type SupabaseStorageAdapterStubOptions,
} from './storage/SupabaseStorageAdapter.stub.js';

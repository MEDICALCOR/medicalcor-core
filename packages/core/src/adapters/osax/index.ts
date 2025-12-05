/**
 * @fileoverview OSAX Adapters Index
 *
 * Exports all OSAX-related infrastructure adapters.
 *
 * @module core/adapters/osax
 */

// Imaging Adapters
export {
  DummyImagingAdapter,
  type DummyImagingAdapterOptions,
} from './imaging/DummyImagingAdapter.js';

// Storage Adapters
export {
  SupabaseStorageAdapterStub,
  type SupabaseStorageAdapterStubOptions,
} from './storage/SupabaseStorageAdapter.stub.js';

// Financial Adapters
export {
  RuleBasedFinancialPredictor,
  type RuleBasedFinancialPredictorOptions,
} from './financial/RuleBasedFinancialPredictor.js';

// Resource Scheduler Adapters
export {
  DummyResourceSchedulerAdapter,
  type DummyResourceSchedulerAdapterOptions,
} from './resources/DummyResourceSchedulerAdapter.js';

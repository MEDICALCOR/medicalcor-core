/**
 * Payment Gateway Adapters
 *
 * Exports payment gateway implementations and factory.
 */

// Adapters
export { StripeAdapter, createStripeAdapter, type StripeAdapterConfig } from './stripe.adapter.js';

// Factory
export {
  PaymentFactory,
  getPaymentProvider,
  type PaymentFactoryConfig,
} from './payment.factory.js';

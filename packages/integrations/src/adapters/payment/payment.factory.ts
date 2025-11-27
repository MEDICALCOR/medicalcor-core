/**
 * Payment Gateway Factory
 *
 * Creates the appropriate payment gateway adapter based on environment configuration.
 * Supports multiple providers through the universal IPaymentGateway interface.
 *
 * Usage:
 * ```typescript
 * // Provider is selected via PAYMENT_PROVIDER env var
 * const payment = PaymentFactory.getProvider();
 * const link = await payment.createPaymentLink({ amount: 10000, currency: 'RON' });
 * ```
 *
 * Environment Variables:
 * - PAYMENT_PROVIDER: 'stripe' | 'netopia' | 'euplatesc' | 'paytabs' | 'mollie'
 * - Provider-specific keys (e.g., STRIPE_SECRET_KEY, STRIPE_WEBHOOK_SECRET)
 */

import type { IPaymentGateway, PaymentProvider } from '@medicalcor/types';
import { StripeAdapter, type StripeAdapterConfig } from './stripe.adapter.js';

/**
 * Payment factory configuration
 */
export interface PaymentFactoryConfig {
  /** Override provider (defaults to env var) */
  provider?: PaymentProvider;

  /** Stripe configuration */
  stripe?: StripeAdapterConfig;

  /** Netopia configuration (future) */
  netopia?: {
    merchantId: string;
    publicKey: string;
    privateKey: string;
    sandbox?: boolean;
  };

  /** EuPlatesc configuration (future) */
  euplatesc?: {
    merchantId: string;
    key: string;
    sandbox?: boolean;
  };

  /** Request timeout in ms */
  timeoutMs?: number;

  /** Retry configuration */
  retryConfig?: {
    maxRetries: number;
    baseDelayMs: number;
  };
}

/**
 * Payment Gateway Factory
 *
 * Provides a unified interface for creating payment gateway adapters.
 */
// eslint-disable-next-line @typescript-eslint/no-extraneous-class
export class PaymentFactory {
  private static instance: IPaymentGateway | null = null;

  /**
   * Get the configured payment gateway provider
   *
   * Provider is determined by:
   * 1. Explicit config.provider parameter
   * 2. PAYMENT_PROVIDER environment variable
   * 3. Default: 'stripe'
   */
  static getProvider(config?: PaymentFactoryConfig): IPaymentGateway {
    // Use singleton pattern for efficiency
    if (PaymentFactory.instance && !config) {
      return PaymentFactory.instance;
    }

    const provider =
      config?.provider ?? (process.env.PAYMENT_PROVIDER as PaymentProvider | undefined) ?? 'stripe';

    const adapter = PaymentFactory.createAdapter(provider, config);

    if (!config) {
      PaymentFactory.instance = adapter;
    }

    return adapter;
  }

  /**
   * Create a new adapter instance (bypasses singleton)
   */
  static createAdapter(provider: PaymentProvider, config?: PaymentFactoryConfig): IPaymentGateway {
    switch (provider) {
      case 'stripe':
        return PaymentFactory.createStripeAdapter(config);

      case 'netopia':
        // Future implementation
        throw new Error(
          'Netopia adapter not yet implemented. ' +
            'Create a NetopiaAdapter class implementing IPaymentGateway.'
        );

      case 'euplatesc':
        // Future implementation
        throw new Error(
          'EuPlatesc adapter not yet implemented. ' +
            'Create an EuPlatescAdapter class implementing IPaymentGateway.'
        );

      case 'paytabs':
        // Future implementation
        throw new Error(
          'PayTabs adapter not yet implemented. ' +
            'Create a PayTabsAdapter class implementing IPaymentGateway.'
        );

      case 'mollie':
        // Future implementation
        throw new Error(
          'Mollie adapter not yet implemented. ' +
            'Create a MollieAdapter class implementing IPaymentGateway.'
        );

      case 'banca_transilvania':
        // Future implementation
        throw new Error(
          'Banca Transilvania adapter not yet implemented. ' +
            'Create a BancaTransilvaniaAdapter class implementing IPaymentGateway.'
        );

      default: {
        const exhaustiveCheck: never = provider;
        throw new Error(
          `Unknown payment provider: ${String(exhaustiveCheck)}. ` +
            `Supported providers: stripe, netopia, euplatesc, paytabs, mollie, banca_transilvania`
        );
      }
    }
  }

  /**
   * Create Stripe adapter
   */
  private static createStripeAdapter(config?: PaymentFactoryConfig): IPaymentGateway {
    const stripeConfig: StripeAdapterConfig = config?.stripe ?? {
      secretKey: process.env.STRIPE_SECRET_KEY ?? '',
      webhookSecret: process.env.STRIPE_WEBHOOK_SECRET,
      timeoutMs: config?.timeoutMs ?? 30000,
      retryConfig: config?.retryConfig ?? {
        maxRetries: 3,
        baseDelayMs: 1000,
      },
    };

    if (!stripeConfig.secretKey) {
      throw new Error(
        'Stripe secret key not configured. ' +
          'Set STRIPE_SECRET_KEY environment variable or provide config.stripe.secretKey'
      );
    }

    return new StripeAdapter(stripeConfig);
  }

  /**
   * Clear the singleton instance (useful for testing)
   */
  static clearInstance(): void {
    PaymentFactory.instance = null;
  }

  /**
   * Check if a provider is available (has required config)
   */
  static isProviderAvailable(provider: PaymentProvider): boolean {
    switch (provider) {
      case 'stripe':
        return !!process.env.STRIPE_SECRET_KEY;
      case 'netopia':
        return !!(
          process.env.NETOPIA_MERCHANT_ID &&
          process.env.NETOPIA_PUBLIC_KEY &&
          process.env.NETOPIA_PRIVATE_KEY
        );
      case 'euplatesc':
        return !!(process.env.EUPLATESC_MERCHANT_ID && process.env.EUPLATESC_KEY);
      case 'paytabs':
        return !!(process.env.PAYTABS_PROFILE_ID && process.env.PAYTABS_SERVER_KEY);
      case 'mollie':
        return !!process.env.MOLLIE_API_KEY;
      case 'banca_transilvania':
        return !!process.env.BT_API_KEY;
      default:
        return false;
    }
  }

  /**
   * Get list of available providers
   */
  static getAvailableProviders(): PaymentProvider[] {
    const providers: PaymentProvider[] = [
      'stripe',
      'netopia',
      'euplatesc',
      'paytabs',
      'mollie',
      'banca_transilvania',
    ];
    return providers.filter((p) => PaymentFactory.isProviderAvailable(p));
  }
}

// Export convenience function
export function getPaymentProvider(config?: PaymentFactoryConfig): IPaymentGateway {
  return PaymentFactory.getProvider(config);
}

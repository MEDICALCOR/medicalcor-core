/**
 * Payment Gateway Universal Interface
 *
 * Abstracts payment processing to support multiple providers:
 * - Stripe (current)
 * - Netopia (Romania)
 * - EuPlatesc (Romania)
 * - PayTabs (Middle East)
 * - Mollie (Europe)
 *
 * Usage:
 * ```typescript
 * const payment = PaymentFactory.getProvider();
 * const link = await payment.createPaymentLink(10000, 'RON', { orderId: '123' });
 * ```
 */

import type { IBaseAdapter, IWebhookVerification, IPaginationParams } from './base.interface.js';

/**
 * Supported payment providers
 */
export type PaymentProvider =
  | 'stripe'
  | 'netopia'
  | 'euplatesc'
  | 'paytabs'
  | 'mollie'
  | 'banca_transilvania';

/**
 * Payment status (normalized across all providers)
 */
export type PaymentStatus =
  | 'PENDING'
  | 'PROCESSING'
  | 'PAID'
  | 'FAILED'
  | 'CANCELLED'
  | 'REFUNDED'
  | 'PARTIALLY_REFUNDED';

/**
 * Payment method types
 */
export type PaymentMethodType = 'card' | 'bank_transfer' | 'cash' | 'wallet' | 'bnpl';

/**
 * Customer information for payments
 */
export interface IPaymentCustomer {
  email?: string | undefined;
  phone?: string | undefined;
  name?: string | undefined;
  customerId?: string | undefined;
}

/**
 * Payment link creation options
 */
export interface ICreatePaymentLinkOptions {
  /** Amount in smallest currency unit (e.g., bani for RON) */
  amount: number;

  /** ISO 4217 currency code (e.g., 'RON', 'EUR', 'USD') */
  currency: string;

  /** Human-readable description */
  description?: string | undefined;

  /** Customer information */
  customer?: IPaymentCustomer | undefined;

  /** Custom metadata to attach to payment */
  metadata?: Record<string, string> | undefined;

  /** Success redirect URL */
  successUrl?: string | undefined;

  /** Cancel redirect URL */
  cancelUrl?: string | undefined;

  /** Payment link expiration in minutes */
  expiresInMinutes?: number | undefined;

  /** Allowed payment methods */
  allowedMethods?: PaymentMethodType[] | undefined;
}

/**
 * Payment link result
 */
export interface IPaymentLink {
  /** Unique payment link ID */
  id: string;

  /** URL for customer to complete payment */
  url: string;

  /** Payment amount */
  amount: number;

  /** Currency code */
  currency: string;

  /** Current status */
  status: PaymentStatus;

  /** Expiration timestamp */
  expiresAt?: Date | undefined;

  /** Provider-specific data */
  providerData?: Record<string, unknown> | undefined;
}

/**
 * Payment transaction details
 */
export interface IPaymentTransaction {
  /** Unique transaction ID */
  id: string;

  /** Provider-specific transaction ID */
  providerTransactionId: string;

  /** Amount in smallest currency unit */
  amount: number;

  /** Amount that was captured (may differ for partial captures) */
  amountCaptured?: number | undefined;

  /** Currency code */
  currency: string;

  /** Current status */
  status: PaymentStatus;

  /** Payment method used */
  paymentMethod?: PaymentMethodType | undefined;

  /** Customer information */
  customer?: IPaymentCustomer | undefined;

  /** Original metadata */
  metadata?: Record<string, string> | undefined;

  /** Creation timestamp */
  createdAt: Date;

  /** Last update timestamp */
  updatedAt: Date;

  /** Refund amount if any */
  refundedAmount?: number | undefined;

  /** Fee charged by provider */
  fee?: number | undefined;

  /** Net amount after fees */
  netAmount?: number | undefined;
}

/**
 * Refund request options
 */
export interface IRefundOptions {
  /** Transaction ID to refund */
  transactionId: string;

  /** Amount to refund (partial refund if less than original) */
  amount?: number | undefined;

  /** Reason for refund */
  reason?: string | undefined;

  /** Custom metadata */
  metadata?: Record<string, string> | undefined;
}

/**
 * Refund result
 */
export interface IRefundResult {
  /** Refund ID */
  id: string;

  /** Original transaction ID */
  transactionId: string;

  /** Refunded amount */
  amount: number;

  /** Currency */
  currency: string;

  /** Refund status */
  status: 'PENDING' | 'COMPLETED' | 'FAILED';

  /** Creation timestamp */
  createdAt: Date;
}

/**
 * Revenue summary for a period
 */
export interface IRevenueSummary {
  /** Total amount in smallest currency unit */
  totalAmount: number;

  /** Currency code */
  currency: string;

  /** Number of transactions */
  transactionCount: number;

  /** Period start */
  periodStart: Date;

  /** Period end */
  periodEnd: Date;

  /** Breakdown by status */
  byStatus?: Record<PaymentStatus, number> | undefined;

  /** Total fees */
  totalFees?: number | undefined;

  /** Net revenue after fees */
  netRevenue?: number | undefined;
}

/**
 * Webhook event types (normalized)
 */
export type PaymentWebhookEventType =
  | 'payment.created'
  | 'payment.succeeded'
  | 'payment.failed'
  | 'payment.cancelled'
  | 'refund.created'
  | 'refund.completed'
  | 'refund.failed'
  | 'dispute.created'
  | 'dispute.resolved';

/**
 * Normalized webhook payload
 */
export interface IPaymentWebhookPayload {
  /** Event type */
  eventType: PaymentWebhookEventType;

  /** Event ID */
  eventId: string;

  /** Transaction ID */
  transactionId: string;

  /** Amount */
  amount: number;

  /** Currency */
  currency: string;

  /** Current status */
  status: PaymentStatus;

  /** Customer info */
  customer?: IPaymentCustomer | undefined;

  /** Original metadata */
  metadata?: Record<string, string> | undefined;

  /** Raw provider payload */
  rawPayload: unknown;

  /** Event timestamp */
  timestamp: Date;
}

/**
 * Universal Payment Gateway Interface
 *
 * All payment providers must implement this interface to be
 * compatible with the MedicalCor platform.
 */
export interface IPaymentGateway extends IBaseAdapter {
  /**
   * Provider identifier
   */
  readonly providerName: PaymentProvider;

  /**
   * Create a payment link for customer checkout
   */
  createPaymentLink(options: ICreatePaymentLinkOptions): Promise<IPaymentLink>;

  /**
   * Get payment status by transaction ID
   */
  getPaymentStatus(transactionId: string): Promise<PaymentStatus>;

  /**
   * Get full transaction details
   */
  getTransaction(transactionId: string): Promise<IPaymentTransaction>;

  /**
   * List transactions with optional filters
   */
  listTransactions(options?: {
    status?: PaymentStatus;
    startDate?: Date;
    endDate?: Date;
    customerId?: string;
    pagination?: IPaginationParams;
  }): Promise<{ transactions: IPaymentTransaction[]; hasMore: boolean }>;

  /**
   * Process a refund
   */
  refund(options: IRefundOptions): Promise<IRefundResult>;

  /**
   * Get revenue summary for a period
   */
  getRevenueSummary(startDate: Date, endDate: Date): Promise<IRevenueSummary>;

  /**
   * Get today's revenue (convenience method)
   */
  getDailyRevenue(timezone?: string): Promise<IRevenueSummary>;

  /**
   * Verify webhook signature and parse payload
   */
  verifyWebhook(payload: string, signature: string): IWebhookVerification;

  /**
   * Parse webhook payload into normalized format
   */
  parseWebhookPayload(payload: unknown): IPaymentWebhookPayload | null;

  /**
   * Format amount from smallest unit to display string
   * Example: 150000 (bani) -> "1.500,00 RON"
   */
  formatAmount(amount: number, currency?: string): string;

  /**
   * Convert amount to major currency units
   * Example: 150000 (bani) -> 1500 (RON)
   */
  toMajorUnits(amount: number): number;

  /**
   * Convert amount from major to minor currency units
   * Example: 1500 (RON) -> 150000 (bani)
   */
  toMinorUnits(amount: number): number;
}

/**
 * Payment Gateway Factory configuration
 */
export interface IPaymentGatewayConfig {
  /** Provider to use */
  provider: PaymentProvider;

  /** Provider-specific configuration */
  config: Record<string, unknown>;
}

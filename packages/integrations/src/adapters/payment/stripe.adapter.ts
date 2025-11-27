/**
 * Stripe Payment Gateway Adapter
 *
 * Implements the IPaymentGateway interface for Stripe.
 * This adapter wraps the existing StripeClient with the universal interface.
 */

import crypto from 'crypto';
import type {
  IPaymentGateway,
  ICreatePaymentLinkOptions,
  IPaymentLink,
  IPaymentTransaction,
  IRefundOptions,
  IRefundResult,
  IRevenueSummary,
  IHealthCheckResult,
  IWebhookVerification,
  IPaymentWebhookPayload,
  PaymentStatus,
  IPaginationParams,
} from '@medicalcor/types';
import { withRetry, ExternalServiceError, RateLimitError } from '@medicalcor/core';

export interface StripeAdapterConfig {
  secretKey: string;
  webhookSecret?: string | undefined;
  timeoutMs?: number | undefined;
  retryConfig?:
    | {
        maxRetries: number;
        baseDelayMs: number;
      }
    | undefined;
}

/**
 * Stripe implementation of the universal Payment Gateway interface
 */
export class StripeAdapter implements IPaymentGateway {
  readonly providerName = 'stripe' as const;
  private config: StripeAdapterConfig;
  private baseUrl = 'https://api.stripe.com/v1';

  constructor(config: StripeAdapterConfig) {
    this.config = config;
  }

  // ===========================================================================
  // Health Check
  // ===========================================================================

  async healthCheck(): Promise<IHealthCheckResult> {
    const startTime = Date.now();
    try {
      // Simple balance check to verify API key is valid
      await this.request<{ available: unknown[] }>('/balance');
      return {
        healthy: true,
        provider: this.providerName,
        latencyMs: Date.now() - startTime,
        timestamp: new Date(),
      };
    } catch (error) {
      return {
        healthy: false,
        provider: this.providerName,
        latencyMs: Date.now() - startTime,
        message: error instanceof Error ? error.message : 'Unknown error',
        timestamp: new Date(),
      };
    }
  }

  // ===========================================================================
  // Payment Operations
  // ===========================================================================

  async createPaymentLink(options: ICreatePaymentLinkOptions): Promise<IPaymentLink> {
    // Create a Checkout Session instead of Payment Link for more control
    const params = new URLSearchParams();
    params.append('mode', 'payment');
    params.append('line_items[0][price_data][currency]', options.currency.toLowerCase());
    params.append('line_items[0][price_data][unit_amount]', options.amount.toString());
    params.append(
      'line_items[0][price_data][product_data][name]',
      options.description ?? 'Payment'
    );
    params.append('line_items[0][quantity]', '1');

    if (options.successUrl) {
      params.append('success_url', options.successUrl);
    } else {
      params.append('success_url', 'https://example.com/success?session_id={CHECKOUT_SESSION_ID}');
    }

    if (options.cancelUrl) {
      params.append('cancel_url', options.cancelUrl);
    } else {
      params.append('cancel_url', 'https://example.com/cancel');
    }

    if (options.customer?.email) {
      params.append('customer_email', options.customer.email);
    }

    if (options.metadata) {
      for (const [key, value] of Object.entries(options.metadata)) {
        params.append(`metadata[${key}]`, value);
      }
    }

    if (options.expiresInMinutes) {
      const expiresAt = Math.floor(Date.now() / 1000) + options.expiresInMinutes * 60;
      params.append('expires_at', expiresAt.toString());
    }

    const response = await this.request<{
      id: string;
      url: string;
      status: string;
      expires_at?: number;
    }>('/checkout/sessions', {
      method: 'POST',
      body: params.toString(),
    });

    return {
      id: response.id,
      url: response.url,
      amount: options.amount,
      currency: options.currency,
      status: this.mapCheckoutStatus(response.status),
      expiresAt: response.expires_at ? new Date(response.expires_at * 1000) : undefined,
    };
  }

  async getPaymentStatus(transactionId: string): Promise<PaymentStatus> {
    const transaction = await this.getTransaction(transactionId);
    return transaction.status;
  }

  async getTransaction(transactionId: string): Promise<IPaymentTransaction> {
    // Try to get as a PaymentIntent first, then as a Charge
    try {
      const pi = await this.request<{
        id: string;
        amount: number;
        amount_received: number;
        currency: string;
        status: string;
        metadata?: Record<string, string>;
        created: number;
        customer?: string;
      }>(`/payment_intents/${transactionId}`);

      return {
        id: pi.id,
        providerTransactionId: pi.id,
        amount: pi.amount,
        amountCaptured: pi.amount_received,
        currency: pi.currency.toUpperCase(),
        status: this.mapPaymentIntentStatus(pi.status),
        metadata: pi.metadata,
        createdAt: new Date(pi.created * 1000),
        updatedAt: new Date(),
      };
    } catch {
      // Try as a charge
      const charge = await this.request<{
        id: string;
        amount: number;
        amount_captured: number;
        currency: string;
        status: string;
        paid: boolean;
        refunded: boolean;
        metadata?: Record<string, string>;
        created: number;
        amount_refunded?: number;
      }>(`/charges/${transactionId}`);

      return {
        id: charge.id,
        providerTransactionId: charge.id,
        amount: charge.amount,
        amountCaptured: charge.amount_captured,
        currency: charge.currency.toUpperCase(),
        status: this.mapChargeStatus(charge),
        metadata: charge.metadata,
        createdAt: new Date(charge.created * 1000),
        updatedAt: new Date(),
        refundedAmount: charge.amount_refunded,
      };
    }
  }

  async listTransactions(options?: {
    status?: PaymentStatus;
    startDate?: Date;
    endDate?: Date;
    customerId?: string;
    pagination?: IPaginationParams;
  }): Promise<{ transactions: IPaymentTransaction[]; hasMore: boolean }> {
    const params = new URLSearchParams();
    params.append('limit', (options?.pagination?.limit ?? 100).toString());

    if (options?.startDate) {
      params.append('created[gte]', Math.floor(options.startDate.getTime() / 1000).toString());
    }
    if (options?.endDate) {
      params.append('created[lte]', Math.floor(options.endDate.getTime() / 1000).toString());
    }
    if (options?.customerId) {
      params.append('customer', options.customerId);
    }
    if (options?.pagination?.cursor) {
      params.append('starting_after', options.pagination.cursor);
    }

    const response = await this.request<{
      data: {
        id: string;
        amount: number;
        amount_captured: number;
        currency: string;
        status: string;
        paid: boolean;
        refunded: boolean;
        metadata?: Record<string, string>;
        created: number;
        amount_refunded?: number;
      }[];
      has_more: boolean;
    }>(`/charges?${params.toString()}`);

    const transactions = response.data.map((charge) => ({
      id: charge.id,
      providerTransactionId: charge.id,
      amount: charge.amount,
      amountCaptured: charge.amount_captured,
      currency: charge.currency.toUpperCase(),
      status: this.mapChargeStatus(charge),
      metadata: charge.metadata,
      createdAt: new Date(charge.created * 1000),
      updatedAt: new Date(),
      refundedAmount: charge.amount_refunded,
    }));

    // Filter by status if provided
    const filtered = options?.status
      ? transactions.filter((t) => t.status === options.status)
      : transactions;

    return {
      transactions: filtered,
      hasMore: response.has_more,
    };
  }

  async refund(options: IRefundOptions): Promise<IRefundResult> {
    const params = new URLSearchParams();
    params.append('charge', options.transactionId);

    if (options.amount) {
      params.append('amount', options.amount.toString());
    }
    if (options.reason) {
      params.append('reason', options.reason);
    }
    if (options.metadata) {
      for (const [key, value] of Object.entries(options.metadata)) {
        params.append(`metadata[${key}]`, value);
      }
    }

    const response = await this.request<{
      id: string;
      charge: string;
      amount: number;
      currency: string;
      status: string;
      created: number;
    }>('/refunds', {
      method: 'POST',
      body: params.toString(),
    });

    return {
      id: response.id,
      transactionId: response.charge,
      amount: response.amount,
      currency: response.currency.toUpperCase(),
      status: response.status === 'succeeded' ? 'COMPLETED' : 'PENDING',
      createdAt: new Date(response.created * 1000),
    };
  }

  async getRevenueSummary(startDate: Date, endDate: Date): Promise<IRevenueSummary> {
    const params = new URLSearchParams({
      'created[gte]': Math.floor(startDate.getTime() / 1000).toString(),
      'created[lte]': Math.floor(endDate.getTime() / 1000).toString(),
      limit: '100',
    });

    let totalAmount = 0;
    let transactionCount = 0;
    let currency = 'RON';
    let hasMore = true;
    let startingAfter: string | undefined;

    while (hasMore) {
      const queryParams = new URLSearchParams(params);
      if (startingAfter) {
        queryParams.set('starting_after', startingAfter);
      }

      const response = await this.request<{
        data: {
          id: string;
          amount: number;
          amount_captured: number;
          currency: string;
          status: string;
          paid: boolean;
          refunded: boolean;
        }[];
        has_more: boolean;
      }>(`/charges?${queryParams.toString()}`);

      for (const charge of response.data) {
        if (charge.status === 'succeeded' && charge.paid && !charge.refunded) {
          totalAmount += charge.amount_captured || charge.amount;
          transactionCount++;
          currency = charge.currency.toUpperCase();
        }
      }

      hasMore = response.has_more;
      if (response.data.length > 0) {
        const lastCharge = response.data[response.data.length - 1];
        startingAfter = lastCharge?.id;
      } else {
        hasMore = false;
      }
    }

    return {
      totalAmount,
      currency,
      transactionCount,
      periodStart: startDate,
      periodEnd: endDate,
    };
  }

  async getDailyRevenue(timezone = 'Europe/Bucharest'): Promise<IRevenueSummary> {
    const now = new Date();
    const todayStart = new Date(now.toLocaleString('en-US', { timeZone: timezone }));
    todayStart.setHours(0, 0, 0, 0);

    const todayEnd = new Date(now.toLocaleString('en-US', { timeZone: timezone }));
    todayEnd.setHours(23, 59, 59, 999);

    return this.getRevenueSummary(todayStart, todayEnd);
  }

  // ===========================================================================
  // Webhook Operations
  // ===========================================================================

  verifyWebhook(payload: string, signature: string): IWebhookVerification {
    if (!this.config.webhookSecret) {
      return { valid: false, error: 'Webhook secret not configured' };
    }

    const signatureParts = signature.split(',');
    let timestamp = '';
    let sig = '';

    for (const part of signatureParts) {
      const [key, value] = part.split('=');
      if (key === 't') timestamp = value ?? '';
      else if (key === 'v1') sig = value ?? '';
    }

    if (!timestamp || !sig) {
      return { valid: false, error: 'Invalid signature format' };
    }

    // Check timestamp is within 5 minutes
    const currentTime = Math.floor(Date.now() / 1000);
    const webhookTime = parseInt(timestamp, 10);
    if (Math.abs(currentTime - webhookTime) > 300) {
      return { valid: false, error: 'Webhook timestamp too old' };
    }

    const signedPayload = `${timestamp}.${payload}`;
    const expectedSignature = crypto
      .createHmac('sha256', this.config.webhookSecret)
      .update(signedPayload, 'utf8')
      .digest('hex');

    try {
      const valid = crypto.timingSafeEqual(Buffer.from(expectedSignature), Buffer.from(sig));
      return {
        valid,
        payload: valid ? JSON.parse(payload) : undefined,
        error: valid ? undefined : 'Signature mismatch',
      };
    } catch {
      return { valid: false, error: 'Signature verification failed' };
    }
  }

  parseWebhookPayload(payload: unknown): IPaymentWebhookPayload | null {
    const event = payload as {
      id: string;
      type: string;
      created: number;
      data: {
        object: {
          id: string;
          amount: number;
          currency: string;
          status: string;
          metadata?: Record<string, string>;
          customer_email?: string;
        };
      };
    };

    const eventTypeMap: Record<string, IPaymentWebhookPayload['eventType']> = {
      'payment_intent.created': 'payment.created',
      'payment_intent.succeeded': 'payment.succeeded',
      'payment_intent.payment_failed': 'payment.failed',
      'charge.succeeded': 'payment.succeeded',
      'charge.failed': 'payment.failed',
      'charge.refunded': 'refund.completed',
    };

    const mappedType = eventTypeMap[event.type];
    if (!mappedType) return null;

    const obj = event.data.object;

    return {
      eventType: mappedType,
      eventId: event.id,
      transactionId: obj.id,
      amount: obj.amount,
      currency: obj.currency.toUpperCase(),
      status: this.mapStripeStatus(obj.status),
      customer: obj.customer_email ? { email: obj.customer_email } : undefined,
      metadata: obj.metadata,
      rawPayload: payload,
      timestamp: new Date(event.created * 1000),
    };
  }

  // ===========================================================================
  // Utility Methods
  // ===========================================================================

  formatAmount(amount: number, currency = 'RON'): string {
    const majorUnits = amount / 100;
    return new Intl.NumberFormat('ro-RO', {
      style: 'currency',
      currency: currency.toUpperCase(),
    }).format(majorUnits);
  }

  toMajorUnits(amount: number): number {
    return Math.round(amount / 100);
  }

  toMinorUnits(amount: number): number {
    return Math.round(amount * 100);
  }

  // ===========================================================================
  // Private Helpers
  // ===========================================================================

  private async request<T>(path: string, options: RequestInit = {}): Promise<T> {
    const url = `${this.baseUrl}${path}`;
    const timeoutMs = this.config.timeoutMs ?? 30000;

    const makeRequest = async () => {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

      try {
        const existingHeaders = (options.headers as Record<string, string> | undefined) ?? {};
        const response = await fetch(url, {
          ...options,
          signal: controller.signal,
          headers: {
            Authorization: `Bearer ${this.config.secretKey}`,
            'Content-Type': 'application/x-www-form-urlencoded',
            ...existingHeaders,
          },
        });

        if (response.status === 429) {
          const retryAfter = response.headers.get('Retry-After');
          throw new RateLimitError(parseInt(retryAfter ?? '60', 10));
        }

        if (!response.ok) {
          throw new ExternalServiceError('Stripe', `Request failed with status ${response.status}`);
        }

        return (await response.json()) as T;
      } catch (error) {
        if (error instanceof Error && error.name === 'AbortError') {
          throw new ExternalServiceError('Stripe', `Request timeout after ${timeoutMs}ms`);
        }
        throw error;
      } finally {
        clearTimeout(timeoutId);
      }
    };

    return withRetry(makeRequest, {
      maxRetries: this.config.retryConfig?.maxRetries ?? 3,
      baseDelayMs: this.config.retryConfig?.baseDelayMs ?? 1000,
      shouldRetry: (error) => {
        if (error instanceof RateLimitError) return true;
        if (error instanceof ExternalServiceError && error.message.includes('502')) return true;
        if (error instanceof ExternalServiceError && error.message.includes('503')) return true;
        if (error instanceof ExternalServiceError && error.message.includes('timeout')) return true;
        return false;
      },
    });
  }

  private mapCheckoutStatus(status: string): PaymentStatus {
    switch (status) {
      case 'complete':
        return 'PAID';
      case 'expired':
        return 'CANCELLED';
      case 'open':
      default:
        return 'PENDING';
    }
  }

  private mapPaymentIntentStatus(status: string): PaymentStatus {
    switch (status) {
      case 'succeeded':
        return 'PAID';
      case 'processing':
        return 'PROCESSING';
      case 'requires_payment_method':
      case 'requires_confirmation':
      case 'requires_action':
        return 'PENDING';
      case 'canceled':
        return 'CANCELLED';
      default:
        return 'FAILED';
    }
  }

  private mapChargeStatus(charge: {
    status: string;
    paid: boolean;
    refunded: boolean;
    amount_refunded?: number;
    amount?: number;
  }): PaymentStatus {
    if (charge.refunded) return 'REFUNDED';
    if (charge.amount_refunded && charge.amount && charge.amount_refunded < charge.amount) {
      return 'PARTIALLY_REFUNDED';
    }
    if (charge.status === 'succeeded' && charge.paid) return 'PAID';
    if (charge.status === 'pending') return 'PROCESSING';
    if (charge.status === 'failed') return 'FAILED';
    return 'PENDING';
  }

  private mapStripeStatus(status: string): PaymentStatus {
    switch (status) {
      case 'succeeded':
        return 'PAID';
      case 'processing':
        return 'PROCESSING';
      case 'canceled':
        return 'CANCELLED';
      case 'failed':
        return 'FAILED';
      default:
        return 'PENDING';
    }
  }
}

/**
 * Create Stripe adapter
 */
export function createStripeAdapter(config: StripeAdapterConfig): IPaymentGateway {
  return new StripeAdapter(config);
}

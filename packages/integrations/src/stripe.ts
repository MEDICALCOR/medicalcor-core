import crypto from 'crypto';
import {
  withRetry,
  ExternalServiceError,
  RateLimitError,
  WebhookSignatureError,
} from '@medicalcor/core';

/**
 * Stripe Integration Client
 * Handles payment data retrieval for dashboard statistics
 */

export interface StripeClientConfig {
  secretKey: string;
  webhookSecret?: string;
  retryConfig?: {
    maxRetries: number;
    baseDelayMs: number;
  };
  /** Request timeout in milliseconds (default: 30000) */
  timeoutMs?: number;
}

/** Default timeout for Stripe API requests (30 seconds) */
const DEFAULT_TIMEOUT_MS = 30000;

export interface DailyRevenueResult {
  amount: number; // in smallest currency unit (bani for RON)
  currency: string;
  transactionCount: number;
  periodStart: Date;
  periodEnd: Date;
}

export interface BalanceTransaction {
  id: string;
  amount: number;
  currency: string;
  type: string;
  created: number;
  status: string;
}

export interface ChargeListResponse {
  object: 'list';
  data: {
    id: string;
    amount: number;
    amount_captured: number;
    currency: string;
    status: 'succeeded' | 'pending' | 'failed';
    created: number;
    paid: boolean;
    refunded: boolean;
    metadata?: Record<string, string>;
  }[];
  has_more: boolean;
}

export class StripeClient {
  private config: StripeClientConfig;
  private baseUrl = 'https://api.stripe.com/v1';

  constructor(config: StripeClientConfig) {
    this.config = config;
  }

  /**
   * Get daily revenue (sum of successful charges for today)
   */
  async getDailyRevenue(timezone = 'Europe/Bucharest'): Promise<DailyRevenueResult> {
    // Calculate today's start and end in the specified timezone
    const now = new Date();
    const todayStart = new Date(now.toLocaleString('en-US', { timeZone: timezone }));
    todayStart.setHours(0, 0, 0, 0);

    const todayEnd = new Date(now.toLocaleString('en-US', { timeZone: timezone }));
    todayEnd.setHours(23, 59, 59, 999);

    // Convert to Unix timestamps
    const createdGte = Math.floor(todayStart.getTime() / 1000);
    const createdLte = Math.floor(todayEnd.getTime() / 1000);

    // Fetch successful charges for today
    const params = new URLSearchParams({
      'created[gte]': createdGte.toString(),
      'created[lte]': createdLte.toString(),
      limit: '100',
    });

    let totalAmount = 0;
    let transactionCount = 0;
    let currency = 'ron';
    let hasMore = true;
    let startingAfter: string | undefined;

    while (hasMore) {
      const queryParams = new URLSearchParams(params);
      if (startingAfter) {
        queryParams.set('starting_after', startingAfter);
      }

      const response = await this.request<ChargeListResponse>(`/charges?${queryParams.toString()}`);

      for (const charge of response.data) {
        // Only count successful, paid, non-refunded charges
        if (charge.status === 'succeeded' && charge.paid && !charge.refunded) {
          totalAmount += charge.amount_captured || charge.amount;
          transactionCount++;
          currency = charge.currency;
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
      amount: totalAmount,
      currency,
      transactionCount,
      periodStart: todayStart,
      periodEnd: todayEnd,
    };
  }

  /**
   * Get revenue for a specific date range
   */
  async getRevenueForPeriod(startDate: Date, endDate: Date): Promise<DailyRevenueResult> {
    const createdGte = Math.floor(startDate.getTime() / 1000);
    const createdLte = Math.floor(endDate.getTime() / 1000);

    const params = new URLSearchParams({
      'created[gte]': createdGte.toString(),
      'created[lte]': createdLte.toString(),
      limit: '100',
    });

    let totalAmount = 0;
    let transactionCount = 0;
    let currency = 'ron';
    let hasMore = true;
    let startingAfter: string | undefined;

    while (hasMore) {
      const queryParams = new URLSearchParams(params);
      if (startingAfter) {
        queryParams.set('starting_after', startingAfter);
      }

      const response = await this.request<ChargeListResponse>(`/charges?${queryParams.toString()}`);

      for (const charge of response.data) {
        if (charge.status === 'succeeded' && charge.paid && !charge.refunded) {
          totalAmount += charge.amount_captured || charge.amount;
          transactionCount++;
          currency = charge.currency;
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
      amount: totalAmount,
      currency,
      transactionCount,
      periodStart: startDate,
      periodEnd: endDate,
    };
  }

  /**
   * Format amount from smallest unit to display format
   * Example: 150000 (bani) -> 1500.00 (RON)
   */
  formatAmount(amount: number, currency = 'ron'): string {
    const majorUnits = amount / 100;
    return new Intl.NumberFormat('ro-RO', {
      style: 'currency',
      currency: currency.toUpperCase(),
    }).format(majorUnits);
  }

  /**
   * Convert amount to major currency units
   * Example: 150000 (bani) -> 1500 (RON)
   */
  toMajorUnits(amount: number): number {
    return Math.round(amount / 100);
  }

  /**
   * Verify Stripe webhook signature
   * Uses HMAC-SHA256 as per Stripe's specification
   * @see https://stripe.com/docs/webhooks/signatures
   */
  verifyWebhookSignature(payload: string, signatureHeader: string): boolean {
    if (!this.config.webhookSecret) {
      throw new Error('Webhook secret not configured');
    }

    // Parse signature header: t=<timestamp>,v1=<signature>
    const signatureParts = signatureHeader.split(',');
    let timestamp = '';
    let signature = '';

    for (const part of signatureParts) {
      const [key, value] = part.split('=');
      if (key === 't') {
        timestamp = value ?? '';
      } else if (key === 'v1') {
        signature = value ?? '';
      }
    }

    if (!timestamp || !signature) {
      return false;
    }

    // Check timestamp is within 5 minutes to prevent replay attacks
    const currentTime = Math.floor(Date.now() / 1000);
    const webhookTime = parseInt(timestamp, 10);
    const TOLERANCE_SECONDS = 300; // 5 minutes

    if (Math.abs(currentTime - webhookTime) > TOLERANCE_SECONDS) {
      return false;
    }

    // Compute expected signature: HMAC-SHA256 of "timestamp.payload"
    const signedPayload = `${timestamp}.${payload}`;
    const expectedSignature = crypto
      .createHmac('sha256', this.config.webhookSecret)
      .update(signedPayload, 'utf8')
      .digest('hex');

    // Timing-safe comparison to prevent timing attacks
    try {
      return crypto.timingSafeEqual(Buffer.from(expectedSignature), Buffer.from(signature));
    } catch {
      // Length mismatch or other error
      return false;
    }
  }

  /**
   * Validate and verify incoming webhook
   * Throws WebhookSignatureError if signature is invalid
   */
  validateWebhook(payload: string, signatureHeader: string): void {
    if (!this.verifyWebhookSignature(payload, signatureHeader)) {
      throw new WebhookSignatureError('Invalid Stripe webhook signature');
    }
  }

  /**
   * Make authenticated request to Stripe API with timeout support
   */
  private async request<T>(path: string, options: RequestInit = {}): Promise<T> {
    const url = `${this.baseUrl}${path}`;
    const timeoutMs = this.config.timeoutMs ?? DEFAULT_TIMEOUT_MS;

    const makeRequest = async () => {
      // Create AbortController for timeout
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
          const errorBody = await response.text();
          // Log full error internally (may contain PII) but don't expose in exception
          console.error('[Stripe] API error:', {
            status: response.status,
            statusText: response.statusText,
            url: path,
            errorBody, // May contain PII - only for internal logs
          });
          // Throw generic error without PII
          throw new ExternalServiceError('Stripe', `Request failed with status ${response.status}`);
        }

        return (await response.json()) as T;
      } catch (error) {
        // Convert AbortError to ExternalServiceError for consistent handling
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
        // Retry on timeout errors
        if (error instanceof ExternalServiceError && error.message.includes('timeout')) return true;
        return false;
      },
    });
  }
}

/**
 * Create a configured Stripe client
 */
export function createStripeClient(config: StripeClientConfig): StripeClient {
  return new StripeClient(config);
}

/**
 * Mock Stripe Client for development/testing
 */
export class MockStripeClient {
  /**
   * Get mock daily revenue
   */
  getDailyRevenue(): Promise<DailyRevenueResult> {
    const now = new Date();
    const todayStart = new Date(now);
    todayStart.setHours(0, 0, 0, 0);
    const todayEnd = new Date(now);
    todayEnd.setHours(23, 59, 59, 999);

    // SECURITY: Use crypto-secure randomness for mock data
    const baseAmount = 250000; // 2500 RON base
    const varianceBytes = new Uint32Array(1);
    crypto.getRandomValues(varianceBytes);
    const variance = varianceBytes[0]! % 150001; // 0-1500 RON variance
    const countBytes = new Uint32Array(1);
    crypto.getRandomValues(countBytes);
    const transactionCount = (countBytes[0]! % 8) + 3; // 3-10 transactions

    return Promise.resolve({
      amount: baseAmount + variance,
      currency: 'ron',
      transactionCount,
      periodStart: todayStart,
      periodEnd: todayEnd,
    });
  }

  /**
   * Get mock revenue for period
   */
  getRevenueForPeriod(startDate: Date, endDate: Date): Promise<DailyRevenueResult> {
    const days = Math.ceil((endDate.getTime() - startDate.getTime()) / (1000 * 60 * 60 * 24));
    const dailyAverage = 300000; // 3000 RON average per day

    // SECURITY: Use crypto-secure randomness for mock data
    const varianceBytes = new Uint32Array(1);
    crypto.getRandomValues(varianceBytes);
    return Promise.resolve({
      amount: dailyAverage * days + (varianceBytes[0]! % 100001),
      currency: 'ron',
      transactionCount: days * 5,
      periodStart: startDate,
      periodEnd: endDate,
    });
  }

  /**
   * Format amount from smallest unit to display format
   */
  formatAmount(amount: number, currency = 'ron'): string {
    const majorUnits = amount / 100;
    return new Intl.NumberFormat('ro-RO', {
      style: 'currency',
      currency: currency.toUpperCase(),
    }).format(majorUnits);
  }

  /**
   * Convert amount to major currency units
   */
  toMajorUnits(amount: number): number {
    return Math.round(amount / 100);
  }
}

/**
 * Create mock Stripe client for development
 */
export function createMockStripeClient(): MockStripeClient {
  return new MockStripeClient();
}

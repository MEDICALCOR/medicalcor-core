import { withRetry, ExternalServiceError, RateLimitError } from '@medicalcor/core';

/**
 * Stripe Integration Client
 * Handles payment data retrieval for dashboard statistics
 */

export interface StripeClientConfig {
  secretKey: string;
  retryConfig?: {
    maxRetries: number;
    baseDelayMs: number;
  };
}

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
   * Make authenticated request to Stripe API
   */
  private async request<T>(path: string, options: RequestInit = {}): Promise<T> {
    const url = `${this.baseUrl}${path}`;

    const makeRequest = async () => {
      const existingHeaders = (options.headers as Record<string, string> | undefined) ?? {};
      const response = await fetch(url, {
        ...options,
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
        throw new ExternalServiceError('Stripe', `${response.status}: ${errorBody}`);
      }

      return response.json() as Promise<T>;
    };

    return withRetry(makeRequest, {
      maxRetries: this.config.retryConfig?.maxRetries ?? 3,
      baseDelayMs: this.config.retryConfig?.baseDelayMs ?? 1000,
      shouldRetry: (error) => {
        if (error instanceof RateLimitError) return true;
        if (error instanceof ExternalServiceError && error.message.includes('502')) return true;
        if (error instanceof ExternalServiceError && error.message.includes('503')) return true;
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

    // Generate realistic mock data
    const baseAmount = 250000; // 2500 RON base
    const variance = Math.floor(Math.random() * 150000); // 0-1500 RON variance
    const transactionCount = Math.floor(Math.random() * 8) + 3; // 3-10 transactions

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

    return Promise.resolve({
      amount: dailyAverage * days + Math.floor(Math.random() * 100000),
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

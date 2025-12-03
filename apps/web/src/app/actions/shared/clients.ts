/**
 * @fileoverview Lazy-Initialized Service Client Factory
 *
 * Provides singleton instances of external service clients with:
 * - Lazy initialization (only created when first needed)
 * - Environment-based configuration
 * - Type-safe client interfaces
 * - Automatic fallback to mock clients in development
 *
 * @module actions/shared/clients
 * @security API keys are never exposed to the client - server actions only
 */

import {
  HubSpotClient,
  StripeClient,
  type MockStripeClient,
  createMockStripeClient,
} from '@medicalcor/integrations';
import type {
  ISchedulingRepository,
  TimeSlot,
  BookingRequest,
  BookingResult,
  AppointmentDetails,
  GetAvailableSlotsOptions,
} from '@medicalcor/domain';

// ============================================================================
// CONSTANTS
// ============================================================================

/**
 * Default timezone for scheduling operations
 * @constant
 */
export const DEFAULT_TIMEZONE = 'Europe/Bucharest' as const;

/**
 * HubSpot pagination limit (maximum per page)
 * @constant
 */
export const HUBSPOT_PAGE_SIZE = 100 as const;

/**
 * Maximum results for safety limit in pagination
 * @constant
 */
export const MAX_FETCH_RESULTS = 5000 as const;

// ============================================================================
// SINGLETON CLIENT INSTANCES
// ============================================================================

let hubspotClient: HubSpotClient | null = null;
let stripeClient: StripeClient | MockStripeClient | null = null;
let schedulingService: ISchedulingRepository | null = null;

// ============================================================================
// CLIENT FACTORY FUNCTIONS
// ============================================================================

/**
 * Get or create HubSpot client instance
 * @throws {Error} If HUBSPOT_ACCESS_TOKEN environment variable is not set
 * @returns {HubSpotClient} Singleton HubSpot client instance
 *
 * @example
 * ```typescript
 * const hubspot = getHubSpotClient();
 * const contacts = await hubspot.searchContacts({ ... });
 * ```
 */
export function getHubSpotClient(): HubSpotClient {
  if (!hubspotClient) {
    const accessToken = process.env.HUBSPOT_ACCESS_TOKEN;
    if (!accessToken) {
      throw new Error(
        'HUBSPOT_ACCESS_TOKEN environment variable is not set. ' +
          'Please configure your HubSpot integration in .env.local'
      );
    }
    hubspotClient = new HubSpotClient({ accessToken });
  }
  return hubspotClient;
}

/**
 * Get or create Stripe client instance
 * Falls back to mock client in development when STRIPE_SECRET_KEY is not set
 * @returns {StripeClient | MockStripeClient} Singleton Stripe client instance
 *
 * @example
 * ```typescript
 * const stripe = getStripeClient();
 * const revenue = await stripe.getDailyRevenue('Europe/Bucharest');
 * ```
 */
export function getStripeClient(): StripeClient | MockStripeClient {
  if (!stripeClient) {
    const secretKey = process.env.STRIPE_SECRET_KEY;
    if (!secretKey) {
      // Use mock client for development when Stripe is not configured
      stripeClient = createMockStripeClient();
    } else {
      stripeClient = new StripeClient({ secretKey });
    }
  }
  return stripeClient;
}

/**
 * Mock Scheduling Repository for Web App
 * NOTE: In production, this should be replaced with actual database calls
 * through an API layer, not direct database access from Next.js server actions
 */
class MockSchedulingRepository implements ISchedulingRepository {
  getAvailableSlots(_options: string | GetAvailableSlotsOptions): Promise<TimeSlot[]> {
    // Mock implementation - return empty array for now
    // TODO: Replace with API call to backend service
    return Promise.resolve([]);
  }

  bookAppointment(_request: BookingRequest): Promise<BookingResult> {
    // Mock implementation
    // TODO: Replace with API call to backend service
    return Promise.reject(new Error('Booking not implemented in web app - use API endpoint'));
  }

  getUpcomingAppointments(_startDate: Date, _endDate: Date): Promise<AppointmentDetails[]> {
    // Mock implementation - return empty array for now
    // TODO: Replace with API call to backend service
    return Promise.resolve([]);
  }
}

/**
 * Get or create Scheduling service instance
 * @returns {ISchedulingRepository} Singleton scheduling service instance
 *
 * @example
 * ```typescript
 * const scheduling = getSchedulingService();
 * const slots = await scheduling.getAvailableSlots({ ... });
 * ```
 */
export function getSchedulingService(): ISchedulingRepository {
  schedulingService ??= new MockSchedulingRepository();
  return schedulingService;
}

// ============================================================================
// CLIENT RESET (FOR TESTING)
// ============================================================================

/**
 * Reset all client instances (useful for testing)
 * @internal
 */
export function resetClients(): void {
  hubspotClient = null;
  stripeClient = null;
  schedulingService = null;
}

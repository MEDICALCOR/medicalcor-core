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

import 'server-only';

import {
  HubSpotClient,
  StripeClient,
  type MockStripeClient,
  createMockStripeClient,
} from '@medicalcor/integrations';
import type { TimeSlot, BookingRequest, AppointmentDetails } from '@medicalcor/domain';

// Local types for the web scheduling client API contract
// These may differ from domain types as this client wraps an HTTP API
interface WebGetAvailableSlotsOptions {
  // Standard scheduling API options
  clinicId?: string;
  providerId?: string;
  serviceType?: string;
  startDate?: Date;
  endDate?: Date;
  // Calendar-style options (used by calendar actions)
  procedureType?: string;
  preferredDates?: string[];
  limit?: number;
}

interface WebBookingResult {
  success: boolean;
  id?: string; // Alias for appointmentId (used by calendar actions)
  appointmentId?: string;
  confirmationNumber?: string;
  error?: string;
}

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
let schedulingService: APISchedulingRepository | null = null;

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
 * API-based Scheduling Repository for Web App
 *
 * This repository delegates to the backend API for scheduling operations.
 * Direct database access from Next.js server actions is not recommended
 * for scheduling operations which require transactional consistency.
 */
class APISchedulingRepository {
  private readonly apiBaseUrl: string;

  constructor() {
    this.apiBaseUrl = process.env.API_BASE_URL ?? 'http://localhost:3000';
  }

  async getAvailableSlots(options: string | WebGetAvailableSlotsOptions): Promise<TimeSlot[]> {
    try {
      let queryParams: string;
      if (typeof options === 'string') {
        queryParams = `clinicId=${encodeURIComponent(options)}`;
      } else {
        const params: Record<string, string> = {};
        if (options.clinicId) params.clinicId = options.clinicId;
        if (options.providerId) params.providerId = options.providerId;
        if (options.serviceType) params.serviceType = options.serviceType;
        if (options.startDate) params.startDate = options.startDate.toISOString();
        if (options.endDate) params.endDate = options.endDate.toISOString();
        // Calendar-style options
        if (options.procedureType) params.procedureType = options.procedureType;
        if (options.preferredDates) params.preferredDates = options.preferredDates.join(',');
        if (options.limit) params.limit = String(options.limit);
        queryParams = new URLSearchParams(params).toString();
      }

      const response = await fetch(`${this.apiBaseUrl}/api/scheduling/slots?${queryParams}`, {
        headers: { 'Content-Type': 'application/json' },
        cache: 'no-store',
      });

      if (!response.ok) {
        // Return empty array if API unavailable (graceful degradation)
        return [];
      }

      const data = (await response.json()) as { slots?: TimeSlot[] };
      return data.slots ?? [];
    } catch {
      // Return empty array on network errors (graceful degradation)
      return [];
    }
  }

  async bookAppointment(request: BookingRequest): Promise<WebBookingResult> {
    try {
      const response = await fetch(`${this.apiBaseUrl}/api/scheduling/book`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(request),
      });

      if (!response.ok) {
        const errorData = (await response.json().catch(() => ({}))) as { message?: string };
        return {
          success: false,
          error: errorData.message ?? `Booking failed with status ${response.status}`,
        };
      }

      const data = (await response.json()) as { appointmentId: string; confirmationNumber: string };
      return {
        success: true,
        id: data.appointmentId, // Alias for calendar actions
        appointmentId: data.appointmentId,
        confirmationNumber: data.confirmationNumber,
      };
    } catch (error) {
      return {
        success: false,
        error:
          error instanceof Error
            ? `Booking service unavailable: ${error.message}`
            : 'Booking service unavailable. Please try again later.',
      };
    }
  }

  async getUpcomingAppointments(startDate: Date, endDate: Date): Promise<AppointmentDetails[]> {
    try {
      const queryParams = new URLSearchParams({
        startDate: startDate.toISOString(),
        endDate: endDate.toISOString(),
      }).toString();

      const response = await fetch(
        `${this.apiBaseUrl}/api/scheduling/appointments?${queryParams}`,
        {
          headers: { 'Content-Type': 'application/json' },
          cache: 'no-store',
        }
      );

      if (!response.ok) {
        return [];
      }

      const data = (await response.json()) as { appointments?: AppointmentDetails[] };
      return data.appointments ?? [];
    } catch {
      // Return empty array on network errors (graceful degradation)
      return [];
    }
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
export function getSchedulingService(): APISchedulingRepository {
  schedulingService ??= new APISchedulingRepository();
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

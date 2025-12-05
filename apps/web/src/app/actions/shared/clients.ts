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
  WhatsAppClient,
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
let whatsappClient: WhatsAppClient | null = null;

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
 * Calls the backend API for scheduling operations (proper separation of concerns)
 */
class APISchedulingRepository implements ISchedulingRepository {
  private apiBaseUrl: string;

  constructor() {
    // Use internal API URL for server-to-server communication
    // Fall through empty strings by checking length
    const internalUrl = process.env.API_INTERNAL_URL;
    const publicUrl = process.env.NEXT_PUBLIC_API_URL;
    this.apiBaseUrl =
      internalUrl && internalUrl.length > 0
        ? internalUrl
        : publicUrl && publicUrl.length > 0
          ? publicUrl
          : 'http://localhost:3000';
  }

  async getAvailableSlots(options: string | GetAvailableSlotsOptions): Promise<TimeSlot[]> {
    const opts = typeof options === 'string' ? { procedureType: options } : options;

    try {
      const params = new URLSearchParams();
      if (opts.procedureType) params.append('procedureType', opts.procedureType);
      if (opts.limit) params.append('limit', opts.limit.toString());
      if (opts.preferredDates?.length) {
        params.append('preferredDates', opts.preferredDates.join(','));
      }

      const response = await fetch(`${this.apiBaseUrl}/api/scheduling/slots?${params}`, {
        method: 'GET',
        headers: {
          'Content-Type': 'application/json',
          'X-Internal-Request': 'true',
        },
        // Don't cache scheduling data
        cache: 'no-store',
      });

      if (!response.ok) {
        // API not available - return empty slots (graceful degradation)
        if (response.status === 404 || response.status === 503) {
          return [];
        }
        throw new Error(`API error: ${response.status}`);
      }

      const data = (await response.json()) as { slots?: TimeSlot[] };
      return data.slots ?? [];
    } catch (error) {
      // Network error or API unavailable - return empty slots
      console.error('[scheduling] Failed to fetch available slots:', error);
      return [];
    }
  }

  async bookAppointment(request: BookingRequest): Promise<BookingResult> {
    const response = await fetch(`${this.apiBaseUrl}/api/scheduling/book`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Internal-Request': 'true',
      },
      body: JSON.stringify(request),
    });

    if (!response.ok) {
      const error = (await response.json().catch(() => ({ message: 'Booking failed' }))) as {
        message?: string;
      };
      throw new Error(error.message ?? 'Booking failed');
    }

    return response.json() as Promise<BookingResult>;
  }

  async getUpcomingAppointments(startDate: Date, endDate: Date): Promise<AppointmentDetails[]> {
    try {
      const params = new URLSearchParams({
        startDate: startDate.toISOString(),
        endDate: endDate.toISOString(),
      });

      const response = await fetch(`${this.apiBaseUrl}/api/scheduling/appointments?${params}`, {
        method: 'GET',
        headers: {
          'Content-Type': 'application/json',
          'X-Internal-Request': 'true',
        },
        cache: 'no-store',
      });

      if (!response.ok) {
        if (response.status === 404 || response.status === 503) {
          return [];
        }
        throw new Error(`API error: ${response.status}`);
      }

      const data = (await response.json()) as { appointments?: AppointmentDetails[] };
      return data.appointments ?? [];
    } catch (error) {
      console.error('[scheduling] Failed to fetch upcoming appointments:', error);
      return [];
    }
  }
}

/**
 * Get or create Scheduling service instance
 * Uses API-based implementation that calls backend scheduling endpoints
 * @returns {ISchedulingRepository} Singleton scheduling service instance
 *
 * @example
 * ```typescript
 * const scheduling = getSchedulingService();
 * const slots = await scheduling.getAvailableSlots({ ... });
 * ```
 */
export function getSchedulingService(): ISchedulingRepository {
  schedulingService ??= new APISchedulingRepository();
  return schedulingService;
}

/**
 * Get or create WhatsApp client instance
 * Returns null if WhatsApp is not configured
 * @returns {WhatsAppClient | null} Singleton WhatsApp client instance or null
 *
 * @example
 * ```typescript
 * const whatsapp = getWhatsAppClient();
 * if (whatsapp) {
 *   await whatsapp.sendText({ to: '+40712345678', text: 'Hello!' });
 * }
 * ```
 */
export function getWhatsAppClient(): WhatsAppClient | null {
  if (!whatsappClient) {
    const apiKey = process.env.WHATSAPP_API_KEY;
    const phoneNumberId = process.env.WHATSAPP_PHONE_NUMBER_ID;

    if (!apiKey || !phoneNumberId) {
      // WhatsApp not configured - return null for graceful degradation
      return null;
    }

    whatsappClient = new WhatsAppClient({
      apiKey,
      phoneNumberId,
      webhookSecret: process.env.WHATSAPP_WEBHOOK_SECRET,
    });
  }
  return whatsappClient;
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
  whatsappClient = null;
}

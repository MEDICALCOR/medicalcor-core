import {
  HubSpotClient,
  StripeClient,
  type MockStripeClient,
  createMockStripeClient,
} from '@medicalcor/integrations';
import { SchedulingService } from '@medicalcor/domain';

// Lazy-initialized clients (only created when first action is called)
let hubspotClient: HubSpotClient | null = null;
let stripeClient: StripeClient | MockStripeClient | null = null;
let schedulingService: SchedulingService | null = null;

/**
 * Gets or creates a HubSpot client instance
 * @throws Error if HUBSPOT_ACCESS_TOKEN is not set
 */
export function getHubSpotClient(): HubSpotClient {
  if (!hubspotClient) {
    const accessToken = process.env.HUBSPOT_ACCESS_TOKEN;
    if (!accessToken) {
      throw new Error('HUBSPOT_ACCESS_TOKEN environment variable is not set');
    }
    hubspotClient = new HubSpotClient({ accessToken });
  }
  return hubspotClient;
}

/**
 * Gets or creates a Stripe client instance
 * Falls back to mock client if STRIPE_SECRET_KEY is not set
 */
export function getStripeClient(): StripeClient | MockStripeClient {
  if (!stripeClient) {
    const secretKey = process.env.STRIPE_SECRET_KEY;
    if (!secretKey) {
      // Use mock client for development when Stripe is not configured
      console.warn('[getStripeClient] STRIPE_SECRET_KEY not set, using mock client');
      stripeClient = createMockStripeClient();
    } else {
      stripeClient = new StripeClient({ secretKey });
    }
  }
  return stripeClient;
}

/**
 * Gets or creates a SchedulingService instance
 */
export function getSchedulingService(): SchedulingService {
  schedulingService ??= new SchedulingService({
    timezone: 'Europe/Bucharest',
  });
  return schedulingService;
}

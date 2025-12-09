/**
 * Internal Tracking Events API
 *
 * Receives tracking events from CORTEX Analytics and stores them
 * for internal reporting, CRM sync, and attribution analysis.
 */

import { type NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';

// Schema for tracking events
const TrackingEventSchema = z.object({
  event: z.object({
    type: z.string(),
    value: z.number().optional(),
    currency: z.string().optional(),
    metadata: z.record(z.unknown()).optional(),
    timestamp: z.number(),
  }),
  user: z.object({
    visitorId: z.string(),
    sessionId: z.string(),
    landingPage: z.string().optional(),
    referrer: z.string().optional(),
    utmSource: z.string().optional(),
    utmMedium: z.string().optional(),
    utmCampaign: z.string().optional(),
    utmContent: z.string().optional(),
    utmTerm: z.string().optional(),
    gclid: z.string().optional(),
    fbclid: z.string().optional(),
    device: z.enum(['mobile', 'tablet', 'desktop']).optional(),
    browser: z.string().optional(),
  }),
  timestamp: z.string(),
});

/**
 * POST /api/tracking/events
 *
 * Store tracking events for analytics and CRM sync
 */
export async function POST(req: NextRequest): Promise<NextResponse> {
  try {
    const body = await req.json();
    const parseResult = TrackingEventSchema.safeParse(body);

    if (!parseResult.success) {
      return NextResponse.json(
        { success: false, error: 'Invalid event data' },
        { status: 400 }
      );
    }

    const { event, user, timestamp } = parseResult.data;

    // In production, store to database and/or send to data warehouse
    // For now, we log for debugging and acknowledge receipt
    if (process.env.NODE_ENV !== 'production') {
      console.debug('[Tracking Event]', {
        type: event.type,
        visitorId: user.visitorId,
        timestamp,
        metadata: event.metadata,
      });
    }

    // TODO: Implement actual storage
    // - Store in PostgreSQL for reporting
    // - Send to BigQuery for advanced analytics
    // - Sync to HubSpot for CRM attribution

    return NextResponse.json({
      success: true,
      received: true,
    });
  } catch (error) {
    console.error('[Tracking API] Error:', error);
    return NextResponse.json(
      { success: false, error: 'Internal error' },
      { status: 500 }
    );
  }
}

/**
 * A/B Test Impression Tracking API
 *
 * Records when a visitor sees a variant of an A/B test.
 * Data is stored for analysis and statistical significance calculations.
 */

import { type NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';

// ============================================================================
// SCHEMA
// ============================================================================

const ImpressionSchema = z.object({
  testId: z.string().min(1),
  variantId: z.string().min(1),
  visitorId: z.string().min(1),
  timestamp: z.string().datetime(),
  userAgent: z.string().optional(),
  referrer: z.string().optional(),
});

// ============================================================================
// IN-MEMORY STORE (Replace with database in production)
// ============================================================================

interface ImpressionRecord {
  id: string;
  testId: string;
  variantId: string;
  visitorId: string;
  timestamp: string;
  userAgent?: string;
  referrer?: string;
}

// Store impressions in memory for demo
const impressionsStore: ImpressionRecord[] = [];

// Aggregate stats
const statsStore: Record<string, {
  impressions: Record<string, number>;
  uniqueVisitors: Record<string, Set<string>>;
}> = {};

// ============================================================================
// HANDLERS
// ============================================================================

/**
 * POST /api/ab-test/impression
 *
 * Record an A/B test impression
 */
export async function POST(req: NextRequest): Promise<NextResponse> {
  try {
    const body = await req.json() as unknown;
    const parseResult = ImpressionSchema.safeParse(body);

    if (!parseResult.success) {
      return NextResponse.json(
        { success: false, error: 'Invalid data', details: parseResult.error.flatten() },
        { status: 400 }
      );
    }

    const data = parseResult.data;

    // Create impression record
    const impression: ImpressionRecord = {
      id: `imp_${Date.now()}_${Math.random().toString(36).substring(2, 8)}`,
      ...data,
    };

    // Store impression
    impressionsStore.push(impression);

    // Update aggregated stats
    if (!statsStore[data.testId]) {
      statsStore[data.testId] = {
        impressions: {},
        uniqueVisitors: {},
      };
    }

    const testStats = statsStore[data.testId];

    // Increment impressions
    testStats.impressions[data.variantId] = (testStats.impressions[data.variantId] ?? 0) + 1;

    // Track unique visitors
    if (!testStats.uniqueVisitors[data.variantId]) {
      testStats.uniqueVisitors[data.variantId] = new Set();
    }
    testStats.uniqueVisitors[data.variantId].add(data.visitorId);

    // Log for monitoring (use structured logger in production)
    console.info('[ABTest] Impression recorded', {
      testId: data.testId,
      variantId: data.variantId,
      totalImpressions: testStats.impressions[data.variantId],
      uniqueVisitors: testStats.uniqueVisitors[data.variantId].size,
    });

    return NextResponse.json({
      success: true,
      data: { id: impression.id },
    });
  } catch (error) {
    console.error('[ABTest] Impression error:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to record impression' },
      { status: 500 }
    );
  }
}

/**
 * GET /api/ab-test/impression
 *
 * Get impression statistics for a test
 */
export function GET(req: NextRequest): NextResponse {
  try {
    const { searchParams } = new URL(req.url);
    const testId = searchParams.get('testId');

    if (!testId) {
      // Return all test stats
      const allStats = Object.entries(statsStore).map(([id, stats]) => ({
        testId: id,
        variants: Object.entries(stats.impressions).map(([variantId, impressions]) => ({
          variantId,
          impressions,
          uniqueVisitors: stats.uniqueVisitors[variantId]?.size ?? 0,
        })),
      }));

      return NextResponse.json({ success: true, data: allStats });
    }

    const testStats = statsStore[testId];
    if (!testStats) {
      return NextResponse.json({
        success: true,
        data: { testId, variants: [] },
      });
    }

    const variants = Object.entries(testStats.impressions).map(([variantId, impressions]) => ({
      variantId,
      impressions,
      uniqueVisitors: testStats.uniqueVisitors[variantId]?.size ?? 0,
    }));

    return NextResponse.json({
      success: true,
      data: { testId, variants },
    });
  } catch (error) {
    console.error('[ABTest] Get impressions error:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to get impressions' },
      { status: 500 }
    );
  }
}

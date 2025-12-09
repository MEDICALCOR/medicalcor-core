/**
 * A/B Test Conversion Tracking API
 *
 * Records when a visitor converts on a variant of an A/B test.
 * Tracks lead submissions, calls, WhatsApp clicks, and other conversion events.
 */

import { type NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';

// ============================================================================
// SCHEMA
// ============================================================================

const ConversionSchema = z.object({
  testId: z.string().min(1),
  variantId: z.string().min(1),
  visitorId: z.string().min(1),
  eventType: z.enum(['lead', 'call', 'whatsapp', 'quiz_complete', 'plan_generated']),
  value: z.number().optional(),
  timestamp: z.string().datetime(),
  metadata: z.record(z.unknown()).optional(),
});

// ============================================================================
// IN-MEMORY STORE (Replace with database in production)
// ============================================================================

interface ConversionRecord {
  id: string;
  testId: string;
  variantId: string;
  visitorId: string;
  eventType: string;
  value?: number;
  timestamp: string;
  metadata?: Record<string, unknown>;
}

// Store conversions in memory for demo
const conversionsStore: ConversionRecord[] = [];

// Aggregate stats
const conversionStatsStore: Record<
  string,
  {
    conversions: Record<string, Record<string, number>>; // variantId -> eventType -> count
    revenue: Record<string, number>; // variantId -> total value
    uniqueConverters: Record<string, Set<string>>; // variantId -> visitor IDs
  }
> = {};

// ============================================================================
// HANDLERS
// ============================================================================

/**
 * POST /api/ab-test/conversion
 *
 * Record an A/B test conversion
 */
export async function POST(req: NextRequest): Promise<NextResponse> {
  try {
    const body = (await req.json()) as unknown;
    const parseResult = ConversionSchema.safeParse(body);

    if (!parseResult.success) {
      return NextResponse.json(
        { success: false, error: 'Invalid data', details: parseResult.error.flatten() },
        { status: 400 }
      );
    }

    const data = parseResult.data;

    // Create conversion record
    const conversion: ConversionRecord = {
      id: `conv_${Date.now()}_${Math.random().toString(36).substring(2, 8)}`,
      ...data,
    };

    // Store conversion
    conversionsStore.push(conversion);

    // Update aggregated stats
    if (!conversionStatsStore[data.testId]) {
      conversionStatsStore[data.testId] = {
        conversions: {},
        revenue: {},
        uniqueConverters: {},
      };
    }

    const testStats = conversionStatsStore[data.testId];

    // Initialize variant stats if needed
    if (!testStats.conversions[data.variantId]) {
      testStats.conversions[data.variantId] = {};
      testStats.revenue[data.variantId] = 0;
      testStats.uniqueConverters[data.variantId] = new Set();
    }

    // Increment conversion count by event type
    const variantConversions = testStats.conversions[data.variantId];
    variantConversions[data.eventType] = (variantConversions[data.eventType] ?? 0) + 1;

    // Add revenue if provided
    if (data.value) {
      testStats.revenue[data.variantId] += data.value;
    }

    // Track unique converters
    testStats.uniqueConverters[data.variantId].add(data.visitorId);

    // Log for monitoring
    console.info('[ABTest] Conversion recorded', {
      testId: data.testId,
      variantId: data.variantId,
      eventType: data.eventType,
      value: data.value,
      totalConversions: Object.values(variantConversions).reduce((a, b) => a + b, 0),
      uniqueConverters: testStats.uniqueConverters[data.variantId].size,
    });

    return NextResponse.json({
      success: true,
      data: { id: conversion.id },
    });
  } catch (error) {
    console.error('[ABTest] Conversion error:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to record conversion' },
      { status: 500 }
    );
  }
}

/**
 * GET /api/ab-test/conversion
 *
 * Get conversion statistics for a test
 */
export function GET(req: NextRequest): NextResponse {
  try {
    const { searchParams } = new URL(req.url);
    const testId = searchParams.get('testId');

    if (!testId) {
      // Return all test conversion stats
      const allStats = Object.entries(conversionStatsStore).map(([id, stats]) => ({
        testId: id,
        variants: Object.keys(stats.conversions).map((variantId) => ({
          variantId,
          conversions: stats.conversions[variantId],
          totalConversions: Object.values(stats.conversions[variantId] ?? {}).reduce(
            (a, b) => a + b,
            0
          ),
          revenue: stats.revenue[variantId] ?? 0,
          uniqueConverters: stats.uniqueConverters[variantId]?.size ?? 0,
        })),
      }));

      return NextResponse.json({ success: true, data: allStats });
    }

    const testStats = conversionStatsStore[testId];
    if (!testStats) {
      return NextResponse.json({
        success: true,
        data: { testId, variants: [] },
      });
    }

    const variants = Object.keys(testStats.conversions).map((variantId) => ({
      variantId,
      conversions: testStats.conversions[variantId],
      totalConversions: Object.values(testStats.conversions[variantId] ?? {}).reduce(
        (a, b) => a + b,
        0
      ),
      revenue: testStats.revenue[variantId] ?? 0,
      uniqueConverters: testStats.uniqueConverters[variantId]?.size ?? 0,
    }));

    return NextResponse.json({
      success: true,
      data: { testId, variants },
    });
  } catch (error) {
    console.error('[ABTest] Get conversions error:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to get conversions' },
      { status: 500 }
    );
  }
}

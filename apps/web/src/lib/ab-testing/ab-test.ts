/**
 * ═══════════════════════════════════════════════════════════════════════════
 * A/B TESTING UTILITY FOR LANDING PAGES
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * Provides A/B testing functionality using:
 * - Feature flags for variant assignment
 * - Cookie-based persistence
 * - Analytics integration
 *
 * Usage:
 * const { variant, trackConversion } = useABTest('landing_page_v3');
 * ═══════════════════════════════════════════════════════════════════════════
 */

import { useCallback, useEffect, useState } from 'react';

// ============================================================================
// TYPES
// ============================================================================

export interface ABTestVariant {
  id: string;
  name: string;
  weight: number; // Percentage weight (0-100)
  component?: string; // Component path or identifier
}

export interface ABTest {
  id: string;
  name: string;
  description: string;
  variants: ABTestVariant[];
  startDate: Date;
  endDate?: Date;
  targetAudience?: 'all' | 'new_visitors' | 'returning';
  status: 'draft' | 'running' | 'paused' | 'completed';
}

export interface ABTestResult {
  testId: string;
  variantId: string;
  impressions: number;
  conversions: number;
  conversionRate: number;
  revenue?: number;
}

export interface ConversionEvent {
  testId: string;
  variantId: string;
  eventType: 'lead' | 'call' | 'whatsapp' | 'quiz_complete' | 'plan_generated';
  value?: number;
  metadata?: Record<string, unknown>;
}

// ============================================================================
// CONFIGURATION
// ============================================================================

export const AB_TESTS: Record<string, ABTest> = {
  landing_page_v3: {
    id: 'landing_page_v3',
    name: 'Landing Page V3 vs Revolutionary',
    description: 'Test between CORTEX Funnel V2 and Revolutionary Landing Page',
    variants: [
      {
        id: 'control',
        name: 'CORTEX Funnel V2 (Control)',
        weight: 50,
        component: 'landing-page',
      },
      {
        id: 'revolutionary',
        name: 'Revolutionary (Treatment)',
        weight: 50,
        component: 'revolutionary',
      },
    ],
    startDate: new Date(),
    targetAudience: 'all',
    status: 'running',
  },
  quiz_style: {
    id: 'quiz_style',
    name: 'Basic Quiz vs Adaptive Quiz',
    description: 'Test quiz completion rates between styles',
    variants: [
      { id: 'basic', name: 'Basic Quiz', weight: 50 },
      { id: 'adaptive', name: 'Adaptive Quiz', weight: 50 },
    ],
    startDate: new Date(),
    targetAudience: 'all',
    status: 'running',
  },
};

// ============================================================================
// UTILITIES
// ============================================================================

const COOKIE_PREFIX = 'mc_ab_';
const COOKIE_EXPIRY_DAYS = 30;

/**
 * Generate a unique visitor ID
 */
function generateVisitorId(): string {
  return `v_${Date.now()}_${Math.random().toString(36).substring(2, 11)}`;
}

/**
 * Get or create visitor ID from cookies
 */
function getVisitorId(): string {
  if (typeof document === 'undefined') return generateVisitorId();

  const cookieName = `${COOKIE_PREFIX}visitor_id`;
  const existing = document.cookie
    .split('; ')
    .find((row) => row.startsWith(`${cookieName}=`))
    ?.split('=')[1];

  if (existing) return existing;

  const newId = generateVisitorId();
  const expires = new Date(Date.now() + COOKIE_EXPIRY_DAYS * 24 * 60 * 60 * 1000);
  document.cookie = `${cookieName}=${newId}; expires=${expires.toUTCString()}; path=/; SameSite=Lax`;
  return newId;
}

/**
 * Get variant assignment from cookie
 */
function getVariantFromCookie(testId: string): string | null {
  if (typeof document === 'undefined') return null;

  const cookieName = `${COOKIE_PREFIX}${testId}`;
  return (
    document.cookie
      .split('; ')
      .find((row) => row.startsWith(`${cookieName}=`))
      ?.split('=')[1] ?? null
  );
}

/**
 * Save variant assignment to cookie
 */
function saveVariantToCookie(testId: string, variantId: string): void {
  if (typeof document === 'undefined') return;

  const cookieName = `${COOKIE_PREFIX}${testId}`;
  const expires = new Date(Date.now() + COOKIE_EXPIRY_DAYS * 24 * 60 * 60 * 1000);
  document.cookie = `${cookieName}=${variantId}; expires=${expires.toUTCString()}; path=/; SameSite=Lax`;
}

/**
 * Assign visitor to a variant using weighted random selection
 */
function assignVariant(test: ABTest): ABTestVariant {
  // Use visitor ID for consistent assignment
  const visitorId = getVisitorId();
  const hash = simpleHash(visitorId + test.id);
  const normalizedHash = (hash % 100) / 100;

  let cumulativeWeight = 0;
  for (const variant of test.variants) {
    cumulativeWeight += variant.weight / 100;
    if (normalizedHash < cumulativeWeight) {
      return variant;
    }
  }

  // Fallback to first variant
  return test.variants[0];
}

/**
 * Simple hash function for consistent variant assignment
 */
function simpleHash(str: string): number {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    const char = str.charCodeAt(i);
    hash = (hash << 5) - hash + char;
    hash = hash & hash; // Convert to 32-bit integer
  }
  return Math.abs(hash);
}

// ============================================================================
// TRACKING
// ============================================================================

/**
 * Track A/B test impression
 */
async function trackImpression(testId: string, variantId: string): Promise<void> {
  try {
    await fetch('/api/ab-test/impression', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        testId,
        variantId,
        visitorId: getVisitorId(),
        timestamp: new Date().toISOString(),
        userAgent: typeof navigator !== 'undefined' ? navigator.userAgent : undefined,
        referrer: typeof document !== 'undefined' ? document.referrer : undefined,
      }),
    });
  } catch (error) {
    console.warn('[ABTest] Failed to track impression:', error);
  }
}

/**
 * Track A/B test conversion
 */
async function trackConversionEvent(event: ConversionEvent): Promise<void> {
  try {
    await fetch('/api/ab-test/conversion', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        ...event,
        visitorId: getVisitorId(),
        timestamp: new Date().toISOString(),
      }),
    });
  } catch (error) {
    console.warn('[ABTest] Failed to track conversion:', error);
  }
}

// ============================================================================
// REACT HOOK
// ============================================================================

export interface UseABTestResult {
  variant: ABTestVariant | null;
  variantId: string | null;
  isControl: boolean;
  isTreatment: boolean;
  trackConversion: (
    eventType: ConversionEvent['eventType'],
    value?: number,
    metadata?: Record<string, unknown>
  ) => void;
  loading: boolean;
}

/**
 * React hook for A/B testing
 *
 * @example
 * const { variant, trackConversion, isControl } = useABTest('landing_page_v3');
 *
 * if (isControl) {
 *   return <ControlLandingPage />;
 * }
 * return <TreatmentLandingPage />;
 */
export function useABTest(testId: string): UseABTestResult {
  const [variant, setVariant] = useState<ABTestVariant | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const test = AB_TESTS[testId];
    if (test?.status !== 'running') {
      setLoading(false);
      return;
    }

    // Check for existing assignment
    const existingVariantId = getVariantFromCookie(testId);
    if (existingVariantId) {
      const existingVariant = test.variants.find((v) => v.id === existingVariantId);
      if (existingVariant) {
        setVariant(existingVariant);
        setLoading(false);
        return;
      }
    }

    // Assign new variant
    const assignedVariant = assignVariant(test);
    saveVariantToCookie(testId, assignedVariant.id);
    setVariant(assignedVariant);

    // Track impression
    void trackImpression(testId, assignedVariant.id);

    setLoading(false);
  }, [testId]);

  const trackConversion = useCallback(
    (
      eventType: ConversionEvent['eventType'],
      value?: number,
      metadata?: Record<string, unknown>
    ) => {
      if (!variant) return;

      void trackConversionEvent({
        testId,
        variantId: variant.id,
        eventType,
        value,
        metadata,
      });
    },
    [testId, variant]
  );

  return {
    variant,
    variantId: variant?.id ?? null,
    isControl: variant?.id === 'control',
    isTreatment: variant?.id !== 'control',
    trackConversion,
    loading,
  };
}

// ============================================================================
// SERVER-SIDE HELPERS
// ============================================================================

/**
 * Get variant from request cookies (for server components)
 */
export function getVariantFromRequest(testId: string, cookieHeader: string | null): string | null {
  if (!cookieHeader) return null;

  const cookieName = `${COOKIE_PREFIX}${testId}`;
  const cookies = cookieHeader.split('; ');
  const cookie = cookies.find((c) => c.startsWith(`${cookieName}=`));
  return cookie?.split('=')[1] ?? null;
}

/**
 * Determine variant for server-side rendering
 */
export function getServerVariant(
  testId: string,
  cookieHeader: string | null
): ABTestVariant | null {
  const test = AB_TESTS[testId];
  if (test?.status !== 'running') return null;

  const existingVariantId = getVariantFromRequest(testId, cookieHeader);
  if (existingVariantId) {
    return test.variants.find((v) => v.id === existingVariantId) ?? null;
  }

  return null;
}

// ============================================================================
// EXPORTS
// ============================================================================

export { getVisitorId, trackImpression, trackConversionEvent };

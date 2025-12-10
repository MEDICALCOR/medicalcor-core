'use client';

/**
 * ═══════════════════════════════════════════════════════════════════════════
 * A/B TEST LANDING PAGE ROUTER
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * This page automatically routes visitors to either:
 * - Control (A): CORTEX Funnel V2 landing page
 * - Treatment (B): Revolutionary landing page with AI tools
 *
 * Traffic is split 50/50 with cookie-based persistence.
 * All conversions are tracked for statistical analysis.
 * ═══════════════════════════════════════════════════════════════════════════
 */

import { useEffect } from 'react';
import { useABTest } from '@/lib/ab-testing';
import dynamic from 'next/dynamic';

// Dynamically import both landing page variants
const ControlLandingPage = dynamic(() => import('../landing-page'), {
  loading: () => <LoadingState variant="control" />,
});

const RevolutionaryLandingPage = dynamic(() => import('../revolutionary/page'), {
  loading: () => <LoadingState variant="revolutionary" />,
});

// ============================================================================
// LOADING STATE
// ============================================================================

function LoadingState({ variant: _variant }: { variant: string }) {
  return (
    <div className="min-h-screen bg-gradient-to-b from-slate-900 to-slate-800 flex items-center justify-center">
      <div className="text-center">
        <div className="w-16 h-16 mx-auto mb-6 relative">
          <div className="absolute inset-0 border-4 border-cyan-500/30 rounded-full" />
          <div className="absolute inset-0 border-4 border-transparent border-t-cyan-500 rounded-full animate-spin" />
        </div>
        <p className="text-white text-lg font-medium">Se încarcă...</p>
        <p className="text-slate-400 text-sm mt-2">Pregătim experiența perfectă pentru tine</p>
      </div>

      <style jsx>{`
        @keyframes spin {
          from {
            transform: rotate(0deg);
          }
          to {
            transform: rotate(360deg);
          }
        }
        .animate-spin {
          animation: spin 1s linear infinite;
        }
      `}</style>
    </div>
  );
}

// ============================================================================
// DEBUG PANEL (Development Only)
// ============================================================================

function DebugPanel({ variantId, testId }: { variantId: string | null; testId: string }) {
  if (process.env.NODE_ENV === 'production') return null;

  return (
    <div className="fixed bottom-4 right-4 z-[9999] bg-slate-900/95 text-white p-4 rounded-xl shadow-2xl text-sm font-mono max-w-xs">
      <div className="flex items-center gap-2 mb-2">
        <div
          className={`w-3 h-3 rounded-full ${variantId === 'control' ? 'bg-blue-500' : 'bg-emerald-500'}`}
        />
        <span className="font-bold">A/B Test Active</span>
      </div>
      <div className="space-y-1 text-slate-300">
        <div>
          Test: <span className="text-cyan-400">{testId}</span>
        </div>
        <div>
          Variant: <span className="text-amber-400">{variantId ?? 'loading...'}</span>
        </div>
        <div className="text-xs text-slate-500 mt-2">
          {variantId === 'control' ? '📊 CORTEX Funnel V2' : '🚀 Revolutionary Page'}
        </div>
      </div>
    </div>
  );
}

// ============================================================================
// MAIN ROUTER COMPONENT
// ============================================================================

export default function ABTestLandingPage() {
  const {
    variant: _variant,
    variantId,
    isControl,
    trackConversion,
    loading,
  } = useABTest('landing_page_v3');

  // Expose trackConversion globally for use by child components
  useEffect(() => {
    if (typeof window !== 'undefined') {
      (window as unknown as Record<string, unknown>).__abTestTrackConversion = trackConversion;
    }
  }, [trackConversion]);

  // Show loading state while determining variant
  if (loading) {
    return <LoadingState variant="loading" />;
  }

  return (
    <>
      {/* Render appropriate variant */}
      {isControl ? <ControlLandingPage /> : <RevolutionaryLandingPage />}

      {/* Debug panel for development */}
      <DebugPanel variantId={variantId} testId="landing_page_v3" />
    </>
  );
}

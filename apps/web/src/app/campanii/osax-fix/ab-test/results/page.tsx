'use client';

/**
 * ═══════════════════════════════════════════════════════════════════════════
 * A/B TEST RESULTS DASHBOARD
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * Real-time dashboard showing:
 * - Impressions per variant
 * - Conversion rates
 * - Statistical significance
 * - Revenue per variant
 * ═══════════════════════════════════════════════════════════════════════════
 */

import { useEffect, useState, useCallback } from 'react';
import {
  BarChart3,
  TrendingUp,
  Users,
  Target,
  DollarSign,
  RefreshCw,
  Award,
  AlertTriangle,
  CheckCircle2,
  ArrowUpRight,
  ArrowDownRight,
} from 'lucide-react';

// ============================================================================
// TYPES
// ============================================================================

interface VariantStats {
  variantId: string;
  impressions: number;
  uniqueVisitors: number;
}

interface ConversionStats {
  variantId: string;
  conversions: Record<string, number>;
  totalConversions: number;
  revenue: number;
  uniqueConverters: number;
}

interface TestResults {
  testId: string;
  impressions: VariantStats[];
  conversions: ConversionStats[];
}

// ============================================================================
// STATISTICAL CALCULATIONS
// ============================================================================

function calculateConversionRate(conversions: number, impressions: number): number {
  if (impressions === 0) return 0;
  return (conversions / impressions) * 100;
}

function calculateLift(control: number, treatment: number): number {
  if (control === 0) return 0;
  return ((treatment - control) / control) * 100;
}

function calculateZScore(
  controlConversions: number,
  controlImpressions: number,
  treatmentConversions: number,
  treatmentImpressions: number
): number {
  const p1 = controlConversions / (controlImpressions || 1);
  const p2 = treatmentConversions / (treatmentImpressions || 1);
  const pPooled =
    (controlConversions + treatmentConversions) /
    ((controlImpressions || 1) + (treatmentImpressions || 1));
  const se = Math.sqrt(
    pPooled * (1 - pPooled) * (1 / (controlImpressions || 1) + 1 / (treatmentImpressions || 1))
  );
  if (se === 0) return 0;
  return (p2 - p1) / se;
}

function getSignificanceLevel(zScore: number): {
  level: 'not_significant' | 'low' | 'medium' | 'high';
  confidence: number;
  color: string;
} {
  const absZ = Math.abs(zScore);
  if (absZ >= 2.576) return { level: 'high', confidence: 99, color: 'emerald' };
  if (absZ >= 1.96) return { level: 'medium', confidence: 95, color: 'cyan' };
  if (absZ >= 1.645) return { level: 'low', confidence: 90, color: 'amber' };
  return { level: 'not_significant', confidence: 0, color: 'slate' };
}

// ============================================================================
// COMPONENT
// ============================================================================

export default function ABTestResultsPage() {
  const [results, setResults] = useState<TestResults | null>(null);
  const [loading, setLoading] = useState(true);
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);

  const fetchResults = useCallback(async () => {
    setLoading(true);
    try {
      const [impressionsRes, conversionsRes] = await Promise.all([
        fetch('/api/ab-test/impression?testId=landing_page_v3'),
        fetch('/api/ab-test/conversion?testId=landing_page_v3'),
      ]);

      const impressionsData = (await impressionsRes.json()) as {
        success: boolean;
        data: { variants: VariantStats[] };
      };
      const conversionsData = (await conversionsRes.json()) as {
        success: boolean;
        data: { variants: ConversionStats[] };
      };

      if (impressionsData.success && conversionsData.success) {
        setResults({
          testId: 'landing_page_v3',
          impressions: impressionsData.data.variants ?? [],
          conversions: conversionsData.data.variants ?? [],
        });
        setLastUpdated(new Date());
      }
    } catch (error) {
      console.error('Failed to fetch results:', error);
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    void fetchResults();
    const interval = setInterval(() => void fetchResults(), 30000); // Refresh every 30s
    return () => clearInterval(interval);
  }, [fetchResults]);

  // Get variant data
  const controlImpressions = results?.impressions.find((v) => v.variantId === 'control');
  const treatmentImpressions = results?.impressions.find((v) => v.variantId === 'revolutionary');
  const controlConversions = results?.conversions.find((v) => v.variantId === 'control');
  const treatmentConversions = results?.conversions.find((v) => v.variantId === 'revolutionary');

  // Calculate metrics
  const controlCR = calculateConversionRate(
    controlConversions?.totalConversions ?? 0,
    controlImpressions?.impressions ?? 0
  );
  const treatmentCR = calculateConversionRate(
    treatmentConversions?.totalConversions ?? 0,
    treatmentImpressions?.impressions ?? 0
  );
  const lift = calculateLift(controlCR, treatmentCR);
  const zScore = calculateZScore(
    controlConversions?.totalConversions ?? 0,
    controlImpressions?.impressions ?? 0,
    treatmentConversions?.totalConversions ?? 0,
    treatmentImpressions?.impressions ?? 0
  );
  const significance = getSignificanceLevel(zScore);

  return (
    <div className="min-h-screen bg-slate-50 p-6">
      <div className="max-w-6xl mx-auto">
        {/* Header */}
        <div className="flex items-center justify-between mb-8">
          <div>
            <h1 className="text-2xl font-bold text-slate-900">A/B Test Results</h1>
            <p className="text-slate-600">Landing Page V3 vs Revolutionary</p>
          </div>
          <div className="flex items-center gap-4">
            {lastUpdated && (
              <span className="text-sm text-slate-500">
                Updated: {lastUpdated.toLocaleTimeString()}
              </span>
            )}
            <button
              onClick={() => void fetchResults()}
              disabled={loading}
              className="flex items-center gap-2 px-4 py-2 bg-white border border-slate-200 rounded-lg hover:bg-slate-50 disabled:opacity-50"
            >
              <RefreshCw size={16} className={loading ? 'animate-spin' : ''} />
              <span>Refresh</span>
            </button>
          </div>
        </div>

        {/* Summary Cards */}
        <div className="grid md:grid-cols-4 gap-4 mb-8">
          {/* Total Impressions */}
          <div className="bg-white rounded-xl p-5 shadow-sm border border-slate-100">
            <div className="flex items-center gap-3 mb-3">
              <div className="w-10 h-10 bg-blue-100 rounded-lg flex items-center justify-center">
                <Users size={20} className="text-blue-600" />
              </div>
              <span className="text-slate-600 text-sm">Total Impressions</span>
            </div>
            <p className="text-2xl font-bold text-slate-900">
              {(
                (controlImpressions?.impressions ?? 0) + (treatmentImpressions?.impressions ?? 0)
              ).toLocaleString()}
            </p>
          </div>

          {/* Total Conversions */}
          <div className="bg-white rounded-xl p-5 shadow-sm border border-slate-100">
            <div className="flex items-center gap-3 mb-3">
              <div className="w-10 h-10 bg-emerald-100 rounded-lg flex items-center justify-center">
                <Target size={20} className="text-emerald-600" />
              </div>
              <span className="text-slate-600 text-sm">Total Conversions</span>
            </div>
            <p className="text-2xl font-bold text-slate-900">
              {(
                (controlConversions?.totalConversions ?? 0) +
                (treatmentConversions?.totalConversions ?? 0)
              ).toLocaleString()}
            </p>
          </div>

          {/* Lift */}
          <div className="bg-white rounded-xl p-5 shadow-sm border border-slate-100">
            <div className="flex items-center gap-3 mb-3">
              <div
                className={`w-10 h-10 rounded-lg flex items-center justify-center ${
                  lift >= 0 ? 'bg-emerald-100' : 'bg-red-100'
                }`}
              >
                {lift >= 0 ? (
                  <ArrowUpRight size={20} className="text-emerald-600" />
                ) : (
                  <ArrowDownRight size={20} className="text-red-600" />
                )}
              </div>
              <span className="text-slate-600 text-sm">Lift (Treatment vs Control)</span>
            </div>
            <p className={`text-2xl font-bold ${lift >= 0 ? 'text-emerald-600' : 'text-red-600'}`}>
              {lift >= 0 ? '+' : ''}
              {lift.toFixed(1)}%
            </p>
          </div>

          {/* Statistical Significance */}
          <div className="bg-white rounded-xl p-5 shadow-sm border border-slate-100">
            <div className="flex items-center gap-3 mb-3">
              <div
                className={`w-10 h-10 rounded-lg flex items-center justify-center bg-${significance.color}-100`}
              >
                {significance.level === 'not_significant' ? (
                  <AlertTriangle size={20} className="text-slate-600" />
                ) : (
                  <CheckCircle2 size={20} className={`text-${significance.color}-600`} />
                )}
              </div>
              <span className="text-slate-600 text-sm">Significance</span>
            </div>
            <p className={`text-2xl font-bold text-${significance.color}-600`}>
              {significance.confidence > 0 ? `${significance.confidence}%` : 'Not yet'}
            </p>
          </div>
        </div>

        {/* Variant Comparison */}
        <div className="grid md:grid-cols-2 gap-6 mb-8">
          {/* Control Variant */}
          <div className="bg-white rounded-xl shadow-sm border border-slate-100 overflow-hidden">
            <div className="bg-blue-50 px-6 py-4 border-b border-blue-100">
              <div className="flex items-center gap-3">
                <div className="w-8 h-8 bg-blue-500 rounded-lg flex items-center justify-center text-white font-bold">
                  A
                </div>
                <div>
                  <h3 className="font-bold text-slate-900">Control: CORTEX Funnel V2</h3>
                  <p className="text-sm text-slate-600">Pagina existentă</p>
                </div>
              </div>
            </div>
            <div className="p-6 space-y-4">
              <div className="flex justify-between items-center">
                <span className="text-slate-600">Impressions</span>
                <span className="font-bold text-slate-900">
                  {(controlImpressions?.impressions ?? 0).toLocaleString()}
                </span>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-slate-600">Unique Visitors</span>
                <span className="font-bold text-slate-900">
                  {(controlImpressions?.uniqueVisitors ?? 0).toLocaleString()}
                </span>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-slate-600">Conversions</span>
                <span className="font-bold text-slate-900">
                  {(controlConversions?.totalConversions ?? 0).toLocaleString()}
                </span>
              </div>
              <div className="pt-4 border-t border-slate-100">
                <div className="flex justify-between items-center">
                  <span className="text-slate-600 font-medium">Conversion Rate</span>
                  <span className="text-xl font-bold text-blue-600">{controlCR.toFixed(2)}%</span>
                </div>
              </div>
            </div>
          </div>

          {/* Treatment Variant */}
          <div className="bg-white rounded-xl shadow-sm border border-slate-100 overflow-hidden">
            <div className="bg-emerald-50 px-6 py-4 border-b border-emerald-100">
              <div className="flex items-center gap-3">
                <div className="w-8 h-8 bg-emerald-500 rounded-lg flex items-center justify-center text-white font-bold">
                  B
                </div>
                <div>
                  <h3 className="font-bold text-slate-900">Treatment: Revolutionary</h3>
                  <p className="text-sm text-slate-600">Pagina nouă cu AI tools</p>
                </div>
                {lift > 0 && significance.level !== 'not_significant' && (
                  <span className="ml-auto px-3 py-1 bg-emerald-100 text-emerald-700 rounded-full text-sm font-medium flex items-center gap-1">
                    <Award size={14} />
                    Winner
                  </span>
                )}
              </div>
            </div>
            <div className="p-6 space-y-4">
              <div className="flex justify-between items-center">
                <span className="text-slate-600">Impressions</span>
                <span className="font-bold text-slate-900">
                  {(treatmentImpressions?.impressions ?? 0).toLocaleString()}
                </span>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-slate-600">Unique Visitors</span>
                <span className="font-bold text-slate-900">
                  {(treatmentImpressions?.uniqueVisitors ?? 0).toLocaleString()}
                </span>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-slate-600">Conversions</span>
                <span className="font-bold text-slate-900">
                  {(treatmentConversions?.totalConversions ?? 0).toLocaleString()}
                </span>
              </div>
              <div className="pt-4 border-t border-slate-100">
                <div className="flex justify-between items-center">
                  <span className="text-slate-600 font-medium">Conversion Rate</span>
                  <span className="text-xl font-bold text-emerald-600">
                    {treatmentCR.toFixed(2)}%
                  </span>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Recommendations */}
        <div className="bg-gradient-to-br from-slate-900 to-slate-800 rounded-xl p-6 text-white">
          <h3 className="text-lg font-bold mb-4 flex items-center gap-2">
            <TrendingUp size={20} />
            Recommendations
          </h3>
          <div className="space-y-3">
            {(controlImpressions?.impressions ?? 0) + (treatmentImpressions?.impressions ?? 0) <
              100 && (
              <p className="flex items-start gap-2">
                <AlertTriangle size={18} className="text-amber-400 flex-shrink-0 mt-0.5" />
                <span>
                  Need more data. Continue running the test until at least 1,000 impressions per
                  variant for reliable results.
                </span>
              </p>
            )}
            {significance.level === 'not_significant' && (
              <p className="flex items-start gap-2">
                <AlertTriangle size={18} className="text-amber-400 flex-shrink-0 mt-0.5" />
                <span>
                  Results are not statistically significant yet. Continue the test before making
                  decisions.
                </span>
              </p>
            )}
            {significance.level === 'high' && lift > 0 && (
              <p className="flex items-start gap-2">
                <CheckCircle2 size={18} className="text-emerald-400 flex-shrink-0 mt-0.5" />
                <span>
                  Strong evidence that Revolutionary page outperforms Control. Consider deploying to
                  100% of traffic.
                </span>
              </p>
            )}
            {significance.level === 'high' && lift < 0 && (
              <p className="flex items-start gap-2">
                <AlertTriangle size={18} className="text-red-400 flex-shrink-0 mt-0.5" />
                <span>
                  Control page is performing better. Investigate Revolutionary page issues before
                  continuing.
                </span>
              </p>
            )}
          </div>
        </div>

        {/* Footer */}
        <div className="mt-8 text-center text-sm text-slate-500">
          <p>A/B Test ID: landing_page_v3 • Started: {new Date().toLocaleDateString()}</p>
          <p className="mt-1">Traffic split: 50% Control / 50% Treatment</p>
        </div>
      </div>
    </div>
  );
}

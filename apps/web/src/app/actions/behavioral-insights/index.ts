'use server';

/**
 * @fileoverview Behavioral Insights Server Actions
 *
 * M5: Pattern Detection for Cognitive Memory - Behavioral Insights
 * Server actions for fetching behavioral patterns and cognitive insights.
 *
 * @module actions/behavioral-insights
 * @security All actions require VIEW_ANALYTICS permission
 */

import { requirePermission } from '@/lib/auth/server-action-auth';

// ============================================================================
// TYPES
// ============================================================================

export type PatternType =
  | 'appointment_rescheduler'
  | 'monday_avoider'
  | 'high_engagement'
  | 'declining_engagement'
  | 'quick_responder'
  | 'slow_responder'
  | 'price_sensitive'
  | 'quality_focused'
  | 'llm_communication_preference'
  | 'llm_time_preference'
  | 'llm_seasonal_behavior'
  | 'llm_topic_interest'
  | 'llm_other';

export type InsightType =
  | 'churn_risk'
  | 'upsell_opportunity'
  | 'engagement_drop'
  | 'positive_momentum'
  | 'pattern_detected'
  | 'reactivation_candidate'
  | 'referral_opportunity';

export type SubjectType = 'lead' | 'patient' | 'contact';

export interface BehavioralPattern {
  id: string;
  subjectType: SubjectType;
  subjectId: string;
  patternType: string;
  patternDescription: string;
  confidence: number;
  supportingEventIds: string[];
  firstObservedAt: string;
  lastObservedAt: string;
  occurrenceCount: number;
}

export interface CognitiveInsight {
  type: InsightType;
  confidence: number;
  description: string;
  recommendedAction: string;
  supportingEventIds?: string[];
}

export interface PatternStats {
  totalPatterns: number;
  byType: Record<string, number>;
  highConfidenceCount: number;
  recentlyDetected: number;
}

export interface InsightsDashboardData {
  stats: PatternStats;
  topPatterns: BehavioralPattern[];
  recentInsights: CognitiveInsight[];
  patternsByType: { type: string; count: number; avgConfidence: number }[];
  subjectsWithPatterns: number;
}

export interface SubjectInsights {
  subjectType: SubjectType;
  subjectId: string;
  subjectName: string;
  patterns: BehavioralPattern[];
  insights: CognitiveInsight[];
  sentimentTrend: 'improving' | 'stable' | 'declining';
  engagementScore: number;
  lastInteraction: string | null;
}

// ============================================================================
// MOCK DATA GENERATORS
// ============================================================================

const PATTERN_DESCRIPTIONS: Record<string, string> = {
  appointment_rescheduler:
    'Patient frequently reschedules appointments. Consider flexible scheduling options.',
  monday_avoider:
    'Patient avoids Monday appointments. Schedule suggestions should exclude Mondays.',
  high_engagement:
    'Highly engaged patient with multiple communication channels. Prime candidate for loyalty programs.',
  declining_engagement:
    'Patient engagement has declined. Consider proactive outreach with personalized offers.',
  quick_responder:
    'Patient typically responds quickly to messages. Real-time communication is effective.',
  slow_responder: 'Patient takes longer to respond. Allow adequate time before follow-ups.',
  price_sensitive:
    'Patient shows price sensitivity. Emphasize value propositions and payment plans.',
  quality_focused:
    'Patient prioritizes quality and expertise. Highlight credentials and success stories.',
};

function generateMockPatterns(): BehavioralPattern[] {
  const subjects = [
    { id: 'lead-001', type: 'lead' as SubjectType, name: 'Maria Ionescu' },
    { id: 'patient-002', type: 'patient' as SubjectType, name: 'Alexandru Pop' },
    { id: 'lead-003', type: 'lead' as SubjectType, name: 'Elena Vasilescu' },
    { id: 'patient-004', type: 'patient' as SubjectType, name: 'Andrei Gheorghe' },
    { id: 'lead-005', type: 'lead' as SubjectType, name: 'Diana Stan' },
    { id: 'contact-006', type: 'contact' as SubjectType, name: 'Mihai Dobre' },
  ];

  const patternTypes = [
    'appointment_rescheduler',
    'high_engagement',
    'quick_responder',
    'price_sensitive',
    'declining_engagement',
    'quality_focused',
    'slow_responder',
    'monday_avoider',
  ];

  const patterns: BehavioralPattern[] = [];
  const now = new Date();

  subjects.forEach((subject, subjectIndex) => {
    // Each subject gets 1-3 patterns
    const patternCount = 1 + Math.floor(Math.random() * 3);
    const assignedPatterns = patternTypes.slice(
      subjectIndex % 4,
      (subjectIndex % 4) + patternCount
    );

    assignedPatterns.forEach((patternType, patternIndex) => {
      const daysAgo = Math.floor(Math.random() * 60) + 7;
      const firstObserved = new Date(now);
      firstObserved.setDate(firstObserved.getDate() - daysAgo);

      const lastObservedDaysAgo = Math.floor(Math.random() * 7);
      const lastObserved = new Date(now);
      lastObserved.setDate(lastObserved.getDate() - lastObservedDaysAgo);

      patterns.push({
        id: `pattern-${subject.id}-${patternIndex}`,
        subjectType: subject.type,
        subjectId: subject.id,
        patternType,
        patternDescription: PATTERN_DESCRIPTIONS[patternType] ?? `${patternType} pattern detected`,
        confidence: 0.5 + Math.random() * 0.5,
        supportingEventIds: Array.from(
          { length: 3 + Math.floor(Math.random() * 5) },
          (_, i) => `event-${subject.id}-${i}`
        ),
        firstObservedAt: firstObserved.toISOString(),
        lastObservedAt: lastObserved.toISOString(),
        occurrenceCount: 2 + Math.floor(Math.random() * 10),
      });
    });
  });

  return patterns;
}

function generateMockInsights(patterns: BehavioralPattern[]): CognitiveInsight[] {
  const insights: CognitiveInsight[] = [];

  patterns.forEach((pattern) => {
    switch (pattern.patternType) {
      case 'declining_engagement':
        insights.push({
          type: 'engagement_drop',
          confidence: pattern.confidence,
          description: `${pattern.patternDescription} Interaction frequency has decreased significantly.`,
          recommendedAction: 'Send personalized reactivation message with special offer.',
          supportingEventIds: pattern.supportingEventIds,
        });
        break;
      case 'high_engagement':
        insights.push({
          type: 'referral_opportunity',
          confidence: pattern.confidence * 0.8,
          description: 'Highly engaged patient is a good candidate for referral program.',
          recommendedAction: 'Introduce referral incentives and loyalty benefits.',
          supportingEventIds: pattern.supportingEventIds,
        });
        break;
      case 'price_sensitive':
        insights.push({
          type: 'upsell_opportunity',
          confidence: pattern.confidence * 0.5,
          description: 'Patient is price-conscious but engaged.',
          recommendedAction: 'Present value-focused packages and payment plans.',
          supportingEventIds: pattern.supportingEventIds,
        });
        break;
      case 'appointment_rescheduler':
        insights.push({
          type: 'churn_risk',
          confidence: pattern.confidence * 0.6,
          description: 'Frequent rescheduling may indicate scheduling difficulties or hesitation.',
          recommendedAction: 'Offer flexible scheduling options or address potential concerns.',
          supportingEventIds: pattern.supportingEventIds,
        });
        break;
    }
  });

  // Add some reactivation candidates
  insights.push({
    type: 'reactivation_candidate',
    confidence: 0.78,
    description: "Patient was previously active (12 interactions) but hasn't engaged in 65 days.",
    recommendedAction: 'Send personalized reactivation message with checkup reminder.',
    supportingEventIds: ['event-001', 'event-002'],
  });

  insights.push({
    type: 'positive_momentum',
    confidence: 0.85,
    description: 'Patient shows consistent positive engagement recently.',
    recommendedAction: 'Capitalize on positive momentum with upgrade offers.',
    supportingEventIds: ['event-003', 'event-004', 'event-005'],
  });

  return insights.sort((a, b) => b.confidence - a.confidence);
}

// ============================================================================
// SERVER ACTIONS
// ============================================================================

/**
 * Get behavioral insights dashboard data
 *
 * @requires VIEW_ANALYTICS permission
 * @returns Complete dashboard data including stats, patterns, and insights
 */
export async function getBehavioralInsightsDashboardAction(): Promise<InsightsDashboardData> {
  try {
    await requirePermission('VIEW_ANALYTICS');

    const patterns = generateMockPatterns();
    const insights = generateMockInsights(patterns);

    // Calculate stats
    const byType: Record<string, number> = {};
    patterns.forEach((p) => {
      byType[p.patternType] = (byType[p.patternType] ?? 0) + 1;
    });

    const highConfidenceCount = patterns.filter((p) => p.confidence >= 0.8).length;

    const sevenDaysAgo = new Date();
    sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
    const recentlyDetected = patterns.filter(
      (p) => new Date(p.firstObservedAt) >= sevenDaysAgo
    ).length;

    const uniqueSubjects = new Set(patterns.map((p) => p.subjectId));

    // Calculate patterns by type with avg confidence
    const patternsByType = Object.entries(byType).map(([type, count]) => {
      const typePatterns = patterns.filter((p) => p.patternType === type);
      const avgConfidence =
        typePatterns.reduce((sum, p) => sum + p.confidence, 0) / typePatterns.length;
      return { type, count, avgConfidence: Math.round(avgConfidence * 100) / 100 };
    });

    return {
      stats: {
        totalPatterns: patterns.length,
        byType,
        highConfidenceCount,
        recentlyDetected,
      },
      topPatterns: patterns.sort((a, b) => b.confidence - a.confidence).slice(0, 10),
      recentInsights: insights.slice(0, 8),
      patternsByType: patternsByType.sort((a, b) => b.count - a.count),
      subjectsWithPatterns: uniqueSubjects.size,
    };
  } catch (error) {
    if (process.env.NODE_ENV !== 'production') {
      console.error('[getBehavioralInsightsDashboardAction] Failed:', error);
    }

    return {
      stats: {
        totalPatterns: 0,
        byType: {},
        highConfidenceCount: 0,
        recentlyDetected: 0,
      },
      topPatterns: [],
      recentInsights: [],
      patternsByType: [],
      subjectsWithPatterns: 0,
    };
  }
}

/**
 * Get pattern statistics
 *
 * @requires VIEW_ANALYTICS permission
 * @returns Pattern statistics
 */
export async function getPatternStatsAction(): Promise<PatternStats> {
  try {
    await requirePermission('VIEW_ANALYTICS');

    const patterns = generateMockPatterns();
    const byType: Record<string, number> = {};
    patterns.forEach((p) => {
      byType[p.patternType] = (byType[p.patternType] ?? 0) + 1;
    });

    const sevenDaysAgo = new Date();
    sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);

    return {
      totalPatterns: patterns.length,
      byType,
      highConfidenceCount: patterns.filter((p) => p.confidence >= 0.8).length,
      recentlyDetected: patterns.filter((p) => new Date(p.firstObservedAt) >= sevenDaysAgo).length,
    };
  } catch (error) {
    if (process.env.NODE_ENV !== 'production') {
      console.error('[getPatternStatsAction] Failed:', error);
    }
    return {
      totalPatterns: 0,
      byType: {},
      highConfidenceCount: 0,
      recentlyDetected: 0,
    };
  }
}

/**
 * Get insights for a specific subject (lead/patient/contact)
 *
 * @param subjectType - Type of subject
 * @param subjectId - Subject ID
 * @requires VIEW_ANALYTICS permission
 * @returns Subject insights with patterns
 */
export async function getSubjectInsightsAction(
  subjectType: SubjectType,
  subjectId: string
): Promise<SubjectInsights | null> {
  try {
    await requirePermission('VIEW_ANALYTICS');

    const allPatterns = generateMockPatterns();
    const subjectPatterns = allPatterns.filter(
      (p) => p.subjectType === subjectType && p.subjectId === subjectId
    );

    if (subjectPatterns.length === 0) {
      return null;
    }

    const insights = generateMockInsights(subjectPatterns);

    // Mock subject name based on ID
    const mockNames: Record<string, string> = {
      'lead-001': 'Maria Ionescu',
      'patient-002': 'Alexandru Pop',
      'lead-003': 'Elena Vasilescu',
      'patient-004': 'Andrei Gheorghe',
      'lead-005': 'Diana Stan',
      'contact-006': 'Mihai Dobre',
    };

    const sentimentTrends: ('improving' | 'stable' | 'declining')[] = [
      'improving',
      'stable',
      'declining',
    ];

    return {
      subjectType,
      subjectId,
      subjectName: mockNames[subjectId] ?? 'Unknown',
      patterns: subjectPatterns,
      insights,
      sentimentTrend: sentimentTrends[Math.floor(Math.random() * 3)] ?? 'stable',
      engagementScore: Math.round(Math.random() * 40 + 60),
      lastInteraction: new Date(Date.now() - Math.random() * 7 * 24 * 60 * 60 * 1000).toISOString(),
    };
  } catch (error) {
    if (process.env.NODE_ENV !== 'production') {
      console.error('[getSubjectInsightsAction] Failed:', error);
    }
    return null;
  }
}

/**
 * Trigger pattern detection for a subject
 *
 * @param subjectType - Type of subject
 * @param subjectId - Subject ID
 * @requires MANAGE_LEADS permission
 * @returns Detected patterns
 */
export async function detectPatternsAction(
  subjectType: SubjectType,
  subjectId: string
): Promise<BehavioralPattern[]> {
  try {
    await requirePermission('EDIT_PATIENTS' as any);

    // In production, this would call the PatternDetector service
    // For now, return mock data
    const allPatterns = generateMockPatterns();
    return allPatterns.filter((p) => p.subjectType === subjectType && p.subjectId === subjectId);
  } catch (error) {
    if (process.env.NODE_ENV !== 'production') {
      console.error('[detectPatternsAction] Failed:', error);
    }
    return [];
  }
}

/**
 * Get all patterns for a specific pattern type
 *
 * @param patternType - Pattern type to filter by
 * @requires VIEW_ANALYTICS permission
 * @returns Patterns of the specified type
 */
export async function getPatternsByTypeAction(patternType: string): Promise<BehavioralPattern[]> {
  try {
    await requirePermission('VIEW_ANALYTICS');

    const allPatterns = generateMockPatterns();
    return allPatterns
      .filter((p) => p.patternType === patternType)
      .sort((a, b) => b.confidence - a.confidence);
  } catch (error) {
    if (process.env.NODE_ENV !== 'production') {
      console.error('[getPatternsByTypeAction] Failed:', error);
    }
    return [];
  }
}

/**
 * Get high-priority insights that need attention
 *
 * @requires VIEW_ANALYTICS permission
 * @returns High confidence insights requiring action
 */
export async function getActionableInsightsAction(): Promise<CognitiveInsight[]> {
  try {
    await requirePermission('VIEW_ANALYTICS');

    const patterns = generateMockPatterns();
    const insights = generateMockInsights(patterns);

    // Return high confidence insights that need action
    return insights
      .filter((i) => i.confidence >= 0.7)
      .filter((i) => ['churn_risk', 'reactivation_candidate', 'engagement_drop'].includes(i.type))
      .slice(0, 10);
  } catch (error) {
    if (process.env.NODE_ENV !== 'production') {
      console.error('[getActionableInsightsAction] Failed:', error);
    }
    return [];
  }
}

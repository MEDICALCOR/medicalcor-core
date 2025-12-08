/**
 * Pattern Detector - Behavioral Pattern Detection for Cognitive Memory
 *
 * M5: Analyzes episodic events to detect behavioral patterns and generate insights.
 * Uses both rule-based algorithms and LLM analysis for pattern recognition.
 */

import type { Pool } from 'pg';
import { createLogger } from '../logger.js';
import {
  DEFAULT_COGNITIVE_CONFIG,
  type EpisodicEvent,
  type BehavioralPattern,
  type PatternDetectionResult,
  type CognitiveInsight,
  type CognitiveSystemConfig,
  type SubjectType,
  type LLMPattern,
} from './types.js';
import type { IOpenAIClient } from './episode-builder.js';

const logger = createLogger({ name: 'cognitive-pattern-detector' });

// =============================================================================
// Pattern Detection Rules
// =============================================================================

interface PatternRule {
  type: string;
  detect: (events: EpisodicEvent[]) => PatternDetectionResult;
  description: (confidence: number, events: EpisodicEvent[]) => string;
}

// Helper: Check if day of week matches
function isDayOfWeek(date: Date, day: number): boolean {
  return date.getDay() === day;
}

// Helper: Calculate average response time between events
function calculateAverageResponseTime(events: EpisodicEvent[]): number | null {
  const responseTimes: number[] = [];
  const sortedEvents = [...events].sort((a, b) => a.occurredAt.getTime() - b.occurredAt.getTime());

  for (let i = 1; i < sortedEvents.length; i++) {
    const prevEvent = sortedEvents[i - 1];
    const currEvent = sortedEvents[i];
    if (prevEvent && currEvent) {
      const diff = currEvent.occurredAt.getTime() - prevEvent.occurredAt.getTime();
      if (diff < 24 * 60 * 60 * 1000) {
        // Within 24 hours
        responseTimes.push(diff);
      }
    }
  }

  if (responseTimes.length === 0) return null;
  return responseTimes.reduce((a, b) => a + b, 0) / responseTimes.length;
}

// =============================================================================
// Rule-Based Pattern Detectors
// =============================================================================

const PATTERN_RULES: PatternRule[] = [
  // Appointment Rescheduler Pattern
  {
    type: 'appointment_rescheduler',
    detect: (events) => {
      const rescheduleEvents = events.filter(
        (e) =>
          e.eventType.includes('reschedule') ||
          e.eventType === 'appointment.rescheduled' ||
          e.summary.toLowerCase().includes('reschedul')
      );

      const cancellations = events.filter(
        (e) =>
          e.eventType.includes('cancel') ||
          e.eventType === 'appointment.cancelled' ||
          e.summary.toLowerCase().includes('cancel')
      );

      const totalSchedulingIssues = rescheduleEvents.length + cancellations.length;
      const confidence = Math.min(totalSchedulingIssues * 0.25, 1);

      return {
        detected: totalSchedulingIssues >= 2,
        confidence,
        supportingEvents: [...rescheduleEvents, ...cancellations].map((e) => e.id),
      };
    },
    description: (confidence, events) => {
      const count = events.filter(
        (e) =>
          e.eventType.includes('reschedule') ||
          e.eventType.includes('cancel') ||
          e.summary.toLowerCase().includes('reschedul') ||
          e.summary.toLowerCase().includes('cancel')
      ).length;
      return `Patient has rescheduled or cancelled appointments ${count} times (${Math.round(confidence * 100)}% confidence). Consider flexible scheduling options.`;
    },
  },

  // Monday Avoider Pattern
  {
    type: 'monday_avoider',
    detect: (events) => {
      const schedulingEvents = events.filter((e) => e.eventCategory === 'scheduling');

      if (schedulingEvents.length < 3) {
        return { detected: false, confidence: 0, supportingEvents: [] };
      }

      const mondayEvents = schedulingEvents.filter((e) => isDayOfWeek(e.occurredAt, 1));
      const mondayRatio = mondayEvents.length / schedulingEvents.length;

      // Expected Monday ratio is ~14.3% (1/7), if significantly lower, pattern detected
      const expectedRatio = 1 / 7;
      const deviation = expectedRatio - mondayRatio;
      const confidence = deviation > 0 ? Math.min(deviation * 5, 1) : 0;

      return {
        detected: mondayRatio < 0.05 && schedulingEvents.length >= 5,
        confidence,
        supportingEvents: schedulingEvents.map((e) => e.id),
      };
    },
    description: () =>
      'Patient consistently avoids Monday appointments. Schedule suggestions should exclude Mondays when possible.',
  },

  // High Engagement Pattern
  {
    type: 'high_engagement',
    detect: (events) => {
      const communicationEvents = events.filter((e) => e.eventCategory === 'communication');

      // Check channel diversity
      const channels = new Set(communicationEvents.map((e) => e.sourceChannel));

      // Check frequency (events per month)
      const thirtyDaysAgo = new Date();
      thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
      const recentEvents = communicationEvents.filter((e) => e.occurredAt >= thirtyDaysAgo);

      const hasMultipleChannels = channels.size >= 2;
      const hasHighFrequency = recentEvents.length >= 5;
      const hasPositiveSentiment =
        communicationEvents.filter((e) => e.sentiment === 'positive').length >
        communicationEvents.length * 0.5;

      const confidence =
        (hasMultipleChannels ? 0.35 : 0) +
        (hasHighFrequency ? 0.35 : 0) +
        (hasPositiveSentiment ? 0.3 : 0);

      return {
        detected: confidence >= 0.6,
        confidence,
        supportingEvents: recentEvents.map((e) => e.id),
      };
    },
    description: (confidence, events) => {
      const channels = new Set(events.map((e) => e.sourceChannel)).size;
      return `Highly engaged patient with ${channels} communication channels and regular interactions (${Math.round(confidence * 100)}% confidence). Prime candidate for loyalty programs.`;
    },
  },

  // Declining Engagement Pattern
  {
    type: 'declining_engagement',
    detect: (events) => {
      if (events.length < 5) {
        return { detected: false, confidence: 0, supportingEvents: [] };
      }

      const sortedEvents = [...events].sort(
        (a, b) => a.occurredAt.getTime() - b.occurredAt.getTime()
      );

      // Split into halves
      const midpoint = Math.floor(sortedEvents.length / 2);
      const firstHalf = sortedEvents.slice(0, midpoint);
      const secondHalf = sortedEvents.slice(midpoint);

      // Calculate interaction frequency for each half
      const firstHalfDuration =
        firstHalf.length > 1
          ? (firstHalf[firstHalf.length - 1]?.occurredAt.getTime() ?? 0) -
            (firstHalf[0]?.occurredAt.getTime() ?? 0)
          : 0;
      const secondHalfDuration =
        secondHalf.length > 1
          ? (secondHalf[secondHalf.length - 1]?.occurredAt.getTime() ?? 0) -
            (secondHalf[0]?.occurredAt.getTime() ?? 0)
          : 0;

      const firstFrequency = firstHalfDuration > 0 ? firstHalf.length / firstHalfDuration : 0;
      const secondFrequency = secondHalfDuration > 0 ? secondHalf.length / secondHalfDuration : 0;

      // Also check sentiment trend
      const recentNegative = secondHalf.filter((e) => e.sentiment === 'negative').length;
      const recentSentimentRatio = secondHalf.length > 0 ? recentNegative / secondHalf.length : 0;

      const frequencyDecline =
        firstFrequency > 0 ? Math.max(0, (firstFrequency - secondFrequency) / firstFrequency) : 0;

      const confidence = frequencyDecline * 0.7 + recentSentimentRatio * 0.3;

      return {
        detected: frequencyDecline > 0.3 || recentSentimentRatio > 0.4,
        confidence: Math.min(confidence, 1),
        supportingEvents: secondHalf.map((e) => e.id),
      };
    },
    description: (confidence) =>
      `Patient engagement has declined (${Math.round(confidence * 100)}% confidence). Consider proactive outreach with personalized offers.`,
  },

  // Quick Responder Pattern
  {
    type: 'quick_responder',
    detect: (events) => {
      const avgResponseTime = calculateAverageResponseTime(events);

      if (avgResponseTime === null) {
        return { detected: false, confidence: 0, supportingEvents: [] };
      }

      // Quick responder = average response within 30 minutes
      const thirtyMinutes = 30 * 60 * 1000;
      const isQuick = avgResponseTime < thirtyMinutes;
      const confidence = isQuick ? Math.min(1 - avgResponseTime / thirtyMinutes, 1) : 0;

      return {
        detected: isQuick,
        confidence,
        supportingEvents: events.map((e) => e.id),
      };
    },
    description: (confidence) =>
      `Patient typically responds quickly to messages (${Math.round(confidence * 100)}% confidence). Real-time communication is effective.`,
  },

  // Slow Responder Pattern
  {
    type: 'slow_responder',
    detect: (events) => {
      const avgResponseTime = calculateAverageResponseTime(events);

      if (avgResponseTime === null) {
        return { detected: false, confidence: 0, supportingEvents: [] };
      }

      // Slow responder = average response over 4 hours
      const fourHours = 4 * 60 * 60 * 1000;
      const isSlow = avgResponseTime > fourHours;
      const confidence = isSlow ? Math.min((avgResponseTime - fourHours) / fourHours, 1) : 0;

      return {
        detected: isSlow,
        confidence,
        supportingEvents: events.map((e) => e.id),
      };
    },
    description: (confidence) =>
      `Patient typically takes longer to respond (${Math.round(confidence * 100)}% confidence). Allow adequate time before follow-ups.`,
  },

  // Price Sensitive Pattern
  {
    type: 'price_sensitive',
    detect: (events) => {
      const priceRelatedEvents = events.filter(
        (e) =>
          e.summary.toLowerCase().includes('price') ||
          e.summary.toLowerCase().includes('cost') ||
          e.summary.toLowerCase().includes('afford') ||
          e.summary.toLowerCase().includes('pret') ||
          e.summary.toLowerCase().includes('discount') ||
          e.summary.toLowerCase().includes('reducere') ||
          (e.intent?.toLowerCase().includes('price') ?? false) ||
          e.keyEntities.some((entity) => entity.type === 'amount')
      );

      const confidence = Math.min(priceRelatedEvents.length * 0.3, 1);

      return {
        detected: priceRelatedEvents.length >= 2,
        confidence,
        supportingEvents: priceRelatedEvents.map((e) => e.id),
      };
    },
    description: (confidence) =>
      `Patient shows price sensitivity in communications (${Math.round(confidence * 100)}% confidence). Emphasize value propositions and payment plans.`,
  },

  // Quality Focused Pattern
  {
    type: 'quality_focused',
    detect: (events) => {
      const qualityRelatedEvents = events.filter(
        (e) =>
          e.summary.toLowerCase().includes('quality') ||
          e.summary.toLowerCase().includes('experience') ||
          e.summary.toLowerCase().includes('best') ||
          e.summary.toLowerCase().includes('calitate') ||
          e.summary.toLowerCase().includes('experienta') ||
          e.summary.toLowerCase().includes('specialist') ||
          e.summary.toLowerCase().includes('expert') ||
          e.intent?.toLowerCase().includes('quality')
      );

      const confidence = Math.min(qualityRelatedEvents.length * 0.35, 1);

      return {
        detected: qualityRelatedEvents.length >= 2,
        confidence,
        supportingEvents: qualityRelatedEvents.map((e) => e.id),
      };
    },
    description: (confidence) =>
      `Patient prioritizes quality and expertise (${Math.round(confidence * 100)}% confidence). Highlight credentials and success stories.`,
  },
];

// =============================================================================
// LLM-Based Pattern Detection
// =============================================================================

const LLM_PATTERN_PROMPT = `Analyze these patient interaction events and identify behavioral patterns not covered by standard rules.

Events:
{{EVENTS}}

Look for patterns like:
- Communication preferences (preferred times, channels, tone)
- Seasonal behaviors (more active in certain months)
- Topic interests (specific treatments, concerns they return to)
- Decision-making style (impulsive vs. deliberate)
- Any other behavioral patterns

Respond with a JSON array of patterns:
[
  {
    "type": "llm_<pattern_name>",
    "description": "Clear description of the pattern",
    "confidence": 0.0-1.0,
    "reasoning": "Why this pattern was detected"
  }
]

Only include patterns with confidence >= 0.5. Return empty array if no significant patterns found.`;

// =============================================================================
// Pattern Detector Class
// =============================================================================

export class PatternDetector {
  private config: CognitiveSystemConfig;

  constructor(
    private pool: Pool,
    private openai?: IOpenAIClient,
    config: Partial<CognitiveSystemConfig> = {}
  ) {
    this.config = { ...DEFAULT_COGNITIVE_CONFIG, ...config };
  }

  /**
   * Detect all behavioral patterns for a subject
   */
  async detectPatterns(subjectType: SubjectType, subjectId: string): Promise<BehavioralPattern[]> {
    const startTime = Date.now();

    try {
      // 1. Fetch recent events for analysis
      const events = await this.fetchSubjectEvents(subjectType, subjectId);

      if (events.length === 0) {
        logger.debug({ subjectId }, 'No events found for pattern detection');
        return [];
      }

      // 2. Run rule-based detection
      const rulePatterns = this.runRuleBasedDetection(events, subjectType, subjectId);

      // 3. Optionally run LLM-based detection
      let llmPatterns: BehavioralPattern[] = [];
      if (this.config.enableLLMPatterns && this.openai && events.length >= 5) {
        llmPatterns = await this.runLLMDetection(events, subjectType, subjectId);
      }

      // 4. Combine and filter by minimum confidence
      const allPatterns = [...rulePatterns, ...llmPatterns].filter(
        (p) => p.confidence >= this.config.minPatternConfidence
      );

      // 5. Persist patterns
      await this.persistPatterns(allPatterns);

      logger.info(
        {
          subjectId,
          eventCount: events.length,
          patternsDetected: allPatterns.length,
          processingTimeMs: Date.now() - startTime,
        },
        'Pattern detection complete'
      );

      return allPatterns;
    } catch (error) {
      logger.error({ error, subjectId }, 'Failed to detect patterns');
      throw error;
    }
  }

  /**
   * Generate cognitive insights based on detected patterns
   */
  async generateInsights(subjectType: SubjectType, subjectId: string): Promise<CognitiveInsight[]> {
    const patterns = await this.getStoredPatterns(subjectType, subjectId);
    const insights: CognitiveInsight[] = [];

    // Generate insights based on patterns
    for (const pattern of patterns) {
      const insight = this.patternToInsight(pattern);
      if (insight) {
        insights.push(insight);
      }
    }

    // Add engagement-based insights
    const engagementInsight = await this.detectEngagementInsight(subjectType, subjectId);
    if (engagementInsight) {
      insights.push(engagementInsight);
    }

    return insights.sort((a, b) => b.confidence - a.confidence);
  }

  /**
   * Get all behavioral patterns for a subject
   */
  async getStoredPatterns(
    subjectType: SubjectType,
    subjectId: string
  ): Promise<BehavioralPattern[]> {
    const result = await this.pool.query<Record<string, unknown>>(
      `
      SELECT *
      FROM behavioral_patterns
      WHERE subject_type = $1 AND subject_id = $2
      ORDER BY confidence DESC
      `,
      [subjectType, subjectId]
    );

    return result.rows.map((row) => this.rowToPattern(row));
  }

  /**
   * Get pattern statistics for dashboard
   */
  async getPatternStats(): Promise<{
    totalPatterns: number;
    byType: Record<string, number>;
    highConfidenceCount: number;
    recentlyDetected: number;
  }> {
    interface StatsRow {
      total_patterns: number;
      high_confidence: number;
      recently_detected: number;
    }
    interface TypeRow {
      pattern_type: string;
      count: number;
    }

    const result = await this.pool.query<StatsRow>(`
      SELECT
        COUNT(*)::int as total_patterns,
        COUNT(*) FILTER (WHERE confidence >= 0.8)::int as high_confidence,
        COUNT(*) FILTER (WHERE created_at >= NOW() - INTERVAL '7 days')::int as recently_detected
      FROM behavioral_patterns
    `);

    const typeResult = await this.pool.query<TypeRow>(`
      SELECT pattern_type, COUNT(*)::int as count
      FROM behavioral_patterns
      GROUP BY pattern_type
    `);

    const byType: Record<string, number> = {};
    for (const row of typeResult.rows) {
      byType[row.pattern_type] = row.count;
    }

    const row = result.rows[0];
    return {
      totalPatterns: row?.total_patterns ?? 0,
      byType,
      highConfidenceCount: row?.high_confidence ?? 0,
      recentlyDetected: row?.recently_detected ?? 0,
    };
  }

  // =============================================================================
  // Private Methods
  // =============================================================================

  private async fetchSubjectEvents(
    subjectType: SubjectType,
    subjectId: string
  ): Promise<EpisodicEvent[]> {
    const result = await this.pool.query<Record<string, unknown>>(
      `
      SELECT
        id, subject_type, subject_id, event_type, event_category,
        source_channel, raw_event_id, summary, key_entities,
        sentiment, intent, occurred_at, processed_at, metadata
      FROM episodic_events
      WHERE subject_type = $1 AND subject_id = $2 AND deleted_at IS NULL
      ORDER BY occurred_at DESC
      LIMIT $3
      `,
      [subjectType, subjectId, this.config.maxEventsForPatterns]
    );

    return result.rows.map((row) => this.rowToEvent(row));
  }

  private runRuleBasedDetection(
    events: EpisodicEvent[],
    subjectType: SubjectType,
    subjectId: string
  ): BehavioralPattern[] {
    const patterns: BehavioralPattern[] = [];

    for (const rule of PATTERN_RULES) {
      const result = rule.detect(events);

      if (result.detected) {
        const supportingEvents = events.filter((e) => result.supportingEvents.includes(e.id));

        patterns.push({
          id: crypto.randomUUID(),
          subjectType,
          subjectId,
          patternType: rule.type,
          patternDescription: rule.description(result.confidence, supportingEvents),
          confidence: result.confidence,
          supportingEventIds: result.supportingEvents,
          firstObservedAt: new Date(
            Math.min(...supportingEvents.map((e) => e.occurredAt.getTime()))
          ),
          lastObservedAt: new Date(
            Math.max(...supportingEvents.map((e) => e.occurredAt.getTime()))
          ),
          occurrenceCount: result.supportingEvents.length,
        });
      }
    }

    return patterns;
  }

  private async runLLMDetection(
    events: EpisodicEvent[],
    subjectType: SubjectType,
    subjectId: string
  ): Promise<BehavioralPattern[]> {
    if (!this.openai) return [];

    try {
      // Prepare event summaries for LLM
      const eventSummaries = events
        .slice(0, 20) // Limit to 20 most recent
        .map(
          (e) =>
            `[${e.occurredAt.toISOString().split('T')[0]}] ${e.eventType} via ${e.sourceChannel}: ${e.summary} (sentiment: ${e.sentiment ?? 'unknown'})`
        )
        .join('\n');

      const prompt = LLM_PATTERN_PROMPT.replace('{{EVENTS}}', eventSummaries);

      const response = await this.openai.chatCompletion({
        messages: [
          {
            role: 'system',
            content:
              'You are a behavioral analyst for a medical CRM. Identify subtle behavioral patterns from patient interactions. Be specific and actionable.',
          },
          { role: 'user', content: prompt },
        ],
        temperature: this.config.llmTemperature,
        maxTokens: this.config.llmMaxTokens,
        jsonMode: true,
      });

      const llmPatterns = JSON.parse(response) as LLMPattern[];

      return llmPatterns
        .filter((p) => p.confidence >= this.config.minPatternConfidence)
        .map((p) => ({
          id: crypto.randomUUID(),
          subjectType,
          subjectId,
          patternType: p.type.startsWith('llm_') ? p.type : `llm_${p.type}`,
          patternDescription: p.description,
          confidence: p.confidence,
          supportingEventIds: events.slice(0, 10).map((e) => e.id),
          firstObservedAt: events[events.length - 1]?.occurredAt ?? new Date(),
          lastObservedAt: events[0]?.occurredAt ?? new Date(),
          occurrenceCount: 1,
          metadata: { reasoning: p.reasoning },
        }));
    } catch (error) {
      logger.warn({ error }, 'LLM pattern detection failed, continuing with rule-based only');
      return [];
    }
  }

  private async persistPatterns(patterns: BehavioralPattern[]): Promise<void> {
    for (const pattern of patterns) {
      await this.pool.query(
        `
        INSERT INTO behavioral_patterns (
          id, subject_type, subject_id, pattern_type, pattern_description,
          confidence, supporting_event_ids, first_observed_at, last_observed_at,
          occurrence_count, metadata
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
        ON CONFLICT (subject_type, subject_id, pattern_type)
        DO UPDATE SET
          pattern_description = EXCLUDED.pattern_description,
          confidence = EXCLUDED.confidence,
          supporting_event_ids = EXCLUDED.supporting_event_ids,
          last_observed_at = EXCLUDED.last_observed_at,
          occurrence_count = behavioral_patterns.occurrence_count + 1,
          metadata = EXCLUDED.metadata,
          updated_at = NOW()
        `,
        [
          pattern.id,
          pattern.subjectType,
          pattern.subjectId,
          pattern.patternType,
          pattern.patternDescription,
          pattern.confidence,
          pattern.supportingEventIds,
          pattern.firstObservedAt,
          pattern.lastObservedAt,
          pattern.occurrenceCount,
          JSON.stringify(pattern.metadata ?? {}),
        ]
      );
    }
  }

  private patternToInsight(pattern: BehavioralPattern): CognitiveInsight | null {
    switch (pattern.patternType) {
      case 'appointment_rescheduler':
        return {
          type: 'churn_risk',
          confidence: pattern.confidence * 0.6,
          description: 'Frequent rescheduling may indicate scheduling difficulties or hesitation.',
          recommendedAction: 'Offer flexible scheduling options or address potential concerns.',
          supportingEventIds: pattern.supportingEventIds,
        };

      case 'declining_engagement':
        return {
          type: 'engagement_drop',
          confidence: pattern.confidence,
          description: pattern.patternDescription,
          recommendedAction: 'Initiate re-engagement campaign with personalized offers.',
          supportingEventIds: pattern.supportingEventIds,
        };

      case 'high_engagement':
        return {
          type: 'referral_opportunity',
          confidence: pattern.confidence * 0.8,
          description: 'Highly engaged patient is a good candidate for referral program.',
          recommendedAction: 'Introduce referral incentives and loyalty benefits.',
          supportingEventIds: pattern.supportingEventIds,
        };

      case 'price_sensitive':
        return {
          type: 'upsell_opportunity',
          confidence: pattern.confidence * 0.5,
          description: 'Patient is price-conscious but engaged.',
          recommendedAction: 'Present value-focused packages and payment plans.',
          supportingEventIds: pattern.supportingEventIds,
        };

      default:
        if (pattern.patternType.startsWith('llm_')) {
          return {
            type: 'pattern_detected',
            confidence: pattern.confidence,
            description: pattern.patternDescription,
            recommendedAction: 'Review pattern and consider personalized approach.',
            supportingEventIds: pattern.supportingEventIds,
          };
        }
        return null;
    }
  }

  private async detectEngagementInsight(
    subjectType: SubjectType,
    subjectId: string
  ): Promise<CognitiveInsight | null> {
    interface EngagementRow {
      last_interaction: Date | null;
      recent_count: string;
      older_count: string;
    }

    // Check for reactivation candidate
    const result = await this.pool.query<EngagementRow>(
      `
      SELECT
        MAX(occurred_at) as last_interaction,
        COUNT(*) FILTER (WHERE occurred_at >= NOW() - INTERVAL '90 days') as recent_count,
        COUNT(*) FILTER (WHERE occurred_at < NOW() - INTERVAL '90 days') as older_count
      FROM episodic_events
      WHERE subject_type = $1 AND subject_id = $2 AND deleted_at IS NULL
      `,
      [subjectType, subjectId]
    );

    const row = result.rows[0];
    if (!row) return null;

    const lastInteraction = row.last_interaction;
    const recentCount = Number(row.recent_count);
    const olderCount = Number(row.older_count);

    // Check for dormant patient with history
    if (lastInteraction && olderCount > 3 && recentCount === 0) {
      const daysSinceInteraction = Math.floor(
        (Date.now() - lastInteraction.getTime()) / (1000 * 60 * 60 * 24)
      );

      if (daysSinceInteraction > 60) {
        return {
          type: 'reactivation_candidate',
          confidence: Math.min(0.5 + (daysSinceInteraction - 60) * 0.005, 0.95),
          description: `Patient was previously active (${olderCount} interactions) but hasn't engaged in ${daysSinceInteraction} days.`,
          recommendedAction:
            'Send personalized reactivation message with special offer or checkup reminder.',
        };
      }
    }

    // Check for positive momentum
    if (recentCount >= 3) {
      interface SentimentRow {
        positive: string;
        total: string;
      }

      const sentimentResult = await this.pool.query<SentimentRow>(
        `
        SELECT
          COUNT(*) FILTER (WHERE sentiment = 'positive') as positive,
          COUNT(*) as total
        FROM episodic_events
        WHERE subject_type = $1 AND subject_id = $2
          AND deleted_at IS NULL
          AND occurred_at >= NOW() - INTERVAL '30 days'
        `,
        [subjectType, subjectId]
      );

      const sentimentRow = sentimentResult.rows[0];
      const positiveRatio =
        sentimentRow && Number(sentimentRow.total) > 0
          ? Number(sentimentRow.positive) / Number(sentimentRow.total)
          : 0;

      if (positiveRatio >= 0.6) {
        return {
          type: 'positive_momentum',
          confidence: positiveRatio,
          description: 'Patient shows consistent positive engagement recently.',
          recommendedAction:
            'Capitalize on positive momentum with upgrade offers or additional services.',
        };
      }
    }

    return null;
  }

  private rowToEvent(row: Record<string, unknown>): EpisodicEvent {
    return {
      id: row.id as string,
      subjectType: row.subject_type as EpisodicEvent['subjectType'],
      subjectId: row.subject_id as string,
      eventType: row.event_type as string,
      eventCategory: row.event_category as EpisodicEvent['eventCategory'],
      sourceChannel: row.source_channel as EpisodicEvent['sourceChannel'],
      rawEventId: row.raw_event_id as string | undefined,
      summary: row.summary as string,
      keyEntities: Array.isArray(row.key_entities)
        ? (row.key_entities as EpisodicEvent['keyEntities'])
        : [],
      sentiment: row.sentiment as EpisodicEvent['sentiment'],
      intent: row.intent as string | undefined,
      occurredAt: row.occurred_at as Date,
      processedAt: row.processed_at as Date | undefined,
      metadata: row.metadata ? (row.metadata as Record<string, unknown>) : undefined,
    };
  }

  private rowToPattern(row: Record<string, unknown>): BehavioralPattern {
    return {
      id: row.id as string,
      subjectType: row.subject_type as BehavioralPattern['subjectType'],
      subjectId: row.subject_id as string,
      patternType: row.pattern_type as string,
      patternDescription: row.pattern_description as string,
      confidence: Number(row.confidence),
      supportingEventIds: Array.isArray(row.supporting_event_ids)
        ? (row.supporting_event_ids as string[])
        : [],
      firstObservedAt: row.first_observed_at as Date,
      lastObservedAt: row.last_observed_at as Date,
      occurrenceCount: typeof row.occurrence_count === 'number' ? row.occurrence_count : 1,
      metadata: row.metadata ? (row.metadata as Record<string, unknown>) : undefined,
    };
  }
}

// =============================================================================
// Factory Function
// =============================================================================

export function createPatternDetector(
  pool: Pool,
  openai?: IOpenAIClient,
  config?: Partial<CognitiveSystemConfig>
): PatternDetector {
  return new PatternDetector(pool, openai, config);
}

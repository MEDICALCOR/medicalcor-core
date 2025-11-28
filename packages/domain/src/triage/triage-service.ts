/**
 * Dental Triage Service - State-of-the-Art Implementation
 *
 * Routes leads and determines priority scheduling based on patient needs.
 * NOTE: This is NOT an emergency clinic. For life-threatening emergencies,
 * patients should call 112.
 *
 * Architecture Highlights:
 * - Discriminated unions for urgency levels
 * - Const assertions for exhaustive checking
 * - Immutable data structures
 * - Type-safe configuration
 *
 * @module domain/triage
 */

import {
  type UrgencyLevel,
  type RoutingRecommendation,
  type LeadChannel,
  createSymptomFlag,
} from '../types.js';

// Local type definition for LeadScore (aligned with @medicalcor/types)
export type LeadScore = 'HOT' | 'WARM' | 'COLD' | 'UNQUALIFIED';

// ============================================================================
// INTERFACES - Immutable by default
// ============================================================================

/**
 * Triage assessment result
 */
export interface TriageResult {
  readonly urgencyLevel: UrgencyLevel;
  readonly routingRecommendation: RoutingRecommendation;
  readonly medicalFlags: readonly string[];
  readonly suggestedOwner?: string;
  readonly prioritySchedulingRequested: boolean;
  readonly notes: string;
}

/**
 * Triage input data
 */
export interface TriageInput {
  readonly leadScore: LeadScore;
  readonly channel: LeadChannel;
  readonly messageContent: string;
  readonly procedureInterest?: readonly string[];
  readonly hasExistingRelationship: boolean;
  readonly previousAppointments?: number;
  readonly lastContactDays?: number;
}

/**
 * Triage configuration
 */
export interface TriageConfig {
  readonly priorityKeywords: readonly string[];
  readonly medicalEmergencyKeywords: readonly string[];
  readonly prioritySchedulingKeywords: readonly string[];
  readonly vipPhones?: readonly string[];
  readonly defaultOwners: Readonly<Record<string, string>>;
}

// ============================================================================
// DEFAULT CONFIGURATION - Frozen for immutability
// ============================================================================

const DEFAULT_CONFIG: TriageConfig = Object.freeze({
  // Keywords indicating patient discomfort requiring priority scheduling
  // NOTE: These are NOT medical emergencies - they indicate high purchase intent
  priorityKeywords: Object.freeze([
    'durere',
    'durere puternica',
    'umflatura',
    'urgent',
    'infectie',
    'abces',
    'febra',
    'nu pot manca',
    'nu pot dormi',
  ] as const),

  medicalEmergencyKeywords: Object.freeze([
    'accident',
    'cazut',
    'spart',
    'urgenta medicala',
    'nu respir bine',
  ] as const),

  prioritySchedulingKeywords: Object.freeze([
    'urgent',
    'cat mai repede',
    'imediat',
    'prioritar',
    'maine',
    'azi',
    'acum',
    'de urgenta',
    'cel mai devreme',
    'prima programare',
  ] as const),

  defaultOwners: Object.freeze({
    implants: 'dr-implant-team',
    general: 'reception-team',
    priority: 'scheduling-team',
  }),
});

// ============================================================================
// TRIAGE SERVICE
// ============================================================================

/**
 * TriageService - Intelligent lead routing and priority assessment
 *
 * Determines priority scheduling based on:
 * - Patient symptoms (pain, discomfort)
 * - Lead score and qualification
 * - Channel and relationship status
 * - Explicit scheduling requests
 *
 * @example
 * ```typescript
 * const service = new TriageService();
 *
 * const result = service.assess({
 *   leadScore: 'HOT',
 *   channel: 'whatsapp',
 *   messageContent: 'Am durere puternica, vreau programare urgent',
 *   procedureInterest: ['implant'],
 *   hasExistingRelationship: false,
 * });
 *
 * console.log(result.urgencyLevel); // 'high_priority'
 * console.log(result.routingRecommendation); // 'next_available_slot'
 * ```
 */
export class TriageService {
  private readonly config: TriageConfig;

  constructor(config?: Partial<TriageConfig>) {
    // Build base config without vipPhones
    const baseConfig = {
      priorityKeywords: Object.freeze(config?.priorityKeywords ?? DEFAULT_CONFIG.priorityKeywords),
      medicalEmergencyKeywords: Object.freeze(
        config?.medicalEmergencyKeywords ?? DEFAULT_CONFIG.medicalEmergencyKeywords
      ),
      prioritySchedulingKeywords: Object.freeze(
        config?.prioritySchedulingKeywords ?? DEFAULT_CONFIG.prioritySchedulingKeywords
      ),
      defaultOwners: Object.freeze({
        ...DEFAULT_CONFIG.defaultOwners,
        ...config?.defaultOwners,
      }),
    };

    // Conditionally add vipPhones only when defined (exactOptionalPropertyTypes compliance)
    this.config = config?.vipPhones
      ? Object.freeze({ ...baseConfig, vipPhones: Object.freeze(config.vipPhones) })
      : Object.freeze(baseConfig);
  }

  // ==========================================================================
  // ASSESSMENT
  // ==========================================================================

  /**
   * Perform triage assessment on a lead
   */
  assess(input: TriageInput): TriageResult {
    const {
      leadScore,
      channel,
      messageContent,
      procedureInterest,
      hasExistingRelationship,
      previousAppointments,
      lastContactDays,
    } = input;

    const lowerContent = messageContent.toLowerCase();
    const medicalFlags: string[] = [];
    let urgencyLevel: UrgencyLevel = 'normal';
    let prioritySchedulingRequested = false;

    // Check for medical emergency keywords - advise calling 112
    const hasEmergencyKeywords = this.config.medicalEmergencyKeywords.some((k) =>
      lowerContent.includes(k)
    );
    if (hasEmergencyKeywords) {
      medicalFlags.push('potential_emergency_refer_112');
    }

    // Check for priority keywords (pain/discomfort indicating high purchase intent)
    const prioritySymptoms = this.config.priorityKeywords.filter((k) => lowerContent.includes(k));
    if (prioritySymptoms.length > 0) {
      urgencyLevel = 'high_priority';
      prioritySchedulingRequested = true;
      medicalFlags.push('priority_scheduling_requested');
      medicalFlags.push(...prioritySymptoms.map((s) => createSymptomFlag(s)));
    }

    // Check for explicit priority scheduling request
    const hasSchedulingKeywords = this.config.prioritySchedulingKeywords.some((k) =>
      lowerContent.includes(k)
    );
    if (hasSchedulingKeywords && !prioritySchedulingRequested) {
      prioritySchedulingRequested = true;
      medicalFlags.push('priority_scheduling_requested');
      if (urgencyLevel === 'normal') {
        urgencyLevel = 'high';
      }
    }

    // Score-based urgency adjustment
    if (leadScore === 'HOT' && urgencyLevel === 'normal') {
      urgencyLevel = 'high';
    }

    // Existing patient priority
    if (hasExistingRelationship && previousAppointments && previousAppointments > 0) {
      medicalFlags.push('existing_patient');
      if (urgencyLevel === 'normal') {
        urgencyLevel = 'high';
      }
    }

    // Re-engagement priority
    if (lastContactDays && lastContactDays > 180) {
      medicalFlags.push('re_engagement_opportunity');
    }

    // Determine routing
    const routingRecommendation = this.determineRouting(
      urgencyLevel,
      leadScore,
      channel,
      prioritySchedulingRequested
    );

    // Determine owner
    const suggestedOwner = this.determineSuggestedOwner(procedureInterest, urgencyLevel);

    // Build notes (includes safety disclaimer)
    const notes = this.buildTriageNotes(
      input,
      medicalFlags,
      urgencyLevel,
      prioritySchedulingRequested
    );

    return Object.freeze({
      urgencyLevel,
      routingRecommendation,
      medicalFlags: Object.freeze(medicalFlags),
      suggestedOwner,
      prioritySchedulingRequested,
      notes,
    });
  }

  // ==========================================================================
  // VIP AND NOTIFICATION
  // ==========================================================================

  /**
   * Check if a phone is VIP
   */
  isVIP(phone: string): boolean {
    return this.config.vipPhones?.includes(phone) ?? false;
  }

  /**
   * Get notification contacts for priority cases
   * NOTE: These are for scheduling coordination, not medical escalation
   */
  getNotificationContacts(urgencyLevel: UrgencyLevel): readonly string[] {
    if (urgencyLevel === 'high_priority') {
      return Object.freeze(['scheduling-team', 'reception-lead']);
    }
    if (urgencyLevel === 'high') {
      return Object.freeze(['reception-team']);
    }
    return Object.freeze([]);
  }

  // ==========================================================================
  // PRIVATE METHODS
  // ==========================================================================

  /**
   * Determine routing based on urgency, score, and priority scheduling request
   */
  private determineRouting(
    urgencyLevel: UrgencyLevel,
    leadScore: LeadScore,
    channel: LeadChannel,
    prioritySchedulingRequested: boolean
  ): RoutingRecommendation {
    // High priority (pain/discomfort) gets next available slot during business hours
    if (urgencyLevel === 'high_priority') {
      return 'next_available_slot';
    }

    // Priority scheduling requested gets same_day routing even for WARM leads
    if (prioritySchedulingRequested && urgencyLevel !== 'low') {
      return 'same_day';
    }

    if (urgencyLevel === 'high' || leadScore === 'HOT') {
      return 'same_day';
    }

    if (leadScore === 'WARM' || channel === 'voice') {
      return 'next_business_day';
    }

    return 'nurture_sequence';
  }

  /**
   * Determine suggested owner based on procedure interest
   */
  private determineSuggestedOwner(
    procedureInterest?: readonly string[],
    urgencyLevel?: UrgencyLevel
  ): string {
    // Priority scheduling goes to scheduling team for fast appointment booking
    if (urgencyLevel === 'high_priority') {
      return this.config.defaultOwners.priority ?? 'scheduling-team';
    }

    if (procedureInterest?.some((p) => ['implant', 'all-on-x', 'All-on-X'].includes(p))) {
      return this.config.defaultOwners.implants ?? 'dr-implant-team';
    }

    return this.config.defaultOwners.general ?? 'reception-team';
  }

  /**
   * Build triage notes for CRM
   */
  private buildTriageNotes(
    input: TriageInput,
    medicalFlags: readonly string[],
    urgencyLevel: UrgencyLevel,
    prioritySchedulingRequested: boolean
  ): string {
    const parts: string[] = [];

    parts.push(`Priority: ${urgencyLevel.toUpperCase()}`);
    parts.push(`Lead Score: ${input.leadScore}`);
    parts.push(`Channel: ${input.channel}`);

    if (prioritySchedulingRequested) {
      parts.push('PRIORITY SCHEDULING REQUESTED');
    }

    if (input.procedureInterest?.length) {
      parts.push(`Procedures: ${input.procedureInterest.join(', ')}`);
    }

    if (medicalFlags.length > 0) {
      parts.push(`Flags: ${medicalFlags.join(', ')}`);
    }

    if (input.hasExistingRelationship) {
      parts.push(`Existing patient with ${input.previousAppointments ?? 0} previous appointments`);
    }

    // Add safety disclaimer for priority cases
    if (urgencyLevel === 'high_priority') {
      parts.push(
        'Note: Patient reported discomfort. Schedule priority appointment during business hours. ' +
          'Reminder: For life-threatening emergencies, advise calling 112.'
      );
    }

    return parts.join(' | ');
  }
}

// ============================================================================
// FACTORY FUNCTION
// ============================================================================

/**
 * Create a configured triage service
 *
 * @example
 * ```typescript
 * const service = createTriageService({
 *   vipPhones: ['+40721234567'],
 *   defaultOwners: {
 *     implants: 'implant-team',
 *     general: 'reception',
 *     priority: 'urgent-team',
 *   },
 * });
 * ```
 */
export function createTriageService(config?: Partial<TriageConfig>): TriageService {
  return new TriageService(config);
}

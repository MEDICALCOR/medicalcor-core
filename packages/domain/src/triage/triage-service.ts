import type { LeadScore, LeadChannel } from '@medicalcor/types';
import { createLogger } from '@medicalcor/core';

const logger = createLogger({ name: 'triage-service' });

/**
 * Dental Triage Service
 * Routes leads and determines priority scheduling based on patient needs
 * NOTE: This is NOT an emergency clinic. For life-threatening emergencies, patients should call 112.
 */

export interface TriageResult {
  urgencyLevel: 'high_priority' | 'high' | 'normal' | 'low';
  routingRecommendation:
    | 'next_available_slot'
    | 'same_day'
    | 'next_business_day'
    | 'nurture_sequence';
  medicalFlags: string[];
  suggestedOwner?: string;
  prioritySchedulingRequested: boolean;
  notes: string;
  /** Actual available slot if routing is next_available_slot or same_day */
  availableSlot?: {
    id: string;
    date: string;
    startTime: string;
    practitioner?: string;
  };
}

export interface TriageInput {
  leadScore: LeadScore;
  channel: LeadChannel;
  messageContent: string;
  procedureInterest?: string[];
  hasExistingRelationship: boolean;
  previousAppointments?: number;
  lastContactDays?: number;
}

export interface TriageConfig {
  priorityKeywords: string[];
  medicalEmergencyKeywords: string[];
  prioritySchedulingKeywords: string[];
  vipPhones?: string[];
  defaultOwners: Record<string, string>;
}

/**
 * Database client interface for loading triage rules
 */
export interface TriageConfigClient {
  query<T>(sql: string, params?: unknown[]): Promise<{ rows: T[] }>;
}

/**
 * Scheduling service interface for slot validation
 */
export interface SchedulingServiceInterface {
  getAvailableSlots(options: {
    procedureType?: string;
    preferredDates?: string[];
    limit?: number;
  }): Promise<
    Array<{
      id: string;
      date: string;
      startTime: string;
      practitioner?: string;
      procedureTypes: string[];
    }>
  >;
}

/**
 * Database row types for triage rules
 */
interface TriageRuleRow {
  rule_type: string;
  value: string;
}

interface TriageOwnerRow {
  owner_key: string;
  owner_value: string;
}

/**
 * Default configuration (fallback when database is not available)
 */
const DEFAULT_CONFIG: TriageConfig = {
  // Keywords indicating patient discomfort requiring priority scheduling
  // NOTE: These are NOT medical emergencies - they indicate high purchase intent
  priorityKeywords: [
    'durere',
    'durere puternica',
    'umflatura',
    'urgent',
    'infectie',
    'abces',
    'febra',
    'nu pot manca',
    'nu pot dormi',
  ],
  medicalEmergencyKeywords: ['accident', 'cazut', 'spart', 'urgenta medicala', 'nu respir bine'],
  prioritySchedulingKeywords: [
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
  ],
  defaultOwners: {
    implants: 'dr-implant-team',
    general: 'reception-team',
    priority: 'scheduling-team',
  },
};

export class TriageService {
  private config: TriageConfig;
  private configClient: TriageConfigClient | null = null;
  private schedulingService: SchedulingServiceInterface | null = null;
  private configLoaded = false;
  private configLoadPromise: Promise<void> | null = null;

  constructor(
    config?: Partial<TriageConfig>,
    options?: {
      configClient?: TriageConfigClient;
      schedulingService?: SchedulingServiceInterface;
    }
  ) {
    this.config = { ...DEFAULT_CONFIG, ...config };
    this.configClient = options?.configClient ?? null;
    this.schedulingService = options?.schedulingService ?? null;
  }

  /**
   * Load configuration from database (triage_rules table)
   * This allows runtime updates without code deployment
   */
  async loadConfigFromDatabase(): Promise<void> {
    if (!this.configClient) {
      return;
    }

    // Prevent concurrent loads
    if (this.configLoadPromise) {
      return this.configLoadPromise;
    }

    this.configLoadPromise = this._loadConfig();
    await this.configLoadPromise;
    this.configLoadPromise = null;
  }

  private async _loadConfig(): Promise<void> {
    if (!this.configClient) return;

    try {
      // Load rules from database
      const rulesResult = await this.configClient.query<TriageRuleRow>(
        `SELECT rule_type, value FROM triage_rules WHERE active = true ORDER BY priority DESC`
      );

      const priorityKeywords: string[] = [];
      const emergencyKeywords: string[] = [];
      const schedulingKeywords: string[] = [];
      const vipPhones: string[] = [];

      for (const row of rulesResult.rows) {
        switch (row.rule_type) {
          case 'priority_keyword':
            priorityKeywords.push(row.value);
            break;
          case 'emergency_keyword':
            emergencyKeywords.push(row.value);
            break;
          case 'scheduling_keyword':
            schedulingKeywords.push(row.value);
            break;
          case 'vip_phone':
            vipPhones.push(row.value);
            break;
        }
      }

      // Load owners from database
      const ownersResult = await this.configClient.query<TriageOwnerRow>(
        `SELECT owner_key, owner_value FROM triage_owners WHERE active = true`
      );

      const defaultOwners: Record<string, string> = {};
      for (const row of ownersResult.rows) {
        defaultOwners[row.owner_key] = row.owner_value;
      }

      // Update config only if we got data
      if (priorityKeywords.length > 0) {
        this.config.priorityKeywords = priorityKeywords;
      }
      if (emergencyKeywords.length > 0) {
        this.config.medicalEmergencyKeywords = emergencyKeywords;
      }
      if (schedulingKeywords.length > 0) {
        this.config.prioritySchedulingKeywords = schedulingKeywords;
      }
      if (vipPhones.length > 0) {
        this.config.vipPhones = vipPhones;
      }
      if (Object.keys(defaultOwners).length > 0) {
        this.config.defaultOwners = { ...this.config.defaultOwners, ...defaultOwners };
      }

      this.configLoaded = true;
    } catch {
      // Silently fall back to default config on error
      // In production, this should log to monitoring
    }
  }

  /**
   * Perform triage assessment on a lead
   * Determines priority scheduling based on patient needs and purchase intent
   */
  async assess(input: TriageInput): Promise<TriageResult> {
    // Ensure config is loaded from database
    if (!this.configLoaded && this.configClient) {
      await this.loadConfigFromDatabase();
    }

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
    let urgencyLevel: TriageResult['urgencyLevel'] = 'normal';
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
      medicalFlags.push(...prioritySymptoms.map((s) => `symptom:${s.replace(/\s+/g, '_')}`));
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
    let routingRecommendation = this.determineRouting(
      urgencyLevel,
      leadScore,
      channel,
      prioritySchedulingRequested
    );

    // CRITICAL: Validate slot availability for urgent routing
    let availableSlot: TriageResult['availableSlot'] | undefined;
    if (
      this.schedulingService &&
      (routingRecommendation === 'next_available_slot' || routingRecommendation === 'same_day')
    ) {
      availableSlot = await this.findAvailableSlot(routingRecommendation, procedureInterest);

      // If no slot available, downgrade routing recommendation
      if (!availableSlot) {
        medicalFlags.push('no_immediate_slot_available');
        if (routingRecommendation === 'next_available_slot') {
          routingRecommendation = 'same_day';
          // Try again for same_day
          availableSlot = await this.findAvailableSlot('same_day', procedureInterest);
          // If still no slot, downgrade to next_business_day
          if (!availableSlot) {
            routingRecommendation = 'next_business_day';
            availableSlot = await this.findAvailableSlot('next_business_day', procedureInterest);
          }
        } else if (routingRecommendation === 'same_day') {
          // Original was same_day, downgrade to next_business_day
          routingRecommendation = 'next_business_day';
          availableSlot = await this.findAvailableSlot('next_business_day', procedureInterest);
        }
      }
    }

    // Determine owner
    const suggestedOwner = this.determineSuggestedOwner(procedureInterest, urgencyLevel);

    // Build notes (includes safety disclaimer)
    const notes = this.buildTriageNotes(
      input,
      medicalFlags,
      urgencyLevel,
      prioritySchedulingRequested,
      availableSlot
    );

    // Build result with only defined optional properties (exactOptionalPropertyTypes compliance)
    const result: TriageResult = {
      urgencyLevel,
      routingRecommendation,
      medicalFlags,
      prioritySchedulingRequested,
      notes,
      // suggestedOwner is always defined since determineSuggestedOwner always returns a string
      suggestedOwner,
    };
    
    // Add availableSlot only if defined
    if (availableSlot !== undefined) {
      result.availableSlot = availableSlot;
    }
    
    return result;
  }

  /**
   * Synchronous assess method for backward compatibility
   * @deprecated Use async assess() method instead for slot validation
   */
  assessSync(input: TriageInput): Omit<TriageResult, 'availableSlot'> {
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
    let urgencyLevel: TriageResult['urgencyLevel'] = 'normal';
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
      medicalFlags.push(...prioritySymptoms.map((s) => `symptom:${s.replace(/\s+/g, '_')}`));
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

    return {
      urgencyLevel,
      routingRecommendation,
      medicalFlags,
      suggestedOwner,
      prioritySchedulingRequested,
      notes,
    };
  }

  /**
   * Find available slot based on routing recommendation
   */
  private async findAvailableSlot(
    routing: TriageResult['routingRecommendation'],
    procedureInterest?: string[]
  ): Promise<TriageResult['availableSlot'] | undefined> {
    if (!this.schedulingService) {
      return undefined;
    }

    const today = new Date();
    const preferredDates: string[] = [];

    switch (routing) {
      case 'next_available_slot':
        // Today only
        preferredDates.push(today.toISOString().split('T')[0]!);
        break;
      case 'same_day':
        // Today and tomorrow
        preferredDates.push(today.toISOString().split('T')[0]!);
        const tomorrow = new Date(today);
        tomorrow.setDate(tomorrow.getDate() + 1);
        preferredDates.push(tomorrow.toISOString().split('T')[0]!);
        break;
      case 'next_business_day':
        // Next 3 business days
        for (let i = 1; i <= 5; i++) {
          const date = new Date(today);
          date.setDate(date.getDate() + i);
          const dayOfWeek = date.getDay();
          // Skip weekends (0 = Sunday, 6 = Saturday)
          if (dayOfWeek !== 0 && dayOfWeek !== 6) {
            preferredDates.push(date.toISOString().split('T')[0]!);
            if (preferredDates.length >= 3) break;
          }
        }
        break;
      default:
        return undefined;
    }

    try {
      // Build options with only defined properties (exactOptionalPropertyTypes compliance)
      const options: { procedureType?: string; preferredDates?: string[]; limit?: number } = {
        preferredDates,
        limit: 1,
      };
      
      // Add procedureType only if first procedure is defined
      const firstProcedure = procedureInterest?.[0];
      if (firstProcedure !== undefined) {
        options.procedureType = firstProcedure;
      }
      
      const slots = await this.schedulingService.getAvailableSlots(options);

      if (slots.length > 0 && slots[0]) {
        // Build slot result with only defined optional properties
        const slotResult: { id: string; date: string; startTime: string; practitioner?: string } = {
          id: slots[0].id,
          date: slots[0].date,
          startTime: slots[0].startTime,
        };
        
        // Add practitioner only if defined
        if (slots[0].practitioner !== undefined) {
          slotResult.practitioner = slots[0].practitioner;
        }
        
        return slotResult;
      }
    } catch (error) {
      // Slot validation is enhancement, not requirement
      logger.debug({ err: error }, 'Failed to find available slot during triage');
    }

    return undefined;
  }

  /**
   * Determine routing based on urgency, score, and priority scheduling request
   * Priority scheduling routes to next available slot during business hours
   */
  private determineRouting(
    urgencyLevel: TriageResult['urgencyLevel'],
    leadScore: LeadScore,
    channel: LeadChannel,
    prioritySchedulingRequested: boolean
  ): TriageResult['routingRecommendation'] {
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
    procedureInterest?: string[],
    urgencyLevel?: TriageResult['urgencyLevel']
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
   * Includes safety disclaimer for priority cases
   */
  private buildTriageNotes(
    input: TriageInput,
    medicalFlags: string[],
    urgencyLevel: TriageResult['urgencyLevel'],
    prioritySchedulingRequested: boolean,
    availableSlot?: TriageResult['availableSlot']
  ): string {
    const parts: string[] = [];

    parts.push(`Priority: ${urgencyLevel.toUpperCase()}`);
    parts.push(`Lead Score: ${input.leadScore}`);
    parts.push(`Channel: ${input.channel}`);

    if (prioritySchedulingRequested) {
      parts.push('PRIORITY SCHEDULING REQUESTED');
    }

    if (availableSlot) {
      parts.push(`Available Slot: ${availableSlot.date} ${availableSlot.startTime}`);
      if (availableSlot.practitioner) {
        parts.push(`Practitioner: ${availableSlot.practitioner}`);
      }
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
  getNotificationContacts(urgencyLevel: TriageResult['urgencyLevel']): string[] {
    if (urgencyLevel === 'high_priority') {
      return ['scheduling-team', 'reception-lead'];
    }
    if (urgencyLevel === 'high') {
      return ['reception-team'];
    }
    return [];
  }

  /**
   * Get current configuration (for debugging/admin)
   */
  getConfig(): Readonly<TriageConfig> {
    return this.config;
  }

  /**
   * Force reload configuration from database
   */
  async reloadConfig(): Promise<void> {
    this.configLoaded = false;
    await this.loadConfigFromDatabase();
  }
}

/**
 * Create a configured triage service
 */
export function createTriageService(
  config?: Partial<TriageConfig>,
  options?: {
    configClient?: TriageConfigClient;
    schedulingService?: SchedulingServiceInterface;
  }
): TriageService {
  return new TriageService(config, options);
}

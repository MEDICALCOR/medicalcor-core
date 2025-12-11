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
  // eslint-disable-next-line @typescript-eslint/no-unnecessary-type-parameters -- T is needed for caller to specify expected row type
  query<T extends object>(sql: string, params?: unknown[]): Promise<{ rows: T[] }>;
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
    {
      id: string;
      date: string;
      startTime: string;
      practitioner?: string;
      procedureTypes: string[];
    }[]
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
 * Categorized rules loaded from database
 */
interface CategorizedRules {
  priorityKeywords: string[];
  emergencyKeywords: string[];
  schedulingKeywords: string[];
  vipPhones: string[];
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

/**
 * Intermediate result from urgency detection phase
 */
interface UrgencyDetectionResult {
  urgencyLevel: TriageResult['urgencyLevel'];
  medicalFlags: string[];
  prioritySchedulingRequested: boolean;
}

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
      const rules = await this.loadRulesFromDatabase();
      const owners = await this.loadOwnersFromDatabase();

      this.applyLoadedRules(rules);
      this.applyLoadedOwners(owners);

      this.configLoaded = true;
    } catch (error) {
      logger.warn({ error }, 'Failed to load triage config from database - using default config');
    }
  }

  /**
   * Load and categorize rules from database
   */
  private async loadRulesFromDatabase(): Promise<CategorizedRules> {
    const result = await this.configClient!.query<TriageRuleRow>(
      `SELECT rule_type, value FROM triage_rules WHERE active = true ORDER BY priority DESC`
    );

    const rules: CategorizedRules = {
      priorityKeywords: [],
      emergencyKeywords: [],
      schedulingKeywords: [],
      vipPhones: [],
    };

    const ruleTypeToCategory: Record<string, keyof CategorizedRules> = {
      priority_keyword: 'priorityKeywords',
      emergency_keyword: 'emergencyKeywords',
      scheduling_keyword: 'schedulingKeywords',
      vip_phone: 'vipPhones',
    };

    for (const row of result.rows) {
      const category = ruleTypeToCategory[row.rule_type];
      if (category) {
        rules[category].push(row.value);
      }
    }

    return rules;
  }

  /**
   * Load owners mapping from database
   */
  private async loadOwnersFromDatabase(): Promise<Record<string, string>> {
    const result = await this.configClient!.query<TriageOwnerRow>(
      `SELECT owner_key, owner_value FROM triage_owners WHERE active = true`
    );

    const owners: Record<string, string> = {};
    for (const row of result.rows) {
      owners[row.owner_key] = row.owner_value;
    }
    return owners;
  }

  /**
   * Apply loaded rules to config (only if non-empty)
   */
  private applyLoadedRules(rules: CategorizedRules): void {
    if (rules.priorityKeywords.length > 0) {
      this.config.priorityKeywords = rules.priorityKeywords;
    }
    if (rules.emergencyKeywords.length > 0) {
      this.config.medicalEmergencyKeywords = rules.emergencyKeywords;
    }
    if (rules.schedulingKeywords.length > 0) {
      this.config.prioritySchedulingKeywords = rules.schedulingKeywords;
    }
    if (rules.vipPhones.length > 0) {
      this.config.vipPhones = rules.vipPhones;
    }
  }

  /**
   * Apply loaded owners to config (merge with defaults)
   */
  private applyLoadedOwners(owners: Record<string, string>): void {
    if (Object.keys(owners).length > 0) {
      this.config.defaultOwners = { ...this.config.defaultOwners, ...owners };
    }
  }

  /**
   * Detect urgency level and collect medical flags from message content
   * This is the shared logic used by both assess() and assessSync()
   */
  private detectUrgency(input: TriageInput): UrgencyDetectionResult {
    const {
      leadScore,
      messageContent,
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

    return { urgencyLevel, medicalFlags, prioritySchedulingRequested };
  }

  /**
   * Find available slot with fallback to less urgent routing if needed
   * Returns the slot and potentially downgraded routing recommendation
   */
  private async findSlotWithFallback(
    initialRouting: TriageResult['routingRecommendation'],
    procedureInterest?: string[],
    medicalFlags?: string[]
  ): Promise<{
    slot: TriageResult['availableSlot'] | undefined;
    routing: TriageResult['routingRecommendation'];
  }> {
    if (!this.schedulingService) {
      return { slot: undefined, routing: initialRouting };
    }

    // Only attempt slot validation for urgent routing
    if (initialRouting !== 'next_available_slot' && initialRouting !== 'same_day') {
      return { slot: undefined, routing: initialRouting };
    }

    // Define fallback chain: next_available_slot -> same_day -> next_business_day
    const fallbackChain: TriageResult['routingRecommendation'][] =
      initialRouting === 'next_available_slot'
        ? ['next_available_slot', 'same_day', 'next_business_day']
        : ['same_day', 'next_business_day'];

    for (const routing of fallbackChain) {
      const slot = await this.findAvailableSlot(routing, procedureInterest);
      if (slot) {
        return { slot, routing };
      }
    }

    // No slots found at any level, mark flag and use last fallback routing
    medicalFlags?.push('no_immediate_slot_available');
    return { slot: undefined, routing: 'next_business_day' };
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

    const { leadScore, channel, procedureInterest } = input;

    // Phase 1: Detect urgency and collect medical flags
    const { urgencyLevel, medicalFlags, prioritySchedulingRequested } = this.detectUrgency(input);

    // Phase 2: Determine initial routing
    const initialRouting = this.determineRouting(
      urgencyLevel,
      leadScore,
      channel,
      prioritySchedulingRequested
    );

    // Phase 3: Validate slot availability with fallback
    const { slot: availableSlot, routing: routingRecommendation } = await this.findSlotWithFallback(
      initialRouting,
      procedureInterest,
      medicalFlags
    );

    // Phase 4: Build result
    const suggestedOwner = this.determineSuggestedOwner(procedureInterest, urgencyLevel);
    const notes = this.buildTriageNotes(
      input,
      medicalFlags,
      urgencyLevel,
      prioritySchedulingRequested,
      availableSlot
    );

    const result: TriageResult = {
      urgencyLevel,
      routingRecommendation,
      medicalFlags,
      prioritySchedulingRequested,
      notes,
      suggestedOwner,
    };

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
    const { leadScore, channel, procedureInterest } = input;

    // Phase 1: Detect urgency and collect medical flags
    const { urgencyLevel, medicalFlags, prioritySchedulingRequested } = this.detectUrgency(input);

    // Phase 2: Determine routing (no slot validation in sync version)
    const routingRecommendation = this.determineRouting(
      urgencyLevel,
      leadScore,
      channel,
      prioritySchedulingRequested
    );

    // Phase 3: Build result
    const suggestedOwner = this.determineSuggestedOwner(procedureInterest, urgencyLevel);
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
      case 'next_available_slot': {
        // Today only
        const todayStr = today.toISOString().split('T')[0] ?? '';
        preferredDates.push(todayStr);
        break;
      }
      case 'same_day': {
        // Today and tomorrow
        const todayStr = today.toISOString().split('T')[0] ?? '';
        preferredDates.push(todayStr);
        const tomorrow = new Date(today);
        tomorrow.setDate(tomorrow.getDate() + 1);
        const tomorrowStr = tomorrow.toISOString().split('T')[0] ?? '';
        preferredDates.push(tomorrowStr);
        break;
      }
      case 'next_business_day': {
        // Next 3 business days
        for (let i = 1; i <= 5; i++) {
          const date = new Date(today);
          date.setDate(date.getDate() + i);
          const dayOfWeek = date.getDay();
          // Skip weekends (0 = Sunday, 6 = Saturday)
          if (dayOfWeek !== 0 && dayOfWeek !== 6) {
            const dateStr = date.toISOString().split('T')[0] ?? '';
            preferredDates.push(dateStr);
            if (preferredDates.length >= 3) break;
          }
        }
        break;
      }
      case 'nurture_sequence':
        // No slot needed for nurture sequence
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

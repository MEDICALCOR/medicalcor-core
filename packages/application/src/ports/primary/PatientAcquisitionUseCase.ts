/**
 * @fileoverview Primary Port - PatientAcquisitionUseCase
 *
 * Defines what the application offers for patient acquisition operations (driving side).
 * This is a hexagonal architecture PRIMARY PORT for the complete lead-to-patient journey.
 *
 * @module application/ports/primary/PatientAcquisitionUseCase
 *
 * HEXAGONAL ARCHITECTURE PRINCIPLE:
 * Primary ports define the use cases that the application exposes to driving adapters
 * (REST API, CLI, webhooks). They orchestrate domain services and coordinate with
 * secondary ports (repositories, CRM gateways, messaging).
 *
 * BUSINESS CONTEXT:
 * Patient acquisition covers the entire funnel from initial lead capture through
 * conversion to active patient. This includes lead registration, qualification,
 * nurturing, scheduling, and final conversion.
 *
 * HIPAA/GDPR COMPLIANCE:
 * All operations involving patient data are audited. Consent is verified before
 * any outbound communication. PII is handled according to data minimization.
 */

import type { Result } from '../../shared/Result.js';
import type { DomainError } from '../../shared/DomainError.js';
import type { SecurityContext } from '../../security/SecurityContext.js';
import type { LeadClassification, LeadChannel, ScoringMethod } from './LeadScoringUseCase.js';

/**
 * Lead status in the acquisition pipeline
 */
export type LeadStatus =
  | 'new'
  | 'contacted'
  | 'qualified'
  | 'nurturing'
  | 'scheduled'
  | 'converted'
  | 'lost';

/**
 * Reason for losing a lead
 */
export type LostReason =
  | 'no_response'
  | 'competitor'
  | 'price'
  | 'timing'
  | 'not_qualified'
  | 'invalid_contact'
  | 'duplicate'
  | 'other';

/**
 * Patient demographics (PII - handle with care)
 */
export interface PatientDemographics {
  /** First name */
  readonly firstName?: string;

  /** Last name */
  readonly lastName?: string;

  /** Date of birth */
  readonly dateOfBirth?: Date;

  /** Gender */
  readonly gender?: 'male' | 'female' | 'other' | 'prefer_not_to_say';

  /** City */
  readonly city?: string;

  /** County/Region */
  readonly county?: string;
}

/**
 * Medical context gathered from conversation
 */
export interface MedicalContext {
  /** Primary symptoms or concerns */
  readonly primarySymptoms?: readonly string[];

  /** Duration of symptoms */
  readonly symptomDuration?: string;

  /** Urgency level */
  readonly urgencyLevel?: 'emergency' | 'urgent' | 'routine' | 'preventive';

  /** Preferred medical specialty */
  readonly preferredSpecialty?: string;

  /** Insurance status */
  readonly hasInsurance?: boolean;

  /** Insurance provider */
  readonly insuranceProvider?: string;

  /** Previous treatments */
  readonly previousTreatments?: readonly string[];

  /** Known allergies */
  readonly allergies?: readonly string[];

  /** Current medications */
  readonly currentMedications?: readonly string[];
}

/**
 * Consent record for GDPR compliance
 */
export interface ConsentRecord {
  /** Consent type */
  readonly type: 'marketing' | 'sms' | 'email' | 'voice' | 'data_processing';

  /** Whether consent was granted */
  readonly granted: boolean;

  /** When consent was recorded */
  readonly grantedAt: Date;

  /** How consent was obtained */
  readonly source: 'explicit' | 'implicit' | 'form' | 'verbal';

  /** Consent expiry date (2 years from grant per GDPR) */
  readonly expiresAt: Date;
}

/**
 * Input for registering a new lead
 */
export interface RegisterLeadInput {
  /** Phone number in E.164 format */
  readonly phone: string;

  /** Email address */
  readonly email?: string;

  /** Acquisition channel */
  readonly channel: LeadChannel;

  /** Initial message content */
  readonly initialMessage?: string;

  /** Patient demographics */
  readonly demographics?: PatientDemographics;

  /** Medical context */
  readonly medicalContext?: MedicalContext;

  /** HubSpot contact ID (if pre-existing) */
  readonly hubspotContactId?: string;

  /** UTM parameters for attribution */
  readonly utm?: {
    readonly source?: string;
    readonly medium?: string;
    readonly campaign?: string;
    readonly term?: string;
    readonly content?: string;
  };

  /** Initial consent records */
  readonly consents?: readonly ConsentRecord[];

  /** Correlation ID for tracing */
  readonly correlationId: string;

  /** Idempotency key */
  readonly idempotencyKey?: string;
}

/**
 * Output from lead registration
 */
export interface RegisterLeadOutput {
  /** Assigned lead ID */
  readonly leadId: string;

  /** Lead status */
  readonly status: LeadStatus;

  /** Whether this was an existing lead (deduplication) */
  readonly wasExisting: boolean;

  /** HubSpot contact ID (created or existing) */
  readonly hubspotContactId?: string;

  /** Initial score (if auto-scoring enabled) */
  readonly initialScore?: {
    readonly score: number;
    readonly classification: LeadClassification;
  };

  /** Registration timestamp */
  readonly registeredAt: Date;
}

/**
 * Input for qualifying a lead
 */
export interface QualifyLeadInput {
  /** Lead identifier */
  readonly leadId: string;

  /** Qualification score (1-5) */
  readonly score: number;

  /** Classification */
  readonly classification: LeadClassification;

  /** Scoring method used */
  readonly method: ScoringMethod;

  /** AI reasoning */
  readonly reasoning?: string;

  /** Procedures of interest */
  readonly procedureInterest?: readonly string[];

  /** Assigned agent ID */
  readonly assignedAgentId?: string;

  /** Correlation ID */
  readonly correlationId: string;
}

/**
 * Output from lead qualification
 */
export interface QualifyLeadOutput {
  /** Lead identifier */
  readonly leadId: string;

  /** Previous status */
  readonly previousStatus: LeadStatus;

  /** New status */
  readonly newStatus: LeadStatus;

  /** Previous classification */
  readonly previousClassification?: LeadClassification;

  /** New classification */
  readonly newClassification: LeadClassification;

  /** Whether CRM was updated */
  readonly crmSynced: boolean;

  /** Assigned agent ID */
  readonly assignedAgentId?: string;

  /** Qualification timestamp */
  readonly qualifiedAt: Date;
}

/**
 * Input for converting a lead to patient
 */
export interface ConvertToPatientInput {
  /** Lead identifier */
  readonly leadId: string;

  /** Treatment plan ID (if created) */
  readonly treatmentPlanId?: string;

  /** First appointment date */
  readonly firstAppointmentDate?: Date;

  /** Assigned doctor ID */
  readonly assignedDoctorId?: string;

  /** Conversion notes */
  readonly notes?: string;

  /** Correlation ID */
  readonly correlationId: string;
}

/**
 * Output from lead conversion
 */
export interface ConvertToPatientOutput {
  /** Lead identifier */
  readonly leadId: string;

  /** Patient identifier (may differ from leadId) */
  readonly patientId: string;

  /** HubSpot deal ID (if created) */
  readonly hubspotDealId?: string;

  /** Whether CRM was updated */
  readonly crmSynced: boolean;

  /** Conversion timestamp */
  readonly convertedAt: Date;
}

/**
 * Input for marking a lead as lost
 */
export interface MarkLeadLostInput {
  /** Lead identifier */
  readonly leadId: string;

  /** Reason for loss */
  readonly reason: LostReason;

  /** Additional notes */
  readonly notes?: string;

  /** Competitor name (if applicable) */
  readonly competitorName?: string;

  /** Whether to move to nurturing instead of fully lost */
  readonly moveToNurturing?: boolean;

  /** Correlation ID */
  readonly correlationId: string;
}

/**
 * Output from marking lead as lost
 */
export interface MarkLeadLostOutput {
  /** Lead identifier */
  readonly leadId: string;

  /** Final status */
  readonly status: LeadStatus;

  /** Whether CRM was updated */
  readonly crmSynced: boolean;

  /** Whether moved to nurturing sequence */
  readonly inNurturing: boolean;

  /** Marked lost timestamp */
  readonly markedAt: Date;
}

/**
 * Input for assigning an agent to a lead
 */
export interface AssignAgentInput {
  /** Lead identifier */
  readonly leadId: string;

  /** Agent identifier */
  readonly agentId: string;

  /** Assignment reason */
  readonly reason?: 'manual' | 'round_robin' | 'skill_match' | 'language' | 'availability';

  /** Priority level */
  readonly priority?: 'critical' | 'high' | 'medium' | 'low';

  /** Assignment notes */
  readonly notes?: string;

  /** Correlation ID */
  readonly correlationId: string;
}

/**
 * Output from agent assignment
 */
export interface AssignAgentOutput {
  /** Lead identifier */
  readonly leadId: string;

  /** Assigned agent ID */
  readonly agentId: string;

  /** Previous agent ID (if reassignment) */
  readonly previousAgentId?: string;

  /** Assignment timestamp */
  readonly assignedAt: Date;
}

/**
 * Lead summary for dashboard display
 */
export interface LeadSummary {
  /** Lead identifier */
  readonly leadId: string;

  /** Phone (masked for display) */
  readonly phoneMasked: string;

  /** Full name (if available) */
  readonly fullName?: string;

  /** Current status */
  readonly status: LeadStatus;

  /** Current classification */
  readonly classification?: LeadClassification;

  /** Current score */
  readonly score?: number;

  /** Acquisition channel */
  readonly channel: LeadChannel;

  /** Assigned agent */
  readonly assignedAgentId?: string;

  /** Last contact timestamp */
  readonly lastContactAt?: Date;

  /** Created timestamp */
  readonly createdAt: Date;
}

/**
 * Query criteria for listing leads
 */
export interface ListLeadsQuery {
  /** Filter by status */
  readonly status?: LeadStatus | readonly LeadStatus[];

  /** Filter by classification */
  readonly classification?: LeadClassification | readonly LeadClassification[];

  /** Filter by channel */
  readonly channel?: LeadChannel | readonly LeadChannel[];

  /** Filter by assigned agent */
  readonly assignedAgentId?: string;

  /** Filter by minimum score */
  readonly minScore?: number;

  /** Filter by date range (created) */
  readonly createdAfter?: Date;
  readonly createdBefore?: Date;

  /** Search term (phone, name, email) */
  readonly searchTerm?: string;

  /** Page size */
  readonly limit?: number;

  /** Page offset */
  readonly offset?: number;

  /** Sort field */
  readonly orderBy?: 'createdAt' | 'score' | 'lastContactAt' | 'status';

  /** Sort direction */
  readonly orderDirection?: 'asc' | 'desc';
}

/**
 * Paginated list of leads
 */
export interface LeadListOutput {
  /** Lead summaries */
  readonly leads: readonly LeadSummary[];

  /** Total count (for pagination) */
  readonly total: number;

  /** Current page offset */
  readonly offset: number;

  /** Page size */
  readonly limit: number;

  /** Whether more results exist */
  readonly hasMore: boolean;
}

/**
 * Pipeline statistics for dashboard
 */
export interface PipelineStats {
  /** Count by status */
  readonly byStatus: {
    readonly new: number;
    readonly contacted: number;
    readonly qualified: number;
    readonly nurturing: number;
    readonly scheduled: number;
    readonly converted: number;
    readonly lost: number;
  };

  /** Count by classification */
  readonly byClassification: {
    readonly hot: number;
    readonly warm: number;
    readonly cold: number;
    readonly unqualified: number;
  };

  /** Conversion rate */
  readonly conversionRate: number;

  /** Average time to qualify (hours) */
  readonly avgTimeToQualify: number;

  /** Average time to convert (hours) */
  readonly avgTimeToConvert: number;

  /** Period start */
  readonly periodStart: Date;

  /** Period end */
  readonly periodEnd: Date;
}

/**
 * PRIMARY PORT: Patient Acquisition Use Case
 *
 * Defines the contract for the complete lead-to-patient journey.
 * Driving adapters (REST API, webhooks, CLI) use this port to manage
 * the patient acquisition pipeline.
 *
 * @example
 * ```typescript
 * // REST API adapter implementing this port
 * class PatientAcquisitionController {
 *   constructor(private useCase: PatientAcquisitionUseCase) {}
 *
 *   async registerFromWhatsApp(req: FastifyRequest): Promise<FastifyReply> {
 *     const context = this.createSecurityContext(req);
 *     const result = await this.useCase.registerLead({
 *       phone: req.body.from,
 *       channel: 'whatsapp',
 *       initialMessage: req.body.text,
 *       correlationId: req.id,
 *     }, context);
 *
 *     if (isOk(result)) {
 *       return reply.status(201).send(result.value);
 *     }
 *     return reply.status(400).send(result.error.toClientJSON());
 *   }
 * }
 * ```
 */
export interface PatientAcquisitionUseCase {
  /**
   * Register a new lead in the system
   *
   * Creates or updates a lead record, syncs with HubSpot CRM,
   * and optionally triggers auto-scoring.
   *
   * @param input - Lead registration input
   * @param context - Security context for authorization and audit
   * @returns Result with registration output or domain error
   *
   * @throws Never - errors are returned as Result.Err
   */
  registerLead(
    input: RegisterLeadInput,
    context: SecurityContext
  ): Promise<Result<RegisterLeadOutput, DomainError>>;

  /**
   * Qualify a lead based on scoring
   *
   * Updates lead status and classification, syncs with CRM,
   * and triggers appropriate follow-up workflows.
   *
   * @param input - Qualification input
   * @param context - Security context
   * @returns Result with qualification output or domain error
   */
  qualifyLead(
    input: QualifyLeadInput,
    context: SecurityContext
  ): Promise<Result<QualifyLeadOutput, DomainError>>;

  /**
   * Convert a qualified lead to a patient
   *
   * Final step in acquisition funnel. Creates patient record,
   * optionally creates HubSpot deal, and triggers onboarding.
   *
   * @param input - Conversion input
   * @param context - Security context
   * @returns Result with conversion output or domain error
   */
  convertToPatient(
    input: ConvertToPatientInput,
    context: SecurityContext
  ): Promise<Result<ConvertToPatientOutput, DomainError>>;

  /**
   * Mark a lead as lost
   *
   * Records loss reason, optionally moves to nurturing,
   * and updates CRM accordingly.
   *
   * @param input - Lost marking input
   * @param context - Security context
   * @returns Result with lost output or domain error
   */
  markLeadLost(
    input: MarkLeadLostInput,
    context: SecurityContext
  ): Promise<Result<MarkLeadLostOutput, DomainError>>;

  /**
   * Assign an agent to a lead
   *
   * Supports manual assignment, round-robin, and skill-based routing.
   *
   * @param input - Assignment input
   * @param context - Security context
   * @returns Result with assignment output or domain error
   */
  assignAgent(
    input: AssignAgentInput,
    context: SecurityContext
  ): Promise<Result<AssignAgentOutput, DomainError>>;

  /**
   * Get a lead by ID
   *
   * Retrieves full lead details for display or processing.
   *
   * @param leadId - Lead identifier
   * @param context - Security context
   * @returns Result with lead summary or domain error
   */
  getLead(leadId: string, context: SecurityContext): Promise<Result<LeadSummary, DomainError>>;

  /**
   * List leads with filtering and pagination
   *
   * Used for dashboard displays and lead management.
   *
   * @param query - Query criteria
   * @param context - Security context
   * @returns Result with paginated lead list or domain error
   */
  listLeads(
    query: ListLeadsQuery,
    context: SecurityContext
  ): Promise<Result<LeadListOutput, DomainError>>;

  /**
   * Get pipeline statistics
   *
   * Returns aggregate metrics for dashboard and reporting.
   *
   * @param fromDate - Period start date
   * @param toDate - Period end date
   * @param context - Security context
   * @returns Result with pipeline stats or domain error
   */
  getPipelineStats(
    fromDate: Date,
    toDate: Date,
    context: SecurityContext
  ): Promise<Result<PipelineStats, DomainError>>;

  /**
   * Record consent for a lead
   *
   * GDPR requirement - tracks consent for various communication types.
   *
   * @param leadId - Lead identifier
   * @param consent - Consent record
   * @param context - Security context
   * @returns Result with success boolean or domain error
   */
  recordConsent(
    leadId: string,
    consent: ConsentRecord,
    context: SecurityContext
  ): Promise<Result<boolean, DomainError>>;

  /**
   * Check if lead has valid consent
   *
   * Verifies consent before outbound communication.
   *
   * @param leadId - Lead identifier
   * @param consentType - Type of consent to check
   * @param context - Security context
   * @returns Result with boolean or domain error
   */
  hasValidConsent(
    leadId: string,
    consentType: ConsentRecord['type'],
    context: SecurityContext
  ): Promise<Result<boolean, DomainError>>;

  /**
   * Sync lead with CRM
   *
   * Forces synchronization with HubSpot CRM.
   * Useful after manual updates or conflict resolution.
   *
   * @param leadId - Lead identifier
   * @param context - Security context
   * @returns Result with success boolean or domain error
   */
  syncWithCrm(leadId: string, context: SecurityContext): Promise<Result<boolean, DomainError>>;
}

/**
 * Configuration for PatientAcquisitionUseCase implementation
 */
export interface PatientAcquisitionUseCaseConfig {
  /** HubSpot access token */
  readonly hubspotAccessToken: string;

  /** Enable auto-scoring on registration */
  readonly autoScoreOnRegister?: boolean;

  /** Enable CRM sync */
  readonly crmSyncEnabled?: boolean;

  /** Lead deduplication window (hours) */
  readonly deduplicationWindowHours?: number;

  /** Default consent expiry (days) */
  readonly consentExpiryDays?: number;

  /** Enable round-robin agent assignment */
  readonly roundRobinEnabled?: boolean;
}

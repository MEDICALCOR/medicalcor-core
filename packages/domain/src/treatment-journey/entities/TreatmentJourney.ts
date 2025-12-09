/**
 * @fileoverview Treatment Journey Entity
 *
 * The orchestrating aggregate root for the complete patient treatment journey
 * from first contact through final prosthetic delivery and follow-up.
 *
 * This is the CORE of what makes this platform indispensable - it tracks
 * every touchpoint, milestone, and outcome in the patient's dental journey.
 *
 * @module domain/treatment-journey/entities/TreatmentJourney
 */

// ============================================================================
// TYPES
// ============================================================================

/**
 * Journey phases representing major stages in dental treatment
 */
export type JourneyPhase =
  | 'INQUIRY' // Initial contact, lead qualification
  | 'CONSULTATION' // First visit, examination, diagnosis
  | 'PLANNING' // Treatment planning, imaging, cost estimation
  | 'PRE_TREATMENT' // Preparations (extractions, bone grafting, etc.)
  | 'SURGICAL' // Implant placement, major procedures
  | 'HEALING' // Osseointegration, recovery period
  | 'PROSTHETIC' // Design, fabrication, delivery
  | 'ADJUSTMENT' // Try-in, adjustments, refinements
  | 'COMPLETION' // Final delivery, patient satisfaction
  | 'MAINTENANCE'; // Follow-up, hygiene, monitoring

/**
 * Milestone types that mark significant progress
 */
export type MilestoneType =
  // Inquiry phase
  | 'FIRST_CONTACT'
  | 'LEAD_QUALIFIED'
  // Consultation phase
  | 'CONSULTATION_SCHEDULED'
  | 'CONSULTATION_COMPLETED'
  | 'DIAGNOSIS_COMPLETE'
  // Planning phase
  | 'CBCT_SCAN_COMPLETED'
  | 'TREATMENT_PLAN_PRESENTED'
  | 'TREATMENT_PLAN_ACCEPTED'
  | 'FINANCING_APPROVED'
  | 'INFORMED_CONSENT_SIGNED'
  // Pre-treatment phase
  | 'PRE_OP_CLEARANCE'
  | 'EXTRACTIONS_COMPLETED'
  | 'BONE_GRAFT_COMPLETED'
  | 'SINUS_LIFT_COMPLETED'
  // Surgical phase
  | 'SURGERY_SCHEDULED'
  | 'IMPLANTS_PLACED'
  | 'IMMEDIATE_LOAD_DELIVERED'
  // Healing phase
  | 'HEALING_CHECKUP_1'
  | 'HEALING_CHECKUP_2'
  | 'OSSEOINTEGRATION_CONFIRMED'
  // Prosthetic phase
  | 'IMPRESSION_TAKEN'
  | 'SCAN_SENT_TO_LAB'
  | 'DESIGN_RECEIVED'
  | 'DESIGN_APPROVED'
  | 'FABRICATION_COMPLETE'
  // Adjustment phase
  | 'TRY_IN_SCHEDULED'
  | 'TRY_IN_COMPLETED'
  | 'ADJUSTMENTS_REQUESTED'
  | 'ADJUSTMENTS_COMPLETED'
  // Completion phase
  | 'FINAL_DELIVERY'
  | 'PATIENT_SATISFACTION_RECORDED'
  | 'WARRANTY_REGISTERED'
  // Maintenance phase
  | 'MAINTENANCE_SCHEDULED'
  | 'ANNUAL_CHECKUP';

/**
 * Status of the overall journey
 */
export type JourneyStatus =
  | 'ACTIVE' // In progress
  | 'PAUSED' // Temporarily on hold
  | 'COMPLETED' // Successfully finished
  | 'ABANDONED' // Patient dropped out
  | 'CANCELLED'; // Cancelled by clinic/patient

/**
 * Milestone record
 */
export interface JourneyMilestone {
  readonly id: string;
  readonly type: MilestoneType;
  readonly phase: JourneyPhase;
  readonly scheduledAt?: Date;
  readonly completedAt?: Date;
  readonly completedBy?: string;
  readonly notes?: string;
  readonly linkedEntityType?: 'APPOINTMENT' | 'LAB_CASE' | 'INVOICE' | 'DOCUMENT';
  readonly linkedEntityId?: string;
  readonly metadata?: Record<string, unknown>;
}

/**
 * Communication record
 */
export interface JourneyCommunication {
  readonly id: string;
  readonly timestamp: Date;
  readonly channel: 'WHATSAPP' | 'SMS' | 'EMAIL' | 'PHONE' | 'IN_PERSON' | 'PORTAL';
  readonly direction: 'INBOUND' | 'OUTBOUND';
  readonly summary: string;
  readonly sentiment?: 'POSITIVE' | 'NEUTRAL' | 'NEGATIVE';
  readonly agentId?: string;
  readonly linkedMilestoneId?: string;
}

/**
 * Outcome measurement
 */
export interface JourneyOutcome {
  readonly id: string;
  readonly type:
    | 'CLINICAL_SUCCESS'
    | 'PATIENT_SATISFACTION'
    | 'FUNCTIONAL_OUTCOME'
    | 'AESTHETIC_OUTCOME'
    | 'COMPLICATION';
  readonly measurementDate: Date;
  readonly score?: number; // 1-10 or percentage
  readonly description: string;
  readonly measuredBy: string;
  readonly photos?: readonly string[];
}

/**
 * Risk flag during journey
 */
export interface JourneyRiskFlag {
  readonly id: string;
  readonly type:
    | 'DROPOUT_RISK'
    | 'CLINICAL_RISK'
    | 'FINANCIAL_RISK'
    | 'COMMUNICATION_GAP'
    | 'DELAYED_MILESTONE'
    | 'PATIENT_CONCERN';
  readonly severity: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';
  readonly raisedAt: Date;
  readonly resolvedAt?: Date;
  readonly description: string;
  readonly mitigationAction?: string;
}

/**
 * Financial tracking
 */
export interface JourneyFinancials {
  readonly totalEstimate: number;
  readonly totalPaid: number;
  readonly outstandingBalance: number;
  readonly currency: string;
  readonly paymentPlanActive: boolean;
  readonly financingProvider?: string;
  readonly nextPaymentDue?: Date;
  readonly nextPaymentAmount?: number;
}

/**
 * Treatment Journey - The Orchestrating Aggregate Root
 *
 * Tracks the complete patient journey through:
 * - Every phase from inquiry to maintenance
 * - All milestones and their completion status
 * - Communication history across all channels
 * - Clinical outcomes and patient satisfaction
 * - Risk flags and early warning indicators
 * - Financial status and payment tracking
 */
export interface TreatmentJourney {
  // Identity
  readonly id: string;
  readonly journeyNumber: string; // Human-readable (e.g., 'TJ-2024-001234')
  readonly patientId: string;
  readonly clinicId: string;

  // Classification
  readonly treatmentType:
    | 'SINGLE_IMPLANT'
    | 'MULTIPLE_IMPLANTS'
    | 'ALL_ON_4'
    | 'ALL_ON_6'
    | 'ALL_ON_X'
    | 'FULL_MOUTH_REHAB'
    | 'PROSTHETIC_ONLY'
    | 'GENERAL_TREATMENT';
  readonly complexity: 'SIMPLE' | 'MODERATE' | 'COMPLEX' | 'HIGHLY_COMPLEX';

  // Current state
  readonly status: JourneyStatus;
  readonly currentPhase: JourneyPhase;
  readonly progressPercent: number; // 0-100

  // Milestones
  readonly milestones: readonly JourneyMilestone[];
  readonly nextMilestone?: MilestoneType;
  readonly overdueMilestones: readonly string[]; // milestone IDs

  // Linked entities
  readonly allOnXCaseId?: string;
  readonly labCaseIds: readonly string[];
  readonly appointmentIds: readonly string[];
  readonly invoiceIds: readonly string[];

  // Team
  readonly primaryDentistId: string;
  readonly surgeonId?: string;
  readonly prosthodontistId?: string;
  readonly labTechnicianId?: string;
  readonly patientCoordinatorId?: string;

  // Communications
  readonly communications: readonly JourneyCommunication[];
  readonly preferredChannel: 'WHATSAPP' | 'SMS' | 'EMAIL' | 'PHONE';
  readonly lastContactAt?: Date;
  readonly daysSinceLastContact: number;

  // Outcomes
  readonly outcomes: readonly JourneyOutcome[];
  readonly predictedSuccessRate?: number; // 0-100%
  readonly patientSatisfactionScore?: number; // 1-10

  // Risk management
  readonly riskFlags: readonly JourneyRiskFlag[];
  readonly activeRiskCount: number;
  readonly riskLevel: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';

  // Financials
  readonly financials: JourneyFinancials;

  // Timeline
  readonly startDate: Date;
  readonly estimatedCompletionDate: Date;
  readonly actualCompletionDate?: Date;
  readonly totalDurationDays?: number;

  // Metadata
  readonly createdAt: Date;
  readonly updatedAt: Date;
  readonly version: number;
  readonly notes?: string;
}

// ============================================================================
// INPUT TYPES
// ============================================================================

export interface CreateTreatmentJourneyInput {
  readonly patientId: string;
  readonly clinicId: string;
  readonly treatmentType: TreatmentJourney['treatmentType'];
  readonly complexity?: TreatmentJourney['complexity'];
  readonly primaryDentistId: string;
  readonly surgeonId?: string;
  readonly prosthodontistId?: string;
  readonly estimatedCompletionDate: Date;
  readonly financialEstimate: number;
  readonly currency?: string;
  readonly preferredChannel?: TreatmentJourney['preferredChannel'];
  readonly allOnXCaseId?: string;
}

// ============================================================================
// FACTORY FUNCTIONS
// ============================================================================

let journeyCounter = 0;

export function generateJourneyNumber(): string {
  const year = new Date().getFullYear();
  journeyCounter++;
  const sequence = String(journeyCounter).padStart(6, '0');
  return `TJ-${year}-${sequence}`;
}

export function createTreatmentJourney(
  input: CreateTreatmentJourneyInput,
  createdBy: string
): TreatmentJourney {
  const now = new Date();
  const id = crypto.randomUUID();

  const initialMilestone: JourneyMilestone = {
    id: crypto.randomUUID(),
    type: 'FIRST_CONTACT',
    phase: 'INQUIRY',
    completedAt: now,
    completedBy: createdBy,
    notes: 'Journey initiated',
  };

  return {
    id,
    journeyNumber: generateJourneyNumber(),
    patientId: input.patientId,
    clinicId: input.clinicId,
    treatmentType: input.treatmentType,
    complexity: input.complexity ?? 'MODERATE',
    status: 'ACTIVE',
    currentPhase: 'INQUIRY',
    progressPercent: 5,
    milestones: [initialMilestone],
    nextMilestone: 'LEAD_QUALIFIED',
    overdueMilestones: [],
    allOnXCaseId: input.allOnXCaseId,
    labCaseIds: [],
    appointmentIds: [],
    invoiceIds: [],
    primaryDentistId: input.primaryDentistId,
    surgeonId: input.surgeonId,
    prosthodontistId: input.prosthodontistId,
    communications: [],
    preferredChannel: input.preferredChannel ?? 'WHATSAPP',
    daysSinceLastContact: 0,
    outcomes: [],
    riskFlags: [],
    activeRiskCount: 0,
    riskLevel: 'LOW',
    financials: {
      totalEstimate: input.financialEstimate,
      totalPaid: 0,
      outstandingBalance: input.financialEstimate,
      currency: input.currency ?? 'RON',
      paymentPlanActive: false,
    },
    startDate: now,
    estimatedCompletionDate: input.estimatedCompletionDate,
    createdAt: now,
    updatedAt: now,
    version: 1,
  };
}

// ============================================================================
// PHASE TRANSITIONS
// ============================================================================

const PHASE_ORDER: readonly JourneyPhase[] = [
  'INQUIRY',
  'CONSULTATION',
  'PLANNING',
  'PRE_TREATMENT',
  'SURGICAL',
  'HEALING',
  'PROSTHETIC',
  'ADJUSTMENT',
  'COMPLETION',
  'MAINTENANCE',
];

const PHASE_PROGRESS: Record<JourneyPhase, number> = {
  INQUIRY: 5,
  CONSULTATION: 15,
  PLANNING: 25,
  PRE_TREATMENT: 35,
  SURGICAL: 50,
  HEALING: 65,
  PROSTHETIC: 80,
  ADJUSTMENT: 90,
  COMPLETION: 100,
  MAINTENANCE: 100,
};

export function advanceToPhase(
  journey: TreatmentJourney,
  newPhase: JourneyPhase,
  _advancedBy: string
): TreatmentJourney {
  const currentIndex = PHASE_ORDER.indexOf(journey.currentPhase);
  const newIndex = PHASE_ORDER.indexOf(newPhase);

  if (newIndex <= currentIndex && newPhase !== 'MAINTENANCE') {
    throw new Error(`Cannot move backwards from ${journey.currentPhase} to ${newPhase}`);
  }

  const now = new Date();
  const isCompleted = newPhase === 'COMPLETION' || newPhase === 'MAINTENANCE';

  return {
    ...journey,
    currentPhase: newPhase,
    progressPercent: PHASE_PROGRESS[newPhase],
    status: isCompleted ? 'COMPLETED' : journey.status,
    actualCompletionDate: isCompleted ? now : journey.actualCompletionDate,
    totalDurationDays: isCompleted
      ? Math.ceil((now.getTime() - journey.startDate.getTime()) / (1000 * 60 * 60 * 24))
      : journey.totalDurationDays,
    updatedAt: now,
    version: journey.version + 1,
  };
}

// ============================================================================
// MILESTONE MANAGEMENT
// ============================================================================

const MILESTONE_TO_PHASE: Record<MilestoneType, JourneyPhase> = {
  FIRST_CONTACT: 'INQUIRY',
  LEAD_QUALIFIED: 'INQUIRY',
  CONSULTATION_SCHEDULED: 'CONSULTATION',
  CONSULTATION_COMPLETED: 'CONSULTATION',
  DIAGNOSIS_COMPLETE: 'CONSULTATION',
  CBCT_SCAN_COMPLETED: 'PLANNING',
  TREATMENT_PLAN_PRESENTED: 'PLANNING',
  TREATMENT_PLAN_ACCEPTED: 'PLANNING',
  FINANCING_APPROVED: 'PLANNING',
  INFORMED_CONSENT_SIGNED: 'PLANNING',
  PRE_OP_CLEARANCE: 'PRE_TREATMENT',
  EXTRACTIONS_COMPLETED: 'PRE_TREATMENT',
  BONE_GRAFT_COMPLETED: 'PRE_TREATMENT',
  SINUS_LIFT_COMPLETED: 'PRE_TREATMENT',
  SURGERY_SCHEDULED: 'SURGICAL',
  IMPLANTS_PLACED: 'SURGICAL',
  IMMEDIATE_LOAD_DELIVERED: 'SURGICAL',
  HEALING_CHECKUP_1: 'HEALING',
  HEALING_CHECKUP_2: 'HEALING',
  OSSEOINTEGRATION_CONFIRMED: 'HEALING',
  IMPRESSION_TAKEN: 'PROSTHETIC',
  SCAN_SENT_TO_LAB: 'PROSTHETIC',
  DESIGN_RECEIVED: 'PROSTHETIC',
  DESIGN_APPROVED: 'PROSTHETIC',
  FABRICATION_COMPLETE: 'PROSTHETIC',
  TRY_IN_SCHEDULED: 'ADJUSTMENT',
  TRY_IN_COMPLETED: 'ADJUSTMENT',
  ADJUSTMENTS_REQUESTED: 'ADJUSTMENT',
  ADJUSTMENTS_COMPLETED: 'ADJUSTMENT',
  FINAL_DELIVERY: 'COMPLETION',
  PATIENT_SATISFACTION_RECORDED: 'COMPLETION',
  WARRANTY_REGISTERED: 'COMPLETION',
  MAINTENANCE_SCHEDULED: 'MAINTENANCE',
  ANNUAL_CHECKUP: 'MAINTENANCE',
};

export function completeMilestone(
  journey: TreatmentJourney,
  milestoneType: MilestoneType,
  completedBy: string,
  options?: {
    notes?: string;
    linkedEntityType?: JourneyMilestone['linkedEntityType'];
    linkedEntityId?: string;
    metadata?: Record<string, unknown>;
  }
): TreatmentJourney {
  const now = new Date();
  const phase = MILESTONE_TO_PHASE[milestoneType];

  // Check if milestone already exists and is incomplete
  const existingIndex = journey.milestones.findIndex(
    (m) => m.type === milestoneType && !m.completedAt
  );

  let updatedMilestones: JourneyMilestone[];

  if (existingIndex >= 0) {
    // Complete existing milestone
    updatedMilestones = journey.milestones.map((m, i) =>
      i === existingIndex
        ? {
            ...m,
            completedAt: now,
            completedBy,
            notes: options?.notes ?? m.notes,
            linkedEntityType: options?.linkedEntityType ?? m.linkedEntityType,
            linkedEntityId: options?.linkedEntityId ?? m.linkedEntityId,
            metadata: options?.metadata ?? m.metadata,
          }
        : m
    );
  } else {
    // Create new completed milestone
    const newMilestone: JourneyMilestone = {
      id: crypto.randomUUID(),
      type: milestoneType,
      phase,
      completedAt: now,
      completedBy,
      notes: options?.notes,
      linkedEntityType: options?.linkedEntityType,
      linkedEntityId: options?.linkedEntityId,
      metadata: options?.metadata,
    };
    updatedMilestones = [...journey.milestones, newMilestone];
  }

  // Determine next milestone
  const nextMilestone = determineNextMilestone(journey.treatmentType, updatedMilestones);

  // Auto-advance phase if needed
  const phaseIndex = PHASE_ORDER.indexOf(phase);
  const currentPhaseIndex = PHASE_ORDER.indexOf(journey.currentPhase);
  const newPhase = phaseIndex > currentPhaseIndex ? phase : journey.currentPhase;

  return {
    ...journey,
    milestones: updatedMilestones,
    nextMilestone,
    currentPhase: newPhase,
    progressPercent: calculateProgress(updatedMilestones, journey.treatmentType),
    overdueMilestones: journey.overdueMilestones.filter(
      (id) => !updatedMilestones.find((m) => m.id === id && m.completedAt)
    ),
    updatedAt: now,
    version: journey.version + 1,
  };
}

export function scheduleMilestone(
  journey: TreatmentJourney,
  milestoneType: MilestoneType,
  scheduledAt: Date,
  options?: {
    notes?: string;
    linkedEntityType?: JourneyMilestone['linkedEntityType'];
    linkedEntityId?: string;
  }
): TreatmentJourney {
  const phase = MILESTONE_TO_PHASE[milestoneType];

  const newMilestone: JourneyMilestone = {
    id: crypto.randomUUID(),
    type: milestoneType,
    phase,
    scheduledAt,
    notes: options?.notes,
    linkedEntityType: options?.linkedEntityType,
    linkedEntityId: options?.linkedEntityId,
  };

  return {
    ...journey,
    milestones: [...journey.milestones, newMilestone],
    updatedAt: new Date(),
    version: journey.version + 1,
  };
}

function determineNextMilestone(
  treatmentType: TreatmentJourney['treatmentType'],
  completedMilestones: readonly JourneyMilestone[]
): MilestoneType | undefined {
  const completed = new Set(completedMilestones.filter((m) => m.completedAt).map((m) => m.type));

  // Standard milestone progression
  const standardProgression: MilestoneType[] = [
    'FIRST_CONTACT',
    'LEAD_QUALIFIED',
    'CONSULTATION_SCHEDULED',
    'CONSULTATION_COMPLETED',
    'DIAGNOSIS_COMPLETE',
    'CBCT_SCAN_COMPLETED',
    'TREATMENT_PLAN_PRESENTED',
    'TREATMENT_PLAN_ACCEPTED',
    'INFORMED_CONSENT_SIGNED',
  ];

  // Add implant-specific milestones for implant cases
  const implantTypes = [
    'SINGLE_IMPLANT',
    'MULTIPLE_IMPLANTS',
    'ALL_ON_4',
    'ALL_ON_6',
    'ALL_ON_X',
    'FULL_MOUTH_REHAB',
  ];
  if (implantTypes.includes(treatmentType)) {
    standardProgression.push(
      'PRE_OP_CLEARANCE',
      'SURGERY_SCHEDULED',
      'IMPLANTS_PLACED',
      'HEALING_CHECKUP_1',
      'OSSEOINTEGRATION_CONFIRMED'
    );
  }

  // Add prosthetic milestones
  standardProgression.push(
    'IMPRESSION_TAKEN',
    'SCAN_SENT_TO_LAB',
    'DESIGN_RECEIVED',
    'DESIGN_APPROVED',
    'FABRICATION_COMPLETE',
    'TRY_IN_SCHEDULED',
    'TRY_IN_COMPLETED',
    'FINAL_DELIVERY',
    'PATIENT_SATISFACTION_RECORDED'
  );

  // Find first uncompleted milestone
  for (const milestone of standardProgression) {
    if (!completed.has(milestone)) {
      return milestone;
    }
  }

  return undefined;
}

function calculateProgress(
  milestones: readonly JourneyMilestone[],
  treatmentType: TreatmentJourney['treatmentType']
): number {
  const completed = milestones.filter((m) => m.completedAt).length;

  // Estimate total milestones based on treatment type
  const totalEstimates: Record<TreatmentJourney['treatmentType'], number> = {
    SINGLE_IMPLANT: 20,
    MULTIPLE_IMPLANTS: 22,
    ALL_ON_4: 28,
    ALL_ON_6: 28,
    ALL_ON_X: 30,
    FULL_MOUTH_REHAB: 35,
    PROSTHETIC_ONLY: 15,
    GENERAL_TREATMENT: 12,
  };

  const total = totalEstimates[treatmentType];
  return Math.min(100, Math.round((completed / total) * 100));
}

// ============================================================================
// COMMUNICATION TRACKING
// ============================================================================

export function recordCommunication(
  journey: TreatmentJourney,
  communication: Omit<JourneyCommunication, 'id'>
): TreatmentJourney {
  const newComm: JourneyCommunication = {
    ...communication,
    id: crypto.randomUUID(),
  };

  const now = new Date();
  const daysSinceLastContact = 0; // Just communicated

  return {
    ...journey,
    communications: [...journey.communications, newComm],
    lastContactAt: now,
    daysSinceLastContact,
    updatedAt: now,
    version: journey.version + 1,
  };
}

// ============================================================================
// RISK MANAGEMENT
// ============================================================================

export function raiseRiskFlag(
  journey: TreatmentJourney,
  riskFlag: Omit<JourneyRiskFlag, 'id' | 'raisedAt'>
): TreatmentJourney {
  const now = new Date();
  const newFlag: JourneyRiskFlag = {
    ...riskFlag,
    id: crypto.randomUUID(),
    raisedAt: now,
  };

  const updatedFlags = [...journey.riskFlags, newFlag];
  const activeRisks = updatedFlags.filter((f) => !f.resolvedAt);
  const riskLevel = calculateRiskLevel(activeRisks);

  return {
    ...journey,
    riskFlags: updatedFlags,
    activeRiskCount: activeRisks.length,
    riskLevel,
    updatedAt: now,
    version: journey.version + 1,
  };
}

export function resolveRiskFlag(
  journey: TreatmentJourney,
  riskFlagId: string,
  mitigationAction: string
): TreatmentJourney {
  const now = new Date();
  const updatedFlags = journey.riskFlags.map((f) =>
    f.id === riskFlagId ? { ...f, resolvedAt: now, mitigationAction } : f
  );

  const activeRisks = updatedFlags.filter((f) => !f.resolvedAt);
  const riskLevel = calculateRiskLevel(activeRisks);

  return {
    ...journey,
    riskFlags: updatedFlags,
    activeRiskCount: activeRisks.length,
    riskLevel,
    updatedAt: now,
    version: journey.version + 1,
  };
}

function calculateRiskLevel(
  activeRisks: readonly JourneyRiskFlag[]
): TreatmentJourney['riskLevel'] {
  if (activeRisks.some((r) => r.severity === 'CRITICAL')) return 'CRITICAL';
  if (activeRisks.filter((r) => r.severity === 'HIGH').length >= 2) return 'CRITICAL';
  if (activeRisks.some((r) => r.severity === 'HIGH')) return 'HIGH';
  if (activeRisks.filter((r) => r.severity === 'MEDIUM').length >= 2) return 'HIGH';
  if (activeRisks.some((r) => r.severity === 'MEDIUM')) return 'MEDIUM';
  if (activeRisks.length > 0) return 'LOW';
  return 'LOW';
}

// ============================================================================
// OUTCOME TRACKING
// ============================================================================

export function recordOutcome(
  journey: TreatmentJourney,
  outcome: Omit<JourneyOutcome, 'id'>
): TreatmentJourney {
  const newOutcome: JourneyOutcome = {
    ...outcome,
    id: crypto.randomUUID(),
  };

  const updatedOutcomes = [...journey.outcomes, newOutcome];

  // Calculate patient satisfaction if this is a satisfaction outcome
  let patientSatisfactionScore = journey.patientSatisfactionScore;
  if (outcome.type === 'PATIENT_SATISFACTION' && outcome.score) {
    patientSatisfactionScore = outcome.score;
  }

  return {
    ...journey,
    outcomes: updatedOutcomes,
    patientSatisfactionScore,
    updatedAt: new Date(),
    version: journey.version + 1,
  };
}

// ============================================================================
// FINANCIAL TRACKING
// ============================================================================

export function updateFinancials(
  journey: TreatmentJourney,
  update: Partial<JourneyFinancials>
): TreatmentJourney {
  const updatedFinancials: JourneyFinancials = {
    ...journey.financials,
    ...update,
    outstandingBalance:
      (update.totalEstimate ?? journey.financials.totalEstimate) -
      (update.totalPaid ?? journey.financials.totalPaid),
  };

  return {
    ...journey,
    financials: updatedFinancials,
    updatedAt: new Date(),
    version: journey.version + 1,
  };
}

export function recordPayment(
  journey: TreatmentJourney,
  amount: number,
  invoiceId?: string
): TreatmentJourney {
  const newTotalPaid = journey.financials.totalPaid + amount;
  const newOutstanding = journey.financials.totalEstimate - newTotalPaid;

  const updatedInvoiceIds = invoiceId ? [...journey.invoiceIds, invoiceId] : journey.invoiceIds;

  return {
    ...journey,
    financials: {
      ...journey.financials,
      totalPaid: newTotalPaid,
      outstandingBalance: Math.max(0, newOutstanding),
    },
    invoiceIds: updatedInvoiceIds,
    updatedAt: new Date(),
    version: journey.version + 1,
  };
}

// ============================================================================
// ENTITY LINKING
// ============================================================================

export function linkLabCase(journey: TreatmentJourney, labCaseId: string): TreatmentJourney {
  if (journey.labCaseIds.includes(labCaseId)) return journey;

  return {
    ...journey,
    labCaseIds: [...journey.labCaseIds, labCaseId],
    updatedAt: new Date(),
    version: journey.version + 1,
  };
}

export function linkAppointment(
  journey: TreatmentJourney,
  appointmentId: string
): TreatmentJourney {
  if (journey.appointmentIds.includes(appointmentId)) return journey;

  return {
    ...journey,
    appointmentIds: [...journey.appointmentIds, appointmentId],
    updatedAt: new Date(),
    version: journey.version + 1,
  };
}

// ============================================================================
// QUERY HELPERS
// ============================================================================

export function isJourneyAtRisk(journey: TreatmentJourney): boolean {
  return journey.riskLevel === 'HIGH' || journey.riskLevel === 'CRITICAL';
}

export function hasOverdueMilestones(journey: TreatmentJourney): boolean {
  return journey.overdueMilestones.length > 0;
}

export function needsFollowUp(journey: TreatmentJourney, maxDaysSinceContact = 7): boolean {
  return journey.daysSinceLastContact > maxDaysSinceContact;
}

export function getCompletedMilestoneCount(journey: TreatmentJourney): number {
  return journey.milestones.filter((m) => m.completedAt).length;
}

export function getMilestonesByPhase(
  journey: TreatmentJourney,
  phase: JourneyPhase
): readonly JourneyMilestone[] {
  return journey.milestones.filter((m) => m.phase === phase);
}

export function getJourneySummary(journey: TreatmentJourney): string {
  const completed = getCompletedMilestoneCount(journey);
  const total = journey.milestones.length;
  return `${journey.journeyNumber}: ${journey.treatmentType} - ${journey.currentPhase} (${completed}/${total} milestones, ${journey.progressPercent}% complete)`;
}

/**
 * @fileoverview Disposition Code Entities
 *
 * M1 Production Fix: Disposition codes for call outcome tracking.
 * Provides comprehensive call outcome categorization.
 *
 * @module domain/disposition/entities/disposition-code
 */

// ============================================================================
// DISPOSITION CODE TYPES
// ============================================================================

/**
 * Disposition category
 */
export type DispositionCategory =
  | 'connected' // Customer was reached
  | 'not_connected' // Customer was not reached
  | 'follow_up' // Requires follow-up action
  | 'completed' // Call objective achieved
  | 'disqualified'; // Lead disqualified

/**
 * Call direction
 */
export type CallDirection = 'inbound' | 'outbound';

/**
 * Handler type
 */
export type HandlerType = 'ai' | 'human' | 'hybrid';

// ============================================================================
// DISPOSITION CODE ENTITY
// ============================================================================

/**
 * Disposition code definition
 */
export interface DispositionCode {
  /** Unique identifier */
  readonly id: string;

  /** Clinic ID (null for system-wide codes) */
  readonly clinicId: string | null;

  /** Short code (e.g., 'SOLD', 'NO_ANSWER') */
  readonly code: string;

  /** Human-readable name */
  readonly name: string;

  /** Description of the disposition */
  readonly description: string | null;

  /** Category for grouping */
  readonly category: DispositionCategory;

  /** Did this achieve the call objective? */
  readonly isPositiveOutcome: boolean;

  /** Should a follow-up task be created? */
  readonly requiresFollowUp: boolean;

  /** Days until follow-up (if applicable) */
  readonly followUpDays: number | null;

  /** Is this code currently active? */
  readonly isActive: boolean;

  /** Display order for UI */
  readonly displayOrder: number;

  // Audit
  readonly createdAt: Date;
  readonly updatedAt: Date;
}

// ============================================================================
// CALL DISPOSITION ENTITY
// ============================================================================

/**
 * Objection handled during call
 */
export interface ObjectionHandled {
  /** Objection code */
  code: string;
  /** How it was addressed */
  resolution: string | null;
  /** Was objection overcome? */
  overcome: boolean;
}

/**
 * Individual call disposition record
 */
export interface CallDisposition {
  /** Unique identifier */
  readonly id: string;

  /** Call SID from telephony provider */
  readonly callSid: string;

  /** Clinic ID */
  readonly clinicId: string;

  /** Lead ID (if applicable) */
  readonly leadId: string | null;

  /** Disposition code ID */
  readonly dispositionCodeId: string;

  /** Disposition code details (populated on read) */
  readonly dispositionCode?: DispositionCode;

  /** Optional sub-categorization */
  readonly subDisposition: string | null;

  /** Agent notes on why this disposition */
  readonly reason: string | null;

  /** Additional notes */
  readonly notes: string | null;

  // Call metadata
  /** Duration in seconds */
  readonly callDurationSeconds: number | null;

  /** Call direction */
  readonly callDirection: CallDirection | null;

  /** Call type (e.g., 'sales', 'support') */
  readonly callType: string | null;

  // Handler info
  /** Who handled the call */
  readonly handledByType: HandlerType;

  /** Human agent ID */
  readonly agentId: string | null;

  /** AI assistant ID */
  readonly assistantId: string | null;

  // Intent/Objections
  /** Objections handled during call */
  readonly objectionsHandled: ObjectionHandled[];

  /** AI-detected customer intent */
  readonly detectedIntent: string | null;

  /** Intent confidence score (0-1) */
  readonly intentConfidence: number | null;

  // Follow-up
  /** Is follow-up scheduled? */
  readonly followUpScheduled: boolean;

  /** Follow-up date */
  readonly followUpDate: Date | null;

  /** Follow-up notes */
  readonly followUpNotes: string | null;

  /** Additional metadata */
  readonly metadata: Record<string, unknown>;

  // Audit
  /** User who set the disposition */
  readonly setBy: string | null;

  /** When disposition was set */
  readonly setAt: Date;

  readonly createdAt: Date;
}

// ============================================================================
// FACTORY: CREATE CALL DISPOSITION
// ============================================================================

/**
 * Input for creating a call disposition
 */
export interface CreateCallDispositionInput {
  callSid: string;
  clinicId: string;
  leadId?: string;
  dispositionCodeId: string;
  subDisposition?: string;
  reason?: string;
  notes?: string;
  callDurationSeconds?: number;
  callDirection?: CallDirection;
  callType?: string;
  handledByType: HandlerType;
  agentId?: string;
  assistantId?: string;
  objectionsHandled?: ObjectionHandled[];
  detectedIntent?: string;
  intentConfidence?: number;
  followUpDate?: Date;
  followUpNotes?: string;
  setBy?: string;
  metadata?: Record<string, unknown>;
}

/**
 * Generate a UUID v4
 */
function generateUUID(): string {
  // Use crypto.randomUUID for secure ID generation
  return crypto.randomUUID();
}

/**
 * Create a new call disposition record
 */
export function createCallDisposition(input: CreateCallDispositionInput): CallDisposition {
  const now = new Date();

  return {
    id: generateUUID(),
    callSid: input.callSid,
    clinicId: input.clinicId,
    leadId: input.leadId ?? null,
    dispositionCodeId: input.dispositionCodeId,
    subDisposition: input.subDisposition ?? null,
    reason: input.reason ?? null,
    notes: input.notes ?? null,
    callDurationSeconds: input.callDurationSeconds ?? null,
    callDirection: input.callDirection ?? null,
    callType: input.callType ?? null,
    handledByType: input.handledByType,
    agentId: input.agentId ?? null,
    assistantId: input.assistantId ?? null,
    objectionsHandled: input.objectionsHandled ?? [],
    detectedIntent: input.detectedIntent ?? null,
    intentConfidence: input.intentConfidence ?? null,
    followUpScheduled: input.followUpDate !== undefined,
    followUpDate: input.followUpDate ?? null,
    followUpNotes: input.followUpNotes ?? null,
    metadata: input.metadata ?? {},
    setBy: input.setBy ?? null,
    setAt: now,
    createdAt: now,
  };
}

// ============================================================================
// STANDARD DISPOSITION CODES
// ============================================================================

/**
 * Standard disposition codes (matches database seed)
 */
export const STANDARD_DISPOSITION_CODES = {
  // Connected - Positive
  SOLD: 'SOLD',
  APPT_SCHEDULED: 'APPT_SCHEDULED',
  INTERESTED: 'INTERESTED',
  INFO_SENT: 'INFO_SENT',

  // Connected - Neutral
  CALLBACK_REQUESTED: 'CALLBACK_REQUESTED',
  DECISION_PENDING: 'DECISION_PENDING',
  PRICE_OBJECTION: 'PRICE_OBJECTION',

  // Connected - Negative
  NOT_INTERESTED: 'NOT_INTERESTED',
  COMPETITOR: 'COMPETITOR',
  NOT_QUALIFIED: 'NOT_QUALIFIED',
  DO_NOT_CALL: 'DO_NOT_CALL',

  // Not Connected
  NO_ANSWER: 'NO_ANSWER',
  BUSY: 'BUSY',
  VOICEMAIL: 'VOICEMAIL',
  WRONG_NUMBER: 'WRONG_NUMBER',
  DISCONNECTED: 'DISCONNECTED',
  INVALID_NUMBER: 'INVALID_NUMBER',

  // Technical/Other
  TRANSFERRED: 'TRANSFERRED',
  CALL_FAILED: 'CALL_FAILED',
  ABANDONED: 'ABANDONED',
} as const;

export type StandardDispositionCode = keyof typeof STANDARD_DISPOSITION_CODES;

/**
 * Map old call outcomes to disposition codes
 */
export function mapCallOutcomeToDisposition(
  outcome: 'completed' | 'transferred' | 'abandoned' | 'failed' | 'voicemail'
): StandardDispositionCode {
  switch (outcome) {
    case 'completed':
      return 'SOLD';
    case 'transferred':
      return 'TRANSFERRED';
    case 'abandoned':
      return 'ABANDONED';
    case 'failed':
      return 'CALL_FAILED';
    case 'voicemail':
      return 'VOICEMAIL';
    default: {
      // Exhaustive check - this should never happen
      const _exhaustiveCheck: never = outcome;
      return _exhaustiveCheck;
    }
  }
}

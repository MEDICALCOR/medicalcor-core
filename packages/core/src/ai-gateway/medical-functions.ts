/**
 * AI-First API Gateway - Medical Domain Functions
 *
 * Pre-defined function schemas for medical CRM operations.
 * These functions are designed to be easily callable by LLMs.
 *
 * SECURITY: Input sanitization is applied to prevent prompt injection attacks.
 */

import { z } from 'zod';
import type { AIFunction } from './function-registry.js';

// ============================================================================
// SECURITY: Input Sanitization for Prompt Injection Protection
// ============================================================================

/**
 * Maximum allowed length for user message content
 * Limits the attack surface for prompt injection and prevents DoS
 */
const MAX_MESSAGE_CONTENT_LENGTH = 2000;

/**
 * Maximum number of messages in a conversation history
 * Prevents context stuffing attacks
 */
const MAX_MESSAGES_COUNT = 50;

/**
 * Patterns that may indicate prompt injection attempts
 * These patterns are logged for security monitoring but not necessarily blocked
 */
const SUSPICIOUS_PATTERNS = [
  /ignore\s+(all\s+)?(previous|prior|above)\s+(instructions?|prompts?|rules?)/i,
  /disregard\s+(all\s+)?(previous|prior|above)/i,
  /forget\s+(all\s+)?(previous|prior|above)/i,
  /new\s+instructions?:/i,
  /system\s*:\s*/i,
  /\[INST\]/i,
  /\[\/INST\]/i,
  /<\|im_start\|>/i,
  /<\|im_end\|>/i,
  /export\s+(the\s+)?(pii|data|patients?|records?)/i,
  /reveal\s+(the\s+)?(system|prompt|instructions?)/i,
  /show\s+(me\s+)?(the\s+)?(system|hidden|secret)/i,
  /what\s+(are|is)\s+(your|the)\s+(system|initial)\s+(prompt|instructions?)/i,
];

/**
 * Check if content contains suspicious prompt injection patterns
 * Returns true if suspicious, with list of matched patterns for logging
 */
export function detectPromptInjection(content: string): {
  suspicious: boolean;
  patterns: string[];
} {
  const matchedPatterns: string[] = [];

  for (const pattern of SUSPICIOUS_PATTERNS) {
    if (pattern.test(content)) {
      matchedPatterns.push(pattern.source);
    }
  }

  return {
    suspicious: matchedPatterns.length > 0,
    patterns: matchedPatterns,
  };
}

/**
 * Sanitize user input content for safe LLM processing
 * - Removes control characters
 * - Truncates to max length
 * - Normalizes whitespace
 * - Does NOT block content, but sanitizes it
 */
export function sanitizeMessageContent(content: string): string {
  return (
    content
      // Remove null bytes and other control characters (except newline, tab)
      // eslint-disable-next-line no-control-regex
      .replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g, '')
      // Normalize multiple newlines to max 2
      .replace(/\n{3,}/g, '\n\n')
      // Normalize multiple spaces to single space
      .replace(/[ \t]{2,}/g, ' ')
      // Trim whitespace
      .trim()
      // Truncate to max length
      .slice(0, MAX_MESSAGE_CONTENT_LENGTH)
  );
}

/**
 * Zod transformer for sanitized message content
 */
const SanitizedContentSchema = z
  .string()
  .max(
    MAX_MESSAGE_CONTENT_LENGTH,
    `Message content must not exceed ${MAX_MESSAGE_CONTENT_LENGTH} characters`
  )
  .transform(sanitizeMessageContent);

/**
 * Message schema with sanitization
 */
const SanitizedMessageSchema = z.object({
  role: z.enum(['user', 'assistant']).describe('Message sender role'),
  content: SanitizedContentSchema.describe('Message content (sanitized)'),
  timestamp: z.string().datetime().optional().describe('Message timestamp'),
});

// ============================================================================
// LEAD MANAGEMENT FUNCTIONS
// ============================================================================

export const ScoreLeadInputSchema = z.object({
  phone: z.string().describe('Lead phone number in E.164 format'),
  channel: z
    .enum(['whatsapp', 'voice', 'web', 'referral'])
    .describe('Channel through which the lead was acquired'),
  // SECURITY: Messages are sanitized and limited to prevent prompt injection and DoS
  messages: z
    .array(SanitizedMessageSchema)
    .max(MAX_MESSAGES_COUNT, `Maximum ${MAX_MESSAGES_COUNT} messages allowed`)
    .optional()
    .describe('Conversation history with the lead (sanitized, max 50 messages)'),
  utmParams: z
    .object({
      source: z.string().max(256).optional(),
      medium: z.string().max(256).optional(),
      campaign: z.string().max(256).optional(),
      content: z.string().max(256).optional(),
      term: z.string().max(256).optional(),
    })
    .optional()
    .describe('UTM tracking parameters'),
  metadata: z.record(z.unknown()).optional().describe('Additional lead metadata'),
});

export const ScoreLeadFunction: AIFunction = {
  name: 'score_lead',
  description:
    'Analyze and score a lead based on conversation history, channel, and behavior. Returns classification (HOT/WARM/COLD/UNQUALIFIED), numeric score (0-100), and recommended next action.',
  parameters: {
    type: 'object',
    properties: {
      phone: {
        type: 'string',
        description: 'Lead phone number in E.164 format (e.g., +40721234567)',
        pattern: '^\\+[1-9]\\d{1,14}$',
      },
      channel: {
        type: 'string',
        description: 'Acquisition channel',
        enum: ['whatsapp', 'voice', 'web', 'referral'],
      },
      messages: {
        type: 'array',
        description: 'Conversation history with the lead',
        items: {
          type: 'object',
          description: 'A single message in the conversation',
          properties: {
            role: { type: 'string', description: 'Message sender', enum: ['user', 'assistant'] },
            content: { type: 'string', description: 'Message text' },
            timestamp: { type: 'string', description: 'ISO 8601 timestamp', format: 'date-time' },
          },
          required: ['role', 'content'],
        },
      },
      utmParams: {
        type: 'object',
        description: 'UTM tracking parameters for attribution',
        properties: {
          source: { type: 'string', description: 'Traffic source (e.g., google, facebook)' },
          medium: { type: 'string', description: 'Marketing medium (e.g., cpc, email)' },
          campaign: { type: 'string', description: 'Campaign name' },
          content: { type: 'string', description: 'Ad content identifier' },
          term: { type: 'string', description: 'Search term' },
        },
      },
      metadata: {
        type: 'object',
        description: 'Additional metadata about the lead',
      },
    },
    required: ['phone', 'channel'],
  },
  returns: {
    type: 'object',
    description: 'Scoring result with classification, score, confidence, and recommended action',
  },
  category: 'leads',
  examples: [
    {
      description: 'Score a WhatsApp lead asking about teeth whitening',
      input: {
        phone: '+40721234567',
        channel: 'whatsapp',
        messages: [
          { role: 'user', content: 'Bună, cât costă albirea dentară?' },
          { role: 'assistant', content: 'Bună! Albirea profesională costă între 500-800 RON.' },
          { role: 'user', content: 'Perfect, aș vrea să fac o programare săptămâna viitoare.' },
        ],
      },
      output: {
        classification: 'HOT',
        score: 85,
        confidence: 0.92,
        intent: 'booking_request',
        recommendedAction: 'schedule_appointment',
        reasoning: 'Lead expressed clear intent to book an appointment',
      },
    },
  ],
  rateLimit: { maxCalls: 100, windowMs: 60000 },
};

// ============================================================================
// PATIENT MANAGEMENT FUNCTIONS
// ============================================================================

export const GetPatientInputSchema = z.object({
  patientId: z.string().optional().describe('Patient unique identifier'),
  phone: z.string().optional().describe('Patient phone number'),
  email: z.string().email().optional().describe('Patient email address'),
});

export const GetPatientFunction: AIFunction = {
  name: 'get_patient',
  description:
    'Retrieve patient information by ID, phone, or email. Returns patient demographics, appointment history, and consent status.',
  parameters: {
    type: 'object',
    properties: {
      patientId: { type: 'string', description: 'Patient unique identifier (UUID)' },
      phone: {
        type: 'string',
        description: 'Patient phone number in E.164 format',
        pattern: '^\\+[1-9]\\d{1,14}$',
      },
      email: { type: 'string', description: 'Patient email address', format: 'email' },
    },
    required: [],
  },
  returns: {
    type: 'object',
    description: 'Patient record with demographics, appointments, and consent',
  },
  category: 'patients',
};

export const UpdatePatientInputSchema = z.object({
  patientId: z.string().describe('Patient unique identifier'),
  updates: z.object({
    firstName: z.string().optional(),
    lastName: z.string().optional(),
    email: z.string().email().optional(),
    phone: z.string().optional(),
    dateOfBirth: z.string().optional(),
    notes: z.string().optional(),
    tags: z.array(z.string()).optional(),
  }),
});

export const UpdatePatientFunction: AIFunction = {
  name: 'update_patient',
  description: 'Update patient information. Only provided fields will be updated.',
  parameters: {
    type: 'object',
    properties: {
      patientId: { type: 'string', description: 'Patient unique identifier' },
      updates: {
        type: 'object',
        description: 'Fields to update',
        properties: {
          firstName: { type: 'string', description: 'First name' },
          lastName: { type: 'string', description: 'Last name' },
          email: { type: 'string', description: 'Email address', format: 'email' },
          phone: { type: 'string', description: 'Phone number' },
          dateOfBirth: {
            type: 'string',
            description: 'Date of birth (YYYY-MM-DD)',
            format: 'date',
          },
          notes: { type: 'string', description: 'Clinical notes' },
          tags: {
            type: 'array',
            description: 'Patient tags for categorization',
            items: { type: 'string', description: 'Tag value' },
          },
        },
      },
    },
    required: ['patientId', 'updates'],
  },
  category: 'patients',
};

// ============================================================================
// APPOINTMENT FUNCTIONS
// ============================================================================

export const ScheduleAppointmentInputSchema = z.object({
  patientId: z.string().describe('Patient unique identifier'),
  doctorId: z.string().optional().describe('Preferred doctor ID'),
  serviceType: z.string().describe('Type of service/treatment'),
  preferredDate: z.string().describe('Preferred date (YYYY-MM-DD)'),
  preferredTimeSlot: z
    .enum(['morning', 'afternoon', 'evening', 'any'])
    .default('any')
    .describe('Preferred time of day'),
  duration: z.number().default(30).describe('Appointment duration in minutes'),
  notes: z.string().optional().describe('Additional notes for the appointment'),
  urgency: z
    .enum(['normal', 'urgent', 'emergency'])
    .default('normal')
    .describe('Appointment urgency level'),
});

export const ScheduleAppointmentFunction: AIFunction = {
  name: 'schedule_appointment',
  description:
    'Schedule a new appointment for a patient. Automatically finds available slots based on preferences.',
  parameters: {
    type: 'object',
    properties: {
      patientId: { type: 'string', description: 'Patient unique identifier' },
      doctorId: { type: 'string', description: 'Preferred doctor ID (optional)' },
      serviceType: {
        type: 'string',
        description: 'Service type (e.g., consultation, cleaning, whitening)',
      },
      preferredDate: { type: 'string', description: 'Preferred date', format: 'date' },
      preferredTimeSlot: {
        type: 'string',
        description: 'Preferred time of day',
        enum: ['morning', 'afternoon', 'evening', 'any'],
        default: 'any',
      },
      duration: {
        type: 'number',
        description: 'Appointment duration in minutes',
        default: 30,
        minimum: 15,
        maximum: 180,
      },
      notes: { type: 'string', description: 'Additional appointment notes' },
      urgency: {
        type: 'string',
        description: 'Urgency level',
        enum: ['normal', 'urgent', 'emergency'],
        default: 'normal',
      },
    },
    required: ['patientId', 'serviceType', 'preferredDate'],
  },
  returns: {
    type: 'object',
    description: 'Scheduled appointment details with confirmation',
  },
  category: 'appointments',
  examples: [
    {
      description: 'Schedule a dental cleaning',
      input: {
        patientId: '123e4567-e89b-12d3-a456-426614174000',
        serviceType: 'cleaning',
        preferredDate: '2024-12-15',
        preferredTimeSlot: 'morning',
      },
      output: {
        appointmentId: 'apt-456',
        status: 'confirmed',
        dateTime: '2024-12-15T10:00:00Z',
        doctor: { id: 'doc-1', name: 'Dr. Maria Popescu' },
        location: 'Cabinet 3',
      },
    },
  ],
};

export const GetAvailableSlotsInputSchema = z.object({
  startDate: z.string().describe('Start date for availability search'),
  endDate: z.string().describe('End date for availability search'),
  doctorId: z.string().optional().describe('Filter by specific doctor'),
  serviceType: z.string().optional().describe('Filter by service type'),
  duration: z.number().default(30).describe('Required slot duration in minutes'),
});

export const GetAvailableSlotsFunction: AIFunction = {
  name: 'get_available_slots',
  description:
    'Get available appointment slots within a date range. Can filter by doctor and service type.',
  parameters: {
    type: 'object',
    properties: {
      startDate: { type: 'string', description: 'Search start date', format: 'date' },
      endDate: { type: 'string', description: 'Search end date', format: 'date' },
      doctorId: { type: 'string', description: 'Filter by doctor ID' },
      serviceType: { type: 'string', description: 'Filter by service type' },
      duration: {
        type: 'number',
        description: 'Required slot duration in minutes',
        default: 30,
        minimum: 15,
      },
    },
    required: ['startDate', 'endDate'],
  },
  category: 'appointments',
};

export const CancelAppointmentInputSchema = z.object({
  appointmentId: z.string().describe('Appointment to cancel'),
  reason: z.string().optional().describe('Cancellation reason'),
  notifyPatient: z.boolean().default(true).describe('Send notification to patient'),
});

export const CancelAppointmentFunction: AIFunction = {
  name: 'cancel_appointment',
  description: 'Cancel an existing appointment with optional patient notification.',
  parameters: {
    type: 'object',
    properties: {
      appointmentId: { type: 'string', description: 'Appointment ID to cancel' },
      reason: { type: 'string', description: 'Reason for cancellation' },
      notifyPatient: {
        type: 'boolean',
        description: 'Whether to notify the patient',
        default: true,
      },
    },
    required: ['appointmentId'],
  },
  category: 'appointments',
};

// ============================================================================
// MESSAGING FUNCTIONS
// ============================================================================

export const SendWhatsAppInputSchema = z.object({
  to: z.string().describe('Recipient phone number in E.164 format'),
  message: z.string().describe('Message text to send'),
  templateName: z.string().optional().describe('WhatsApp template name (for template messages)'),
  templateParams: z.record(z.string()).optional().describe('Template parameter values'),
});

export const SendWhatsAppFunction: AIFunction = {
  name: 'send_whatsapp',
  description:
    'Send a WhatsApp message to a patient. Can send free-form messages or use pre-approved templates.',
  parameters: {
    type: 'object',
    properties: {
      to: {
        type: 'string',
        description: 'Recipient phone number in E.164 format',
        pattern: '^\\+[1-9]\\d{1,14}$',
      },
      message: { type: 'string', description: 'Message text (for non-template messages)' },
      templateName: {
        type: 'string',
        description: 'Pre-approved template name (e.g., appointment_reminder, welcome_message)',
      },
      templateParams: {
        type: 'object',
        description: 'Key-value pairs for template placeholders',
      },
    },
    required: ['to'],
  },
  category: 'messaging',
  examples: [
    {
      description: 'Send appointment reminder',
      input: {
        to: '+40721234567',
        templateName: 'appointment_reminder',
        templateParams: {
          patient_name: 'Ion',
          appointment_date: '15 Dec 2024',
          appointment_time: '10:00',
        },
      },
      output: { messageId: 'msg-123', status: 'sent', timestamp: '2024-12-14T09:00:00Z' },
    },
  ],
};

// ============================================================================
// CONSENT FUNCTIONS
// ============================================================================

export const RecordConsentInputSchema = z.object({
  patientId: z.string().describe('Patient identifier'),
  phone: z.string().describe('Patient phone number'),
  consentType: z
    .enum([
      'data_processing',
      'marketing_whatsapp',
      'marketing_email',
      'marketing_sms',
      'appointment_reminders',
      'treatment_updates',
      'third_party_sharing',
    ])
    .describe('Type of consent'),
  status: z.enum(['granted', 'denied', 'withdrawn']).describe('Consent status'),
  source: z.string().describe('Where consent was collected'),
  ipAddress: z.string().optional().describe('IP address for audit'),
});

export const RecordConsentFunction: AIFunction = {
  name: 'record_consent',
  description: 'Record patient consent for GDPR compliance. All consent changes are audited.',
  parameters: {
    type: 'object',
    properties: {
      patientId: { type: 'string', description: 'Patient unique identifier' },
      phone: {
        type: 'string',
        description: 'Patient phone number',
        pattern: '^\\+[1-9]\\d{1,14}$',
      },
      consentType: {
        type: 'string',
        description: 'Type of consent being recorded',
        enum: [
          'data_processing',
          'marketing_whatsapp',
          'marketing_email',
          'marketing_sms',
          'appointment_reminders',
          'treatment_updates',
          'third_party_sharing',
        ],
      },
      status: {
        type: 'string',
        description: 'Consent status',
        enum: ['granted', 'denied', 'withdrawn'],
      },
      source: {
        type: 'string',
        description: 'Consent collection source (e.g., whatsapp, web_form)',
      },
      ipAddress: { type: 'string', description: 'Client IP address for audit trail' },
    },
    required: ['patientId', 'phone', 'consentType', 'status', 'source'],
  },
  category: 'consent',
};

export const CheckConsentInputSchema = z.object({
  patientId: z.string().optional().describe('Patient identifier'),
  phone: z.string().optional().describe('Patient phone number'),
  consentTypes: z
    .array(
      z.enum([
        'data_processing',
        'marketing_whatsapp',
        'marketing_email',
        'marketing_sms',
        'appointment_reminders',
        'treatment_updates',
        'third_party_sharing',
      ])
    )
    .optional()
    .describe('Specific consent types to check'),
});

export const CheckConsentFunction: AIFunction = {
  name: 'check_consent',
  description: 'Check patient consent status for specific types or all types.',
  parameters: {
    type: 'object',
    properties: {
      patientId: { type: 'string', description: 'Patient unique identifier' },
      phone: { type: 'string', description: 'Patient phone number' },
      consentTypes: {
        type: 'array',
        description: 'Consent types to check (checks all if omitted)',
        items: {
          type: 'string',
          description: 'Consent type',
          enum: [
            'data_processing',
            'marketing_whatsapp',
            'marketing_email',
            'marketing_sms',
            'appointment_reminders',
            'treatment_updates',
            'third_party_sharing',
          ],
        },
      },
    },
    required: [],
  },
  category: 'consent',
};

// ============================================================================
// ANALYTICS FUNCTIONS
// ============================================================================

export const GetLeadAnalyticsInputSchema = z.object({
  startDate: z.string().describe('Analysis start date'),
  endDate: z.string().describe('Analysis end date'),
  groupBy: z
    .enum(['day', 'week', 'month', 'channel', 'classification'])
    .optional()
    .describe('Grouping dimension'),
  channel: z
    .enum(['whatsapp', 'voice', 'web', 'referral'])
    .optional()
    .describe('Filter by channel'),
});

export const GetLeadAnalyticsFunction: AIFunction = {
  name: 'get_lead_analytics',
  description:
    'Get lead analytics and conversion metrics for a date range. Includes counts, conversion rates, and trends.',
  parameters: {
    type: 'object',
    properties: {
      startDate: { type: 'string', description: 'Analysis start date', format: 'date' },
      endDate: { type: 'string', description: 'Analysis end date', format: 'date' },
      groupBy: {
        type: 'string',
        description: 'Group results by dimension',
        enum: ['day', 'week', 'month', 'channel', 'classification'],
      },
      channel: {
        type: 'string',
        description: 'Filter by acquisition channel',
        enum: ['whatsapp', 'voice', 'web', 'referral'],
      },
    },
    required: ['startDate', 'endDate'],
  },
  category: 'analytics',
};

// ============================================================================
// WORKFLOW FUNCTIONS
// ============================================================================

export const TriggerWorkflowInputSchema = z.object({
  workflow: z
    .enum(['lead-scoring', 'patient-journey', 'nurture-sequence', 'booking-agent'])
    .describe('Workflow to trigger'),
  payload: z.record(z.unknown()).describe('Workflow input payload'),
  priority: z.enum(['low', 'normal', 'high']).default('normal').describe('Execution priority'),
});

export const TriggerWorkflowFunction: AIFunction = {
  name: 'trigger_workflow',
  description:
    'Manually trigger a background workflow. Workflows run asynchronously via Trigger.dev.',
  parameters: {
    type: 'object',
    properties: {
      workflow: {
        type: 'string',
        description: 'Workflow identifier',
        enum: ['lead-scoring', 'patient-journey', 'nurture-sequence', 'booking-agent'],
      },
      payload: { type: 'object', description: 'Workflow-specific input data' },
      priority: {
        type: 'string',
        description: 'Execution priority',
        enum: ['low', 'normal', 'high'],
        default: 'normal',
      },
    },
    required: ['workflow', 'payload'],
  },
  category: 'workflows',
};

export const GetWorkflowStatusInputSchema = z.object({
  taskId: z.string().describe('Trigger.dev task ID'),
});

export const GetWorkflowStatusFunction: AIFunction = {
  name: 'get_workflow_status',
  description: 'Check the status of a running or completed workflow task.',
  parameters: {
    type: 'object',
    properties: {
      taskId: { type: 'string', description: 'Task ID returned from trigger_workflow' },
    },
    required: ['taskId'],
  },
  category: 'workflows',
};

// ============================================================================
// ALL FUNCTIONS EXPORT
// ============================================================================

export const ALL_MEDICAL_FUNCTIONS: AIFunction[] = [
  // Leads
  ScoreLeadFunction,
  // Patients
  GetPatientFunction,
  UpdatePatientFunction,
  // Appointments
  ScheduleAppointmentFunction,
  GetAvailableSlotsFunction,
  CancelAppointmentFunction,
  // Messaging
  SendWhatsAppFunction,
  // Consent
  RecordConsentFunction,
  CheckConsentFunction,
  // Analytics
  GetLeadAnalyticsFunction,
  // Workflows
  TriggerWorkflowFunction,
  GetWorkflowStatusFunction,
];

// Export all input schemas for validation
export const FUNCTION_INPUT_SCHEMAS = {
  score_lead: ScoreLeadInputSchema,
  get_patient: GetPatientInputSchema,
  update_patient: UpdatePatientInputSchema,
  schedule_appointment: ScheduleAppointmentInputSchema,
  get_available_slots: GetAvailableSlotsInputSchema,
  cancel_appointment: CancelAppointmentInputSchema,
  send_whatsapp: SendWhatsAppInputSchema,
  record_consent: RecordConsentInputSchema,
  check_consent: CheckConsentInputSchema,
  get_lead_analytics: GetLeadAnalyticsInputSchema,
  trigger_workflow: TriggerWorkflowInputSchema,
  get_workflow_status: GetWorkflowStatusInputSchema,
} as const;

/**
 * @fileoverview Zod Validation Schemas for Domain Services
 *
 * Comprehensive validation schemas for all domain inputs.
 * Provides runtime validation with detailed error messages.
 *
 * @module domain/shared/schemas
 */

import { z } from 'zod';

// ============================================================================
// COMMON SCHEMAS
// ============================================================================

/**
 * HubSpot contact ID schema
 */
export const ContactIdSchema = z
  .string()
  .min(1, 'Contact ID is required')
  .regex(/^\d+$/, 'Contact ID must be numeric');

/**
 * Phone number schema with international format support
 */
export const PhoneNumberSchema = z
  .string()
  .min(8, 'Phone number too short')
  .max(20, 'Phone number too long')
  .regex(/^\+?[\d\s-()]+$/, 'Invalid phone number format');

/**
 * Email address schema
 */
export const EmailSchema = z.string().email('Invalid email address');

/**
 * ISO date string schema
 */
export const ISODateStringSchema = z.string().datetime({ message: 'Invalid ISO date string' });

/**
 * Supported languages schema
 */
export const SupportedLanguageSchema = z.enum(['ro', 'en', 'de'], {
  errorMap: () => ({ message: 'Unsupported language. Use: ro, en, or de' }),
});

// ============================================================================
// CONSENT SCHEMAS
// ============================================================================

/**
 * Consent type schema
 */
export const ConsentTypeSchema = z.enum(
  [
    'data_processing',
    'marketing_whatsapp',
    'marketing_email',
    'marketing_sms',
    'appointment_reminders',
    'treatment_updates',
    'third_party_sharing',
  ],
  { errorMap: () => ({ message: 'Invalid consent type' }) }
);

/**
 * Consent status schema
 */
export const ConsentStatusSchema = z.enum(['granted', 'denied', 'withdrawn', 'pending'], {
  errorMap: () => ({ message: 'Invalid consent status' }),
});

/**
 * Consent source channel schema
 */
export const ConsentChannelSchema = z.enum(['whatsapp', 'web', 'phone', 'in_person', 'email'], {
  errorMap: () => ({ message: 'Invalid consent channel' }),
});

/**
 * Consent source method schema
 */
export const ConsentMethodSchema = z.enum(['explicit', 'implicit', 'double_opt_in'], {
  errorMap: () => ({ message: 'Invalid consent method' }),
});

/**
 * Consent source schema
 */
export const ConsentSourceSchema = z.object({
  channel: ConsentChannelSchema,
  method: ConsentMethodSchema,
  evidenceUrl: z.string().url().nullable(),
  witnessedBy: z.string().nullable(),
});

/**
 * Consent request schema
 */
export const ConsentRequestSchema = z.object({
  contactId: ContactIdSchema,
  phone: PhoneNumberSchema,
  consentType: ConsentTypeSchema,
  status: ConsentStatusSchema,
  source: ConsentSourceSchema,
  ipAddress: z.string().ip().optional(),
  userAgent: z.string().max(500).optional(),
  expiresInDays: z.number().int().positive().max(3650).optional(), // Max 10 years
  metadata: z.record(z.unknown()).optional(),
});

// ============================================================================
// SCORING SCHEMAS
// ============================================================================

/**
 * Lead channel schema
 */
export const LeadChannelSchema = z.enum(['whatsapp', 'web', 'voice', 'email'], {
  errorMap: () => ({ message: 'Invalid lead channel' }),
});

/**
 * Message history entry schema
 */
export const MessageHistoryEntrySchema = z.object({
  role: z.enum(['user', 'assistant', 'system']),
  content: z.string().min(1, 'Message content cannot be empty'),
  timestamp: z.string().datetime().optional(),
});

/**
 * UTM parameters schema
 */
export const UTMParametersSchema = z.object({
  utm_source: z.string().optional(),
  utm_medium: z.string().optional(),
  utm_campaign: z.string().optional(),
  utm_term: z.string().optional(),
  utm_content: z.string().optional(),
});

/**
 * AI scoring context schema
 */
export const AIScoringContextSchema = z.object({
  messageHistory: z.array(MessageHistoryEntrySchema).min(1, 'At least one message required'),
  channel: LeadChannelSchema,
  language: SupportedLanguageSchema.optional(),
  utm: UTMParametersSchema.optional(),
  existingContactId: ContactIdSchema.optional(),
  procedureInterest: z.array(z.string()).optional(),
});

// ============================================================================
// TRIAGE SCHEMAS
// ============================================================================

/**
 * Lead score classification schema
 */
export const LeadScoreClassificationSchema = z.enum(['HOT', 'WARM', 'COLD', 'UNQUALIFIED'], {
  errorMap: () => ({ message: 'Invalid lead classification' }),
});

/**
 * Triage input schema
 */
export const TriageInputSchema = z.object({
  leadScore: LeadScoreClassificationSchema,
  channel: LeadChannelSchema,
  messageContent: z.string().min(1, 'Message content is required'),
  procedureInterest: z.array(z.string()).optional(),
  hasExistingRelationship: z.boolean(),
  previousAppointments: z.number().int().nonnegative().optional(),
  lastContactDays: z.number().int().nonnegative().optional(),
});

// ============================================================================
// SCHEDULING SCHEMAS
// ============================================================================

/**
 * Time slot schema (HH:MM format)
 */
export const TimeSlotSchema = z
  .string()
  .regex(/^([01]\d|2[0-3]):([0-5]\d)$/, 'Invalid time format. Use HH:MM');

/**
 * Date string schema (YYYY-MM-DD format)
 */
export const DateStringSchema = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, 'Invalid date format. Use YYYY-MM-DD');

/**
 * Procedure type schema
 */
export const ProcedureTypeSchema = z.enum(
  ['consultation', 'implant', 'extraction', 'cleaning', 'whitening', 'orthodontics', 'other'],
  { errorMap: () => ({ message: 'Invalid procedure type' }) }
);

/**
 * Appointment slot schema
 */
export const AppointmentSlotSchema = z.object({
  id: z.string().min(1),
  date: DateStringSchema,
  startTime: TimeSlotSchema,
  endTime: TimeSlotSchema,
  duration: z.number().int().positive(),
});

/**
 * Book appointment request schema
 */
export const BookAppointmentRequestSchema = z.object({
  contactId: ContactIdSchema,
  phone: PhoneNumberSchema,
  patientName: z.string().min(1, 'Patient name is required').max(200),
  slotId: z.string().min(1, 'Slot ID is required'),
  procedureType: ProcedureTypeSchema,
  notes: z.string().max(1000).optional(),
  skipConsentCheck: z.boolean().optional(),
});

/**
 * Available slots request schema
 */
export const AvailableSlotsRequestSchema = z.object({
  procedureType: ProcedureTypeSchema,
  preferredDates: z.array(DateStringSchema).min(1, 'At least one date required'),
  preferredTimeRange: z
    .object({
      start: TimeSlotSchema,
      end: TimeSlotSchema,
    })
    .optional(),
  limit: z.number().int().positive().max(100).optional(),
});

// ============================================================================
// LANGUAGE SCHEMAS
// ============================================================================

/**
 * Language detection request schema
 */
export const LanguageDetectionRequestSchema = z.object({
  text: z.string().min(1, 'Text is required for language detection'),
  contactId: ContactIdSchema.optional(),
  setAsPreferred: z.boolean().optional(),
});

/**
 * Translation request schema
 */
export const TranslationRequestSchema = z.object({
  text: z.string().min(1, 'Text is required for translation'),
  fromLanguage: SupportedLanguageSchema,
  toLanguage: SupportedLanguageSchema,
  context: z.enum(['medical', 'appointment', 'marketing', 'general']).optional(),
});

// ============================================================================
// VALIDATION HELPERS
// ============================================================================

/**
 * Validate data against a schema and return a Result
 *
 * @template T - The schema output type
 * @param schema - Zod schema to validate against
 * @param data - Data to validate
 * @returns Validation result with success/failure
 *
 * @example
 * ```typescript
 * const result = validateWithResult(ConsentRequestSchema, inputData);
 * if (result.success) {
 *   // result.value is typed as ConsentRequest
 *   await service.recordConsent(result.value);
 * } else {
 *   // result.error contains validation details
 *   console.error(result.error.fieldErrors);
 * }
 * ```
 */
export function validateWithResult<T extends z.ZodSchema>(
  schema: T,
  data: unknown
): { success: true; value: z.infer<T> } | { success: false; error: z.ZodError } {
  const result = schema.safeParse(data);
  if (result.success) {
    // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment -- Zod safeParse returns properly typed data
    return { success: true, value: result.data };
  }
  return { success: false, error: result.error };
}

/**
 * Create a validated version of a function
 *
 * @template TSchema - The input schema type
 * @template TReturn - The return type of the function
 * @param schema - Input validation schema
 * @param fn - Function to wrap
 * @returns Validated function that throws ValidationError on invalid input
 *
 * @example
 * ```typescript
 * const validateAndBook = withValidation(
 *   BookAppointmentRequestSchema,
 *   async (input) => schedulingService.bookAppointment(input)
 * );
 *
 * // Will throw ValidationError if input is invalid
 * await validateAndBook({ ... });
 * ```
 */
export function withValidation<TSchema extends z.ZodSchema, TReturn>(
  schema: TSchema,
  fn: (input: z.infer<TSchema>) => TReturn
): (input: unknown) => TReturn {
  return (input: unknown) => {
    const result = schema.safeParse(input);
    if (!result.success) {
      throw result.error;
    }
    // eslint-disable-next-line @typescript-eslint/no-unsafe-argument -- Zod safeParse returns properly typed data
    return fn(result.data);
  };
}

// ============================================================================
// TYPE EXPORTS
// ============================================================================

export type ConsentType = z.infer<typeof ConsentTypeSchema>;
export type ConsentStatus = z.infer<typeof ConsentStatusSchema>;
export type ConsentChannel = z.infer<typeof ConsentChannelSchema>;
export type ConsentMethod = z.infer<typeof ConsentMethodSchema>;
export type ConsentSource = z.infer<typeof ConsentSourceSchema>;
export type ConsentRequest = z.infer<typeof ConsentRequestSchema>;
export type LeadChannel = z.infer<typeof LeadChannelSchema>;
export type MessageHistoryEntry = z.infer<typeof MessageHistoryEntrySchema>;
export type UTMParameters = z.infer<typeof UTMParametersSchema>;
export type AIScoringContext = z.infer<typeof AIScoringContextSchema>;
export type LeadScoreClassification = z.infer<typeof LeadScoreClassificationSchema>;
export type TriageInput = z.infer<typeof TriageInputSchema>;
export type TimeSlot = z.infer<typeof TimeSlotSchema>;
export type DateString = z.infer<typeof DateStringSchema>;
export type ProcedureType = z.infer<typeof ProcedureTypeSchema>;
export type AppointmentSlot = z.infer<typeof AppointmentSlotSchema>;
export type BookAppointmentRequest = z.infer<typeof BookAppointmentRequestSchema>;
export type AvailableSlotsRequest = z.infer<typeof AvailableSlotsRequestSchema>;
export type LanguageDetectionRequest = z.infer<typeof LanguageDetectionRequestSchema>;
export type TranslationRequest = z.infer<typeof TranslationRequestSchema>;
export type SupportedLanguage = z.infer<typeof SupportedLanguageSchema>;

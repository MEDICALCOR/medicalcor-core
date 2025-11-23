import { z } from 'zod';

/**
 * Dashboard & UI Schemas for MedicalCor
 *
 * Extended schemas for all dashboard pages including:
 * - Triage Board
 * - Calendar/Appointments
 * - Analytics
 * - Messages/Conversations
 */

// ============================================
// TRIAGE SCHEMAS
// ============================================

export const TriageColumnIdSchema = z.enum(['new', 'hot', 'warm', 'cold', 'scheduled']);

export const TriageLeadSchema = z.object({
  id: z.string(),
  phone: z.string(), // Masked for display
  source: z.enum(['whatsapp', 'voice', 'web_form', 'facebook']),
  time: z.string(), // Relative time
  message: z.string().optional(),
  score: z.number().min(1).max(5).optional(),
  confidence: z.number().min(0).max(1).optional(),
  reasoning: z.string().optional(),
  procedureInterest: z.array(z.string()).optional(),
  appointment: z.string().optional(),
  hubspotContactId: z.string().optional(),
});

export const TriageColumnSchema = z.object({
  id: TriageColumnIdSchema,
  title: z.string(),
  leads: z.array(TriageLeadSchema),
});

// ============================================
// CALENDAR/APPOINTMENTS SCHEMAS
// ============================================

export const AppointmentStatusSchema = z.enum([
  'available',
  'booked',
  'confirmed',
  'completed',
  'cancelled',
  'no-show',
]);

export const TimeSlotSchema = z.object({
  id: z.string(),
  time: z.string(), // HH:mm format
  duration: z.number(), // minutes
  available: z.boolean(),
  patient: z.string().optional(),
  patientId: z.string().optional(),
  procedure: z.string().optional(),
  doctor: z.string().optional(),
  status: AppointmentStatusSchema.optional(),
});

export const DayScheduleSchema = z.object({
  date: z.string(), // ISO date
  slots: z.array(TimeSlotSchema),
  totalAvailable: z.number(),
  totalBooked: z.number(),
});

// ============================================
// ANALYTICS SCHEMAS
// ============================================

export const AnalyticsMetricsSchema = z.object({
  totalLeads: z.number(),
  totalLeadsChange: z.number(), // percentage change
  hotLeads: z.number(),
  hotLeadsChange: z.number(),
  appointmentsScheduled: z.number(),
  appointmentsChange: z.number(),
  conversionRate: z.number(), // percentage
  conversionRateChange: z.number(),
  avgResponseTime: z.number(), // minutes
  avgResponseTimeChange: z.number(),
  revenue: z.number(),
  revenueChange: z.number(),
});

export const TimeSeriesDataPointSchema = z.object({
  date: z.string(),
  value: z.number(),
});

export const LeadsBySourceSchema = z.object({
  source: z.string(),
  count: z.number(),
  color: z.string(),
});

export const ConversionFunnelStepSchema = z.object({
  stage: z.string(),
  count: z.number(),
  percentage: z.number(),
});

export const TopProcedureSchema = z.object({
  procedure: z.string(),
  count: z.number(),
  revenue: z.number(),
});

export const OperatorPerformanceSchema = z.object({
  id: z.string(),
  name: z.string(),
  leadsHandled: z.number(),
  conversions: z.number(),
  conversionRate: z.number(),
  avgResponseTime: z.number(),
  satisfaction: z.number(),
});

// ============================================
// MESSAGES/CONVERSATIONS SCHEMAS
// ============================================

export const MessageDirectionSchema = z.enum(['IN', 'OUT']);
export const MessageStatusSchema = z.enum(['sent', 'delivered', 'read', 'failed']);
export const ConversationStatusSchema = z.enum(['open', 'pending', 'resolved', 'spam']);
export const ConversationChannelSchema = z.enum(['whatsapp', 'sms', 'voice']);

export const MessageSchema = z.object({
  id: z.string(),
  conversationId: z.string(),
  content: z.string(),
  direction: MessageDirectionSchema,
  status: MessageStatusSchema,
  timestamp: z.date(),
  senderName: z.string().optional(),
  mediaUrl: z.string().optional(),
  mediaType: z.string().optional(),
});

export const ConversationSchema = z.object({
  id: z.string(),
  contactId: z.string(),
  contactName: z.string(),
  contactPhone: z.string(), // Masked
  channel: ConversationChannelSchema,
  status: ConversationStatusSchema,
  unreadCount: z.number(),
  lastMessage: MessageSchema.optional(),
  createdAt: z.date(),
  updatedAt: z.date(),
  tags: z.array(z.string()).optional(),
  assignedTo: z.string().optional(),
});

// ============================================
// PATIENT DETAIL EXTENDED SCHEMAS
// ============================================

export const PatientActivityTypeSchema = z.enum([
  'call',
  'message',
  'email',
  'appointment',
  'note',
  'status_change',
  'document',
  'payment',
]);

export const PatientActivitySchema = z.object({
  id: z.string(),
  type: PatientActivityTypeSchema,
  title: z.string(),
  description: z.string().optional(),
  timestamp: z.date(),
  user: z.string().optional(),
});

export const PatientAppointmentSchema = z.object({
  id: z.string(),
  date: z.date(),
  time: z.string(),
  duration: z.number(),
  type: z.string(),
  doctor: z.string().optional(),
  location: z.string().optional(),
  status: z.enum(['scheduled', 'confirmed', 'completed', 'cancelled', 'no-show']),
  notes: z.string().optional(),
});

export const PatientDocumentSchema = z.object({
  id: z.string(),
  name: z.string(),
  type: z.enum(['medical_record', 'lab_result', 'imaging', 'prescription', 'consent', 'other']),
  mimeType: z.string(),
  size: z.number(),
  uploadedAt: z.date(),
  uploadedBy: z.string().optional(),
});

export const PatientNoteSchema = z.object({
  id: z.string(),
  content: z.string(),
  createdAt: z.date(),
  createdBy: z.string(),
  isPinned: z.boolean().optional(),
  category: z.enum(['general', 'medical', 'billing', 'follow-up']).optional(),
});

export const PatientDetailSchema = z.object({
  id: z.string(),
  firstName: z.string(),
  lastName: z.string(),
  dateOfBirth: z.date().optional(),
  gender: z.enum(['male', 'female', 'other']).optional(),
  phone: z.string(),
  email: z.string().optional(),
  status: z.enum(['lead', 'contacted', 'scheduled', 'patient', 'inactive']),
  source: z.string(),
  tags: z.array(z.string()),
  assignedTo: z.string().optional(),
  createdAt: z.date(),
  updatedAt: z.date(),
  // Medical info
  medicalHistory: z.string().optional(),
  allergies: z.array(z.string()).optional(),
  currentMedications: z.array(z.string()).optional(),
  // Related data
  appointments: z.array(PatientAppointmentSchema),
  documents: z.array(PatientDocumentSchema),
  activities: z.array(PatientActivitySchema),
  notes: z.array(PatientNoteSchema),
  // Stats
  totalSpent: z.number().optional(),
  appointmentCount: z.number(),
  lastVisit: z.date().optional(),
  nextAppointment: z.date().optional(),
});

// ============================================
// INFERRED TYPES
// ============================================

export type TriageColumnId = z.infer<typeof TriageColumnIdSchema>;
export type TriageLead = z.infer<typeof TriageLeadSchema>;
export type TriageColumn = z.infer<typeof TriageColumnSchema>;

export type AppointmentStatus = z.infer<typeof AppointmentStatusSchema>;
export type TimeSlot = z.infer<typeof TimeSlotSchema>;
export type DaySchedule = z.infer<typeof DayScheduleSchema>;

export type AnalyticsMetrics = z.infer<typeof AnalyticsMetricsSchema>;
export type TimeSeriesDataPoint = z.infer<typeof TimeSeriesDataPointSchema>;
export type LeadsBySource = z.infer<typeof LeadsBySourceSchema>;
export type ConversionFunnelStep = z.infer<typeof ConversionFunnelStepSchema>;
export type TopProcedure = z.infer<typeof TopProcedureSchema>;
export type OperatorPerformance = z.infer<typeof OperatorPerformanceSchema>;

export type MessageDirection = z.infer<typeof MessageDirectionSchema>;
export type MessageStatus = z.infer<typeof MessageStatusSchema>;
export type ConversationStatus = z.infer<typeof ConversationStatusSchema>;
export type ConversationChannel = z.infer<typeof ConversationChannelSchema>;
export type Message = z.infer<typeof MessageSchema>;
export type Conversation = z.infer<typeof ConversationSchema>;

export type PatientActivityType = z.infer<typeof PatientActivityTypeSchema>;
export type PatientActivity = z.infer<typeof PatientActivitySchema>;
export type PatientAppointment = z.infer<typeof PatientAppointmentSchema>;
export type PatientDocument = z.infer<typeof PatientDocumentSchema>;
export type PatientNote = z.infer<typeof PatientNoteSchema>;
export type PatientDetail = z.infer<typeof PatientDetailSchema>;

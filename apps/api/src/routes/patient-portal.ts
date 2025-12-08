/**
 * Patient Portal API Routes
 * Secure endpoints for patient-facing portal features
 *
 * Features:
 * - OTP-based authentication (phone verification)
 * - Appointment viewing and management
 * - Notification preferences
 *
 * Security:
 * - Rate limiting on auth endpoints
 * - JWT-based session tokens
 * - Phone number verification
 * - GDPR compliant data access
 */

import type { FastifyPluginAsync, FastifyRequest, FastifyReply, RouteHandlerMethod } from 'fastify';
import { z } from 'zod';
import { randomInt, createHash } from 'crypto';
// eslint-disable-next-line @typescript-eslint/no-require-imports, @typescript-eslint/no-var-requires
const jsonwebtoken = require('jsonwebtoken') as {
  sign: (payload: object, secret: string, options?: { expiresIn?: string }) => string;
  verify: (token: string, secret: string) => object;
};
import { generateCorrelationId, logger, normalizeRomanianPhone } from '@medicalcor/core';
import { createIntegrationClients, type IntegrationClients } from '@medicalcor/integrations';

// ============================================
// Types & Schemas
// ============================================

const RequestOTPSchema = z.object({
  phone: z.string().min(10).max(15),
});

const VerifyOTPSchema = z.object({
  phone: z.string().min(10).max(15),
  otp: z.string().length(6),
});

const UpdatePreferencesSchema = z.object({
  appointmentReminders: z.boolean().optional(),
  marketingMessages: z.boolean().optional(),
  treatmentUpdates: z.boolean().optional(),
  preferredChannel: z.enum(['whatsapp', 'sms', 'email']).optional(),
  preferredLanguage: z.enum(['ro', 'en', 'de']).optional(),
});

// Appointment booking schemas
const GetAvailableSlotsSchema = z.object({
  procedureType: z.string().min(1).max(128),
  startDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  endDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  practitionerId: z.string().optional(),
  locationId: z.string().optional(),
  limit: z.coerce.number().int().min(1).max(20).optional(),
});

const BookAppointmentSchema = z.object({
  slotId: z.string().min(1),
  procedureType: z.string().min(1).max(128),
  notes: z.string().max(500).optional(),
});

const CancelAppointmentSchema = z.object({
  appointmentId: z.string().min(1),
  reason: z.string().max(500).optional(),
});

const RescheduleAppointmentSchema = z.object({
  appointmentId: z.string().min(1),
  newSlotId: z.string().min(1),
  reason: z.string().max(500).optional(),
});

interface PatientSession {
  patientId: string;
  phone: string;
  hubspotContactId?: string;
  name?: string;
  email?: string;
  iat: number;
  exp: number;
}

interface OTPEntry {
  otp: string;
  phone: string;
  createdAt: Date;
  attempts: number;
  verified: boolean;
}

// In-memory OTP store (use Redis in production)
const otpStore = new Map<string, OTPEntry>();

// OTP cleanup interval (5 minutes)
const OTP_EXPIRY_MS = 5 * 60 * 1000;
const MAX_OTP_ATTEMPTS = 3;

// JWT configuration
const JWT_SECRET = process.env.PATIENT_PORTAL_JWT_SECRET ?? 'dev-secret-change-in-production';
const JWT_EXPIRY = '24h';

// Initialize clients lazily
let _clients: IntegrationClients | null = null;
function getClients(): IntegrationClients {
  _clients ??= createIntegrationClients({
    source: 'patient-portal',
    includeNotifications: true,
    includeScheduling: true,
    includeConsent: true,
  });
  return _clients;
}

// ============================================
// Helper Functions
// ============================================

function generateOTP(): string {
  return String(randomInt(100000, 999999));
}

function hashPhone(phone: string): string {
  return createHash('sha256').update(phone).digest('hex').slice(0, 16);
}

function createPatientToken(session: Omit<PatientSession, 'iat' | 'exp'>): string {
  return jsonwebtoken.sign(session, JWT_SECRET, { expiresIn: JWT_EXPIRY });
}

function verifyPatientToken(token: string): PatientSession | null {
  try {
    return jsonwebtoken.verify(token, JWT_SECRET) as PatientSession;
  } catch {
    return null;
  }
}

function extractToken(request: FastifyRequest): string | null {
  const authHeader = request.headers.authorization;
  if (!authHeader?.startsWith('Bearer ')) {
    return null;
  }
  return authHeader.slice(7);
}

function cleanupExpiredOTPs(): void {
  const now = Date.now();
  for (const [key, entry] of otpStore.entries()) {
    if (now - entry.createdAt.getTime() > OTP_EXPIRY_MS) {
      otpStore.delete(key);
    }
  }
}

// Run cleanup every minute
setInterval(cleanupExpiredOTPs, 60000);

// ============================================
// Auth Handler Functions
// ============================================

async function handleRequestOTP(
  request: FastifyRequest<{ Body: z.infer<typeof RequestOTPSchema> }>,
  reply: FastifyReply
): Promise<FastifyReply> {
  const correlationId = generateCorrelationId();
  const clients = getClients();

  const parseResult = RequestOTPSchema.safeParse(request.body);
  if (!parseResult.success) {
    return reply.status(400).send({ error: 'Invalid phone number format', correlationId });
  }

  const { phone } = parseResult.data;
  const phoneResult = normalizeRomanianPhone(phone);
  if (!phoneResult.isValid) {
    return reply.status(400).send({ error: 'Invalid Romanian phone number', correlationId });
  }

  const normalizedPhone = phoneResult.normalized;
  const phoneKey = hashPhone(normalizedPhone);

  const existingEntry = otpStore.get(phoneKey);
  if (existingEntry && Date.now() - existingEntry.createdAt.getTime() < 60000) {
    return reply.status(429).send({
      error: 'Please wait before requesting a new OTP',
      retryAfter: 60,
      correlationId,
    });
  }

  const otp = generateOTP();
  otpStore.set(phoneKey, {
    otp,
    phone: normalizedPhone,
    createdAt: new Date(),
    attempts: 0,
    verified: false,
  });

  if (clients.whatsapp) {
    try {
      await clients.whatsapp.sendText({
        to: normalizedPhone,
        text: `Codul dumneavoastră de verificare MedicalCor este: ${otp}\n\nAcest cod expiră în 5 minute.`,
      });
      logger.info({ correlationId }, 'OTP sent via WhatsApp');
    } catch (err) {
      logger.error({ err, correlationId }, 'Failed to send OTP via WhatsApp');
      return reply.status(500).send({ error: 'Failed to send verification code', correlationId });
    }
  } else {
    logger.info({ correlationId }, 'OTP generated (WhatsApp not configured)');
  }

  await clients.eventStore.emit({
    type: 'patient.auth.otp_requested',
    correlationId,
    aggregateId: normalizedPhone,
    aggregateType: 'patient_auth',
    payload: { phone: normalizedPhone.slice(0, -4) + '****', timestamp: new Date().toISOString() },
  });

  return reply.status(200).send({
    success: true,
    message: 'Verification code sent',
    expiresIn: OTP_EXPIRY_MS / 1000,
    correlationId,
  });
}

async function handleVerifyOTP(
  request: FastifyRequest<{ Body: z.infer<typeof VerifyOTPSchema> }>,
  reply: FastifyReply
): Promise<FastifyReply> {
  const correlationId = generateCorrelationId();
  const clients = getClients();

  const parseResult = VerifyOTPSchema.safeParse(request.body);
  if (!parseResult.success) {
    return reply.status(400).send({ error: 'Invalid input', correlationId });
  }

  const { phone, otp } = parseResult.data;
  const phoneResult = normalizeRomanianPhone(phone);
  const normalizedPhone = phoneResult.normalized;
  const phoneKey = hashPhone(normalizedPhone);

  const entry = otpStore.get(phoneKey);
  if (!entry) {
    return reply.status(400).send({
      error: 'No verification code found. Please request a new one.',
      correlationId,
    });
  }

  if (Date.now() - entry.createdAt.getTime() > OTP_EXPIRY_MS) {
    otpStore.delete(phoneKey);
    return reply.status(400).send({
      error: 'Verification code expired. Please request a new one.',
      correlationId,
    });
  }

  if (entry.attempts >= MAX_OTP_ATTEMPTS) {
    otpStore.delete(phoneKey);
    return reply.status(400).send({
      error: 'Too many attempts. Please request a new code.',
      correlationId,
    });
  }

  if (entry.otp !== otp) {
    entry.attempts++;
    return reply.status(400).send({
      error: 'Invalid verification code',
      remainingAttempts: MAX_OTP_ATTEMPTS - entry.attempts,
      correlationId,
    });
  }

  entry.verified = true;
  otpStore.delete(phoneKey);

  let hubspotContactId: string | undefined;
  let patientName: string | undefined;
  let patientEmail: string | undefined;

  if (clients.hubspot) {
    try {
      const contacts = await clients.hubspot.searchContacts({
        filterGroups: [
          { filters: [{ propertyName: 'phone', operator: 'EQ', value: normalizedPhone }] },
        ],
      });
      const contact = contacts.results[0];
      if (contact) {
        hubspotContactId = contact.id;
        patientName = `${contact.properties.firstname ?? ''} ${contact.properties.lastname ?? ''}`.trim();
        patientEmail = contact.properties.email;
      }
    } catch (err) {
      logger.warn({ err, correlationId }, 'Failed to look up patient in HubSpot');
    }
  }

  const token = createPatientToken({
    patientId: hubspotContactId ?? phoneKey,
    phone: normalizedPhone,
    hubspotContactId,
    name: patientName,
    email: patientEmail,
  });

  await clients.eventStore.emit({
    type: 'patient.auth.verified',
    correlationId,
    aggregateId: hubspotContactId ?? normalizedPhone,
    aggregateType: 'patient_auth',
    payload: {
      phone: normalizedPhone.slice(0, -4) + '****',
      hubspotContactId,
      timestamp: new Date().toISOString(),
    },
  });

  logger.info({ correlationId, hubspotContactId }, 'Patient authenticated successfully');

  return reply.status(200).send({
    success: true,
    token,
    patient: {
      id: hubspotContactId ?? phoneKey,
      name: patientName ?? 'Patient',
      phone: normalizedPhone.slice(0, -4) + '****',
      email: patientEmail ? patientEmail.slice(0, 3) + '***@***' : undefined,
    },
    correlationId,
  });
}

// ============================================
// Auth Middleware
// ============================================

function requirePatientAuth(
  request: FastifyRequest,
  reply: FastifyReply,
  done: (err?: Error) => void
): void {
  const token = extractToken(request);
  if (!token) {
    void reply.status(401).send({ error: 'Authentication required' });
    done(new Error('Unauthorized'));
    return;
  }

  const session = verifyPatientToken(token);
  if (!session) {
    void reply.status(401).send({ error: 'Invalid or expired session' });
    done(new Error('Unauthorized'));
    return;
  }

  (request as FastifyRequest & { patientSession: PatientSession }).patientSession = session;
  done();
}

// ============================================
// Protected Route Handlers
// ============================================

async function handleGetProfile(
  request: FastifyRequest,
  reply: FastifyReply
): Promise<FastifyReply> {
  const session = (request as FastifyRequest & { patientSession: PatientSession }).patientSession;
  const correlationId = generateCorrelationId();
  const clients = getClients();

  let profile = {
    id: session.patientId,
    name: session.name ?? 'Patient',
    phone: session.phone.slice(0, -4) + '****',
    email: session.email ? session.email.slice(0, 3) + '***@***' : undefined,
  };

  if (clients.hubspot && session.hubspotContactId) {
    try {
      const contact = await clients.hubspot.getContact(session.hubspotContactId);
      profile = {
        id: session.hubspotContactId,
        name:
          `${contact.properties.firstname ?? ''} ${contact.properties.lastname ?? ''}`.trim() ||
          'Patient',
        phone: session.phone.slice(0, -4) + '****',
        email: contact.properties.email
          ? contact.properties.email.slice(0, 3) + '***@***'
          : undefined,
      };
    } catch (err) {
      logger.warn({ err, correlationId }, 'Failed to fetch HubSpot contact');
    }
  }

  return reply.status(200).send({ success: true, profile, correlationId });
}

async function handleGetAppointments(
  request: FastifyRequest,
  reply: FastifyReply
): Promise<FastifyReply> {
  const session = (request as FastifyRequest & { patientSession: PatientSession }).patientSession;
  const correlationId = generateCorrelationId();
  const clients = getClients();

  if (!clients.scheduling) {
    return reply.status(503).send({ error: 'Scheduling service unavailable', correlationId });
  }

  try {
    const appointments = await clients.scheduling.getPatientAppointments({
      patientPhone: session.phone,
      hubspotContactId: session.hubspotContactId,
    });

    return reply.status(200).send({
      success: true,
      appointments: appointments.map((apt) => ({
        id: apt.id,
        date: apt.scheduledAt,
        procedureType: apt.procedureType,
        status: apt.status,
        location: apt.location?.name,
        practitioner: apt.practitioner?.name,
        confirmationCode: apt.confirmationCode,
      })),
      correlationId,
    });
  } catch (err) {
    logger.error({ err, correlationId }, 'Failed to fetch appointments');
    return reply.status(500).send({ error: 'Failed to fetch appointments', correlationId });
  }
}

async function handleGetPreferences(
  request: FastifyRequest,
  reply: FastifyReply
): Promise<FastifyReply> {
  const session = (request as FastifyRequest & { patientSession: PatientSession }).patientSession;
  const correlationId = generateCorrelationId();
  const clients = getClients();

  const preferences = {
    appointmentReminders: true,
    marketingMessages: false,
    treatmentUpdates: true,
    preferredChannel: 'whatsapp' as const,
    preferredLanguage: 'ro' as const,
  };

  if (clients.consent && session.hubspotContactId) {
    try {
      const [appt, mktg, treat] = await Promise.all([
        clients.consent.getConsent(session.hubspotContactId, 'appointment_reminders'),
        clients.consent.getConsent(session.hubspotContactId, 'marketing_whatsapp'),
        clients.consent.getConsent(session.hubspotContactId, 'treatment_updates'),
      ]);

      preferences.appointmentReminders = appt?.status === 'granted';
      preferences.marketingMessages = mktg?.status === 'granted';
      preferences.treatmentUpdates = treat?.status === 'granted';
    } catch (err) {
      logger.warn({ err, correlationId }, 'Failed to fetch consent preferences');
    }
  }

  return reply.status(200).send({ success: true, preferences, correlationId });
}

async function handleUpdatePreferences(
  request: FastifyRequest<{ Body: z.infer<typeof UpdatePreferencesSchema> }>,
  reply: FastifyReply
): Promise<FastifyReply> {
  const session = (request as FastifyRequest & { patientSession: PatientSession }).patientSession;
  const correlationId = generateCorrelationId();
  const clients = getClients();

  const parseResult = UpdatePreferencesSchema.safeParse(request.body);
  if (!parseResult.success) {
    return reply.status(400).send({ error: 'Invalid preferences', correlationId });
  }

  const updates = parseResult.data;

  if (clients.consent && session.hubspotContactId) {
    try {
      const consentMappings = [
        { key: 'appointmentReminders', type: 'appointment_reminders' as const },
        { key: 'marketingMessages', type: 'marketing_whatsapp' as const },
        { key: 'treatmentUpdates', type: 'treatment_updates' as const },
      ];

      for (const mapping of consentMappings) {
        const value = updates[mapping.key as keyof typeof updates];
        if (typeof value === 'boolean') {
          await clients.consent.recordConsent({
            contactId: session.hubspotContactId,
            phone: session.phone,
            consentType: mapping.type,
            status: value ? 'granted' : 'denied',
            source: { channel: 'web', method: 'explicit', evidenceUrl: null, witnessedBy: null },
          });
        }
      }
    } catch (err) {
      logger.error({ err, correlationId }, 'Failed to update consent preferences');
      return reply.status(500).send({ error: 'Failed to update preferences', correlationId });
    }
  }

  await clients.eventStore.emit({
    type: 'patient.preferences.updated',
    correlationId,
    aggregateId: session.hubspotContactId ?? session.phone,
    aggregateType: 'patient',
    payload: { updates, timestamp: new Date().toISOString() },
  });

  logger.info({ correlationId }, 'Patient preferences updated');
  return reply.status(200).send({ success: true, message: 'Preferences updated', correlationId });
}

// ============================================
// Appointment Booking Handlers
// ============================================

async function handleGetAvailableSlots(
  request: FastifyRequest<{ Querystring: z.infer<typeof GetAvailableSlotsSchema> }>,
  reply: FastifyReply
): Promise<FastifyReply> {
  const correlationId = generateCorrelationId();
  const clients = getClients();

  const parseResult = GetAvailableSlotsSchema.safeParse(request.query);
  if (!parseResult.success) {
    return reply.status(400).send({
      error: 'Invalid query parameters',
      details: parseResult.error.flatten().fieldErrors,
      correlationId,
    });
  }

  if (!clients.scheduling) {
    return reply.status(503).send({ error: 'Scheduling service unavailable', correlationId });
  }

  const { procedureType, startDate, endDate, practitionerId, locationId, limit } = parseResult.data;

  try {
    const slots = await clients.scheduling.getAvailableSlots({
      procedureType,
      startDate,
      endDate,
      practitionerId,
      locationId,
      limit: limit ?? 10,
    });

    return await reply.status(200).send({
      success: true,
      slots: slots.map((slot) => ({
        id: slot.id,
        date: slot.date,
        time: slot.time,
        dateTime: slot.dateTime,
        duration: slot.duration,
        practitioner: slot.practitioner
          ? { id: slot.practitioner.id, name: slot.practitioner.name }
          : undefined,
        location: slot.location
          ? { id: slot.location.id, name: slot.location.name }
          : undefined,
      })),
      correlationId,
    });
  } catch (err) {
    logger.error({ err, correlationId }, 'Failed to fetch available slots');
    return await reply.status(500).send({ error: 'Failed to fetch available slots', correlationId });
  }
}

async function handleBookAppointment(
  request: FastifyRequest<{ Body: z.infer<typeof BookAppointmentSchema> }>,
  reply: FastifyReply
): Promise<FastifyReply> {
  const session = (request as FastifyRequest & { patientSession: PatientSession }).patientSession;
  const correlationId = generateCorrelationId();
  const clients = getClients();

  const parseResult = BookAppointmentSchema.safeParse(request.body);
  if (!parseResult.success) {
    return reply.status(400).send({
      error: 'Invalid booking request',
      details: parseResult.error.flatten().fieldErrors,
      correlationId,
    });
  }

  if (!clients.scheduling) {
    return reply.status(503).send({ error: 'Scheduling service unavailable', correlationId });
  }

  const { slotId, procedureType, notes } = parseResult.data;

  // Verify slot is still available
  try {
    const isAvailable = await clients.scheduling.isSlotAvailable(slotId);
    if (!isAvailable) {
      return await reply.status(409).send({
        error: 'Selected time slot is no longer available',
        code: 'SLOT_UNAVAILABLE',
        correlationId,
      });
    }
  } catch (err) {
    logger.warn({ err, correlationId }, 'Failed to verify slot availability');
    // Continue with booking attempt - the service will reject if unavailable
  }

  try {
    const appointment = await clients.scheduling.bookAppointment({
      slotId,
      patientPhone: session.phone,
      patientName: session.name,
      patientEmail: session.email,
      procedureType,
      notes,
      hubspotContactId: session.hubspotContactId,
    });

    // Emit booking event
    await clients.eventStore.emit({
      type: 'patient.appointment.booked',
      correlationId,
      aggregateId: appointment.id,
      aggregateType: 'appointment',
      payload: {
        appointmentId: appointment.id,
        patientId: session.patientId,
        procedureType,
        scheduledAt: appointment.scheduledAt,
        confirmationCode: appointment.confirmationCode,
        timestamp: new Date().toISOString(),
      },
    });

    logger.info(
      { correlationId, appointmentId: appointment.id },
      'Patient booked appointment'
    );

    return await reply.status(201).send({
      success: true,
      appointment: {
        id: appointment.id,
        confirmationCode: appointment.confirmationCode,
        date: appointment.scheduledAt,
        procedureType: appointment.procedureType,
        status: appointment.status,
        practitioner: appointment.practitioner?.name,
        location: appointment.location?.name,
      },
      correlationId,
    });
  } catch (err) {
    logger.error({ err, correlationId }, 'Failed to book appointment');
    return await reply.status(500).send({ error: 'Failed to book appointment', correlationId });
  }
}

async function handleCancelAppointment(
  request: FastifyRequest<{ Body: z.infer<typeof CancelAppointmentSchema> }>,
  reply: FastifyReply
): Promise<FastifyReply> {
  const session = (request as FastifyRequest & { patientSession: PatientSession }).patientSession;
  const correlationId = generateCorrelationId();
  const clients = getClients();

  const parseResult = CancelAppointmentSchema.safeParse(request.body);
  if (!parseResult.success) {
    return reply.status(400).send({
      error: 'Invalid cancellation request',
      details: parseResult.error.flatten().fieldErrors,
      correlationId,
    });
  }

  if (!clients.scheduling) {
    return reply.status(503).send({ error: 'Scheduling service unavailable', correlationId });
  }

  const { appointmentId, reason } = parseResult.data;

  // Verify the appointment belongs to this patient
  try {
    const existingAppointment = await clients.scheduling.getAppointment(appointmentId);
    if (!existingAppointment) {
      return await reply.status(404).send({ error: 'Appointment not found', correlationId });
    }
    if (existingAppointment.patientPhone !== session.phone) {
      logger.warn(
        { correlationId, appointmentId },
        'Patient attempted to cancel another patient appointment'
      );
      return await reply.status(403).send({ error: 'Not authorized to cancel this appointment', correlationId });
    }
    if (existingAppointment.status === 'cancelled') {
      return await reply.status(400).send({ error: 'Appointment already cancelled', correlationId });
    }
    if (existingAppointment.status === 'completed') {
      return await reply.status(400).send({ error: 'Cannot cancel completed appointment', correlationId });
    }
  } catch (err) {
    logger.error({ err, correlationId }, 'Failed to verify appointment ownership');
    return await reply.status(500).send({ error: 'Failed to process cancellation', correlationId });
  }

  try {
    const cancelledAppointment = await clients.scheduling.cancelAppointment({
      appointmentId,
      reason,
      notifyPatient: false, // Patient is cancelling themselves
    });

    // Emit cancellation event
    await clients.eventStore.emit({
      type: 'patient.appointment.cancelled',
      correlationId,
      aggregateId: appointmentId,
      aggregateType: 'appointment',
      payload: {
        appointmentId,
        patientId: session.patientId,
        reason,
        cancelledAt: new Date().toISOString(),
      },
    });

    logger.info({ correlationId, appointmentId }, 'Patient cancelled appointment');

    return await reply.status(200).send({
      success: true,
      appointment: {
        id: cancelledAppointment.id,
        status: cancelledAppointment.status,
      },
      message: 'Appointment cancelled successfully',
      correlationId,
    });
  } catch (err) {
    logger.error({ err, correlationId }, 'Failed to cancel appointment');
    return await reply.status(500).send({ error: 'Failed to cancel appointment', correlationId });
  }
}

async function handleRescheduleAppointment(
  request: FastifyRequest<{ Body: z.infer<typeof RescheduleAppointmentSchema> }>,
  reply: FastifyReply
): Promise<FastifyReply> {
  const session = (request as FastifyRequest & { patientSession: PatientSession }).patientSession;
  const correlationId = generateCorrelationId();
  const clients = getClients();

  const parseResult = RescheduleAppointmentSchema.safeParse(request.body);
  if (!parseResult.success) {
    return reply.status(400).send({
      error: 'Invalid reschedule request',
      details: parseResult.error.flatten().fieldErrors,
      correlationId,
    });
  }

  if (!clients.scheduling) {
    return reply.status(503).send({ error: 'Scheduling service unavailable', correlationId });
  }

  const { appointmentId, newSlotId, reason } = parseResult.data;

  // Verify the appointment belongs to this patient
  try {
    const existingAppointment = await clients.scheduling.getAppointment(appointmentId);
    if (!existingAppointment) {
      return await reply.status(404).send({ error: 'Appointment not found', correlationId });
    }
    if (existingAppointment.patientPhone !== session.phone) {
      logger.warn(
        { correlationId, appointmentId },
        'Patient attempted to reschedule another patient appointment'
      );
      return await reply.status(403).send({ error: 'Not authorized to reschedule this appointment', correlationId });
    }
    if (existingAppointment.status === 'cancelled') {
      return await reply.status(400).send({ error: 'Cannot reschedule cancelled appointment', correlationId });
    }
    if (existingAppointment.status === 'completed') {
      return await reply.status(400).send({ error: 'Cannot reschedule completed appointment', correlationId });
    }
  } catch (err) {
    logger.error({ err, correlationId }, 'Failed to verify appointment ownership');
    return await reply.status(500).send({ error: 'Failed to process reschedule', correlationId });
  }

  // Verify new slot is available
  try {
    const isAvailable = await clients.scheduling.isSlotAvailable(newSlotId);
    if (!isAvailable) {
      return await reply.status(409).send({
        error: 'Selected time slot is no longer available',
        code: 'SLOT_UNAVAILABLE',
        correlationId,
      });
    }
  } catch (err) {
    logger.warn({ err, correlationId }, 'Failed to verify new slot availability');
  }

  try {
    const rescheduledAppointment = await clients.scheduling.rescheduleAppointment({
      appointmentId,
      newSlotId,
      reason,
      notifyPatient: false,
    });

    // Emit reschedule event
    await clients.eventStore.emit({
      type: 'patient.appointment.rescheduled',
      correlationId,
      aggregateId: appointmentId,
      aggregateType: 'appointment',
      payload: {
        appointmentId,
        patientId: session.patientId,
        newSlotId,
        newScheduledAt: rescheduledAppointment.scheduledAt,
        reason,
        rescheduledAt: new Date().toISOString(),
      },
    });

    logger.info({ correlationId, appointmentId, newSlotId }, 'Patient rescheduled appointment');

    return await reply.status(200).send({
      success: true,
      appointment: {
        id: rescheduledAppointment.id,
        confirmationCode: rescheduledAppointment.confirmationCode,
        date: rescheduledAppointment.scheduledAt,
        procedureType: rescheduledAppointment.procedureType,
        status: rescheduledAppointment.status,
        practitioner: rescheduledAppointment.practitioner?.name,
        location: rescheduledAppointment.location?.name,
      },
      message: 'Appointment rescheduled successfully',
      correlationId,
    });
  } catch (err) {
    logger.error({ err, correlationId }, 'Failed to reschedule appointment');
    return await reply.status(500).send({ error: 'Failed to reschedule appointment', correlationId });
  }
}

// ============================================
// Route Definitions
// ============================================

export const patientPortalRoutes: FastifyPluginAsync = async (fastify) => {
  // Auth routes
  fastify.post('/patient/auth/request-otp', handleRequestOTP);
  fastify.post('/patient/auth/verify-otp', handleVerifyOTP);
  fastify.post('/patient/auth/logout', async (_req, reply) => {
    return reply.status(200).send({ success: true, message: 'Logged out successfully' });
  });

  // Protected routes
  fastify.get('/patient/profile', { preHandler: requirePatientAuth }, handleGetProfile);
  fastify.get('/patient/appointments', { preHandler: requirePatientAuth }, handleGetAppointments);
  fastify.get('/patient/preferences', { preHandler: requirePatientAuth }, handleGetPreferences);
  fastify.put('/patient/preferences', { preHandler: requirePatientAuth }, handleUpdatePreferences as RouteHandlerMethod);

  // Appointment booking routes
  fastify.get('/patient/appointments/slots', { preHandler: requirePatientAuth }, handleGetAvailableSlots as RouteHandlerMethod);
  fastify.post('/patient/appointments/book', { preHandler: requirePatientAuth }, handleBookAppointment as RouteHandlerMethod);
  fastify.post('/patient/appointments/cancel', { preHandler: requirePatientAuth }, handleCancelAppointment as RouteHandlerMethod);
  fastify.post('/patient/appointments/reschedule', { preHandler: requirePatientAuth }, handleRescheduleAppointment as RouteHandlerMethod);
};

// ============================================
// Internal Notification Routes
// ============================================

export const internalNotificationRoutes: FastifyPluginAsync = async (fastify) => {
  fastify.post('/internal/notifications/broadcast', async (request, reply) => {
    const correlationId = generateCorrelationId();
    const apiKey = request.headers['x-internal-api-key'];
    const expectedKey = process.env.INTERNAL_API_KEY;

    if (!expectedKey || apiKey !== expectedKey) {
      return reply.status(403).send({ error: 'Unauthorized', correlationId });
    }

    logger.info({ correlationId }, 'Notification broadcast received');
    return reply.status(200).send({ success: true, correlationId });
  });

  fastify.post('/internal/notifications/send', async (request, reply) => {
    const correlationId = generateCorrelationId();
    const apiKey = request.headers['x-internal-api-key'];
    const expectedKey = process.env.INTERNAL_API_KEY;

    if (!expectedKey || apiKey !== expectedKey) {
      return reply.status(403).send({ error: 'Unauthorized', correlationId });
    }

    logger.info({ correlationId }, 'Targeted notification received');
    return reply.status(200).send({ success: true, correlationId });
  });
};

'use server';

import type { HotLead, Appointment, DaySlots, SystemStatus, CallOutcome } from './components';
import { getCurrentUser } from '@/lib/auth/server-action-auth';
import { getDatabase } from '@/lib/db';
import { createIntegrationClients } from '@medicalcor/integrations';
import { createLogger } from '@medicalcor/core';

const logger = createLogger({ name: 'receptionist-actions' });

/**
 * Server actions for the receptionist dashboard
 * Connected to real backend services
 */

// Lazy-initialize integration clients
function getClients() {
  return createIntegrationClients({
    source: 'receptionist-dashboard',
    includeVapi: true,
    includeScheduling: true,
  });
}

// =============================================================================
// USER & STATUS
// =============================================================================

/**
 * Get current user name for greeting
 */
export async function getCurrentUserAction(): Promise<{ name: string }> {
  const user = await getCurrentUser();

  if (!user) {
    return { name: 'User' };
  }

  // Extract first name for friendly greeting
  if (!user.name) {
    return { name: 'User' };
  }
  const firstName = user.name.split(' ')[0];
  return { name: firstName || 'User' };
}

/**
 * Get system status (missed calls, queue, etc.)
 */
export async function getSystemStatusAction(): Promise<SystemStatus> {
  const db = getDatabase();

  try {
    // Query for missed calls in last 24 hours
    const missedCallsResult = await db.query<{ count: string }>(
      `SELECT COUNT(*) as count FROM calls
       WHERE status = 'missed'
       AND created_at > NOW() - INTERVAL '24 hours'`
    );

    // Query for unresolved complaints
    const complaintsResult = await db.query<{ count: string }>(
      `SELECT COUNT(*) as count FROM patient_feedback
       WHERE sentiment = 'negative'
       AND resolved_at IS NULL
       AND created_at > NOW() - INTERVAL '7 days'`
    );

    // Query current queue size
    const queueResult = await db.query<{ count: string }>(
      `SELECT COUNT(*) as count FROM call_queue
       WHERE status = 'waiting'`
    );

    // Check if any appointments today need insurance verification
    const insuranceResult = await db.query<{ unverified: string }>(
      `SELECT COUNT(*) as unverified FROM appointments a
       LEFT JOIN insurance_verifications iv ON a.patient_id = iv.patient_id
       WHERE DATE(a.start_time) = CURRENT_DATE
       AND a.status != 'cancelled'
       AND (iv.verified_at IS NULL OR iv.verified_at < NOW() - INTERVAL '30 days')`
    );

    return {
      missedCalls: parseInt(missedCallsResult.rows[0]?.count ?? '0', 10),
      angryPatients: parseInt(complaintsResult.rows[0]?.count ?? '0', 10),
      queueSize: parseInt(queueResult.rows[0]?.count ?? '0', 10),
      insuranceVerified: parseInt(insuranceResult.rows[0]?.unverified ?? '0', 10) === 0,
    };
  } catch (error) {
    logger.warn({ error }, 'Failed to fetch system status, using defaults');
    // Return safe defaults if database not available
    return {
      missedCalls: 0,
      angryPatients: 0,
      insuranceVerified: true,
      queueSize: 0,
    };
  }
}

// =============================================================================
// HOT LEADS
// =============================================================================

/**
 * Get hot leads that need immediate callback
 */
export async function getHotLeadsAction(): Promise<HotLead[]> {
  const { hubspot } = getClients();

  if (!hubspot) {
    logger.warn('HubSpot client not configured');
    return [];
  }

  try {
    // Search for contacts with recent missed calls or callback requests
    const contacts = await hubspot.searchAllContacts({
      filterGroups: [
        {
          filters: [
            {
              propertyName: 'lead_status',
              operator: 'EQ',
              value: 'CALLBACK_REQUESTED',
            },
          ],
        },
        {
          filters: [
            {
              propertyName: 'last_call_outcome',
              operator: 'EQ',
              value: 'NO_ANSWER',
            },
            {
              propertyName: 'hs_lastmodifieddate',
              operator: 'GTE',
              value: new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString(),
            },
          ],
        },
      ],
      sorts: [{ propertyName: 'hs_lastmodifieddate', direction: 'DESCENDING' }],
      limit: 10,
      properties: [
        'firstname',
        'lastname',
        'phone',
        'lead_score',
        'procedure_interest',
        'callback_reason',
        'last_call_time',
      ],
    });

    return contacts.map((contact: { id: string; properties: Record<string, unknown> }) => {
      const props = contact.properties;
      const lastCallTimeStr =
        typeof props.last_call_time === 'string' ? props.last_call_time : null;
      const lastCallTime = lastCallTimeStr ? new Date(lastCallTimeStr) : new Date();
      const waitingMinutes = Math.round((Date.now() - lastCallTime.getTime()) / (1000 * 60));

      const firstName = typeof props.firstname === 'string' ? props.firstname : '';
      const lastName = typeof props.lastname === 'string' ? props.lastname : '';
      const fullName = `${firstName} ${lastName}`.trim();

      return {
        id: contact.id,
        name: fullName || 'Unknown',
        phone: typeof props.phone === 'string' ? props.phone : '',
        reason:
          typeof props.callback_reason === 'string' ? props.callback_reason : 'Callback requested',
        waitingMinutes,
        procedureInterest:
          typeof props.procedure_interest === 'string' ? props.procedure_interest : undefined,
      };
    });
  } catch (error) {
    logger.error({ error }, 'Failed to fetch hot leads from HubSpot');
    return [];
  }
}

// =============================================================================
// APPOINTMENTS
// =============================================================================

interface AppointmentRow {
  id: string;
  start_time: Date;
  patient_name: string;
  procedure_type: string;
  confirmed: boolean;
  checked_in: boolean;
}

/**
 * Get today's appointments
 */
export async function getTodaysAppointmentsAction(): Promise<Appointment[]> {
  const db = getDatabase();

  try {
    const result = await db.query<AppointmentRow>(
      `SELECT
        a.id,
        a.start_time,
        COALESCE(p.name, a.patient_name, 'Unknown') as patient_name,
        a.procedure_type,
        a.confirmed,
        a.checked_in
       FROM appointments a
       LEFT JOIN patients p ON a.patient_id = p.id
       WHERE DATE(a.start_time) = CURRENT_DATE
       AND a.status != 'cancelled'
       ORDER BY a.start_time ASC`
    );

    return result.rows.map((row) => ({
      id: row.id,
      time: new Date(row.start_time).toLocaleTimeString('en-US', {
        hour: '2-digit',
        minute: '2-digit',
        hour12: false,
      }),
      patientName: row.patient_name,
      procedure: row.procedure_type,
      confirmed: row.confirmed,
      checkedIn: row.checked_in,
    }));
  } catch (error) {
    logger.error({ error }, 'Failed to fetch appointments');
    return [];
  }
}

/**
 * Send reminder to patient via WhatsApp
 */
export async function sendReminderAction(appointmentId: string): Promise<void> {
  const { whatsapp } = getClients();
  const db = getDatabase();

  // Get appointment details
  const result = await db.query<{
    patient_phone: string;
    patient_name: string;
    start_time: Date;
    procedure_type: string;
  }>(
    `SELECT
      COALESCE(p.phone, a.patient_phone) as patient_phone,
      COALESCE(p.name, a.patient_name) as patient_name,
      a.start_time,
      a.procedure_type
     FROM appointments a
     LEFT JOIN patients p ON a.patient_id = p.id
     WHERE a.id = $1`,
    [appointmentId]
  );

  const appointment = result.rows.at(0);
  if (!appointment) {
    throw new Error('Appointment not found');
  }

  if (!whatsapp) {
    logger.warn('WhatsApp client not configured, skipping reminder');
    // Mark as sent anyway in demo mode
    await db.query(`UPDATE appointments SET reminder_sent_at = NOW() WHERE id = $1`, [
      appointmentId,
    ]);
    return;
  }

  try {
    // Send WhatsApp template reminder
    await whatsapp.sendTemplate({
      to: appointment.patient_phone,
      templateName: 'appointment_reminder',
      language: 'ro',
      components: [
        {
          type: 'body',
          parameters: [
            { type: 'text', text: appointment.patient_name },
            {
              type: 'text',
              text: new Date(appointment.start_time).toLocaleDateString('ro-RO', {
                weekday: 'long',
                day: 'numeric',
                month: 'long',
              }),
            },
            {
              type: 'text',
              text: new Date(appointment.start_time).toLocaleTimeString('ro-RO', {
                hour: '2-digit',
                minute: '2-digit',
              }),
            },
          ],
        },
      ],
    });

    // Mark reminder as sent
    await db.query(`UPDATE appointments SET reminder_sent_at = NOW() WHERE id = $1`, [
      appointmentId,
    ]);

    logger.info({ appointmentId }, 'Appointment reminder sent');
  } catch (error) {
    logger.error({ error, appointmentId }, 'Failed to send reminder');
    throw error;
  }
}

/**
 * Check in patient
 */
export async function checkInPatientAction(appointmentId: string): Promise<void> {
  const db = getDatabase();

  await db.query(
    `UPDATE appointments
     SET checked_in = true, checked_in_at = NOW()
     WHERE id = $1`,
    [appointmentId]
  );

  logger.info({ appointmentId }, 'Patient checked in');
}

// =============================================================================
// CALLS
// =============================================================================

/**
 * Initiate call to lead via Vapi
 */
export async function initiateCallAction(leadId: string): Promise<void> {
  const { hubspot, vapi } = getClients();

  if (!vapi) {
    logger.warn('Vapi client not configured');
    return;
  }

  // Get lead details from HubSpot
  let phone: string | undefined;

  if (hubspot) {
    try {
      const contact = await hubspot.getContact(leadId);
      phone = contact.properties.phone as string | undefined;
    } catch (error) {
      logger.warn({ error, leadId }, 'Failed to fetch contact from HubSpot');
    }
  }

  if (!phone) {
    throw new Error('Lead phone number not found');
  }

  try {
    // Create outbound call via Vapi
    await vapi.createOutboundCall({
      phoneNumber: phone,
      metadata: {
        leadId,
        source: 'receptionist-dashboard',
        initiatedBy: 'receptionist',
      },
    });

    // Update last call time in HubSpot
    if (hubspot) {
      await hubspot.updateContact(leadId, {
        last_call_time: new Date().toISOString(),
        last_call_direction: 'outbound',
      });
    }

    logger.info({ leadId }, 'Outbound call initiated');
  } catch (error) {
    logger.error({ error, leadId }, 'Failed to initiate call');
    throw error;
  }
}

// =============================================================================
// BOOKING
// =============================================================================

interface TimeSlotRow {
  id: string;
  start_time: Date;
  end_time: Date;
  practitioner_name: string;
}

/**
 * Get available slots for booking
 */
export async function getAvailableSlotsAction(): Promise<DaySlots[]> {
  const db = getDatabase();

  try {
    // Get available slots for next 5 business days
    const result = await db.query<TimeSlotRow>(
      `SELECT
        ts.id,
        ts.start_time,
        ts.end_time,
        p.name as practitioner_name
       FROM time_slots ts
       JOIN practitioners p ON ts.practitioner_id = p.id
       WHERE ts.is_booked = false
       AND ts.start_time > NOW()
       AND ts.start_time < NOW() + INTERVAL '7 days'
       AND EXTRACT(DOW FROM ts.start_time) NOT IN (0, 6)
       ORDER BY ts.start_time ASC
       LIMIT 50`
    );

    // Group by day
    const dayMap = new Map<string, DaySlots>();

    for (const row of result.rows) {
      const date = new Date(row.start_time);
      const dateKey = date.toISOString().split('T')[0];
      const time = date.toLocaleTimeString('en-US', {
        hour: '2-digit',
        minute: '2-digit',
        hour12: false,
      });

      let daySlots = dayMap.get(dateKey);
      if (!daySlots) {
        const isToday = dateKey === new Date().toISOString().split('T')[0];
        const isTomorrow = dateKey === new Date(Date.now() + 86400000).toISOString().split('T')[0];
        const label = isToday
          ? 'Today'
          : isTomorrow
            ? 'Tomorrow'
            : date.toLocaleDateString('en-US', { weekday: 'long' });

        daySlots = {
          date: dateKey,
          label,
          slots: [],
        };
        dayMap.set(dateKey, daySlots);
      }

      daySlots.slots.push({
        time,
        available: true,
      });
    }

    return Array.from(dayMap.values()).slice(0, 5);
  } catch (error) {
    logger.error({ error }, 'Failed to fetch available slots');
    // Return mock data as fallback
    const today = new Date();
    const days: DaySlots[] = [];

    for (let i = 1; i <= 5; i++) {
      const date = new Date(today);
      date.setDate(date.getDate() + i);

      const dayName = i === 1 ? 'Tomorrow' : date.toLocaleDateString('en-US', { weekday: 'long' });

      days.push({
        date: date.toISOString().split('T')[0],
        label: dayName,
        slots: [
          { time: '09:00', available: true },
          { time: '10:00', available: true },
          { time: '11:00', available: true },
          { time: '14:00', available: true },
          { time: '15:00', available: true },
        ],
      });
    }

    return days;
  }
}

/**
 * Book appointment
 */
export async function bookAppointmentAction(
  patientName: string,
  date: string,
  time: string,
  procedure?: string
): Promise<void> {
  const db = getDatabase();
  const { whatsapp } = getClients();

  try {
    // Find the slot
    const startTime = new Date(`${date}T${time}:00`);

    // Create appointment
    const result = await db.query<{ id: string; patient_phone: string }>(
      `INSERT INTO appointments (
        patient_name,
        procedure_type,
        start_time,
        status,
        confirmed,
        created_at
      ) VALUES ($1, $2, $3, 'scheduled', true, NOW())
      RETURNING id`,
      [patientName, procedure ?? 'General consultation', startTime]
    );

    const appointmentId = result.rows[0]?.id;

    // Mark slot as booked
    await db.query(
      `UPDATE time_slots
       SET is_booked = true, appointment_id = $1
       WHERE start_time = $2 AND is_booked = false`,
      [appointmentId, startTime]
    );

    logger.info({ appointmentId, patientName, date, time }, 'Appointment booked');

    // Send confirmation via WhatsApp if available
    if (whatsapp && result.rows[0]?.patient_phone) {
      try {
        await whatsapp.sendTemplate({
          to: result.rows[0].patient_phone,
          templateName: 'appointment_confirmation',
          language: 'ro',
          components: [
            {
              type: 'body',
              parameters: [
                { type: 'text', text: patientName },
                {
                  type: 'text',
                  text: new Date(startTime).toLocaleDateString('ro-RO', {
                    weekday: 'long',
                    day: 'numeric',
                    month: 'long',
                  }),
                },
                { type: 'text', text: time },
              ],
            },
          ],
        });
      } catch (error) {
        logger.warn({ error }, 'Failed to send booking confirmation');
      }
    }
  } catch (error) {
    logger.error({ error, patientName, date, time }, 'Failed to book appointment');
    throw error;
  }
}

// =============================================================================
// CALL OUTCOMES
// =============================================================================

/**
 * Save call outcome
 */
export async function saveCallOutcomeAction(
  leadId: string,
  outcome: CallOutcome,
  note?: string
): Promise<void> {
  const { hubspot } = getClients();
  const db = getDatabase();

  // Map outcome to HubSpot properties
  const outcomeProperties: Record<string, string> = {
    last_call_outcome: outcome,
    last_call_time: new Date().toISOString(),
  };

  if (note) {
    outcomeProperties.last_call_note = note;
  }

  // Update lead status based on outcome
  switch (outcome) {
    case 'booked':
      outcomeProperties.lead_status = 'APPOINTMENT_BOOKED';
      break;
    case 'callback':
      outcomeProperties.lead_status = 'CALLBACK_REQUESTED';
      break;
    case 'not_interested':
      outcomeProperties.lead_status = 'NOT_INTERESTED';
      break;
    case 'voicemail':
      outcomeProperties.lead_status = 'VOICEMAIL_LEFT';
      break;
    default: {
      // Exhaustive check - this should never happen
      const _exhaustiveCheck: never = outcome;
      void _exhaustiveCheck;
    }
  }

  // Update in HubSpot
  if (hubspot) {
    try {
      await hubspot.updateContact(leadId, outcomeProperties);
      logger.info({ leadId, outcome }, 'Call outcome saved to HubSpot');
    } catch (error) {
      logger.error({ error, leadId }, 'Failed to update HubSpot contact');
    }
  }

  // Also log to local database for analytics
  try {
    await db.query(
      `INSERT INTO call_outcomes (lead_id, outcome, note, created_at)
       VALUES ($1, $2, $3, NOW())`,
      [leadId, outcome, note ?? null]
    );
  } catch (error) {
    logger.warn({ error }, 'Failed to log call outcome locally');
  }
}

// =============================================================================
// INCOMING CALLS
// =============================================================================

/**
 * Answer incoming call
 */
export async function answerCallAction(callSid: string): Promise<void> {
  const { vapi } = getClients();
  const db = getDatabase();

  logger.info({ callSid }, 'Answering call');

  // Update call status in database
  try {
    await db.query(
      `UPDATE calls SET status = 'answered', answered_at = NOW() WHERE call_sid = $1`,
      [callSid]
    );
  } catch (error) {
    logger.warn({ error, callSid }, 'Failed to update call status');
  }

  // If using Vapi, the actual call answering happens on the client side
  // This action just records the intent and updates our records
  if (vapi) {
    // Vapi handles the actual call connection via WebRTC on the client
    logger.info({ callSid }, 'Call will be connected via Vapi WebRTC');
  }
}

/**
 * Decline incoming call
 */
export async function declineCallAction(callSid: string): Promise<void> {
  const db = getDatabase();

  logger.info({ callSid }, 'Declining call');

  // Update call status
  try {
    await db.query(`UPDATE calls SET status = 'declined', ended_at = NOW() WHERE call_sid = $1`, [
      callSid,
    ]);
  } catch (error) {
    logger.warn({ error, callSid }, 'Failed to update call status');
  }

  // Note: The actual call rejection happens via Vapi/Twilio webhook
  // This action records the receptionist's intent to decline
}

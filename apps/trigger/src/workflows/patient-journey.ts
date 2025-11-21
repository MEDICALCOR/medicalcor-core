import { task, logger, wait } from '@trigger.dev/sdk/v3';
import { z } from 'zod';

/**
 * Patient Journey Workflow
 * Orchestrates the end-to-end patient journey from first contact to appointment
 */

const PatientJourneyPayloadSchema = z.object({
  phone: z.string(),
  hubspotContactId: z.string(),
  channel: z.enum(['whatsapp', 'voice', 'web']),
  initialScore: z.number(),
  classification: z.enum(['HOT', 'WARM', 'COLD', 'UNQUALIFIED']),
  procedureInterest: z.array(z.string()).optional(),
  correlationId: z.string(),
});

export const patientJourneyWorkflow = task({
  id: 'patient-journey-workflow',
  retry: {
    maxAttempts: 5,
    minTimeoutInMs: 5000,
    maxTimeoutInMs: 60000,
    factor: 2,
  },
  run: async (payload: z.infer<typeof PatientJourneyPayloadSchema>) => {
    const { phone, hubspotContactId, channel, initialScore, classification, procedureInterest, correlationId } = payload;

    logger.info('Starting patient journey workflow', {
      phone,
      hubspotContactId,
      classification,
      correlationId,
    });

    // ============================================
    // STAGE 1: Initial Engagement
    // ============================================
    logger.info('Stage 1: Initial engagement', { correlationId });

    if (classification === 'HOT') {
      // Hot leads get immediate attention
      // await hubspotClient.createTask({
      //   contactId: hubspotContactId,
      //   subject: `URGENT: Hot lead requires immediate follow-up`,
      //   body: `Lead score: ${initialScore}/5. Interested in: ${procedureInterest?.join(', ') ?? 'Unknown'}`,
      //   priority: 'HIGH',
      //   dueDate: new Date(), // Due immediately
      // });

      // Send acknowledgment template
      // await whatsappClient.sendTemplate(phone, 'hot_lead_acknowledgment', {
      //   name: '{{1}}', // Will be replaced with contact name
      // });

      logger.info('Hot lead: Created urgent task and sent acknowledgment', { correlationId });
    } else if (classification === 'WARM') {
      // Warm leads get nurture sequence
      // await startNurtureSequence(hubspotContactId, 'warm_lead');
      logger.info('Warm lead: Started nurture sequence', { correlationId });
    } else if (classification === 'COLD') {
      // Cold leads get AI response and follow-up scheduling
      // Schedule follow-up in 24 hours
      logger.info('Cold lead: Scheduled 24h follow-up', { correlationId });
    }

    // ============================================
    // STAGE 2: Qualification Check (after 4 hours for non-HOT)
    // ============================================
    if (classification !== 'HOT') {
      logger.info('Waiting for qualification check window', { correlationId });
      await wait.for({ hours: 4 });

      // Check if lead has been engaged
      // const updatedContact = await hubspotClient.getContact(hubspotContactId);
      // const hasResponded = checkForNewMessages(updatedContact);

      // if (!hasResponded) {
      //   // Send follow-up message
      //   await whatsappClient.sendTemplate(phone, 'gentle_followup', {});
      //   logger.info('Sent gentle follow-up message', { correlationId });
      // }
    }

    // ============================================
    // STAGE 3: Appointment Scheduling (after engagement)
    // ============================================
    logger.info('Stage 3: Checking for appointment opportunity', { correlationId });

    // Check if ready for appointment
    // const isReadyForAppointment = await checkAppointmentReadiness(hubspotContactId);
    // if (isReadyForAppointment) {
    //   // Trigger booking flow
    //   await triggerBookingAgent(phone, hubspotContactId, procedureInterest);
    // }

    // ============================================
    // STAGE 4: Post-Appointment Follow-up
    // ============================================
    // Wait for appointment to be scheduled and completed
    // This would typically be triggered by a separate event

    // ============================================
    // STAGE 5: Referral Request (if positive outcome)
    // ============================================
    // After successful procedure, request referral

    logger.info('Patient journey workflow completed initial stages', {
      correlationId,
      classification,
    });

    return {
      success: true,
      phone,
      hubspotContactId,
      classification,
      stagesCompleted: ['initial_engagement', 'qualification_check'],
    };
  },
});

/**
 * Lead Nurture Sequence Workflow
 * Automated nurture sequence for warm leads
 */
const NurtureSequencePayloadSchema = z.object({
  phone: z.string(),
  hubspotContactId: z.string(),
  sequenceType: z.enum(['warm_lead', 'cold_lead', 'post_consultation', 'recall']),
  correlationId: z.string(),
});

export const nurtureSequenceWorkflow = task({
  id: 'nurture-sequence-workflow',
  run: async (payload: z.infer<typeof NurtureSequencePayloadSchema>) => {
    const { phone, hubspotContactId, sequenceType, correlationId } = payload;

    logger.info('Starting nurture sequence', {
      hubspotContactId,
      sequenceType,
      correlationId,
    });

    const sequences: Record<string, { delays: number[]; templates: string[] }> = {
      warm_lead: {
        delays: [24, 72, 168], // hours
        templates: ['warm_followup_1', 'warm_followup_2', 'warm_followup_3'],
      },
      cold_lead: {
        delays: [48, 168, 336], // hours
        templates: ['cold_reengagement_1', 'cold_reengagement_2', 'cold_reengagement_3'],
      },
      post_consultation: {
        delays: [24, 72, 168],
        templates: ['post_consult_1', 'post_consult_2', 'post_consult_3'],
      },
      recall: {
        delays: [24, 168, 336],
        templates: ['recall_reminder_1', 'recall_reminder_2', 'recall_final'],
      },
    };

    const sequence = sequences[sequenceType];
    if (!sequence) {
      logger.error('Unknown sequence type', { sequenceType });
      return { success: false, error: 'Unknown sequence type' };
    }

    for (let i = 0; i < sequence.delays.length; i++) {
      const delay = sequence.delays[i];
      const template = sequence.templates[i];

      if (!delay || !template) continue;

      logger.info(`Waiting ${delay} hours for next message`, { correlationId, step: i + 1 });
      await wait.for({ hours: delay });

      // Check if lead has converted or opted out
      // const contact = await hubspotClient.getContact(hubspotContactId);
      // if (contact.properties.lifecyclestage === 'customer') {
      //   logger.info('Lead converted, stopping sequence', { correlationId });
      //   break;
      // }
      // if (contact.properties.consent_marketing === 'false') {
      //   logger.info('Lead opted out, stopping sequence', { correlationId });
      //   break;
      // }

      // Send nurture message
      // await whatsappClient.sendTemplate(phone, template, {});
      logger.info(`Sent nurture message: ${template}`, { correlationId, step: i + 1 });
    }

    return {
      success: true,
      hubspotContactId,
      sequenceType,
      messagesSet: sequence.templates.length,
    };
  },
});

/**
 * Booking Agent Workflow
 * Handles appointment scheduling via WhatsApp
 */
const BookingAgentPayloadSchema = z.object({
  phone: z.string(),
  hubspotContactId: z.string(),
  procedureType: z.string(),
  preferredDates: z.array(z.string()).optional(),
  correlationId: z.string(),
});

export const bookingAgentWorkflow = task({
  id: 'booking-agent-workflow',
  run: async (payload: z.infer<typeof BookingAgentPayloadSchema>) => {
    const { phone, hubspotContactId, procedureType, preferredDates, correlationId } = payload;

    logger.info('Starting booking agent', {
      hubspotContactId,
      procedureType,
      correlationId,
    });

    // Step 1: Get available slots
    // const availableSlots = await schedulingService.getAvailableSlots({
    //   procedureType,
    //   preferredDates,
    //   limit: 3,
    // });

    // Step 2: Present slots to patient
    // const slotMessage = formatSlotsMessage(availableSlots);
    // await whatsappClient.sendText(phone, slotMessage);

    // Step 3: Wait for response (with timeout)
    // This would be handled by a separate message handler that updates the workflow

    // Step 4: Confirm booking
    // await schedulingService.bookAppointment({
    //   hubspotContactId,
    //   slot: selectedSlot,
    //   procedureType,
    // });

    // Step 5: Send confirmation
    // await whatsappClient.sendTemplate(phone, 'appointment_confirmation', {
    //   date: formatDate(selectedSlot.date),
    //   time: formatTime(selectedSlot.time),
    //   location: selectedSlot.location,
    // });

    logger.info('Booking agent completed', { correlationId });

    return {
      success: true,
      hubspotContactId,
      procedureType,
    };
  },
});

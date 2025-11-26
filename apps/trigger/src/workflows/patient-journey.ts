import { task, logger, wait } from '@trigger.dev/sdk/v3';
import { z } from 'zod';
import crypto from 'crypto';
import {
  createIntegrationClients,
  type TimeSlot,
  type Appointment,
} from '@medicalcor/integrations';

/**
 * Initialize clients lazily using shared factory
 */
function getClients() {
  return createIntegrationClients({
    source: 'patient-journey',
    includeScheduling: true,
    includeTemplateCatalog: true,
  });
}

/**
 * Patient Journey Workflow
 * Orchestrates the end-to-end patient journey from first contact to appointment
 */

export const PatientJourneyPayloadSchema = z.object({
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
    const {
      phone,
      hubspotContactId,
      channel: _channel,
      initialScore,
      classification,
      procedureInterest,
      correlationId,
    } = payload;
    const { hubspot, whatsapp, eventStore } = getClients();

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
      // Hot leads get priority scheduling attention
      if (hubspot) {
        // IDEMPOTENCY: Generate unique key to prevent duplicate tasks on retry
        const taskIdempotencyKey = crypto
          .createHash('sha256')
          .update(`task:hot_lead:${hubspotContactId}:${correlationId}`)
          .digest('hex')
          .slice(0, 16);

        try {
          // Check if task was already created (idempotency check via event store)
          const existingEvents = await eventStore.getEventsByCorrelation(
            `${correlationId}:task:${taskIdempotencyKey}`
          );
          const taskAlreadyCreated = existingEvents.some(
            (e) => e.type === 'hubspot.task.created'
          );

          if (!taskAlreadyCreated) {
            await hubspot.createTask({
              contactId: hubspotContactId,
              subject: `PRIORITY REQUEST: Patient wants quick appointment`,
              body: `Lead score: ${initialScore}/5. Interested in: ${procedureInterest?.join(', ') ?? 'Unknown'}\n\nPatient reported interest/discomfort. Schedule priority appointment during business hours.`,
              priority: 'HIGH',
              dueDate: new Date(Date.now() + 30 * 60 * 1000), // Due in 30 minutes during business hours
            });

            // Record task creation for idempotency
            await eventStore.emit({
              type: 'hubspot.task.created',
              correlationId: `${correlationId}:task:${taskIdempotencyKey}`,
              aggregateId: hubspotContactId,
              aggregateType: 'contact',
              payload: { taskType: 'hot_lead_priority', idempotencyKey: taskIdempotencyKey },
            });

            logger.info('Created priority request task for hot lead', { correlationId });
          } else {
            logger.info('Skipping duplicate task creation (idempotent)', {
              correlationId,
              taskIdempotencyKey,
            });
          }
        } catch (error) {
          logger.error('Failed to create HubSpot task', { error, correlationId });
        }
      }

      // Send priority scheduling acknowledgment
      if (whatsapp) {
        try {
          await whatsapp.sendText({
            to: phone,
            text: 'Am înțeles că aveți un disconfort. Vă priorizăm pentru o programare cât mai rapidă în timpul programului de lucru. Pentru urgențe vitale, sunați la 112.',
          });
          logger.info('Sent priority scheduling acknowledgment via WhatsApp', { correlationId });
        } catch (error) {
          logger.error('Failed to send WhatsApp acknowledgment', { error, correlationId });
        }
      }

      logger.info('Hot lead: Created priority task and sent acknowledgment', { correlationId });
    } else if (classification === 'WARM') {
      // Warm leads get nurture sequence
      logger.info('Warm lead: Starting nurture sequence', { correlationId });

      // Trigger nurture sequence for warm leads
      await nurtureSequenceWorkflow.trigger({
        phone,
        hubspotContactId,
        sequenceType: 'warm_lead',
        correlationId: `${correlationId}_nurture`,
      });

      // Send initial warm lead message
      if (whatsapp) {
        try {
          await whatsapp.sendText({
            to: phone,
            text: 'Bună ziua! Vă mulțumim pentru interesul acordat serviciilor noastre. Echipa noastră vă va contacta în curând cu informații detaliate despre procedurile disponibile și beneficiile acestora.',
          });
          logger.info('Sent warm lead introduction message', { correlationId });
        } catch (error) {
          logger.error('Failed to send warm lead message', { error, correlationId });
        }
      }
    } else if (classification === 'COLD') {
      // Cold leads get nurture sequence and scheduled follow-up
      logger.info('Cold lead: Starting cold nurture sequence with 24h follow-up', {
        correlationId,
      });

      // Trigger cold lead nurture sequence
      await nurtureSequenceWorkflow.trigger({
        phone,
        hubspotContactId,
        sequenceType: 'cold_lead',
        correlationId: `${correlationId}_nurture`,
      });

      // Send initial informational message
      if (whatsapp) {
        try {
          await whatsapp.sendText({
            to: phone,
            text: 'Bună ziua! Vă mulțumim că ne-ați contactat. Dacă aveți întrebări despre serviciile noastre de stomatologie, suntem aici să vă ajutăm.',
          });
          logger.info('Sent cold lead introduction message', { correlationId });
        } catch (error) {
          logger.error('Failed to send cold lead message', { error, correlationId });
        }
      }
    } else {
      // Unqualified leads get polite acknowledgment
      logger.info('Unqualified lead: Sending polite response', { correlationId });

      if (whatsapp) {
        try {
          await whatsapp.sendText({
            to: phone,
            text: 'Bună ziua! Vă mulțumim pentru mesaj. Dacă aveți întrebări în viitor, nu ezitați să ne contactați.',
          });
          logger.info('Sent unqualified lead response', { correlationId });
        } catch (error) {
          logger.error('Failed to send unqualified lead message', { error, correlationId });
        }
      }
    }

    // Emit domain event
    await emitEvent(eventStore, 'lead.engaged', hubspotContactId, {
      phone,
      classification,
      correlationId,
    });

    // ============================================
    // STAGE 2: Qualification Check (after 4 hours for non-HOT)
    // ============================================
    if (classification !== 'HOT') {
      logger.info('Waiting for qualification check window', { correlationId });
      await wait.for({ hours: 4 });

      // Check if lead has been engaged
      if (hubspot) {
        try {
          const updatedContact = await hubspot.getContact(hubspotContactId);
          // Check lifecycle stage as proxy for engagement
          const hasEngagement =
            updatedContact.properties.lifecyclestage === 'opportunity' ||
            updatedContact.properties.lead_status === 'engaged';

          if (!hasEngagement && whatsapp) {
            await whatsapp.sendText({
              to: phone,
              text: 'Bună ziua! Am observat că nu am primit încă un răspuns de la dumneavoastră. Dacă aveți întrebări despre serviciile noastre, suntem aici să vă ajutăm. 😊',
            });
            logger.info('Sent gentle follow-up message', { correlationId });
          }
        } catch (error) {
          logger.warn('Failed to check contact engagement', { error, correlationId });
        }
      }
    }

    // ============================================
    // STAGE 3: Appointment Scheduling (after engagement)
    // ============================================
    logger.info('Stage 3: Checking for appointment opportunity', { correlationId });

    // For hot leads, directly suggest booking
    if (classification === 'HOT' && whatsapp) {
      try {
        await whatsapp.sendInteractiveButtons({
          to: phone,
          headerText: 'Programare Consultație',
          bodyText:
            'Doriți să programați o consultație gratuită? Unul dintre medicii noștri vă va contacta pentru a stabili cel mai convenabil moment.',
          buttons: [
            { id: 'book_yes', title: 'Da, vreau să programez' },
            { id: 'book_later', title: 'Mai târziu' },
          ],
        });
        logger.info('Sent booking prompt to hot lead', { correlationId });
      } catch (error) {
        logger.error('Failed to send booking prompt', { error, correlationId });
      }
    }

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
export const NurtureSequencePayloadSchema = z.object({
  phone: z.string(),
  hubspotContactId: z.string(),
  sequenceType: z.enum(['warm_lead', 'cold_lead', 'post_consultation', 'recall']),
  correlationId: z.string(),
});

export const nurtureSequenceWorkflow = task({
  id: 'nurture-sequence-workflow',
  run: async (payload: z.infer<typeof NurtureSequencePayloadSchema>) => {
    const { phone, hubspotContactId, sequenceType, correlationId } = payload;
    const { hubspot, whatsapp } = getClients();

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

    let messagesSent = 0;

    for (let i = 0; i < sequence.delays.length; i++) {
      const delay = sequence.delays[i];
      const template = sequence.templates[i];

      if (!delay || !template) continue;

      logger.info(`Waiting ${delay} hours for next message`, { correlationId, step: i + 1 });
      await wait.for({ hours: delay });

      // Check if lead has converted or opted out
      if (hubspot) {
        try {
          const contact = await hubspot.getContact(hubspotContactId);
          if (contact.properties.lifecyclestage === 'customer') {
            logger.info('Lead converted, stopping sequence', { correlationId });
            break;
          }
          if (contact.properties.consent_marketing === 'false') {
            logger.info('Lead opted out, stopping sequence', { correlationId });
            break;
          }
        } catch (error) {
          logger.warn('Failed to check contact status', { error, correlationId });
        }
      }

      // Send nurture message
      if (whatsapp) {
        try {
          await whatsapp.sendTemplate({
            to: phone,
            templateName: template,
          });
          messagesSent++;
          logger.info(`Sent nurture message: ${template}`, { correlationId, step: i + 1 });
        } catch (error) {
          logger.error(`Failed to send nurture message: ${template}`, { error, correlationId });
        }
      } else {
        logger.info(`Would send nurture message: ${template}`, { correlationId, step: i + 1 });
      }
    }

    return {
      success: true,
      hubspotContactId,
      sequenceType,
      messagesConfigured: sequence.templates.length,
      messagesSent,
    };
  },
});

/**
 * Booking Agent Workflow
 * Handles appointment scheduling via WhatsApp with interactive slot selection
 *
 * Flow:
 * 1. Fetch available slots from scheduling service
 * 2. Present slots to patient via WhatsApp interactive list
 * 3. Book selected slot when patient confirms
 * 4. Send confirmation message and update HubSpot
 * 5. Emit appointment.scheduled event
 */
export const BookingAgentPayloadSchema = z.object({
  phone: z.string(),
  hubspotContactId: z.string(),
  procedureType: z.string(),
  preferredDates: z.array(z.string()).optional(),
  patientName: z.string().optional(),
  patientEmail: z.string().optional(),
  language: z.enum(['ro', 'en', 'de']).default('ro'),
  correlationId: z.string(),
  // Optional: pre-selected slot (for direct booking without interactive selection)
  selectedSlotId: z.string().optional(),
});

export type BookingAgentPayload = z.infer<typeof BookingAgentPayloadSchema>;

export const bookingAgentWorkflow = task({
  id: 'booking-agent-workflow',
  retry: {
    maxAttempts: 3,
    minTimeoutInMs: 2000,
    maxTimeoutInMs: 30000,
    factor: 2,
  },
  run: async (payload: BookingAgentPayload) => {
    const {
      phone,
      hubspotContactId,
      procedureType,
      preferredDates,
      patientName,
      patientEmail,
      language,
      correlationId,
      selectedSlotId,
    } = payload;
    const { hubspot, whatsapp, scheduling, templateCatalog, eventStore } = getClients();

    logger.info('Starting booking agent workflow', {
      hubspotContactId,
      procedureType,
      hasPreselectedSlot: !!selectedSlotId,
      correlationId,
    });

    // ============================================
    // Step 1: Get available slots
    // ============================================
    logger.info('Fetching available slots', { procedureType, correlationId });

    if (!scheduling) {
      logger.error('Scheduling service not available', { correlationId });
      return {
        success: false,
        error: 'Scheduling service not configured',
        hubspotContactId,
        procedureType,
      };
    }

    let availableSlots: TimeSlot[];
    try {
      const slotsOptions: { procedureType: string; limit: number; preferredDates?: string[] } = {
        procedureType,
        limit: 5,
      };
      if (preferredDates && preferredDates.length > 0) {
        slotsOptions.preferredDates = preferredDates;
      }
      availableSlots = await scheduling.getAvailableSlots(slotsOptions);
    } catch (error) {
      logger.error('Failed to fetch available slots', { error, correlationId });

      // Notify patient of error
      if (whatsapp) {
        await whatsapp.sendText({
          to: phone,
          text: getLocalizedMessage('slots_error', language),
        });
      }

      return {
        success: false,
        error: 'Failed to fetch available slots',
        hubspotContactId,
        procedureType,
      };
    }

    if (availableSlots.length === 0) {
      logger.warn('No available slots found', { procedureType, correlationId });

      if (whatsapp) {
        await whatsapp.sendText({
          to: phone,
          text: getLocalizedMessage('no_slots', language),
        });
      }

      // Create HubSpot task for manual follow-up
      if (hubspot) {
        try {
          await hubspot.createTask({
            contactId: hubspotContactId,
            subject: `No slots available for ${procedureType} - manual scheduling needed`,
            body: `Patient tried to book ${procedureType} but no slots were available. Please contact them manually.`,
            priority: 'HIGH',
          });
        } catch (taskError) {
          logger.error('Failed to create follow-up task', { error: taskError, correlationId });
        }
      }

      return {
        success: false,
        error: 'No slots available',
        hubspotContactId,
        procedureType,
      };
    }

    logger.info(`Found ${availableSlots.length} available slots`, { correlationId });

    // ============================================
    // Step 2: Handle pre-selected slot or present options
    // ============================================
    let selectedSlot: TimeSlot | undefined;

    if (selectedSlotId) {
      // Direct booking with pre-selected slot
      // CRITICAL FIX: Re-validate slot availability before booking
      // The slot might have been booked by another user since it was displayed
      selectedSlot = availableSlots.find((slot) => slot.id === selectedSlotId);

      if (!selectedSlot) {
        logger.warn('Pre-selected slot not found in available slots - may have been booked', {
          selectedSlotId,
          availableSlotsCount: availableSlots.length,
          correlationId,
        });

        // Notify patient that the slot is no longer available
        if (whatsapp) {
          const slotUnavailableMessages: Record<string, string> = {
            ro: 'Ne pare rău, intervalul selectat nu mai este disponibil. Vă rugăm să alegeți alt interval din lista de mai jos.',
            en: 'Sorry, the selected time slot is no longer available. Please choose another time from the list below.',
            de: 'Der ausgewählte Termin ist leider nicht mehr verfügbar. Bitte wählen Sie einen anderen Termin aus der Liste unten.',
          };

          try {
            await whatsapp.sendText({
              to: phone,
              text: slotUnavailableMessages[language] ?? slotUnavailableMessages.ro ?? '',
            });
          } catch (notifyError) {
            logger.error('Failed to send slot unavailable notification', {
              error: notifyError,
              correlationId,
            });
          }
        }

        // Fall through to present available options
      } else {
        // Double-check the slot is still marked as available
        // This provides an additional safety layer
        if (!selectedSlot.available) {
          logger.warn('Pre-selected slot exists but is marked as unavailable', {
            selectedSlotId,
            correlationId,
          });
          selectedSlot = undefined; // Reset to trigger slot selection
        }
      }
    }

    if (!selectedSlot && whatsapp) {
      // Present available slots to patient via WhatsApp interactive list
      const slotsMessage = formatSlotsMessage(availableSlots, language, scheduling);

      try {
        await whatsapp.sendInteractiveList({
          to: phone,
          headerText: getLocalizedMessage('slots_header', language),
          bodyText: slotsMessage.bodyText,
          buttonText: getLocalizedMessage('select_slot_button', language),
          sections: [
            {
              title: getLocalizedMessage('available_slots_section', language),
              rows: availableSlots.slice(0, 10).map((slot) => ({
                id: `slot_${slot.id}`,
                title: scheduling.formatSlotShort(slot),
                description: formatSlotDescription(slot, language),
              })),
            },
          ],
          footerText: getLocalizedMessage('slots_footer', language),
        });

        logger.info('Sent slot selection message', {
          slotsCount: availableSlots.length,
          correlationId,
        });

        // Store available slots in context for later selection
        // In a real implementation, this would use workflow state or a session store
        // For now, we'll wait for the webhook handler to trigger a new workflow with selectedSlotId

        return {
          success: true,
          status: 'awaiting_selection',
          hubspotContactId,
          procedureType,
          availableSlotsCount: availableSlots.length,
          availableSlotIds: availableSlots.map((s) => s.id),
        };
      } catch (error) {
        logger.error('Failed to send slot selection message', { error, correlationId });

        // Fallback to simple text message with slots
        const fallbackText = formatSlotsFallbackText(availableSlots, language, scheduling);
        await whatsapp.sendText({ to: phone, text: fallbackText });

        return {
          success: true,
          status: 'awaiting_selection_fallback',
          hubspotContactId,
          procedureType,
        };
      }
    }

    if (!selectedSlot) {
      // No WhatsApp client and no pre-selected slot - can't proceed
      logger.error('Cannot proceed without WhatsApp client or pre-selected slot', {
        correlationId,
      });
      return {
        success: false,
        error: 'No slot selection mechanism available',
        hubspotContactId,
        procedureType,
      };
    }

    // ============================================
    // Step 3: Book the selected slot
    // ============================================
    logger.info('Booking selected slot', { slotId: selectedSlot.id, correlationId });

    let appointment: Appointment;
    try {
      const bookingInput: {
        slotId: string;
        patientPhone: string;
        procedureType: string;
        hubspotContactId?: string;
        metadata?: Record<string, unknown>;
        patientName?: string;
        patientEmail?: string;
      } = {
        slotId: selectedSlot.id,
        patientPhone: phone,
        procedureType,
        hubspotContactId,
        metadata: { correlationId },
      };
      if (patientName) {
        bookingInput.patientName = patientName;
      }
      if (patientEmail) {
        bookingInput.patientEmail = patientEmail;
      }
      appointment = await scheduling.bookAppointment(bookingInput);
    } catch (error) {
      logger.error('Failed to book appointment', { error, slotId: selectedSlot.id, correlationId });

      if (whatsapp) {
        await whatsapp.sendText({
          to: phone,
          text: getLocalizedMessage('booking_error', language),
        });
      }

      return {
        success: false,
        error: 'Failed to book appointment',
        hubspotContactId,
        procedureType,
        slotId: selectedSlot.id,
      };
    }

    logger.info('Appointment booked successfully', {
      appointmentId: appointment.id,
      confirmationCode: appointment.confirmationCode,
      correlationId,
    });

    // ============================================
    // Step 4: Send confirmation message
    // ============================================
    if (whatsapp && templateCatalog) {
      try {
        // Use appointment confirmation template
        const dateStr = templateCatalog.formatDateForTemplate(appointment.scheduledAt, language);
        const timeStr = templateCatalog.formatTimeForTemplate(appointment.scheduledAt);
        const locationStr = appointment.location?.name ?? 'Clinica Noastră';

        await whatsapp.sendTemplate({
          to: phone,
          templateName: 'appointment_confirmation',
          language: templateCatalog.getMetaLanguageCode(language),
          components: [
            {
              type: 'body',
              parameters: [
                { type: 'text', text: dateStr },
                { type: 'text', text: timeStr },
                { type: 'text', text: locationStr },
              ],
            },
          ],
        });

        logger.info('Sent appointment confirmation template', { correlationId });

        // Send additional details as text
        if (appointment.confirmationCode || appointment.location?.address) {
          const detailsText = formatAppointmentDetails(appointment, language);
          await whatsapp.sendText({ to: phone, text: detailsText });
        }

        // Send location if available
        if (appointment.location?.address) {
          // Note: Would need lat/lng for sendLocation - using text for now
          logger.info('Location details included in confirmation', { correlationId });
        }
      } catch (error) {
        logger.error('Failed to send confirmation message', { error, correlationId });
        // Non-critical - appointment is already booked
      }
    }

    // ============================================
    // Step 5: Update HubSpot
    // ============================================
    if (hubspot) {
      try {
        // Update contact with appointment info
        await hubspot.updateContact(hubspotContactId, {
          lifecyclestage: 'opportunity',
          next_appointment_date: appointment.scheduledAt,
          appointment_procedure: procedureType,
        });

        // Log to timeline
        await hubspot.logMessageToTimeline({
          contactId: hubspotContactId,
          message: `Appointment booked: ${procedureType} on ${appointment.scheduledAt}. Confirmation: ${appointment.confirmationCode ?? 'N/A'}`,
          direction: 'OUT',
          channel: 'whatsapp',
          metadata: {
            appointmentId: appointment.id,
            confirmationCode: appointment.confirmationCode,
          },
        });

        logger.info('Updated HubSpot contact with appointment', { correlationId });
      } catch (error) {
        logger.error('Failed to update HubSpot', { error, correlationId });
        // Non-critical - appointment is already booked
      }
    }

    // ============================================
    // Step 6: Emit domain event
    // ============================================
    await emitEvent(eventStore, 'appointment.scheduled', appointment.id, {
      appointmentId: appointment.id,
      hubspotContactId,
      procedureType,
      scheduledAt: appointment.scheduledAt,
      confirmationCode: appointment.confirmationCode,
      correlationId,
    });

    logger.info('Booking agent completed successfully', {
      appointmentId: appointment.id,
      correlationId,
    });

    return {
      success: true,
      status: 'booked',
      appointmentId: appointment.id,
      confirmationCode: appointment.confirmationCode,
      scheduledAt: appointment.scheduledAt,
      hubspotContactId,
      procedureType,
      location: appointment.location?.name,
      practitioner: appointment.practitioner?.name,
    };
  },
});

// ============================================
// Helper Functions
// ============================================

/**
 * Get localized message for booking flow
 */
function getLocalizedMessage(key: string, language: 'ro' | 'en' | 'de'): string {
  const messages: Record<string, Record<string, string>> = {
    slots_header: {
      ro: 'Programări Disponibile',
      en: 'Available Appointments',
      de: 'Verfügbare Termine',
    },
    select_slot_button: {
      ro: 'Alege un interval',
      en: 'Select a time',
      de: 'Zeit auswählen',
    },
    available_slots_section: {
      ro: 'Intervale disponibile',
      en: 'Available times',
      de: 'Verfügbare Zeiten',
    },
    slots_footer: {
      ro: 'Selectați intervalul dorit pentru a confirma programarea.',
      en: 'Select your preferred time to confirm the appointment.',
      de: 'Wählen Sie Ihre bevorzugte Zeit aus, um den Termin zu bestätigen.',
    },
    slots_error: {
      ro: 'Ne pare rău, a apărut o eroare la verificarea disponibilității. Vă rugăm să încercați din nou sau să ne contactați telefonic.',
      en: 'Sorry, there was an error checking availability. Please try again or contact us by phone.',
      de: 'Es tut uns leid, beim Überprüfen der Verfügbarkeit ist ein Fehler aufgetreten. Bitte versuchen Sie es erneut oder kontaktieren Sie uns telefonisch.',
    },
    no_slots: {
      ro: 'Ne pare rău, în momentul de față nu avem intervale disponibile pentru procedura dorită. Un coleg vă va contacta în curând pentru a găsi o soluție.',
      en: 'Sorry, we currently have no available slots for this procedure. A colleague will contact you shortly to find a solution.',
      de: 'Es tut uns leid, wir haben derzeit keine verfügbaren Termine für dieses Verfahren. Ein Kollege wird Sie in Kürze kontaktieren, um eine Lösung zu finden.',
    },
    booking_error: {
      ro: 'Ne pare rău, nu am putut finaliza programarea. Vă rugăm să încercați din nou sau să ne contactați telefonic.',
      en: 'Sorry, we could not complete the booking. Please try again or contact us by phone.',
      de: 'Es tut uns leid, wir konnten die Buchung nicht abschließen. Bitte versuchen Sie es erneut oder kontaktieren Sie uns telefonisch.',
    },
  };

  return messages[key]?.[language] ?? messages[key]?.ro ?? key;
}

/**
 * Format available slots for WhatsApp interactive list
 */
function formatSlotsMessage(
  slots: TimeSlot[],
  language: 'ro' | 'en' | 'de',
  scheduling: { formatSlotForDisplay: (slot: TimeSlot, lang: 'ro' | 'en' | 'de') => string }
): { bodyText: string } {
  const introMessages: Record<string, string> = {
    ro: 'Am găsit următoarele intervale disponibile pentru dumneavoastră:',
    en: 'We found the following available times for you:',
    de: 'Wir haben folgende verfügbare Zeiten für Sie gefunden:',
  };

  const slotList = slots
    .slice(0, 5)
    .map((slot, index) => `${index + 1}. ${scheduling.formatSlotForDisplay(slot, language)}`)
    .join('\n');

  return {
    bodyText: `${introMessages[language] ?? introMessages.ro}\n\n${slotList}`,
  };
}

/**
 * Format slot description for interactive list row
 */
function formatSlotDescription(slot: TimeSlot, language: 'ro' | 'en' | 'de'): string {
  const parts: string[] = [];

  if (slot.practitioner?.name) {
    const withLabels: Record<string, string> = {
      ro: 'cu',
      en: 'with',
      de: 'mit',
    };
    parts.push(`${withLabels[language] ?? 'cu'} ${slot.practitioner.name}`);
  }

  if (slot.location?.name) {
    parts.push(slot.location.name);
  }

  return parts.join(' - ') || `${slot.duration} min`;
}

/**
 * Format slots as fallback text message
 */
function formatSlotsFallbackText(
  slots: TimeSlot[],
  language: 'ro' | 'en' | 'de',
  scheduling: { formatSlotForDisplay: (slot: TimeSlot, lang: 'ro' | 'en' | 'de') => string }
): string {
  const introMessages: Record<string, string> = {
    ro: 'Avem următoarele intervale disponibile:\n\n',
    en: 'We have the following available times:\n\n',
    de: 'Wir haben folgende verfügbare Zeiten:\n\n',
  };

  const instructionMessages: Record<string, string> = {
    ro: '\n\nRăspundeți cu numărul intervalului dorit pentru a confirma programarea.',
    en: '\n\nReply with the number of your preferred time to confirm the appointment.',
    de: '\n\nAntworten Sie mit der Nummer Ihrer bevorzugten Zeit, um den Termin zu bestätigen.',
  };

  const slotList = slots
    .slice(0, 5)
    .map((slot, index) => `${index + 1}. ${scheduling.formatSlotForDisplay(slot, language)}`)
    .join('\n');

  const intro = introMessages[language] ?? introMessages.ro ?? '';
  const instruction = instructionMessages[language] ?? instructionMessages.ro ?? '';
  return intro + slotList + instruction;
}

/**
 * Format appointment details for follow-up message
 */
function formatAppointmentDetails(appointment: Appointment, language: 'ro' | 'en' | 'de'): string {
  const labels: Record<string, Record<string, string>> = {
    confirmation: {
      ro: 'Cod confirmare',
      en: 'Confirmation code',
      de: 'Bestätigungscode',
    },
    address: {
      ro: 'Adresă',
      en: 'Address',
      de: 'Adresse',
    },
    doctor: {
      ro: 'Medic',
      en: 'Doctor',
      de: 'Arzt',
    },
    duration: {
      ro: 'Durată estimată',
      en: 'Estimated duration',
      de: 'Geschätzte Dauer',
    },
    minutes: {
      ro: 'minute',
      en: 'minutes',
      de: 'Minuten',
    },
  };

  const parts: string[] = [];

  if (appointment.confirmationCode) {
    parts.push(
      `📋 ${labels.confirmation?.[language] ?? 'Cod confirmare'}: ${appointment.confirmationCode}`
    );
  }

  if (appointment.practitioner?.name) {
    parts.push(`👨‍⚕️ ${labels.doctor?.[language] ?? 'Medic'}: ${appointment.practitioner.name}`);
  }

  if (appointment.location?.address) {
    parts.push(`📍 ${labels.address?.[language] ?? 'Adresă'}: ${appointment.location.address}`);
  }

  if (appointment.duration) {
    parts.push(
      `⏱️ ${labels.duration?.[language] ?? 'Durată estimată'}: ${appointment.duration} ${labels.minutes?.[language] ?? 'minute'}`
    );
  }

  return parts.join('\n');
}

/**
 * Helper to emit domain events
 */
async function emitEvent(
  eventStore: {
    emit: (input: {
      type: string;
      correlationId: string;
      payload: Record<string, unknown>;
      aggregateId?: string;
      aggregateType?: string;
    }) => Promise<unknown>;
  },
  type: string,
  aggregateId: string,
  payload: Record<string, unknown>
): Promise<void> {
  const correlationId = (payload.correlationId as string) || crypto.randomUUID();
  const aggregateType = type.split('.')[0];
  const input: {
    type: string;
    correlationId: string;
    payload: Record<string, unknown>;
    aggregateId?: string;
    aggregateType?: string;
  } = {
    type,
    correlationId,
    payload,
    aggregateId,
  };
  if (aggregateType) {
    input.aggregateType = aggregateType;
  }
  await eventStore.emit(input);
}

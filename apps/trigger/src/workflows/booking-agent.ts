import { task, logger } from '@trigger.dev/sdk/v3';
import { z } from 'zod';
import {
  createIntegrationClients,
  type TimeSlot,
  type Appointment,
} from '@medicalcor/integrations';
import { getLocalizedMessage, type SupportedLanguage } from './i18n/booking-messages';
import {
  formatSlotsMessage,
  formatSlotDescription,
  formatSlotsFallbackText,
  formatAppointmentDetails,
} from './utils/slot-formatters';
import { emitEvent } from './utils/event-emitter';

/**
 * Booking Agent Workflow
 *
 * Handles appointment scheduling via WhatsApp with interactive slot selection.
 *
 * Flow:
 * 1. Fetch available slots from scheduling service
 * 2. Present slots to patient via WhatsApp interactive list
 * 3. Book selected slot when patient confirms
 * 4. Send confirmation message and update HubSpot
 * 5. Emit appointment.scheduled event
 */

/**
 * Initialize clients lazily using shared factory
 */
function getClients() {
  return createIntegrationClients({
    source: 'booking-agent',
    includeScheduling: true,
    includeTemplateCatalog: true,
  });
}

/**
 * Payload schema for booking agent workflow
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

/**
 * Booking Agent Workflow
 */
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
      selectedSlot = availableSlots.find((slot) => slot.id === selectedSlotId);
      if (!selectedSlot) {
        logger.warn('Pre-selected slot not found or no longer available', {
          selectedSlotId,
          correlationId,
        });
        // Fall through to present available options
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

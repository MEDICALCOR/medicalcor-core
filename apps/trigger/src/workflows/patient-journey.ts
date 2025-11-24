import { task, logger, wait } from '@trigger.dev/sdk/v3';
import { z } from 'zod';
import { createIntegrationClients } from '@medicalcor/integrations';
import { nurtureSequenceWorkflow } from './nurture-sequence';
import { emitEvent } from './utils/event-emitter';

// Re-export related workflows for convenience
export { nurtureSequenceWorkflow, NurtureSequencePayloadSchema } from './nurture-sequence';
export type { NurtureSequencePayload } from './nurture-sequence';
export { bookingAgentWorkflow, BookingAgentPayloadSchema } from './booking-agent';
export type { BookingAgentPayload } from './booking-agent';

/**
 * Patient Journey Workflow
 *
 * Orchestrates the end-to-end patient journey from first contact to appointment.
 * This is the main entry point that coordinates:
 * - Initial lead engagement based on classification
 * - Nurture sequence triggering
 * - Qualification checks
 * - Appointment scheduling prompts
 */

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
 * Payload schema for patient journey workflow
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

export type PatientJourneyPayload = z.infer<typeof PatientJourneyPayloadSchema>;

/**
 * Patient Journey Workflow
 *
 * Main orchestration workflow for patient engagement.
 */
export const patientJourneyWorkflow = task({
  id: 'patient-journey-workflow',
  retry: {
    maxAttempts: 5,
    minTimeoutInMs: 5000,
    maxTimeoutInMs: 60000,
    factor: 2,
  },
  run: async (payload: PatientJourneyPayload) => {
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
        try {
          await hubspot.createTask({
            contactId: hubspotContactId,
            subject: `PRIORITY REQUEST: Patient wants quick appointment`,
            body: `Lead score: ${initialScore}/5. Interested in: ${procedureInterest?.join(', ') ?? 'Unknown'}\n\nPatient reported interest/discomfort. Schedule priority appointment during business hours.`,
            priority: 'HIGH',
            dueDate: new Date(Date.now() + 30 * 60 * 1000), // Due in 30 minutes during business hours
          });
          logger.info('Created priority request task for hot lead', { correlationId });
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

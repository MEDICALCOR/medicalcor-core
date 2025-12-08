import { task, logger } from '@trigger.dev/sdk/v3';
import { z } from 'zod';
import { createIntegrationClients } from '@medicalcor/integrations';

/**
 * Subscription Handler Tasks (H8)
 * Processes Stripe subscription lifecycle events
 *
 * Flow:
 * 1. Process subscription event (created/updated/canceled)
 * 2. Update HubSpot contact with subscription status
 * 3. Send notifications for important subscription events
 * 4. Emit domain events
 *
 * @module @medicalcor/trigger/tasks/subscription-handler
 */

// Initialize clients lazily using shared factory
function getClients() {
  return createIntegrationClients({
    source: 'subscription-handler',
    includeTemplateCatalog: true,
  });
}

// ============================================================================
// SCHEMAS
// ============================================================================

export const SubscriptionCreatedPayloadSchema = z.object({
  subscriptionId: z.string(),
  customerId: z.string(),
  customerEmail: z.string().nullable(),
  status: z.string(),
  productName: z.string().optional(),
  amount: z.number().optional(),
  currency: z.string().optional(),
  interval: z.string().optional(),
  trialEnd: z.number().nullable(),
  currentPeriodEnd: z.number(),
  metadata: z.record(z.string()).optional(),
  correlationId: z.string(),
});

export type SubscriptionCreatedPayload = z.infer<typeof SubscriptionCreatedPayloadSchema>;

export const SubscriptionUpdatedPayloadSchema = z.object({
  subscriptionId: z.string(),
  customerId: z.string(),
  customerEmail: z.string().nullable(),
  previousStatus: z.string().optional(),
  newStatus: z.string(),
  cancelAt: z.number().nullable(),
  canceledAt: z.number().nullable(),
  endedAt: z.number().nullable(),
  metadata: z.record(z.string()).optional(),
  correlationId: z.string(),
});

export type SubscriptionUpdatedPayload = z.infer<typeof SubscriptionUpdatedPayloadSchema>;

export const SubscriptionDeletedPayloadSchema = z.object({
  subscriptionId: z.string(),
  customerId: z.string(),
  customerEmail: z.string().nullable(),
  cancellationReason: z.string().optional(),
  metadata: z.record(z.string()).optional(),
  correlationId: z.string(),
});

export type SubscriptionDeletedPayload = z.infer<typeof SubscriptionDeletedPayloadSchema>;

export const TrialEndingPayloadSchema = z.object({
  subscriptionId: z.string(),
  customerId: z.string(),
  customerEmail: z.string().nullable(),
  trialEnd: z.number(),
  daysRemaining: z.number(),
  metadata: z.record(z.string()).optional(),
  correlationId: z.string(),
});

export type TrialEndingPayload = z.infer<typeof TrialEndingPayloadSchema>;

// ============================================================================
// TASKS
// ============================================================================

/**
 * Handle new subscription creation
 */
export const handleSubscriptionCreated = task({
  id: 'subscription-created-handler',
  retry: {
    maxAttempts: 3,
    minTimeoutInMs: 1000,
    maxTimeoutInMs: 10000,
    factor: 2,
  },
  run: async (payload: SubscriptionCreatedPayload) => {
    const {
      subscriptionId,
      customerId,
      customerEmail,
      status,
      productName,
      amount,
      currency,
      interval,
      trialEnd,
      currentPeriodEnd,
      metadata,
      correlationId,
    } = payload;

    const { hubspot, whatsapp, templateCatalog, eventStore } = getClients();

    logger.info('Processing new subscription', {
      subscriptionId,
      customerId,
      status,
      productName,
      correlationId,
    });

    // Find or create HubSpot contact
    let hubspotContactId: string | undefined;

    if (hubspot && customerEmail) {
      try {
        const contact = await hubspot.upsertContactByEmail(customerEmail, {
          stripe_customer_id: customerId,
          subscription_status: status,
          subscription_product: productName ?? 'Unknown',
          subscription_start_date: new Date().toISOString(),
          lead_source: 'stripe_subscription',
        });
        hubspotContactId = contact.id;

        // Log subscription to timeline
        await hubspot.logPaymentToTimeline({
          contactId: hubspotContactId,
          paymentId: subscriptionId,
          amount: amount ?? 0,
          currency: currency ?? 'EUR',
          status: `subscription_created: ${productName ?? 'N/A'}`,
        });

        logger.info('HubSpot contact updated for subscription', {
          contactId: hubspotContactId,
          correlationId,
        });
      } catch (err) {
        logger.error('Failed to update HubSpot for subscription', { err, correlationId });
      }
    }

    // Send welcome notification for new subscribers
    if (whatsapp && metadata?.phone && templateCatalog && status === 'active') {
      try {
        const components = templateCatalog.buildTemplateComponents('subscription_welcome', {
          product: productName ?? 'Premium Plan',
          date: templateCatalog.formatDateForTemplate(new Date()),
        });

        await whatsapp.sendTemplate({
          to: metadata.phone,
          templateName: 'subscription_welcome',
          language: 'ro',
          components,
        });

        logger.info('Subscription welcome message sent', { correlationId });
      } catch (err) {
        logger.error('Failed to send welcome message', { err, correlationId });
      }
    }

    // Emit domain event
    try {
      await eventStore.emit({
        type: 'subscription.created',
        correlationId,
        aggregateId: subscriptionId,
        aggregateType: 'subscription',
        payload: {
          subscriptionId,
          customerId,
          hubspotContactId,
          status,
          productName,
          amount,
          currency,
          interval,
          trialEnd: trialEnd ? new Date(trialEnd * 1000).toISOString() : null,
          currentPeriodEnd: new Date(currentPeriodEnd * 1000).toISOString(),
        },
      });
    } catch (err) {
      logger.error('Failed to emit subscription event', { err, correlationId });
    }

    return {
      success: true,
      subscriptionId,
      hubspotContactId,
      status,
    };
  },
});

/**
 * Handle subscription status updates
 */
export const handleSubscriptionUpdated = task({
  id: 'subscription-updated-handler',
  retry: {
    maxAttempts: 3,
    minTimeoutInMs: 1000,
    maxTimeoutInMs: 10000,
    factor: 2,
  },
  run: async (payload: SubscriptionUpdatedPayload) => {
    const {
      subscriptionId,
      customerId,
      customerEmail,
      previousStatus,
      newStatus,
      cancelAt,
      canceledAt,
      // metadata available for future extension
      metadata: _metadata,
      correlationId,
    } = payload;

    const { hubspot, eventStore } = getClients();

    logger.info('Processing subscription update', {
      subscriptionId,
      previousStatus,
      newStatus,
      correlationId,
    });

    // Update HubSpot contact
    let hubspotContactId: string | undefined;

    if (hubspot && customerEmail) {
      try {
        const contact = await hubspot.findContactByEmail(customerEmail);
        if (contact) {
          hubspotContactId = contact.id;

          const updates: Record<string, string> = {
            subscription_status: newStatus,
          };

          if (cancelAt) {
            updates.subscription_cancel_date = new Date(cancelAt * 1000).toISOString();
          }

          if (canceledAt) {
            updates.subscription_canceled_date = new Date(canceledAt * 1000).toISOString();
          }

          await hubspot.updateContact(hubspotContactId, updates);

          // Log status change to timeline
          await hubspot.logPaymentToTimeline({
            contactId: hubspotContactId,
            paymentId: subscriptionId,
            amount: 0,
            currency: 'EUR',
            status: `subscription_${newStatus}`,
          });

          logger.info('HubSpot contact updated for subscription change', {
            contactId: hubspotContactId,
            newStatus,
            correlationId,
          });
        }
      } catch (err) {
        logger.error('Failed to update HubSpot for subscription change', { err, correlationId });
      }
    }

    // Emit domain event
    try {
      await eventStore.emit({
        type: 'subscription.updated',
        correlationId,
        aggregateId: subscriptionId,
        aggregateType: 'subscription',
        payload: {
          subscriptionId,
          customerId,
          hubspotContactId,
          previousStatus,
          newStatus,
          cancelAt: cancelAt ? new Date(cancelAt * 1000).toISOString() : null,
          canceledAt: canceledAt ? new Date(canceledAt * 1000).toISOString() : null,
        },
      });
    } catch (err) {
      logger.error('Failed to emit subscription update event', { err, correlationId });
    }

    return {
      success: true,
      subscriptionId,
      hubspotContactId,
      previousStatus,
      newStatus,
    };
  },
});

/**
 * Handle subscription cancellation/deletion
 */
export const handleSubscriptionDeleted = task({
  id: 'subscription-deleted-handler',
  retry: {
    maxAttempts: 3,
    minTimeoutInMs: 1000,
    maxTimeoutInMs: 10000,
    factor: 2,
  },
  run: async (payload: SubscriptionDeletedPayload) => {
    const { subscriptionId, customerId, customerEmail, cancellationReason, correlationId } =
      payload;

    const { hubspot, eventStore } = getClients();

    logger.warn('Processing subscription deletion', {
      subscriptionId,
      customerId,
      cancellationReason,
      correlationId,
    });

    // Update HubSpot contact
    let hubspotContactId: string | undefined;

    if (hubspot && customerEmail) {
      try {
        const contact = await hubspot.findContactByEmail(customerEmail);
        if (contact) {
          hubspotContactId = contact.id;

          await hubspot.updateContact(hubspotContactId, {
            subscription_status: 'canceled',
            subscription_end_date: new Date().toISOString(),
            subscription_cancellation_reason: cancellationReason ?? 'Not specified',
          });

          // Create follow-up task for retention
          await hubspot.createTask({
            contactId: hubspotContactId,
            subject: 'Subscription Cancelled - Retention Follow-up',
            body: `Subscription ${subscriptionId} has been cancelled.\nReason: ${cancellationReason ?? 'Not specified'}\n\nPlease follow up to understand the cancellation reason and explore retention opportunities.`,
            priority: 'HIGH',
            dueDate: new Date(Date.now() + 24 * 60 * 60 * 1000), // Due tomorrow
          });

          logger.info('Created retention task for cancelled subscription', {
            contactId: hubspotContactId,
            correlationId,
          });
        }
      } catch (err) {
        logger.error('Failed to update HubSpot for subscription deletion', { err, correlationId });
      }
    }

    // Emit domain event
    try {
      await eventStore.emit({
        type: 'subscription.deleted',
        correlationId,
        aggregateId: subscriptionId,
        aggregateType: 'subscription',
        payload: {
          subscriptionId,
          customerId,
          hubspotContactId,
          cancellationReason,
          deletedAt: new Date().toISOString(),
        },
      });
    } catch (err) {
      logger.error('Failed to emit subscription deletion event', { err, correlationId });
    }

    return {
      success: true,
      subscriptionId,
      hubspotContactId,
      cancellationReason,
    };
  },
});

/**
 * Handle trial ending notification
 */
export const handleTrialEnding = task({
  id: 'trial-ending-handler',
  retry: {
    maxAttempts: 3,
    minTimeoutInMs: 1000,
    maxTimeoutInMs: 10000,
    factor: 2,
  },
  run: async (payload: TrialEndingPayload) => {
    const {
      subscriptionId,
      customerId,
      customerEmail,
      trialEnd,
      daysRemaining,
      metadata,
      correlationId,
    } = payload;

    const { hubspot, whatsapp, templateCatalog, eventStore } = getClients();

    logger.info('Processing trial ending notification', {
      subscriptionId,
      daysRemaining,
      correlationId,
    });

    // Update HubSpot contact
    let hubspotContactId: string | undefined;

    if (hubspot && customerEmail) {
      try {
        const contact = await hubspot.findContactByEmail(customerEmail);
        if (contact) {
          hubspotContactId = contact.id;

          await hubspot.updateContact(hubspotContactId, {
            trial_end_date: new Date(trialEnd * 1000).toISOString(),
          });

          // Create conversion task
          await hubspot.createTask({
            contactId: hubspotContactId,
            subject: `Trial Ending in ${daysRemaining} days - Convert to Paid`,
            body: `Subscription ${subscriptionId} trial is ending on ${new Date(trialEnd * 1000).toLocaleDateString()}.\n\nReach out to convert this trial to a paid subscription.`,
            priority: daysRemaining <= 3 ? 'HIGH' : 'MEDIUM',
            dueDate: new Date(trialEnd * 1000 - 24 * 60 * 60 * 1000), // Day before trial ends
          });
        }
      } catch (err) {
        logger.error('Failed to update HubSpot for trial ending', { err, correlationId });
      }
    }

    // Send trial ending notification
    if (whatsapp && metadata?.phone && templateCatalog) {
      try {
        const trialEndDate = new Date(trialEnd * 1000);

        const components = templateCatalog.buildTemplateComponents('trial_ending', {
          days: daysRemaining.toString(),
          date: templateCatalog.formatDateForTemplate(trialEndDate),
        });

        await whatsapp.sendTemplate({
          to: metadata.phone,
          templateName: 'trial_ending',
          language: 'ro',
          components,
        });

        logger.info('Trial ending notification sent', { correlationId });
      } catch (err) {
        logger.error('Failed to send trial ending notification', { err, correlationId });
      }
    }

    // Emit domain event
    try {
      await eventStore.emit({
        type: 'subscription.trial_ending',
        correlationId,
        aggregateId: subscriptionId,
        aggregateType: 'subscription',
        payload: {
          subscriptionId,
          customerId,
          hubspotContactId,
          trialEnd: new Date(trialEnd * 1000).toISOString(),
          daysRemaining,
        },
      });
    } catch (err) {
      logger.error('Failed to emit trial ending event', { err, correlationId });
    }

    return {
      success: true,
      subscriptionId,
      hubspotContactId,
      daysRemaining,
      notificationSent: !!(whatsapp && metadata?.phone),
    };
  },
});

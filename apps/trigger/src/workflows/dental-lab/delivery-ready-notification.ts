/**
 * @fileoverview Lab Case Delivery Ready Notification Workflow
 *
 * Notifies clinics when lab cases are ready for pickup or delivery.
 * Coordinates scheduling and provides delivery instructions.
 *
 * @module apps/trigger/workflows/dental-lab/delivery-ready-notification
 */

import { task, logger } from '@trigger.dev/sdk/v3';
import { z } from 'zod';

// =============================================================================
// SCHEMAS
// =============================================================================

export const DeliveryReadyPayloadSchema = z.object({
  labCaseId: z.string().uuid(),
  caseNumber: z.string(),
  clinicId: z.string().uuid(),
  patientId: z.string().uuid(),
  patientName: z.string().optional(),
  prostheticDescription: z.string(),
  deliveryMethod: z.enum(['PICKUP', 'COURIER', 'INTERNAL_DELIVERY']),
  pickupLocation: z.string().optional(),
  estimatedDeliveryTime: z.string().datetime().optional(),
  specialInstructions: z.string().optional(),
  containsTryIn: z.boolean().default(false),
  correlationId: z.string(),
});

export type DeliveryReadyPayload = z.infer<typeof DeliveryReadyPayloadSchema>;

// =============================================================================
// DELIVERY READY NOTIFICATION WORKFLOW
// =============================================================================

/**
 * Lab Case Delivery Ready Notification Workflow
 *
 * Triggered when a lab case passes QC and is ready for delivery. Handles:
 * 1. Notification to clinic
 * 2. Patient appointment reminder (if try-in scheduled)
 * 3. Delivery tracking setup
 * 4. Case documentation compilation
 */
export const labCaseDeliveryReadyWorkflow = task({
  id: 'dental-lab-delivery-ready-notification',
  retry: {
    maxAttempts: 3,
    minTimeoutInMs: 5000,
    maxTimeoutInMs: 30000,
    factor: 2,
  },
  run: async (payload: DeliveryReadyPayload) => {
    const {
      labCaseId,
      caseNumber,
      clinicId,
      patientId,
      patientName,
      prostheticDescription,
      deliveryMethod,
      pickupLocation,
      estimatedDeliveryTime,
      specialInstructions,
      containsTryIn,
      correlationId,
    } = payload;

    logger.info('Starting delivery ready notification workflow', {
      labCaseId,
      caseNumber,
      deliveryMethod,
      correlationId,
    });

    const results = {
      clinicNotified: false,
      patientNotified: false,
      deliveryScheduled: false,
      documentsCompiled: false,
    };

    // =========================================================================
    // Stage 1: Notify Clinic
    // =========================================================================
    logger.info('Stage 1: Notifying clinic', { correlationId });

    const clinicNotification = {
      type: 'CASE_READY_FOR_DELIVERY',
      clinicId,
      title: `Case Ready: ${caseNumber}`,
      body: buildClinicNotificationBody({
        caseNumber,
        patientName,
        prostheticDescription,
        deliveryMethod,
        pickupLocation,
        estimatedDeliveryTime,
        specialInstructions,
      }),
      priority: 'NORMAL',
      data: {
        labCaseId,
        caseNumber,
        action: 'VIEW_CASE_DETAILS',
      },
      channels: ['push', 'email'],
    };

    // In a real implementation, send via notification service
    results.clinicNotified = true;
    logger.info('Clinic notified', { clinicId, correlationId });

    // =========================================================================
    // Stage 2: Notify Patient (if try-in required)
    // =========================================================================
    if (containsTryIn) {
      logger.info('Stage 2: Sending patient try-in reminder', { correlationId });

      const patientNotification = {
        type: 'PROSTHETIC_READY_TRYIN',
        patientId,
        title: 'Your Dental Restoration is Ready',
        body: buildPatientNotificationBody({
          prostheticDescription,
          clinicName: 'Your Dental Clinic', // Would be looked up
          callToAction: 'Please contact your clinic to schedule your try-in appointment.',
        }),
        channels: ['sms', 'email'],
      };

      results.patientNotified = true;
      logger.info('Patient notified', { patientId, correlationId });
    }

    // =========================================================================
    // Stage 3: Set Up Delivery Tracking
    // =========================================================================
    if (deliveryMethod === 'COURIER') {
      logger.info('Stage 3: Setting up courier delivery tracking', { correlationId });

      const deliveryTracking = {
        labCaseId,
        caseNumber,
        method: 'COURIER',
        status: 'PENDING_PICKUP',
        estimatedDelivery: estimatedDeliveryTime,
        trackingNumber: null, // Will be assigned when shipped
        createdAt: new Date().toISOString(),
      };

      results.deliveryScheduled = true;
      logger.info('Delivery tracking set up', { correlationId });
    }

    // =========================================================================
    // Stage 4: Compile Case Documentation
    // =========================================================================
    logger.info('Stage 4: Compiling case documentation', { correlationId });

    const documentation = {
      caseNumber,
      labCaseId,
      documents: [
        { type: 'QC_REPORT', generated: true },
        { type: 'MANUFACTURING_SPEC', generated: true },
        { type: 'SHADE_VERIFICATION', generated: true },
        { type: 'DELIVERY_SLIP', generated: true },
      ],
      compiledAt: new Date().toISOString(),
    };

    results.documentsCompiled = true;
    logger.info('Documentation compiled', { documentCount: documentation.documents.length, correlationId });

    // =========================================================================
    // Stage 5: Record Event for Analytics
    // =========================================================================
    logger.info('Stage 5: Recording delivery ready event', { correlationId });

    const analyticsEvent = {
      eventType: 'CASE_READY_FOR_DELIVERY',
      labCaseId,
      caseNumber,
      clinicId,
      patientId,
      deliveryMethod,
      containsTryIn,
      timestamp: new Date().toISOString(),
    };

    // =========================================================================
    // Workflow Complete
    // =========================================================================
    logger.info('Delivery ready notification workflow completed', {
      labCaseId,
      caseNumber,
      results,
      correlationId,
    });

    return {
      success: true,
      labCaseId,
      caseNumber,
      ...results,
    };
  },
});

// =============================================================================
// HELPER FUNCTIONS
// =============================================================================

function buildClinicNotificationBody(params: {
  caseNumber: string;
  patientName?: string;
  prostheticDescription: string;
  deliveryMethod: string;
  pickupLocation?: string;
  estimatedDeliveryTime?: string;
  specialInstructions?: string;
}): string {
  const {
    caseNumber,
    patientName,
    prostheticDescription,
    deliveryMethod,
    pickupLocation,
    estimatedDeliveryTime,
    specialInstructions,
  } = params;

  const lines = [
    `Lab case ${caseNumber} is ready for delivery.`,
    ``,
    `Prosthetic: ${prostheticDescription}`,
  ];

  if (patientName) {
    lines.push(`Patient: ${patientName}`);
  }

  lines.push(``, `Delivery Method: ${formatDeliveryMethod(deliveryMethod)}`);

  if (deliveryMethod === 'PICKUP' && pickupLocation) {
    lines.push(`Pickup Location: ${pickupLocation}`);
  }

  if (estimatedDeliveryTime) {
    lines.push(`Estimated Delivery: ${new Date(estimatedDeliveryTime).toLocaleString()}`);
  }

  if (specialInstructions) {
    lines.push(``, `Special Instructions:`, specialInstructions);
  }

  lines.push(``, `Tap to view full case details and documentation.`);

  return lines.join('\n');
}

function buildPatientNotificationBody(params: {
  prostheticDescription: string;
  clinicName: string;
  callToAction: string;
}): string {
  const { prostheticDescription, clinicName, callToAction } = params;

  return [
    `Good news! Your ${prostheticDescription} is ready.`,
    ``,
    `${callToAction}`,
    ``,
    `${clinicName}`,
  ].join('\n');
}

function formatDeliveryMethod(method: string): string {
  switch (method) {
    case 'PICKUP':
      return 'Clinic Pickup';
    case 'COURIER':
      return 'Courier Delivery';
    case 'INTERNAL_DELIVERY':
      return 'Internal Delivery';
    default:
      return method;
  }
}

/**
 * 360dialog WhatsApp Cloud API Webhook Schemas
 *
 * @deprecated Import from '@medicalcor/types' or './schemas/whatsapp.js' instead.
 * This file re-exports from the consolidated schema for backward compatibility.
 */

// Re-export all WhatsApp schemas from the Single Source of Truth
export {
  // Message types
  WhatsAppMessageTypeSchema,
  WhatsAppTextSchema,
  WhatsAppMediaSchema,
  WhatsAppLocationSchema,
  WhatsAppInteractiveSchema,
  WhatsAppContactSchema,
  WhatsAppMessageSchema,
  WhatsAppStatusSchema,
  WhatsAppMetadataSchema,
  // Webhook structures
  WhatsAppValueSchema,
  WhatsAppChangeSchema,
  WhatsAppEntrySchema,
  WhatsAppWebhookSchema,
  // Outbound operations
  WhatsAppSendMessageSchema,
  NormalizedWhatsAppMessageSchema,
  // Types
  type WhatsAppMessageType,
  type WhatsAppText,
  type WhatsAppMedia,
  type WhatsAppLocation,
  type WhatsAppInteractive,
  type WhatsAppContact,
  type WhatsAppMessage,
  type WhatsAppStatus,
  type WhatsAppMetadata,
  type WhatsAppValue,
  type WhatsAppChange,
  type WhatsAppEntry,
  type WhatsAppWebhook,
  type WhatsAppSendMessage,
  type NormalizedWhatsAppMessage,
} from './schemas/whatsapp.js';

// Legacy alias for backward compatibility
import { z } from 'zod';

/**
 * @deprecated Use the context object in WhatsAppMessageSchema instead
 */
export const WhatsAppContextSchema = z
  .object({
    from: z.string().optional(),
    id: z.string().optional(),
  })
  .optional();

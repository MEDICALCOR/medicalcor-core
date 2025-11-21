import { z } from 'zod';

/**
 * 360dialog WhatsApp Cloud API Webhook Schemas
 * Based on Meta's WhatsApp Business Platform webhook format
 */

// Contact information
export const WhatsAppContactSchema = z.object({
  profile: z.object({
    name: z.string(),
  }),
  wa_id: z.string(),
});

// Text message
export const WhatsAppTextSchema = z.object({
  body: z.string(),
});

// Message context (for replies)
export const WhatsAppContextSchema = z.object({
  from: z.string().optional(),
  id: z.string().optional(),
}).optional();

// Individual message
export const WhatsAppMessageSchema = z.object({
  from: z.string(),
  id: z.string(),
  timestamp: z.string(),
  type: z.enum(['text', 'image', 'audio', 'video', 'document', 'location', 'contacts', 'button', 'interactive']),
  text: WhatsAppTextSchema.optional(),
  context: WhatsAppContextSchema,
});

// Message status update
export const WhatsAppStatusSchema = z.object({
  id: z.string(),
  status: z.enum(['sent', 'delivered', 'read', 'failed']),
  timestamp: z.string(),
  recipient_id: z.string(),
  errors: z.array(z.object({
    code: z.number(),
    title: z.string(),
    message: z.string().optional(),
  })).optional(),
});

// Metadata
export const WhatsAppMetadataSchema = z.object({
  display_phone_number: z.string(),
  phone_number_id: z.string(),
});

// Value object containing messages or statuses
export const WhatsAppValueSchema = z.object({
  messaging_product: z.literal('whatsapp'),
  metadata: WhatsAppMetadataSchema,
  contacts: z.array(WhatsAppContactSchema).optional(),
  messages: z.array(WhatsAppMessageSchema).optional(),
  statuses: z.array(WhatsAppStatusSchema).optional(),
});

// Change object
export const WhatsAppChangeSchema = z.object({
  value: WhatsAppValueSchema,
  field: z.literal('messages'),
});

// Entry object
export const WhatsAppEntrySchema = z.object({
  id: z.string(),
  changes: z.array(WhatsAppChangeSchema),
});

// Root webhook payload
export const WhatsAppWebhookSchema = z.object({
  object: z.literal('whatsapp_business_account'),
  entry: z.array(WhatsAppEntrySchema),
});

// Inferred types
export type WhatsAppContact = z.infer<typeof WhatsAppContactSchema>;
export type WhatsAppText = z.infer<typeof WhatsAppTextSchema>;
export type WhatsAppMessage = z.infer<typeof WhatsAppMessageSchema>;
export type WhatsAppStatus = z.infer<typeof WhatsAppStatusSchema>;
export type WhatsAppMetadata = z.infer<typeof WhatsAppMetadataSchema>;
export type WhatsAppValue = z.infer<typeof WhatsAppValueSchema>;
export type WhatsAppChange = z.infer<typeof WhatsAppChangeSchema>;
export type WhatsAppEntry = z.infer<typeof WhatsAppEntrySchema>;
export type WhatsAppWebhook = z.infer<typeof WhatsAppWebhookSchema>;

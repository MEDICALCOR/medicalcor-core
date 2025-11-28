/**
 * WhatsApp webhook schemas (360dialog Cloud API format)
 */
import { z } from "zod";

import { TimestampSchema } from "./common.js";

/**
 * WhatsApp message types
 */
export const WhatsAppMessageTypeSchema = z.enum([
  "text",
  "image",
  "audio",
  "video",
  "document",
  "location",
  "contacts",
  "sticker",
  "interactive",
  "button",
  "template",
  "reaction",
  "unknown",
]);

/**
 * Text message content
 */
export const WhatsAppTextSchema = z.object({
  body: z.string(),
});

/**
 * Media message content
 */
export const WhatsAppMediaSchema = z.object({
  id: z.string(),
  mime_type: z.string().optional(),
  sha256: z.string().optional(),
  caption: z.string().optional(),
  filename: z.string().optional(),
});

/**
 * Location message content
 */
export const WhatsAppLocationSchema = z.object({
  latitude: z.number(),
  longitude: z.number(),
  name: z.string().optional(),
  address: z.string().optional(),
});

/**
 * Sticker message content
 */
export const WhatsAppStickerSchema = z.object({
  id: z.string(),
  mime_type: z.string().optional(),
  sha256: z.string().optional(),
  animated: z.boolean().optional(),
});

/**
 * Contact info for contacts message
 */
export const WhatsAppContactInfoSchema = z.object({
  name: z.object({
    formatted_name: z.string(),
    first_name: z.string().optional(),
    last_name: z.string().optional(),
  }),
  phones: z.array(z.object({
    phone: z.string(),
    type: z.string().optional(),
  })).optional(),
  emails: z.array(z.object({
    email: z.string(),
    type: z.string().optional(),
  })).optional(),
});

/**
 * Button message content
 */
export const WhatsAppButtonSchema = z.object({
  text: z.string(),
  payload: z.string().optional(),
});

/**
 * Interactive message reply (button/list)
 */
export const WhatsAppInteractiveSchema = z.object({
  type: z.enum(["button_reply", "list_reply"]),
  button_reply: z
    .object({
      id: z.string(),
      title: z.string(),
    })
    .optional(),
  list_reply: z
    .object({
      id: z.string(),
      title: z.string(),
      description: z.string().optional(),
    })
    .optional(),
});

/**
 * Contact in conversation
 */
export const WhatsAppContactSchema = z.object({
  wa_id: z.string(),
  profile: z.object({
    name: z.string(),
  }),
});

/**
 * Individual message in webhook
 */
export const WhatsAppMessageSchema = z.object({
  id: z.string(),
  from: z.string(),
  timestamp: z.string(),
  type: WhatsAppMessageTypeSchema,
  text: WhatsAppTextSchema.optional(),
  image: WhatsAppMediaSchema.optional(),
  audio: WhatsAppMediaSchema.optional(),
  video: WhatsAppMediaSchema.optional(),
  document: WhatsAppMediaSchema.optional(),
  location: WhatsAppLocationSchema.optional(),
  sticker: WhatsAppStickerSchema.optional(),
  contacts: z.array(WhatsAppContactInfoSchema).optional(),
  button: WhatsAppButtonSchema.optional(),
  interactive: WhatsAppInteractiveSchema.optional(),
  context: z
    .object({
      message_id: z.string(),
      from: z.string().optional(),
    })
    .optional(),
});

/**
 * Message status update
 */
export const WhatsAppStatusSchema = z.object({
  id: z.string(),
  status: z.enum(["sent", "delivered", "read", "failed"]),
  timestamp: z.string(),
  recipient_id: z.string(),
  errors: z
    .array(
      z.object({
        code: z.number(),
        title: z.string(),
        message: z.string().optional(),
        error_data: z
          .object({
            details: z.string(),
          })
          .optional(),
      })
    )
    .optional(),
});

/**
 * Webhook metadata (phone number info)
 */
export const WhatsAppMetadataSchema = z.object({
  display_phone_number: z.string(),
  phone_number_id: z.string(),
});

/**
 * Webhook entry value
 */
export const WhatsAppValueSchema = z.object({
  messaging_product: z.literal("whatsapp"),
  metadata: WhatsAppMetadataSchema,
  contacts: z.array(WhatsAppContactSchema).optional(),
  messages: z.array(WhatsAppMessageSchema).optional(),
  statuses: z.array(WhatsAppStatusSchema).optional(),
});

/**
 * Webhook change entry
 */
export const WhatsAppChangeSchema = z.object({
  field: z.literal("messages"),
  value: WhatsAppValueSchema,
});

/**
 * Webhook entry
 */
export const WhatsAppEntrySchema = z.object({
  id: z.string(),
  changes: z.array(WhatsAppChangeSchema),
});

/**
 * Complete WhatsApp Webhook payload (360dialog format)
 */
export const WhatsAppWebhookSchema = z.object({
  object: z.literal("whatsapp_business_account"),
  entry: z.array(WhatsAppEntrySchema),
});

/**
 * Outbound message request
 */
export const WhatsAppSendMessageSchema = z.object({
  to: z.string(),
  type: WhatsAppMessageTypeSchema.default("text"),
  text: WhatsAppTextSchema.optional(),
  template: z
    .object({
      name: z.string(),
      language: z.object({
        code: z.string().default("ro"),
      }),
      components: z.array(z.record(z.unknown())).optional(),
    })
    .optional(),
});

/**
 * Parsed/normalized incoming WhatsApp message for internal use
 */
export const NormalizedWhatsAppMessageSchema = z.object({
  messageId: z.string(),
  from: z.string(),
  timestamp: TimestampSchema,
  type: WhatsAppMessageTypeSchema,
  content: z.string(),
  mediaUrl: z.string().url().optional(),
  replyToMessageId: z.string().optional(),
  contactName: z.string().optional(),
  raw: z.record(z.unknown()),
});

export type WhatsAppMessageType = z.infer<typeof WhatsAppMessageTypeSchema>;
export type WhatsAppText = z.infer<typeof WhatsAppTextSchema>;
export type WhatsAppMedia = z.infer<typeof WhatsAppMediaSchema>;
export type WhatsAppLocation = z.infer<typeof WhatsAppLocationSchema>;
export type WhatsAppInteractive = z.infer<typeof WhatsAppInteractiveSchema>;
export type WhatsAppContact = z.infer<typeof WhatsAppContactSchema>;
export type WhatsAppMessage = z.infer<typeof WhatsAppMessageSchema>;
export type WhatsAppStatus = z.infer<typeof WhatsAppStatusSchema>;
export type WhatsAppMetadata = z.infer<typeof WhatsAppMetadataSchema>;
export type WhatsAppValue = z.infer<typeof WhatsAppValueSchema>;
export type WhatsAppChange = z.infer<typeof WhatsAppChangeSchema>;
export type WhatsAppEntry = z.infer<typeof WhatsAppEntrySchema>;
export type WhatsAppWebhook = z.infer<typeof WhatsAppWebhookSchema>;
export type WhatsAppSendMessage = z.infer<typeof WhatsAppSendMessageSchema>;
export type NormalizedWhatsAppMessage = z.infer<typeof NormalizedWhatsAppMessageSchema>;

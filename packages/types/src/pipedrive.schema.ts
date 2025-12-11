/**
 * ╔══════════════════════════════════════════════════════════════════════════════╗
 * ║                         PIPEDRIVE CRM SCHEMAS                                 ║
 * ║                                                                               ║
 * ║  Platinum-standard Zod schemas for Pipedrive API v1 integration.             ║
 * ║  Supports persons, deals, activities, notes, pipelines, and webhooks.        ║
 * ╚══════════════════════════════════════════════════════════════════════════════╝
 */

import { z } from 'zod';

// =============================================================================
// PIPEDRIVE BASE TYPES
// =============================================================================

/**
 * Pipedrive deal status
 */
export const PipedriveDealStatusSchema = z.enum(['open', 'won', 'lost', 'deleted']);
export type PipedriveDealStatus = z.infer<typeof PipedriveDealStatusSchema>;

/**
 * Pipedrive activity type
 */
export const PipedriveActivityTypeSchema = z.enum([
  'call',
  'meeting',
  'task',
  'deadline',
  'email',
  'lunch',
]);
export type PipedriveActivityType = z.infer<typeof PipedriveActivityTypeSchema>;

/**
 * Pipedrive visibility levels
 */
export const PipedriveVisibilitySchema = z.enum(['1', '3', '5', '7']);
export type PipedriveVisibility = z.infer<typeof PipedriveVisibilitySchema>;

// =============================================================================
// PIPEDRIVE PHONE/EMAIL VALUE OBJECTS
// =============================================================================

/**
 * Pipedrive phone object (array format from API)
 */
export const PipedrivePhoneSchema = z.object({
  value: z.string(),
  primary: z.boolean().optional(),
  label: z.string().optional(),
});
export type PipedrivePhone = z.infer<typeof PipedrivePhoneSchema>;

/**
 * Pipedrive email object (array format from API)
 */
export const PipedriveEmailSchema = z.object({
  value: z.string().email(),
  primary: z.boolean().optional(),
  label: z.string().optional(),
});
export type PipedriveEmail = z.infer<typeof PipedriveEmailSchema>;

// =============================================================================
// PIPEDRIVE PERSON (CONTACT)
// =============================================================================

/**
 * Pipedrive person (contact) schema
 */
export const PipedrivePersonSchema = z.object({
  id: z.number(),
  name: z.string().optional(),
  first_name: z.string().optional(),
  last_name: z.string().optional(),
  phone: z.array(PipedrivePhoneSchema).optional(),
  email: z.array(PipedriveEmailSchema).optional(),
  org_id: z.union([z.number(), z.object({ value: z.number() })]).optional(),
  owner_id: z.union([z.number(), z.object({ id: z.number() })]).optional(),
  visible_to: PipedriveVisibilitySchema.optional(),
  marketing_status: z.string().optional(),
  add_time: z.string().optional(),
  update_time: z.string().optional(),
  active_flag: z.boolean().optional(),
  // Custom fields are dynamic - hash-based keys
  // Allow any additional string keys for custom fields
}).passthrough();

export type PipedrivePerson = z.infer<typeof PipedrivePersonSchema>;

/**
 * Create person input
 */
export const PipedriveCreatePersonInputSchema = z.object({
  name: z.string().min(1),
  owner_id: z.number().optional(),
  org_id: z.number().optional(),
  email: z.array(z.string().email()).optional(),
  phone: z.array(z.string()).optional(),
  visible_to: PipedriveVisibilitySchema.optional(),
  marketing_status: z.enum(['no_consent', 'unsubscribed', 'subscribed', 'archived']).optional(),
}).passthrough(); // Allow custom fields

export type PipedriveCreatePersonInput = z.infer<typeof PipedriveCreatePersonInputSchema>;

/**
 * Update person input
 */
export const PipedriveUpdatePersonInputSchema = PipedriveCreatePersonInputSchema.partial();
export type PipedriveUpdatePersonInput = z.infer<typeof PipedriveUpdatePersonInputSchema>;

// =============================================================================
// PIPEDRIVE ORGANIZATION
// =============================================================================

/**
 * Pipedrive organization schema
 */
export const PipedriveOrganizationSchema = z.object({
  id: z.number(),
  name: z.string(),
  owner_id: z.union([z.number(), z.object({ id: z.number() })]).optional(),
  address: z.string().optional(),
  active_flag: z.boolean().optional(),
  add_time: z.string().optional(),
  update_time: z.string().optional(),
}).passthrough();

export type PipedriveOrganization = z.infer<typeof PipedriveOrganizationSchema>;

// =============================================================================
// PIPEDRIVE DEAL
// =============================================================================

/**
 * Pipedrive deal schema
 */
export const PipedriveDealSchema = z.object({
  id: z.number(),
  title: z.string().optional(),
  value: z.number().optional(),
  currency: z.string().optional(),
  status: PipedriveDealStatusSchema.optional(),
  stage_id: z.number().optional(),
  pipeline_id: z.number().optional(),
  person_id: z.union([z.number(), z.object({ value: z.number() })]).optional(),
  org_id: z.union([z.number(), z.object({ value: z.number() })]).optional(),
  user_id: z.union([z.number(), z.object({ id: z.number() })]).optional(),
  probability: z.number().optional(),
  expected_close_date: z.string().nullable().optional(),
  won_time: z.string().nullable().optional(),
  lost_time: z.string().nullable().optional(),
  lost_reason: z.string().nullable().optional(),
  add_time: z.string().optional(),
  update_time: z.string().optional(),
  active: z.boolean().optional(),
  deleted: z.boolean().optional(),
}).passthrough();

export type PipedriveDeal = z.infer<typeof PipedriveDealSchema>;

/**
 * Create deal input
 */
export const PipedriveCreateDealInputSchema = z.object({
  title: z.string().min(1),
  value: z.number().optional(),
  currency: z.string().length(3).optional(),
  user_id: z.number().optional(),
  person_id: z.number().optional(),
  org_id: z.number().optional(),
  pipeline_id: z.number().optional(),
  stage_id: z.number().optional(),
  status: PipedriveDealStatusSchema.optional(),
  expected_close_date: z.string().optional(),
  probability: z.number().min(0).max(100).optional(),
  visible_to: PipedriveVisibilitySchema.optional(),
}).passthrough();

export type PipedriveCreateDealInput = z.infer<typeof PipedriveCreateDealInputSchema>;

/**
 * Update deal input
 */
export const PipedriveUpdateDealInputSchema = PipedriveCreateDealInputSchema.partial();
export type PipedriveUpdateDealInput = z.infer<typeof PipedriveUpdateDealInputSchema>;

// =============================================================================
// PIPEDRIVE ACTIVITY (TASK)
// =============================================================================

/**
 * Pipedrive activity schema
 */
export const PipedriveActivitySchema = z.object({
  id: z.number(),
  type: z.string().optional(),
  subject: z.string().optional(),
  note: z.string().optional(),
  done: z.boolean().optional(),
  due_date: z.string().optional(),
  due_time: z.string().optional(),
  duration: z.string().optional(),
  user_id: z.number().optional(),
  person_id: z.number().optional(),
  deal_id: z.number().optional(),
  org_id: z.number().optional(),
  busy_flag: z.boolean().optional(),
  add_time: z.string().optional(),
  update_time: z.string().optional(),
  marked_as_done_time: z.string().nullable().optional(),
}).passthrough();

export type PipedriveActivity = z.infer<typeof PipedriveActivitySchema>;

/**
 * Create activity input
 */
export const PipedriveCreateActivityInputSchema = z.object({
  subject: z.string().min(1),
  type: z.string().optional(),
  done: z.boolean().optional(),
  due_date: z.string().optional(),
  due_time: z.string().optional(),
  duration: z.string().optional(),
  user_id: z.number().optional(),
  person_id: z.number().optional(),
  deal_id: z.number().optional(),
  org_id: z.number().optional(),
  note: z.string().optional(),
  busy_flag: z.boolean().optional(),
});

export type PipedriveCreateActivityInput = z.infer<typeof PipedriveCreateActivityInputSchema>;

/**
 * Update activity input
 */
export const PipedriveUpdateActivityInputSchema = PipedriveCreateActivityInputSchema.partial();
export type PipedriveUpdateActivityInput = z.infer<typeof PipedriveUpdateActivityInputSchema>;

// =============================================================================
// PIPEDRIVE NOTE
// =============================================================================

/**
 * Pipedrive note schema
 */
export const PipedriveNoteSchema = z.object({
  id: z.number(),
  content: z.string(),
  person_id: z.number().nullable().optional(),
  deal_id: z.number().nullable().optional(),
  org_id: z.number().nullable().optional(),
  user_id: z.number().optional(),
  add_time: z.string().optional(),
  update_time: z.string().optional(),
  pinned_to_person_flag: z.boolean().optional(),
  pinned_to_deal_flag: z.boolean().optional(),
  pinned_to_organization_flag: z.boolean().optional(),
});

export type PipedriveNote = z.infer<typeof PipedriveNoteSchema>;

/**
 * Create note input
 */
export const PipedriveCreateNoteInputSchema = z.object({
  content: z.string().min(1),
  person_id: z.number().optional(),
  deal_id: z.number().optional(),
  org_id: z.number().optional(),
  pinned_to_person_flag: z.boolean().optional(),
  pinned_to_deal_flag: z.boolean().optional(),
  pinned_to_organization_flag: z.boolean().optional(),
});

export type PipedriveCreateNoteInput = z.infer<typeof PipedriveCreateNoteInputSchema>;

// =============================================================================
// PIPEDRIVE PIPELINE & STAGES
// =============================================================================

/**
 * Pipedrive pipeline schema
 */
export const PipedrivePipelineSchema = z.object({
  id: z.number(),
  name: z.string(),
  url_title: z.string().optional(),
  order_nr: z.number().optional(),
  active: z.boolean().optional(),
  deal_probability: z.boolean().optional(),
  add_time: z.string().optional(),
  update_time: z.string().optional(),
});

export type PipedrivePipeline = z.infer<typeof PipedrivePipelineSchema>;

/**
 * Pipedrive stage schema
 */
export const PipedriveStageSchema = z.object({
  id: z.number(),
  name: z.string(),
  pipeline_id: z.number(),
  order_nr: z.number().optional(),
  active_flag: z.boolean().optional(),
  deal_probability: z.number().optional(),
  rotten_flag: z.boolean().optional(),
  rotten_days: z.number().nullable().optional(),
  add_time: z.string().optional(),
  update_time: z.string().optional(),
});

export type PipedriveStage = z.infer<typeof PipedriveStageSchema>;

// =============================================================================
// PIPEDRIVE USER (OWNER)
// =============================================================================

/**
 * Pipedrive user schema
 */
export const PipedriveUserSchema = z.object({
  id: z.number(),
  name: z.string(),
  email: z.string().email(),
  active_flag: z.boolean().optional(),
  is_admin: z.number().optional(),
  role_id: z.number().optional(),
  created: z.string().optional(),
  modified: z.string().optional(),
});

export type PipedriveUser = z.infer<typeof PipedriveUserSchema>;

// =============================================================================
// PIPEDRIVE API RESPONSE WRAPPERS
// =============================================================================

/**
 * Standard Pipedrive API response wrapper
 */
export const PipedriveApiResponseSchema = <T extends z.ZodType>(dataSchema: T) =>
  z.object({
    success: z.boolean(),
    data: dataSchema.nullable(),
    additional_data: z
      .object({
        pagination: z
          .object({
            start: z.number(),
            limit: z.number(),
            more_items_in_collection: z.boolean(),
            next_start: z.number().optional(),
          })
          .optional(),
      })
      .optional(),
    error: z.string().optional(),
    error_info: z.string().optional(),
  });

/**
 * Paginated list response
 */
export const PipedrivePaginatedResponseSchema = <T extends z.ZodType>(itemSchema: T) =>
  PipedriveApiResponseSchema(z.array(itemSchema));

// =============================================================================
// PIPEDRIVE WEBHOOK PAYLOADS
// =============================================================================

/**
 * Webhook meta information
 */
export const PipedriveWebhookMetaSchema = z.object({
  v: z.number().optional(),
  action: z.enum(['added', 'updated', 'deleted', 'merged']),
  object: z.enum(['person', 'deal', 'activity', 'note', 'organization']),
  id: z.number(),
  company_id: z.number().optional(),
  user_id: z.number().optional(),
  timestamp: z.number().optional(),
});

export type PipedriveWebhookMeta = z.infer<typeof PipedriveWebhookMetaSchema>;

/**
 * Generic webhook payload structure
 */
export const PipedriveWebhookPayloadSchema = z.object({
  meta: PipedriveWebhookMetaSchema.optional(),
  current: z.record(z.unknown()).optional(),
  previous: z.record(z.unknown()).optional(),
  // Direct data format (without meta wrapper)
  data: z.record(z.unknown()).optional(),
});

export type PipedriveWebhookPayload = z.infer<typeof PipedriveWebhookPayloadSchema>;

// =============================================================================
// PIPEDRIVE SEARCH
// =============================================================================

/**
 * Search result item
 */
export const PipedriveSearchResultItemSchema = z.object({
  result_score: z.number(),
  item: z.object({
    id: z.number(),
    type: z.string(),
    name: z.string().optional(),
    title: z.string().optional(),
    phone: z.array(z.object({ value: z.string() })).optional(),
    email: z.array(z.object({ value: z.string() })).optional(),
    organization: z.object({ name: z.string() }).optional(),
    owner: z.object({ id: z.number() }).optional(),
    custom_fields: z.array(z.string()).optional(),
  }),
});

export type PipedriveSearchResultItem = z.infer<typeof PipedriveSearchResultItemSchema>;

/**
 * Search response
 */
export const PipedriveSearchResponseSchema = z.object({
  success: z.boolean(),
  data: z.object({
    items: z.array(PipedriveSearchResultItemSchema),
  }),
  additional_data: z
    .object({
      pagination: z
        .object({
          start: z.number(),
          limit: z.number(),
          more_items_in_collection: z.boolean(),
        })
        .optional(),
    })
    .optional(),
});

export type PipedriveSearchResponse = z.infer<typeof PipedriveSearchResponseSchema>;

// =============================================================================
// PIPEDRIVE CLIENT CONFIG
// =============================================================================

/**
 * Pipedrive client configuration schema
 */
export const PipedriveClientConfigSchema = z
  .object({
    apiToken: z.string().min(1, 'API token is required'),
    companyDomain: z.string().optional(),
    baseUrl: z.string().url().optional(),
    retryConfig: z
      .object({
        maxRetries: z.number().int().min(0).max(10).default(3),
        baseDelayMs: z.number().int().min(100).max(30000).default(1000),
      })
      .optional(),
  })
  .refine(
    (config) => {
      // SECURITY: Validate baseUrl to prevent SSRF
      if (config.baseUrl) {
        const allowed = [
          'https://api.pipedrive.com',
          `https://${config.companyDomain}.pipedrive.com`,
        ];
        return allowed.some((url) => config.baseUrl?.startsWith(url));
      }
      return true;
    },
    {
      message: 'SSRF Prevention: baseUrl must be official Pipedrive API URL',
      path: ['baseUrl'],
    }
  );

export type PipedriveClientConfig = z.infer<typeof PipedriveClientConfigSchema>;

// =============================================================================
// PIPEDRIVE FIELD MAPPING CONFIG
// =============================================================================

/**
 * Custom field mapping for Pipedrive
 * Maps logical field names to Pipedrive hash-based custom field keys
 */
export const PipedriveFieldMappingSchema = z.object({
  language: z.array(z.string()).default(['language', 'limba', 'preferred_language']),
  utmSource: z.array(z.string()).default(['utm_source', 'source', 'lead_source']),
  utmMedium: z.array(z.string()).default(['utm_medium', 'medium']),
  utmCampaign: z.array(z.string()).default(['utm_campaign', 'campaign']),
  gdprConsent: z.array(z.string()).default(['gdpr_consent', 'marketing_consent', 'consent']),
  adCampaignId: z.array(z.string()).default(['ad_campaign_id', 'gclid', 'fbclid']),
  acquisitionChannel: z.array(z.string()).default(['acquisition_channel', 'channel']),
  leadScore: z.array(z.string()).default(['lead_score', 'score']),
  procedureInterest: z.array(z.string()).default(['procedure_interest', 'treatment_type']),
  budgetRange: z.array(z.string()).default(['budget_range', 'budget']),
});

export type PipedriveFieldMapping = z.infer<typeof PipedriveFieldMappingSchema>;

// =============================================================================
// PIPEDRIVE HEALTH CHECK
// =============================================================================

/**
 * Pipedrive health status
 */
export const PipedriveHealthStatusSchema = z.object({
  connected: z.boolean(),
  latencyMs: z.number(),
  rateLimit: z
    .object({
      remaining: z.number(),
      limit: z.number(),
      resetAt: z.date().optional(),
    })
    .optional(),
  apiVersion: z.string().optional(),
  companyId: z.number().optional(),
});

export type PipedriveHealthStatus = z.infer<typeof PipedriveHealthStatusSchema>;

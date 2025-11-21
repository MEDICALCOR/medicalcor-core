import { z } from 'zod';

/**
 * HubSpot CRM Schemas
 */

// Contact properties
export const HubSpotContactPropertiesSchema = z.object({
  email: z.string().optional(),
  phone: z.string().optional(),
  firstname: z.string().optional(),
  lastname: z.string().optional(),
  lifecyclestage: z.string().optional(),
  lead_status: z.string().optional(),
  lead_score: z.string().optional(),
  lead_source: z.string().optional(),
  hs_language: z.string().optional(),
  // Custom properties for medical CRM
  procedure_interest: z.string().optional(),
  budget_range: z.string().optional(),
  urgency_level: z.string().optional(),
  consent_marketing: z.string().optional(),
  consent_medical_data: z.string().optional(),
  first_touch_channel: z.string().optional(),
  utm_source: z.string().optional(),
  utm_medium: z.string().optional(),
  utm_campaign: z.string().optional(),
});

// Contact object
export const HubSpotContactSchema = z.object({
  id: z.string(),
  properties: HubSpotContactPropertiesSchema,
  createdAt: z.string(),
  updatedAt: z.string(),
  archived: z.boolean().optional(),
});

// Contact create/update input
export const HubSpotContactInputSchema = z.object({
  properties: HubSpotContactPropertiesSchema,
});

// Search filter
export const HubSpotFilterSchema = z.object({
  propertyName: z.string(),
  operator: z.enum(['EQ', 'NEQ', 'LT', 'LTE', 'GT', 'GTE', 'CONTAINS_TOKEN', 'NOT_CONTAINS_TOKEN']),
  value: z.string(),
});

// Search filter group
export const HubSpotFilterGroupSchema = z.object({
  filters: z.array(HubSpotFilterSchema),
});

// Search request
export const HubSpotSearchRequestSchema = z.object({
  filterGroups: z.array(HubSpotFilterGroupSchema),
  sorts: z.array(z.object({
    propertyName: z.string(),
    direction: z.enum(['ASCENDING', 'DESCENDING']),
  })).optional(),
  properties: z.array(z.string()).optional(),
  limit: z.number().optional(),
  after: z.string().optional(),
});

// Search response
export const HubSpotSearchResponseSchema = z.object({
  total: z.number(),
  results: z.array(HubSpotContactSchema),
  paging: z.object({
    next: z.object({
      after: z.string(),
    }).optional(),
  }).optional(),
});

// Timeline event
export const HubSpotTimelineEventSchema = z.object({
  eventTemplateId: z.string(),
  objectId: z.string(),
  tokens: z.record(z.string()),
  extraData: z.record(z.unknown()).optional(),
});

// Task
export const HubSpotTaskSchema = z.object({
  id: z.string().optional(),
  properties: z.object({
    hs_task_subject: z.string(),
    hs_task_body: z.string().optional(),
    hs_task_status: z.enum(['NOT_STARTED', 'IN_PROGRESS', 'WAITING', 'COMPLETED']).optional(),
    hs_task_priority: z.enum(['LOW', 'MEDIUM', 'HIGH']).optional(),
    hs_timestamp: z.string().optional(),
    hubspot_owner_id: z.string().optional(),
  }),
  associations: z.array(z.object({
    to: z.object({ id: z.string() }),
    types: z.array(z.object({
      associationCategory: z.string(),
      associationTypeId: z.number(),
    })),
  })).optional(),
});

// Inferred types
export type HubSpotContactProperties = z.infer<typeof HubSpotContactPropertiesSchema>;
export type HubSpotContact = z.infer<typeof HubSpotContactSchema>;
export type HubSpotContactInput = z.infer<typeof HubSpotContactInputSchema>;
export type HubSpotFilter = z.infer<typeof HubSpotFilterSchema>;
export type HubSpotFilterGroup = z.infer<typeof HubSpotFilterGroupSchema>;
export type HubSpotSearchRequest = z.infer<typeof HubSpotSearchRequestSchema>;
export type HubSpotSearchResponse = z.infer<typeof HubSpotSearchResponseSchema>;
export type HubSpotTimelineEvent = z.infer<typeof HubSpotTimelineEventSchema>;
export type HubSpotTask = z.infer<typeof HubSpotTaskSchema>;

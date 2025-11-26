import { z } from 'zod';
import {
  ChurnRiskSchema,
  NPSCategorySchema,
  LoyaltySegmentSchema,
  FollowUpPrioritySchema,
} from './hubspot.schema.js';

/**
 * CRM Dashboard Schemas
 * Types for retention, NPS, and loyalty dashboards
 */

// Patient with retention metrics (for dashboard display)
export const CRMPatientSchema = z.object({
  id: z.string(),
  name: z.string(),
  phone: z.string(),
  email: z.string().optional(),
  // Retention metrics
  retentionScore: z.number().min(0).max(100),
  churnRisk: ChurnRiskSchema,
  daysInactive: z.number(),
  canceledAppointments: z.number(),
  // NPS metrics
  npsScore: z.number().min(0).max(10).nullable(),
  npsCategory: NPSCategorySchema.nullable(),
  npsFeedback: z.string().nullable(),
  // Loyalty metrics
  loyaltySegment: LoyaltySegmentSchema,
  lifetimeValue: z.number(),
  totalTreatments: z.number(),
  activeDiscounts: z.array(z.string()),
  // Priority
  followUpPriority: FollowUpPrioritySchema,
  // Dates
  lastAppointmentDate: z.string().nullable(),
  lastTreatmentDate: z.string().nullable(),
  lastNpsSurveyDate: z.string().nullable(),
});

// Dashboard KPI stats
export const CRMDashboardStatsSchema = z.object({
  // Retention KPIs
  averageRetentionScore: z.number(),
  patientsAtRisk: z.number(),
  patientsUrgentFollowUp: z.number(),
  // NPS KPIs
  npsScore: z.number(), // Calculated NPS (-100 to 100)
  promotersCount: z.number(),
  passivesCount: z.number(),
  detractorsCount: z.number(),
  responseRate: z.number(), // Percentage of patients who responded to NPS
  // Loyalty KPIs
  platinumCount: z.number(),
  goldCount: z.number(),
  silverCount: z.number(),
  bronzeCount: z.number(),
  // Revenue
  monthlyRevenue: z.number(),
  averageLifetimeValue: z.number(),
});

// Churn risk alert (for urgent display)
export const ChurnRiskAlertSchema = z.object({
  patientId: z.string(),
  patientName: z.string(),
  phone: z.string(),
  retentionScore: z.number(),
  churnRisk: ChurnRiskSchema,
  lifetimeValue: z.number(),
  daysInactive: z.number(),
  canceledAppointments: z.number(),
  npsScore: z.number().nullable(),
  npsFeedback: z.string().nullable(),
  followUpPriority: FollowUpPrioritySchema,
  suggestedAction: z.string(),
});

// NPS trend data (for charts)
export const NPSTrendDataSchema = z.object({
  period: z.string(), // e.g., "Oct 2024"
  npsScore: z.number(),
  promoters: z.number(),
  passives: z.number(),
  detractors: z.number(),
  totalResponses: z.number(),
});

// Retention trend data (for charts)
export const RetentionTrendDataSchema = z.object({
  period: z.string(),
  averageScore: z.number(),
  atRiskCount: z.number(),
  churnedCount: z.number(),
});

// Loyalty segment distribution (for pie chart)
export const LoyaltyDistributionSchema = z.object({
  segment: LoyaltySegmentSchema,
  count: z.number(),
  percentage: z.number(),
  totalLTV: z.number(),
});

// WhatsApp campaign stats (for campaign dashboard)
export const WhatsAppCampaignStatsSchema = z.object({
  id: z.string(),
  name: z.string(),
  type: z.enum(['REMINDER', 'UPSELL', 'RE_ENGAGEMENT', 'NPS', 'FOLLOW_UP']),
  status: z.enum(['ACTIV', 'PROGRAMAT', 'FINALIZAT', 'OPRIT']),
  startDate: z.string(),
  // Metrics
  sent: z.number(),
  delivered: z.number(),
  opened: z.number(),
  openRate: z.number(),
  conversions: z.number(),
  conversionRate: z.number(),
  revenue: z.number(),
  // Targeting
  targetSegment: z.string(),
  lastSentAt: z.string().nullable(),
});

// Dynamic pricing rule (for pricing dashboard)
export const DynamicPricingRuleSchema = z.object({
  id: z.string(),
  name: z.string(),
  segment: z.string(), // Target segment or "Toate"
  discount: z.number(), // Percentage
  condition: z.string(),
  period: z.string(),
  status: z.enum(['ACTIV', 'INACTIV']),
  usageCount: z.number(),
  revenueGenerated: z.number(),
});

// NPS feedback with sentiment (for feedback list)
export const NPSFeedbackItemSchema = z.object({
  patientId: z.string(),
  patientName: z.string(),
  score: z.number(),
  category: NPSCategorySchema,
  feedback: z.string(),
  date: z.string(),
  sentiment: z.enum(['POZITIV', 'NEUTRU', 'NEGATIV']).optional(),
  themes: z.array(z.string()).optional(), // AI-detected themes
});

// Top positive/negative themes from NPS (AI analyzed)
export const NPSThemeSchema = z.object({
  theme: z.string(),
  mentions: z.number(),
  sentimentScore: z.number(), // 0-100
  trend: z.enum(['UP', 'DOWN', 'STABLE']),
});

// Complete CRM Dashboard data structure
export const CRMDashboardDataSchema = z.object({
  stats: CRMDashboardStatsSchema,
  alerts: z.array(ChurnRiskAlertSchema),
  npsTrend: z.array(NPSTrendDataSchema),
  retentionTrend: z.array(RetentionTrendDataSchema),
  loyaltyDistribution: z.array(LoyaltyDistributionSchema),
  recentFeedback: z.array(NPSFeedbackItemSchema),
  positiveThemes: z.array(NPSThemeSchema),
  negativeThemes: z.array(NPSThemeSchema),
  campaigns: z.array(WhatsAppCampaignStatsSchema),
  pricingRules: z.array(DynamicPricingRuleSchema),
});

// Inferred types
export type CRMPatient = z.infer<typeof CRMPatientSchema>;
export type CRMDashboardStats = z.infer<typeof CRMDashboardStatsSchema>;
export type ChurnRiskAlert = z.infer<typeof ChurnRiskAlertSchema>;
export type NPSTrendData = z.infer<typeof NPSTrendDataSchema>;
export type RetentionTrendData = z.infer<typeof RetentionTrendDataSchema>;
export type LoyaltyDistribution = z.infer<typeof LoyaltyDistributionSchema>;
export type WhatsAppCampaignStats = z.infer<typeof WhatsAppCampaignStatsSchema>;
export type DynamicPricingRule = z.infer<typeof DynamicPricingRuleSchema>;
export type NPSFeedbackItem = z.infer<typeof NPSFeedbackItemSchema>;
export type NPSTheme = z.infer<typeof NPSThemeSchema>;
export type CRMDashboardData = z.infer<typeof CRMDashboardDataSchema>;

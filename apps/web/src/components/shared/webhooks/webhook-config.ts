import { CheckCircle2, XCircle, Clock, RefreshCw } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';

export type WebhookStatus = 'success' | 'failed' | 'pending' | 'retrying';
export type WebhookSource = 'whatsapp' | 'stripe' | 'hubspot' | 'twilio' | 'vapi' | 'custom';

export interface WebhookStatusConfig {
  label: string;
  icon: LucideIcon;
  color: string;
  bgColor: string;
}

export interface WebhookSourceConfig {
  label: string;
  color: string;
}

export const webhookStatusConfig: Record<WebhookStatus, WebhookStatusConfig> = {
  success: {
    label: 'Success',
    icon: CheckCircle2,
    color: 'text-green-600',
    bgColor: 'bg-green-100 dark:bg-green-900/30',
  },
  failed: {
    label: 'Failed',
    icon: XCircle,
    color: 'text-red-600',
    bgColor: 'bg-red-100 dark:bg-red-900/30',
  },
  pending: {
    label: 'Pending',
    icon: Clock,
    color: 'text-yellow-600',
    bgColor: 'bg-yellow-100 dark:bg-yellow-900/30',
  },
  retrying: {
    label: 'Retrying',
    icon: RefreshCw,
    color: 'text-blue-600',
    bgColor: 'bg-blue-100 dark:bg-blue-900/30',
  },
};

export const webhookSourceConfig: Record<WebhookSource, WebhookSourceConfig> = {
  whatsapp: { label: 'WhatsApp', color: 'bg-green-500' },
  stripe: { label: 'Stripe', color: 'bg-purple-500' },
  hubspot: { label: 'HubSpot', color: 'bg-orange-500' },
  twilio: { label: 'Twilio', color: 'bg-red-500' },
  vapi: { label: 'Vapi', color: 'bg-blue-500' },
  custom: { label: 'Custom', color: 'bg-gray-500' },
};

export function formatWebhookDate(date: Date, locale = 'ro-RO'): string {
  return new Intl.DateTimeFormat(locale, {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  }).format(date);
}

export function formatWebhookDuration(ms: number | null): string {
  if (ms === null) return '-';
  if (ms < 1000) return `${ms}ms`;
  return `${(ms / 1000).toFixed(2)}s`;
}

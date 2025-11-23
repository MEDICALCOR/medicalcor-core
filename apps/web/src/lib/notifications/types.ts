/**
 * Push notification types for MedicalCor Cortex
 */

export interface PushNotificationPayload {
  title: string;
  body: string;
  icon?: string;
  badge?: string;
  tag?: string;
  data?: Record<string, unknown>;
  actions?: NotificationAction[];
  requireInteraction?: boolean;
}

export interface NotificationAction {
  action: string;
  title: string;
  icon?: string;
}

export type NotificationPermissionState = 'default' | 'granted' | 'denied';

export interface NotificationPreferences {
  enabled: boolean;
  urgencies: boolean;
  newLeads: boolean;
  appointments: boolean;
  sound: boolean;
}

export const DEFAULT_NOTIFICATION_PREFERENCES: NotificationPreferences = {
  enabled: true,
  urgencies: true,
  newLeads: true,
  appointments: true,
  sound: true,
};

export interface UrgencyNotification {
  type: 'urgency';
  leadId: string;
  phone: string;
  reason: string;
  priority: 'critical' | 'high' | 'medium';
  waitingTime: number;
}

export interface LeadNotification {
  type: 'lead';
  leadId: string;
  phone: string;
  source: 'whatsapp' | 'voice' | 'web';
  classification?: 'HOT' | 'WARM' | 'COLD';
}

export interface AppointmentNotification {
  type: 'appointment';
  appointmentId: string;
  patientName: string;
  dateTime: string;
  status: 'created' | 'reminder' | 'cancelled';
}

export type AppNotification = UrgencyNotification | LeadNotification | AppointmentNotification;

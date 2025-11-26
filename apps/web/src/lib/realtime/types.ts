/**
 * Real-time event types for MedicalCor Cortex
 */

export type RealtimeEventType =
  | 'lead.created'
  | 'lead.updated'
  | 'lead.scored'
  | 'lead.assigned'
  | 'message.received'
  | 'message.sent'
  | 'call.started'
  | 'call.ended'
  | 'appointment.created'
  | 'appointment.updated'
  | 'appointment.cancelled'
  | 'task.created'
  | 'task.completed'
  | 'urgency.new'
  | 'urgency.resolved'
  | 'auth_success'
  | 'auth_error'
  | 'ping'
  | 'pong';

export interface RealtimeEvent<T = unknown> {
  id: string;
  type: RealtimeEventType;
  timestamp: string;
  data: T;
}

export interface LeadCreatedPayload {
  id: string;
  phone: string;
  source: 'whatsapp' | 'voice' | 'web';
  message?: string;
}

export interface LeadScoredPayload {
  leadId: string;
  score: number;
  classification: 'HOT' | 'WARM' | 'COLD';
  confidence: number;
  reasoning: string;
  procedureInterest: string[];
}

export interface MessagePayload {
  leadId: string;
  direction: 'IN' | 'OUT';
  content: string;
  channel: 'whatsapp' | 'sms';
}

export interface CallPayload {
  leadId: string;
  direction: 'inbound' | 'outbound';
  status: 'ringing' | 'in-progress' | 'completed' | 'missed';
  duration?: number;
}

export interface AppointmentPayload {
  id: string;
  leadId: string;
  patientName: string;
  dateTime: string;
  procedure: string;
  status: 'scheduled' | 'confirmed' | 'completed' | 'cancelled';
}

export interface UrgencyPayload {
  id: string;
  leadId: string;
  phone: string;
  reason: string;
  priority: 'critical' | 'high' | 'medium';
  waitingTime: number;
}

export interface ConnectionState {
  /**
   * Connection status:
   * - 'connecting': WebSocket handshake in progress
   * - 'authenticating': Connected, waiting for auth_success from server
   * - 'connected': Fully authenticated and ready
   * - 'disconnected': Not connected
   * - 'error': Connection or authentication error
   */
  status: 'connecting' | 'authenticating' | 'connected' | 'disconnected' | 'error';
  lastConnected?: Date;
  reconnectAttempts: number;
}

export type RealtimeEventHandler<T = unknown> = (event: RealtimeEvent<T>) => void;

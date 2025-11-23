'use client';

export type MessageChannel = 'whatsapp' | 'sms' | 'email';
export type MessageDirection = 'IN' | 'OUT';
export type MessageStatus = 'sent' | 'delivered' | 'read' | 'failed';
export type ConversationStatus = 'active' | 'waiting' | 'resolved' | 'archived';

export interface Message {
  id: string;
  conversationId: string;
  content: string;
  direction: MessageDirection;
  status: MessageStatus;
  timestamp: Date;
  senderName?: string;
  metadata?: {
    attachments?: { type: string; url: string; name: string }[];
    isAutomated?: boolean;
  };
}

export interface Conversation {
  id: string;
  patientId?: string;
  patientName: string;
  patientPhone: string;
  channel: MessageChannel;
  status: ConversationStatus;
  lastMessage?: Message;
  unreadCount: number;
  assignedTo?: string;
  tags?: string[];
  createdAt: Date;
  updatedAt: Date;
}

export interface ConversationFilters {
  channel?: MessageChannel;
  status?: ConversationStatus;
  search?: string;
  assignedTo?: string;
}

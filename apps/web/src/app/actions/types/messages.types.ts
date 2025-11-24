/**
 * Conversation representation for messaging views
 */
export interface Conversation {
  id: string;
  patientName: string;
  phone: string;
  channel: 'whatsapp' | 'sms' | 'email';
  status: 'active' | 'waiting' | 'resolved' | 'archived';
  unreadCount: number;
  lastMessage: {
    content: string;
    direction: 'IN' | 'OUT';
    timestamp: Date;
  };
  updatedAt: Date;
}

/**
 * Message representation for conversation threads
 */
export interface Message {
  id: string;
  conversationId: string;
  content: string;
  direction: 'IN' | 'OUT';
  status: 'sent' | 'delivered' | 'read';
  timestamp: Date;
  senderName?: string;
}

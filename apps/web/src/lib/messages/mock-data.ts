'use client';

import type { Conversation, Message, MessageChannel, ConversationStatus } from './types';

const patientNames = [
  'Elena Popescu',
  'Ion Marinescu',
  'Maria Dumitrescu',
  'Alexandru Ionescu',
  'Ana Gheorghiu',
  'Mihai Stoica',
  'Cristina Popa',
  'Andrei Radu',
];

const sampleMessages = [
  'Bună ziua, aș dori să programez o consultație.',
  'Când aveți disponibilitate săptămâna viitoare?',
  'Mulțumesc pentru informații!',
  'Am o întrebare despre tratament.',
  'Este posibil să reprogramăm consultația?',
  'Care este costul procedurii?',
  'Am primit rezultatele analizelor?',
  'Vă mulțumesc pentru răspuns.',
];

const operatorReplies = [
  'Bună ziua! Cu plăcere vă ajut.',
  'Desigur, avem disponibilitate luni și miercuri.',
  'Vă așteptăm cu drag!',
  'Pentru mai multe detalii, vă rog să ne sunați.',
  'Programarea a fost confirmată.',
  'Vă vom contacta în curând.',
];

function randomDate(daysAgo: number): Date {
  const date = new Date();
  date.setDate(date.getDate() - Math.floor(Math.random() * daysAgo));
  date.setHours(Math.floor(Math.random() * 24));
  date.setMinutes(Math.floor(Math.random() * 60));
  return date;
}

function randomElement<T>(arr: T[]): T {
  return arr[Math.floor(Math.random() * arr.length)];
}

export function generateMockConversations(count = 15): Conversation[] {
  const channels: MessageChannel[] = ['whatsapp', 'sms', 'email'];
  const statuses: ConversationStatus[] = ['active', 'waiting', 'resolved', 'archived'];
  const tags = ['Programare', 'Urgență', 'Întrebare', 'Follow-up', 'Reclamație', 'VIP'];

  return Array.from({ length: count }, (_, i) => {
    const patientName = patientNames[i % patientNames.length];
    const createdAt = randomDate(30);
    const updatedAt = new Date(createdAt.getTime() + Math.random() * 7 * 24 * 60 * 60 * 1000);
    const channel = randomElement(channels);
    const status = randomElement(statuses);
    const unreadCount = status === 'active' ? Math.floor(Math.random() * 5) : 0;

    const lastMessage: Message = {
      id: `msg-last-${i}`,
      conversationId: `conv-${i}`,
      content: randomElement(sampleMessages),
      direction: Math.random() > 0.5 ? 'IN' : 'OUT',
      status: 'delivered',
      timestamp: updatedAt,
    };

    return {
      id: `conv-${i}`,
      patientId: `patient-${i}`,
      patientName,
      patientPhone: `+40 7${Math.floor(10000000 + Math.random() * 90000000)}`,
      channel,
      status,
      lastMessage,
      unreadCount,
      assignedTo: Math.random() > 0.3 ? 'Operator 1' : undefined,
      tags: Array.from({ length: Math.floor(Math.random() * 3) }, () => randomElement(tags)),
      createdAt,
      updatedAt,
    };
  }).sort((a, b) => b.updatedAt.getTime() - a.updatedAt.getTime());
}

export function generateMockMessages(conversationId: string, count = 10): Message[] {
  const messages: Message[] = [];
  let currentTime = new Date();
  currentTime.setHours(currentTime.getHours() - count);

  for (let i = 0; i < count; i++) {
    const isIncoming = i % 2 === 0;
    currentTime = new Date(currentTime.getTime() + Math.random() * 60 * 60 * 1000);

    messages.push({
      id: `msg-${conversationId}-${i}`,
      conversationId,
      content: isIncoming ? randomElement(sampleMessages) : randomElement(operatorReplies),
      direction: isIncoming ? 'IN' : 'OUT',
      status: isIncoming ? 'read' : Math.random() > 0.2 ? 'delivered' : 'sent',
      timestamp: currentTime,
      senderName: isIncoming ? undefined : 'Operator 1',
      metadata: {
        isAutomated: !isIncoming && Math.random() > 0.8,
      },
    });
  }

  return messages;
}

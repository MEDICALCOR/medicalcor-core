'use server';

import { z } from 'zod';
import { HubSpotClient } from '@medicalcor/integrations';
import {
  ConversationSchema,
  MessageSchema,
  type Conversation,
  type Message,
  type HubSpotContact,
} from '@medicalcor/types';

/**
 * Server Actions for Messages/Conversations
 * In production: WhatsApp 360dialog API + HubSpot + Event Store
 */

let hubspotClient: HubSpotClient | null = null;

function getHubSpotClient(): HubSpotClient {
  if (!hubspotClient) {
    const accessToken = process.env.HUBSPOT_ACCESS_TOKEN;
    if (!accessToken) {
      throw new Error('HUBSPOT_ACCESS_TOKEN environment variable is not set');
    }
    hubspotClient = new HubSpotClient({ accessToken });
  }
  return hubspotClient;
}

function maskPhone(phone: string): string {
  if (phone.length < 8) return phone;
  return `${phone.slice(0, 6)}${'*'.repeat(3)}${phone.slice(-3)}`;
}

/**
 * Fetches all conversations from contacts with WhatsApp activity
 */
export async function getConversationsAction(): Promise<Conversation[]> {
  try {
    const hubspot = getHubSpotClient();

    const response = await hubspot.searchContacts({
      filterGroups: [
        {
          filters: [{ propertyName: 'lead_source', operator: 'CONTAINS_TOKEN', value: 'whatsapp' }],
        },
      ],
      properties: ['firstname', 'lastname', 'phone', 'lifecyclestage'],
      sorts: [{ propertyName: 'lastmodifieddate', direction: 'DESCENDING' }],
      limit: 50,
    });

    const conversations: Conversation[] = response.results.map(
      (contact: HubSpotContact, index: number) => {
        const name =
          [contact.properties.firstname, contact.properties.lastname].filter(Boolean).join(' ') ||
          'Contact';

        const statuses: ('open' | 'pending' | 'resolved')[] = ['open', 'pending', 'resolved'];
        const status = statuses[index % 3] ?? 'open';

        return {
          id: `conv-${contact.id}`,
          contactId: contact.id,
          contactName: name,
          contactPhone: maskPhone(contact.properties.phone ?? '+40700000000'),
          channel: 'whatsapp' as const,
          status,
          unreadCount: status === 'open' ? Math.floor(Math.random() * 3) : 0,
          createdAt: new Date(contact.createdAt),
          updatedAt: new Date(contact.updatedAt),
          tags: [],
        };
      }
    );

    return z.array(ConversationSchema).parse(conversations);
  } catch (error) {
    console.error('[getConversationsAction] Failed:', error);
    return [];
  }
}

/**
 * Fetches messages for a specific conversation
 */
export function getMessagesAction(conversationId: string): Message[] {
  const contactId = conversationId.replace('conv-', '');
  const messages: Message[] = [];
  const now = new Date();

  const templateMessages = [
    {
      content: 'Bună ziua! Doresc informații despre implanturi dentare.',
      direction: 'IN' as const,
    },
    {
      content: 'Bună ziua! Cu plăcere vă ajut. Ce anume doriți să aflați?',
      direction: 'OUT' as const,
    },
    { content: 'Cât costă un implant și cât durează procedura?', direction: 'IN' as const },
    {
      content: 'Un implant costă între 800-1200 EUR. Procedura durează circa 1 oră.',
      direction: 'OUT' as const,
    },
    {
      content: 'Mulțumesc! Aș dori să fac o programare pentru consultație.',
      direction: 'IN' as const,
    },
    {
      content: 'Desigur! Avem disponibilitate luni și miercuri. Ce zi preferați?',
      direction: 'OUT' as const,
    },
  ];

  templateMessages.forEach((msg, i) => {
    const timestamp = new Date(now);
    timestamp.setMinutes(timestamp.getMinutes() - (templateMessages.length - i) * 15);

    messages.push({
      id: `msg-${contactId}-${i}`,
      conversationId,
      content: msg.content,
      direction: msg.direction,
      status: msg.direction === 'OUT' ? 'delivered' : 'read',
      timestamp,
      senderName: msg.direction === 'OUT' ? 'Operator' : undefined,
    });
  });

  return z.array(MessageSchema).parse(messages);
}

/**
 * Sends a message to a conversation
 */
export async function sendMessageAction(
  _conversationId: string,
  _content: string
): Promise<{ success: boolean; messageId?: string }> {
  // In production: send via WhatsApp, log to HubSpot, emit event
  await Promise.resolve();

  return { success: true, messageId: `msg-new-${Date.now()}` };
}

/**
 * Updates conversation status
 */
export async function updateConversationStatusAction(
  _conversationId: string,
  _status: 'open' | 'pending' | 'resolved' | 'spam'
): Promise<{ success: boolean }> {
  // In production: update database
  await Promise.resolve();

  return { success: true };
}

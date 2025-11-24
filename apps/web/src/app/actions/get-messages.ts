'use server';

import type { HubSpotContact, PaginatedResponse } from '@medicalcor/types';
import { requirePermission } from '@/lib/auth/server-action-auth';
import { getHubSpotClient } from './utils/clients';
import { maskPhone } from './utils/formatters';
import type { Conversation, Message } from './types';

/**
 * Messages Server Actions
 *
 * Actions for fetching conversations and messages.
 */

/**
 * Fetches conversations list from HubSpot contacts (legacy non-paginated version)
 * @deprecated Use getConversationsActionPaginated for new implementations
 * @requires VIEW_MESSAGES permission
 */
export async function getConversationsAction(): Promise<Conversation[]> {
  const result = await getConversationsActionPaginated({ pageSize: 50 });
  return result.items;
}

/**
 * Fetches conversations list from HubSpot contacts with cursor-based pagination
 * @param options.cursor - Cursor for next page (from previous response)
 * @param options.pageSize - Number of items per page (1-100, default 20)
 * @requires VIEW_MESSAGES permission
 */
export async function getConversationsActionPaginated(options?: {
  cursor?: string;
  pageSize?: number;
}): Promise<PaginatedResponse<Conversation>> {
  const { cursor, pageSize = 20 } = options ?? {};
  const validatedPageSize = Math.min(Math.max(pageSize, 1), 100);

  try {
    await requirePermission('VIEW_MESSAGES');
    const hubspot = getHubSpotClient();

    // Fetch recent contacts with messages
    const response = await hubspot.searchContacts({
      filterGroups: [
        {
          filters: [{ propertyName: 'lifecyclestage', operator: 'NEQ', value: '' }],
        },
      ],
      properties: [
        'firstname',
        'lastname',
        'phone',
        'email',
        'hs_lead_status',
        'lastmodifieddate',
        'lead_source',
      ],
      sorts: [{ propertyName: 'lastmodifieddate', direction: 'DESCENDING' }],
      limit: validatedPageSize,
      after: cursor,
    });

    const conversations: Conversation[] = response.results.map((contact: HubSpotContact) => {
      const name =
        [contact.properties.firstname, contact.properties.lastname].filter(Boolean).join(' ') ||
        'Unknown';

      const source = contact.properties.lead_source?.toLowerCase() ?? '';
      const channel: 'whatsapp' | 'sms' | 'email' = source.includes('whatsapp')
        ? 'whatsapp'
        : source.includes('sms')
          ? 'sms'
          : 'email';

      const status = contact.properties.lead_status?.toLowerCase() ?? '';
      const convStatus: 'active' | 'waiting' | 'resolved' | 'archived' =
        status.includes('active') || status.includes('new')
          ? 'active'
          : status.includes('waiting') || status.includes('pending')
            ? 'waiting'
            : status.includes('resolved') || status.includes('closed')
              ? 'resolved'
              : 'active';

      return {
        id: contact.id,
        patientName: name,
        phone: maskPhone(contact.properties.phone ?? '+40700000000'),
        channel,
        status: convStatus,
        unreadCount: 0, // Requires WhatsApp/messaging service integration
        lastMessage: {
          content: '', // No message data available without messaging service
          direction: 'IN' as const,
          timestamp: new Date(contact.updatedAt),
        },
        updatedAt: new Date(contact.updatedAt),
      };
    });

    // Extract next cursor from HubSpot paging info
    const nextCursor = response.paging?.next?.after ?? null;

    return {
      items: conversations,
      nextCursor,
      hasMore: nextCursor !== null,
      total: response.total,
    };
  } catch (error) {
    console.error('[getConversationsActionPaginated] Failed to fetch conversations:', error);
    return {
      items: [],
      nextCursor: null,
      hasMore: false,
      total: 0,
    };
  }
}

/**
 * Fetches messages for a conversation
 * Requires WhatsApp Business API or database integration to store message history.
 * Currently returns empty array until messaging storage is implemented.
 */
export async function getMessagesAction(_conversationId: string): Promise<Message[]> {
  // Real implementation requires:
  // 1. WhatsApp Business API integration to fetch message history
  // 2. Or a database table to store incoming/outgoing messages
  // Currently no messaging storage is configured

  await Promise.resolve(); // Async operation placeholder

  // Return empty array - no message data available without messaging service integration
  return [];
}

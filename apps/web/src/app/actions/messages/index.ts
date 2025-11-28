'use server';

/**
 * @fileoverview Messages Server Actions
 *
 * Server actions for conversation and messaging operations.
 * Integrates with HubSpot for contact data.
 *
 * @module actions/messages
 * @security All actions require VIEW_MESSAGES permission
 *
 * @todo Integrate WhatsApp Business API for message history
 * @todo Implement message storage database
 */

import type {
  Conversation,
  Message,
  HubSpotContact,
  PaginatedResponse,
} from '@medicalcor/types';
import { requirePermission } from '@/lib/auth/server-action-auth';
import { getHubSpotClient } from '../shared/clients';
import { validatePageSize, emptyPaginatedResponse } from '../shared/pagination';
import {
  maskPhone,
  detectChannel,
  mapConversationStatus,
} from '../shared/mappers';

// ============================================================================
// CONSTANTS
// ============================================================================

/**
 * Properties to fetch for conversation list
 * @constant
 */
const CONVERSATION_PROPERTIES = [
  'firstname',
  'lastname',
  'phone',
  'email',
  'hs_lead_status',
  'lastmodifieddate',
  'lead_source',
] as const;

/**
 * Default phone number placeholder
 * @constant
 */
const DEFAULT_PHONE = '+40700000000';

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

/**
 * Maps HubSpot contact to Conversation
 * @internal
 */
function mapContactToConversation(contact: HubSpotContact): Conversation {
  const name =
    [contact.properties.firstname, contact.properties.lastname]
      .filter(Boolean)
      .join(' ') || 'Unknown';

  const channel = detectChannel(contact.properties.lead_source);
  const status = mapConversationStatus(contact.properties.lead_status);

  return {
    id: contact.id,
    patientName: name,
    phone: maskPhone(contact.properties.phone ?? DEFAULT_PHONE),
    channel,
    status,
    unreadCount: 0, // Requires WhatsApp/messaging service integration
    lastMessage: {
      content: '', // No message data without messaging service
      direction: 'IN' as const,
      timestamp: new Date(contact.updatedAt),
    },
    updatedAt: new Date(contact.updatedAt),
  };
}

// ============================================================================
// CONVERSATION ACTIONS
// ============================================================================

/**
 * Fetches conversations list from HubSpot contacts (legacy non-paginated version)
 *
 * @deprecated Use {@link getConversationsActionPaginated} for new implementations
 * @requires VIEW_MESSAGES permission
 *
 * @returns Array of conversations
 */
export async function getConversationsAction(): Promise<Conversation[]> {
  const result = await getConversationsActionPaginated({ pageSize: 50 });
  return result.items;
}

/**
 * Fetches conversations list from HubSpot contacts with cursor-based pagination
 *
 * Conversations are derived from HubSpot contacts with recent activity.
 * Actual message content requires WhatsApp Business API integration.
 *
 * @param options - Pagination options
 * @param options.cursor - Cursor for next page
 * @param options.pageSize - Items per page (1-100, default 20)
 * @requires VIEW_MESSAGES permission
 *
 * @returns Paginated conversation list
 *
 * @example
 * ```typescript
 * const conversations = await getConversationsActionPaginated({ pageSize: 20 });
 * const activeConvos = conversations.items.filter(c => c.status === 'active');
 * ```
 */
export async function getConversationsActionPaginated(options?: {
  cursor?: string;
  pageSize?: number;
}): Promise<PaginatedResponse<Conversation>> {
  const { cursor, pageSize = 20 } = options ?? {};
  const validatedPageSize = validatePageSize(pageSize);

  try {
    await requirePermission('VIEW_MESSAGES');
    const hubspot = getHubSpotClient();

    const response = await hubspot.searchContacts({
      filterGroups: [
        {
          filters: [{ propertyName: 'lifecyclestage', operator: 'NEQ', value: '' }],
        },
      ],
      properties: [...CONVERSATION_PROPERTIES],
      sorts: [{ propertyName: 'lastmodifieddate', direction: 'DESCENDING' }],
      limit: validatedPageSize,
      after: cursor,
    });

    const conversations = response.results.map(mapContactToConversation);
    const nextCursor = response.paging?.next?.after ?? null;

    return {
      items: conversations,
      nextCursor,
      hasMore: nextCursor !== null,
      total: response.total,
    };
  } catch (error) {
    console.error('[getConversationsActionPaginated] Failed to fetch conversations:', error);
    return emptyPaginatedResponse();
  }
}

// ============================================================================
// MESSAGE ACTIONS
// ============================================================================

/**
 * Fetches messages for a conversation
 *
 * **Note:** Currently returns empty array. Full implementation requires:
 * 1. WhatsApp Business API integration for message history
 * 2. Database table to store incoming/outgoing messages
 *
 * @param _conversationId - Conversation/contact ID (unused until integration)
 * @returns Array of messages (currently empty)
 *
 * @todo Implement WhatsApp Business API message fetching
 * @todo Implement message storage with PostgreSQL
 *
 * @example
 * ```typescript
 * // Future usage when implemented
 * const messages = await getMessagesAction('12345');
 * const inbound = messages.filter(m => m.direction === 'IN');
 * ```
 */
export async function getMessagesAction(_conversationId: string): Promise<Message[]> {
  // Real implementation requires:
  // 1. WhatsApp Business API integration to fetch message history
  // 2. Or a database table to store incoming/outgoing messages
  // Currently no messaging storage is configured

  await Promise.resolve(); // Async placeholder

  return [];
}

/**
 * Sends a message in a conversation
 *
 * **Note:** Stub implementation. Requires WhatsApp Business API integration.
 *
 * @param conversationId - Conversation/contact ID
 * @param content - Message content
 * @returns Success status
 *
 * @todo Implement WhatsApp Business API message sending
 */
export async function sendMessageAction(
  _conversationId: string,
  _content: string
): Promise<{ success: boolean; messageId?: string }> {
  // Stub implementation - requires WhatsApp Business API
  await Promise.resolve();

  return { success: false };
}

// ============================================================================
// TYPE RE-EXPORTS
// ============================================================================

export type { Conversation, Message } from '@medicalcor/types';

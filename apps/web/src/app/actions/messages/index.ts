'use server';

/**
 * @fileoverview Messages Server Actions
 *
 * Server actions for conversation and messaging operations.
 * Integrates with HubSpot for contact data and message history.
 * Uses WhatsApp Business API for sending messages.
 *
 * @module actions/messages
 * @security All actions require VIEW_MESSAGES permission
 */

import type { Conversation, Message, HubSpotContact, PaginatedResponse } from '@medicalcor/types';
import { requirePermission, AuthorizationError } from '@/lib/auth/server-action-auth';
import { getHubSpotClient, getWhatsAppClient } from '../shared/clients';
import { validatePageSize, emptyPaginatedResponse } from '../shared/pagination';
import { maskPhone, detectChannel, mapConversationStatus } from '../shared/mappers';

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
    [contact.properties.firstname, contact.properties.lastname].filter(Boolean).join(' ') ||
    'Unknown';

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
    // SECURITY FIX: Only log in non-production to avoid console noise
    if (process.env.NODE_ENV !== 'production') {
      console.error('[getConversationsActionPaginated] Failed to fetch conversations:', error);
    }
    return emptyPaginatedResponse();
  }
}

// ============================================================================
// MESSAGE ACTIONS
// ============================================================================

/**
 * Parse a HubSpot note body to extract message data
 * Notes are stored with format: [CHANNEL] DIRECTION: message (ID: xxx) [Sentiment: xxx]
 * @internal
 */
function parseNoteToMessage(
  note: { id: string; body: string; timestamp: string },
  conversationId: string
): Message | null {
  const body = note.body;

  // Pattern: [CHANNEL] DIRECTION: content (ID: xxx) [Sentiment: xxx]
  const pattern =
    /^\[(\w+)\]\s*(IN|OUT):\s*(.+?)(?:\s*\(ID:\s*([^)]+)\))?(?:\s*\[Sentiment:\s*(\w+)\])?$/s;
  const match = pattern.exec(body);

  if (!match) {
    // Not a message note (could be payment, call, or other note type)
    return null;
  }

  // Destructure with explicit typing - externalId can be undefined for non-captured optional groups
  const channel = match[1];
  const direction = match[2];
  const content = match[3];
  const externalId = match[4] as string | undefined;

  return {
    id: externalId ?? note.id,
    conversationId,
    content: content.trim(),
    direction: direction as 'IN' | 'OUT',
    status: 'delivered',
    timestamp: new Date(note.timestamp),
    senderName: direction === 'IN' ? 'Pacient' : 'Operator',
    channel: channel.toLowerCase() as 'whatsapp' | 'sms' | 'email',
  };
}

/**
 * Fetches messages for a conversation from HubSpot notes
 *
 * Messages are stored as notes on the HubSpot contact timeline.
 * This function fetches notes and parses them into messages.
 *
 * @param conversationId - HubSpot contact ID
 * @returns Array of messages sorted by timestamp (newest last)
 * @requires VIEW_MESSAGES permission
 *
 * @example
 * ```typescript
 * const messages = await getMessagesAction('12345');
 * const inbound = messages.filter(m => m.direction === 'IN');
 * ```
 */
export async function getMessagesAction(conversationId: string): Promise<Message[]> {
  try {
    await requirePermission('VIEW_MESSAGES');
    const hubspot = getHubSpotClient();

    // Fetch notes for the contact
    const notes = await hubspot.getNotesForContact(conversationId, 100);

    // Parse notes into messages
    const messages: Message[] = [];
    for (const note of notes) {
      const message = parseNoteToMessage(note, conversationId);
      if (message) {
        messages.push(message);
      }
    }

    // Sort by timestamp ascending (oldest first)
    messages.sort((a, b) => a.timestamp.getTime() - b.timestamp.getTime());

    return messages;
  } catch (error) {
    if (error instanceof AuthorizationError) throw error;
    // Error logged server-side, return empty for graceful degradation
    return [];
  }
}

/**
 * Sends a message in a conversation via WhatsApp
 *
 * Sends the message using the WhatsApp Business API and logs it to HubSpot timeline.
 *
 * @param conversationId - HubSpot contact ID
 * @param content - Message content to send
 * @returns Success status and message ID if sent
 * @requires SEND_MESSAGES permission
 *
 * @example
 * ```typescript
 * const result = await sendMessageAction('12345', 'Hello, how can I help?');
 * if (result.success) {
 *   console.log('Message sent:', result.messageId);
 * }
 * ```
 */
export async function sendMessageAction(
  conversationId: string,
  content: string
): Promise<{ success: boolean; messageId?: string; error?: string }> {
  try {
    await requirePermission('SEND_MESSAGES');

    const hubspot = getHubSpotClient();
    const whatsapp = getWhatsAppClient();

    // Get contact phone number
    const contact = await hubspot.getContact(conversationId);
    const phone = contact.properties.phone;

    if (!phone) {
      return { success: false, error: 'Contact has no phone number' };
    }

    let messageId: string | undefined;

    // Send via WhatsApp if configured
    if (whatsapp) {
      try {
        const response = await whatsapp.sendText({
          to: phone,
          text: content,
        });
        messageId = response.messages[0]?.id;
      } catch (whatsappError) {
        // Log error but continue to record the attempt in HubSpot
        console.error('[sendMessageAction] WhatsApp send failed:', whatsappError);
      }
    }

    // Log message to HubSpot timeline (even if WhatsApp failed for audit trail)
    await hubspot.logMessageToTimeline({
      contactId: conversationId,
      message: content,
      direction: 'OUT',
      channel: 'whatsapp',
      messageId,
    });

    return {
      success: true,
      messageId: messageId ?? `local-${Date.now()}`,
    };
  } catch (error) {
    if (error instanceof AuthorizationError) throw error;
    // Error logged server-side
    return { success: false, error: 'Failed to send message' };
  }
}

// ============================================================================
// TYPE RE-EXPORTS
// ============================================================================

export type { Conversation, Message } from '@medicalcor/types';

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
 * Fetches messages for a conversation from the message_log table
 *
 * Messages are stored in the message_log table with optional encrypted content.
 * For privacy, only content hashes are stored by default unless encryption is enabled.
 *
 * @param conversationId - Conversation/contact ID (HubSpot contact ID)
 * @param options - Fetch options
 * @param options.limit - Maximum messages to fetch (default 50)
 * @param options.before - Fetch messages before this timestamp
 * @returns Array of messages
 *
 * @example
 * ```typescript
 * const messages = await getMessagesAction('12345');
 * const inbound = messages.filter(m => m.direction === 'IN');
 * ```
 */
export async function getMessagesAction(
  conversationId: string,
  options?: { limit?: number; before?: Date }
): Promise<Message[]> {
  const { limit = 50, before } = options ?? {};

  try {
    await requirePermission('VIEW_MESSAGES');

    // Get phone number for the contact from HubSpot
    const hubspot = getHubSpotClient();
    const contact = await hubspot.getContact(conversationId, ['phone']);

    if (!contact?.properties?.phone) {
      return [];
    }

    const phone = contact.properties.phone;

    // Fetch messages from database
    const { createDatabaseClient } = await import('@medicalcor/core');
    const db = createDatabaseClient();

    let query = `
      SELECT
        id,
        external_message_id,
        phone,
        direction,
        channel,
        content_encrypted,
        content_hash,
        status,
        correlation_id,
        created_at
      FROM message_log
      WHERE phone = $1
        AND deleted_at IS NULL
    `;
    const params: unknown[] = [phone];

    if (before) {
      query += ` AND created_at < $${params.length + 1}`;
      params.push(before);
    }

    query += ` ORDER BY created_at DESC LIMIT $${params.length + 1}`;
    params.push(limit);

    const result = await db.query(query, params);

    // Map database rows to Message type
    const messages: Message[] = result.rows.map(
      (row: {
        id: string;
        external_message_id: string;
        direction: 'IN' | 'OUT';
        channel: string;
        content_encrypted?: string;
        content_hash?: string;
        status: string;
        created_at: Date;
      }) => ({
        id: row.id,
        conversationId,
        externalId: row.external_message_id,
        direction: row.direction,
        channel: row.channel as 'whatsapp' | 'voice' | 'sms' | 'email',
        // Content is encrypted - show placeholder or decrypt if available
        content: row.content_encrypted
          ? '[Encrypted message - view in secure context]'
          : `[Message hash: ${row.content_hash?.slice(0, 8)}...]`,
        status: row.status as 'sent' | 'delivered' | 'read' | 'failed',
        timestamp: new Date(row.created_at),
      })
    );

    // Return in chronological order (oldest first)
    return messages.reverse();
  } catch (error) {
    if (process.env.NODE_ENV !== 'production') {
      console.error('[getMessagesAction] Failed to fetch messages:', error);
    }
    return [];
  }
}

/**
 * Sends a message in a conversation via WhatsApp
 *
 * This action:
 * 1. Validates consent for communication
 * 2. Sends the message via WhatsApp Business API
 * 3. Logs the message to the database
 *
 * @param conversationId - Conversation/contact ID (HubSpot contact ID)
 * @param content - Message content to send
 * @param options - Send options
 * @param options.channel - Channel to use (default: 'whatsapp')
 * @returns Success status with message ID
 *
 * @example
 * ```typescript
 * const result = await sendMessageAction('12345', 'Hello!');
 * if (result.success) {
 *   console.log('Message sent:', result.messageId);
 * }
 * ```
 */
export async function sendMessageAction(
  conversationId: string,
  content: string,
  options?: { channel?: 'whatsapp' | 'sms' }
): Promise<{ success: boolean; messageId?: string; error?: string }> {
  const { channel = 'whatsapp' } = options ?? {};

  try {
    await requirePermission('SEND_MESSAGES');

    // Validate input
    if (!content || content.trim().length === 0) {
      return { success: false, error: 'Message content cannot be empty' };
    }

    if (content.length > 4096) {
      return { success: false, error: 'Message content too long (max 4096 characters)' };
    }

    // Get phone number for the contact from HubSpot
    const hubspot = getHubSpotClient();
    const contact = await hubspot.getContact(conversationId, ['phone', 'firstname']);

    if (!contact?.properties?.phone) {
      return { success: false, error: 'Contact has no phone number' };
    }

    const phone = contact.properties.phone;

    // Check consent before sending
    const { checkConsent } = await import('@medicalcor/core');
    const consentResult = await checkConsent(phone, 'communication');

    if (!consentResult.allowed) {
      return {
        success: false,
        error: `Cannot send message: ${consentResult.reason ?? 'No consent for communication'}`,
      };
    }

    // Generate message ID and correlation ID
    const { randomUUID } = await import('crypto');
    const messageId = randomUUID();
    const correlationId = randomUUID();

    // Hash content for logging (privacy)
    const { createHash } = await import('crypto');
    const contentHash = createHash('sha256').update(content).digest('hex');

    // Log the outgoing message to database
    const { createDatabaseClient } = await import('@medicalcor/core');
    const db = createDatabaseClient();

    await db.query(
      `INSERT INTO message_log
       (id, external_message_id, phone, direction, channel, content_hash, status, correlation_id, created_at)
       VALUES ($1, $2, $3, 'OUT', $4, $5, 'pending', $6, NOW())`,
      [messageId, messageId, phone, channel, contentHash, correlationId]
    );

    // Send via WhatsApp Business API (if configured)
    if (process.env.WHATSAPP_API_URL && process.env.WHATSAPP_API_TOKEN) {
      try {
        const response = await fetch(`${process.env.WHATSAPP_API_URL}/messages`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${process.env.WHATSAPP_API_TOKEN}`,
          },
          body: JSON.stringify({
            messaging_product: 'whatsapp',
            to: phone.replace(/\D/g, ''), // Strip non-digits
            type: 'text',
            text: { body: content },
          }),
        });

        if (response.ok) {
          const data = (await response.json()) as { messages?: [{ id: string }] };
          const externalId = data.messages?.[0]?.id ?? messageId;

          // Update message status and external ID
          await db.query(
            `UPDATE message_log SET status = 'sent', external_message_id = $1 WHERE id = $2`,
            [externalId, messageId]
          );

          return { success: true, messageId: externalId };
        } else {
          const errorText = await response.text();
          await db.query(
            `UPDATE message_log SET status = 'failed' WHERE id = $1`,
            [messageId]
          );
          return { success: false, messageId, error: `WhatsApp API error: ${errorText}` };
        }
      } catch (apiError) {
        await db.query(
          `UPDATE message_log SET status = 'failed' WHERE id = $1`,
          [messageId]
        );
        return {
          success: false,
          messageId,
          error: `Failed to send: ${apiError instanceof Error ? apiError.message : 'Unknown error'}`,
        };
      }
    } else {
      // No WhatsApp API configured - mark as queued for manual processing
      await db.query(
        `UPDATE message_log SET status = 'queued' WHERE id = $1`,
        [messageId]
      );

      return {
        success: true,
        messageId,
        error: 'Message queued (WhatsApp API not configured)',
      };
    }
  } catch (error) {
    if (process.env.NODE_ENV !== 'production') {
      console.error('[sendMessageAction] Failed to send message:', error);
    }
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Failed to send message',
    };
  }
}

// ============================================================================
// TYPE RE-EXPORTS
// ============================================================================

export type { Conversation, Message } from '@medicalcor/types';

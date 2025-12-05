'use client';

import { useState, useCallback, useEffect, useTransition } from 'react';
import { ConversationList } from '@/components/messages/conversation-list';
import { ConversationView, EmptyConversationView } from '@/components/messages/conversation-view';
import { CopilotPanel } from '@/components/ai-copilot';
import { Skeleton } from '@/components/ui/skeleton';
import {
  getConversationsActionPaginated,
  getMessagesAction,
  sendMessageAction,
  type Conversation,
  type Message,
} from '@/app/actions/get-patients';

const PAGE_SIZE = 20;

function ConversationListSkeleton() {
  return (
    <div className="space-y-2 p-4">
      {[1, 2, 3, 4, 5, 6, 7, 8].map((i) => (
        <Skeleton key={i} className="h-20 w-full" />
      ))}
    </div>
  );
}

export default function MessagesPage() {
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [selectedConversation, setSelectedConversation] = useState<Conversation | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [isLoadingConversations, startConversationsTransition] = useTransition();
  const [isLoadingMore, startLoadMoreTransition] = useTransition();
  const [isLoadingMessages, startMessagesTransition] = useTransition();
  const [suggestedMessage, setSuggestedMessage] = useState<string | undefined>(undefined);

  // Pagination state
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [hasMore, setHasMore] = useState(false);
  const [totalCount, setTotalCount] = useState<number | undefined>(undefined);

  // Fetch initial conversations on mount
  useEffect(() => {
    startConversationsTransition(async () => {
      const result = await getConversationsActionPaginated({ pageSize: PAGE_SIZE });
      setConversations(result.items);
      setNextCursor(result.nextCursor);
      setHasMore(result.hasMore);
      setTotalCount(result.total);
    });
  }, []);

  // Load more conversations
  const handleLoadMore = useCallback(() => {
    if (!hasMore || !nextCursor) return;

    startLoadMoreTransition(async () => {
      const result = await getConversationsActionPaginated({
        cursor: nextCursor,
        pageSize: PAGE_SIZE,
      });
      setConversations((prev) => [...prev, ...result.items]);
      setNextCursor(result.nextCursor);
      setHasMore(result.hasMore);
    });
  }, [hasMore, nextCursor]);

  const handleSelectConversation = useCallback((conversation: Conversation) => {
    setSelectedConversation(conversation);

    // Fetch messages for the selected conversation
    startMessagesTransition(async () => {
      const fetchedMessages = await getMessagesAction(conversation.id);
      setMessages(fetchedMessages);
    });

    // Mark conversation as read
    setConversations((prev) =>
      prev.map((c) => (c.id === conversation.id ? { ...c, unreadCount: 0 } : c))
    );
  }, []);

  const handleSendMessage = useCallback(
    async (content: string) => {
      if (!selectedConversation) return;

      const tempId = `msg-temp-${Date.now()}`;
      const newMessage: Message = {
        id: tempId,
        conversationId: selectedConversation.id,
        content,
        direction: 'OUT',
        status: 'sent',
        timestamp: new Date(),
        senderName: 'Operator',
      };

      // Optimistically add message to UI
      setMessages((prev) => [...prev, newMessage]);

      // Update conversation's last message
      setConversations((prev) =>
        prev.map((c) =>
          c.id === selectedConversation.id
            ? {
                ...c,
                lastMessage: {
                  content: newMessage.content,
                  direction: newMessage.direction,
                  timestamp: newMessage.timestamp,
                },
                updatedAt: new Date(),
              }
            : c
        )
      );

      // Send message via server action
      const result = await sendMessageAction(selectedConversation.id, content);

      if (result.success) {
        // Update message with real ID and status
        setMessages((prev) =>
          prev.map((m) =>
            m.id === tempId ? { ...m, id: result.messageId ?? tempId, status: 'delivered' } : m
          )
        );
      } else {
        // Mark as failed
        setMessages((prev) => prev.map((m) => (m.id === tempId ? { ...m, status: 'failed' } : m)));
      }
    },
    [selectedConversation]
  );

  const handleStatusChange = useCallback(
    (status: Conversation['status']) => {
      if (!selectedConversation) return;

      setConversations((prev) =>
        prev.map((c) => (c.id === selectedConversation.id ? { ...c, status } : c))
      );
      setSelectedConversation((prev) => (prev ? { ...prev, status } : null));
    },
    [selectedConversation]
  );

  // Handle AI Copilot suggestion selection
  const handleSuggestionSelect = useCallback((content: string) => {
    setSuggestedMessage(content);
  }, []);

  // Clear suggestion after it's consumed
  const handleSuggestionConsumed = useCallback(() => {
    setSuggestedMessage(undefined);
  }, []);

  // Prepare conversation context for AI Copilot
  // Map email channel to whatsapp for copilot (email isn't supported by copilot)
  const getChannelForCopilot = (channel: string | undefined): 'whatsapp' | 'sms' | 'voice' => {
    if (channel === 'sms') return 'sms';
    if (channel === 'voice') return 'voice';
    return 'whatsapp'; // Default for whatsapp, email, or undefined
  };

  const copilotConversation = messages.map((msg) => ({
    direction: msg.direction,
    content: msg.content,
    timestamp: msg.timestamp.toISOString(),
    channel: getChannelForCopilot(selectedConversation?.channel),
  }));

  return (
    <div className="h-[calc(100vh-4rem)]">
      <div className="grid grid-cols-[380px_1fr] h-full">
        {/* Conversation List */}
        {isLoadingConversations ? (
          <div className="border-r">
            <ConversationListSkeleton />
          </div>
        ) : (
          <ConversationList
            conversations={conversations}
            selectedId={selectedConversation?.id}
            onSelect={handleSelectConversation}
            hasMore={hasMore}
            isLoadingMore={isLoadingMore}
            onLoadMore={handleLoadMore}
            totalCount={totalCount}
          />
        )}

        {/* Conversation View */}
        {selectedConversation ? (
          <ConversationView
            conversation={selectedConversation}
            messages={messages}
            onSendMessage={handleSendMessage}
            onStatusChange={handleStatusChange}
            isLoading={isLoadingMessages}
            suggestedMessage={suggestedMessage}
            onSuggestionConsumed={handleSuggestionConsumed}
          />
        ) : (
          <EmptyConversationView />
        )}
      </div>

      {/* AI Copilot Panel */}
      {selectedConversation && (
        <CopilotPanel
          patientId={selectedConversation.id}
          patientPhone={selectedConversation.phone}
          patientName={selectedConversation.patientName}
          currentConversation={copilotConversation}
          onSuggestionSelect={handleSuggestionSelect}
        />
      )}
    </div>
  );
}

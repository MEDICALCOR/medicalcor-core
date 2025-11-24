'use client';

import { useState, useCallback, useTransition } from 'react';
import { ConversationList } from '@/components/messages/conversation-list';
import { ConversationView, EmptyConversationView } from '@/components/messages/conversation-view';
import { Skeleton } from '@/components/ui/skeleton';
import { Button } from '@/components/ui/button';
import { Loader2 } from 'lucide-react';
import { useInfiniteScroll } from '@/hooks/use-infinite-scroll';
import {
  getConversationsActionPaginated,
  getMessagesAction,
  type Conversation,
  type Message,
} from '@/app/actions/get-patients';

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
  const {
    items: conversations,
    isInitialLoading: isLoadingConversations,
    isLoadingMore,
    hasMore,
    loadMore,
    observerRef,
  } = useInfiniteScroll({
    fetchPage: useCallback(
      (cursor?: string) => getConversationsActionPaginated({ cursor, pageSize: 30 }),
      []
    ),
  });

  const [selectedConversation, setSelectedConversation] = useState<Conversation | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [isLoadingMessages, startMessagesTransition] = useTransition();

  const handleSelectConversation = useCallback((conversation: Conversation) => {
    setSelectedConversation(conversation);

    // Fetch messages for the selected conversation
    startMessagesTransition(async () => {
      const fetchedMessages = await getMessagesAction(conversation.id);
      setMessages(fetchedMessages);
    });
  }, []);

  const handleSendMessage = useCallback(
    (content: string) => {
      if (!selectedConversation) return;

      const newMessage: Message = {
        id: `msg-new-${Date.now()}`,
        conversationId: selectedConversation.id,
        content,
        direction: 'OUT',
        status: 'sent',
        timestamp: new Date(),
        senderName: 'Operator 1',
      };

      setMessages((prev) => [...prev, newMessage]);

      // Simulate delivery status update
      setTimeout(() => {
        setMessages((prev) =>
          prev.map((m) => (m.id === newMessage.id ? { ...m, status: 'delivered' } : m))
        );
      }, 1000);
    },
    [selectedConversation]
  );

  const handleStatusChange = useCallback(
    (status: Conversation['status']) => {
      if (!selectedConversation) return;
      setSelectedConversation((prev) => (prev ? { ...prev, status } : null));
    },
    [selectedConversation]
  );

  return (
    <div className="h-[calc(100vh-4rem)]">
      <div className="grid grid-cols-[380px_1fr] h-full">
        {/* Conversation List */}
        <div className="border-r flex flex-col">
          {isLoadingConversations ? (
            <ConversationListSkeleton />
          ) : (
            <>
              <ConversationList
                conversations={conversations}
                selectedId={selectedConversation?.id}
                onSelect={handleSelectConversation}
              />

              {/* Load More Button */}
              {hasMore && (
                <div className="border-t p-4">
                  {isLoadingMore ? (
                    <div className="flex items-center justify-center gap-2 text-sm text-muted-foreground">
                      <Loader2 className="h-4 w-4 animate-spin" />
                      <span>Se încarcă...</span>
                    </div>
                  ) : (
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => void loadMore()}
                      className="w-full"
                    >
                      Încarcă mai multe conversații
                    </Button>
                  )}
                </div>
              )}

              {/* Intersection Observer Sentinel */}
              <div ref={observerRef} className="h-1" />
            </>
          )}
        </div>

        {/* Conversation View */}
        {selectedConversation ? (
          <ConversationView
            conversation={selectedConversation}
            messages={messages}
            onSendMessage={handleSendMessage}
            onStatusChange={handleStatusChange}
            isLoading={isLoadingMessages}
          />
        ) : (
          <EmptyConversationView />
        )}
      </div>
    </div>
  );
}

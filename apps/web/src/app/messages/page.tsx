'use client';

import { useState, useCallback } from 'react';
import { ConversationList } from '@/components/messages/conversation-list';
import { ConversationView, EmptyConversationView } from '@/components/messages/conversation-view';
import {
  generateMockConversations,
  generateMockMessages,
  type Conversation,
  type Message,
} from '@/lib/messages';

// Generate initial mock data
const initialConversations = generateMockConversations(15);

export default function MessagesPage() {
  const [conversations, setConversations] = useState<Conversation[]>(initialConversations);
  const [selectedConversation, setSelectedConversation] = useState<Conversation | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);

  const handleSelectConversation = useCallback((conversation: Conversation) => {
    setSelectedConversation(conversation);
    // Generate mock messages for the selected conversation
    const convMessages = generateMockMessages(conversation.id, 12);
    setMessages(convMessages);

    // Mark conversation as read
    setConversations((prev) =>
      prev.map((c) => (c.id === conversation.id ? { ...c, unreadCount: 0 } : c))
    );
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

      // Update conversation's last message
      setConversations((prev) =>
        prev.map((c) =>
          c.id === selectedConversation.id
            ? { ...c, lastMessage: newMessage, updatedAt: new Date() }
            : c
        )
      );

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

      setConversations((prev) =>
        prev.map((c) => (c.id === selectedConversation.id ? { ...c, status } : c))
      );
      setSelectedConversation((prev) => (prev ? { ...prev, status } : null));
    },
    [selectedConversation]
  );

  return (
    <div className="h-[calc(100vh-4rem)]">
      <div className="grid grid-cols-[380px_1fr] h-full">
        {/* Conversation List */}
        <ConversationList
          conversations={conversations}
          selectedId={selectedConversation?.id}
          onSelect={handleSelectConversation}
        />

        {/* Conversation View */}
        {selectedConversation ? (
          <ConversationView
            conversation={selectedConversation}
            messages={messages}
            onSendMessage={handleSendMessage}
            onStatusChange={handleStatusChange}
          />
        ) : (
          <EmptyConversationView />
        )}
      </div>
    </div>
  );
}

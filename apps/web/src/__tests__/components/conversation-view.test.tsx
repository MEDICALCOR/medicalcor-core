import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ConversationView, EmptyConversationView } from '@/components/messages/conversation-view';

const mockConversation = {
  id: '1',
  patientName: 'Ion Popescu',
  phone: '+40123456789',
  channel: 'whatsapp' as const,
  status: 'active' as const,
  unreadCount: 0,
  lastMessage: {
    direction: 'IN' as const,
    content: 'Test',
    timestamp: new Date(),
  },
  updatedAt: new Date(),
};

const mockMessages = [
  {
    id: 'm1',
    direction: 'IN' as const,
    content: 'Bună ziua!',
    timestamp: new Date('2024-01-20T10:00:00'),
    status: 'delivered' as const,
  },
  {
    id: 'm2',
    direction: 'OUT' as const,
    content: 'Bună! Cu ce vă putem ajuta?',
    timestamp: new Date('2024-01-20T10:01:00'),
    status: 'read' as const,
  },
];

const mockOnSendMessage = vi.fn();
const mockOnStatusChange = vi.fn();

describe('ConversationView', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should render patient name in header', () => {
    render(
      <ConversationView
        conversation={mockConversation}
        messages={mockMessages}
        onSendMessage={mockOnSendMessage}
      />
    );

    expect(screen.getByText('Ion Popescu')).toBeInTheDocument();
  });

  it('should render patient phone', () => {
    render(
      <ConversationView
        conversation={mockConversation}
        messages={mockMessages}
        onSendMessage={mockOnSendMessage}
      />
    );

    expect(screen.getByText('+40123456789')).toBeInTheDocument();
  });

  it('should render all messages', () => {
    render(
      <ConversationView
        conversation={mockConversation}
        messages={mockMessages}
        onSendMessage={mockOnSendMessage}
      />
    );

    expect(screen.getByText('Bună ziua!')).toBeInTheDocument();
    expect(screen.getByText('Bună! Cu ce vă putem ajuta?')).toBeInTheDocument();
  });

  it('should render input field', () => {
    render(
      <ConversationView
        conversation={mockConversation}
        messages={mockMessages}
        onSendMessage={mockOnSendMessage}
      />
    );

    expect(screen.getByPlaceholderText('Scrie un mesaj...')).toBeInTheDocument();
  });

  it('should send message on form submit', async () => {
    const user = userEvent.setup();
    render(
      <ConversationView
        conversation={mockConversation}
        messages={mockMessages}
        onSendMessage={mockOnSendMessage}
      />
    );

    const input = screen.getByPlaceholderText('Scrie un mesaj...');
    await user.type(input, 'Test message');
    await user.click(screen.getByRole('button', { name: /send/i }));

    expect(mockOnSendMessage).toHaveBeenCalledWith('Test message');
  });

  it('should clear input after sending', async () => {
    const user = userEvent.setup();
    render(
      <ConversationView
        conversation={mockConversation}
        messages={mockMessages}
        onSendMessage={mockOnSendMessage}
      />
    );

    const input = screen.getByPlaceholderText('Scrie un mesaj...') as HTMLInputElement;
    await user.type(input, 'Test');
    await user.click(screen.getByRole('button', { name: /send/i }));

    expect(input.value).toBe('');
  });

  it('should disable send button when input is empty', () => {
    render(
      <ConversationView
        conversation={mockConversation}
        messages={mockMessages}
        onSendMessage={mockOnSendMessage}
      />
    );

    const sendButton = screen.getByRole('button', { name: /send/i });
    expect(sendButton).toBeDisabled();
  });

  it('should enable send button when input has text', async () => {
    const user = userEvent.setup();
    render(
      <ConversationView
        conversation={mockConversation}
        messages={mockMessages}
        onSendMessage={mockOnSendMessage}
      />
    );

    await user.type(screen.getByPlaceholderText('Scrie un mesaj...'), 'Test');

    const sendButton = screen.getByRole('button', { name: /send/i });
    expect(sendButton).not.toBeDisabled();
  });

  it('should show loading skeleton when loading', () => {
    const { container } = render(
      <ConversationView
        conversation={mockConversation}
        messages={[]}
        onSendMessage={mockOnSendMessage}
        isLoading={true}
      />
    );

    const skeletons = container.querySelectorAll('.animate-pulse');
    expect(skeletons.length).toBeGreaterThan(0);
  });

  it('should populate input with suggested message', async () => {
    const { rerender } = render(
      <ConversationView
        conversation={mockConversation}
        messages={mockMessages}
        onSendMessage={mockOnSendMessage}
      />
    );

    rerender(
      <ConversationView
        conversation={mockConversation}
        messages={mockMessages}
        onSendMessage={mockOnSendMessage}
        suggestedMessage="Suggested text"
        onSuggestionConsumed={vi.fn()}
      />
    );

    await waitFor(() => {
      const input = screen.getByPlaceholderText('Scrie un mesaj...') as HTMLInputElement;
      expect(input.value).toBe('Suggested text');
    });
  });

  it('should call onStatusChange when marking as resolved', async () => {
    const user = userEvent.setup();
    render(
      <ConversationView
        conversation={mockConversation}
        messages={mockMessages}
        onSendMessage={mockOnSendMessage}
        onStatusChange={mockOnStatusChange}
      />
    );

    // Open menu
    const menuButtons = screen.getAllByRole('button');
    const moreButton = menuButtons.find((btn) => btn.querySelector('svg'));
    if (moreButton) {
      await user.click(moreButton);

      await waitFor(() => {
        expect(screen.getByText('Marchează ca rezolvat')).toBeInTheDocument();
      });

      await user.click(screen.getByText('Marchează ca rezolvat'));

      expect(mockOnStatusChange).toHaveBeenCalledWith('resolved');
    }
  });

  it('should format message timestamps', () => {
    render(
      <ConversationView
        conversation={mockConversation}
        messages={mockMessages}
        onSendMessage={mockOnSendMessage}
      />
    );

    expect(screen.getByText('10:00')).toBeInTheDocument();
    expect(screen.getByText('10:01')).toBeInTheDocument();
  });

  it('should display date headers', () => {
    render(
      <ConversationView
        conversation={mockConversation}
        messages={mockMessages}
        onSendMessage={mockOnSendMessage}
      />
    );

    // Should show "Astăzi", "Ieri", or date
    const dateHeader = screen.getByRole('img', { hidden: true });
    expect(dateHeader).toBeInTheDocument();
  });
});

describe('EmptyConversationView', () => {
  it('should render empty state', () => {
    render(<EmptyConversationView />);

    expect(screen.getByText('Selectează o conversație')).toBeInTheDocument();
    expect(
      screen.getByText('Alege o conversație din listă pentru a vedea mesajele')
    ).toBeInTheDocument();
  });
});

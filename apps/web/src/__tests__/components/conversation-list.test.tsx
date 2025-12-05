import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ConversationList } from '@/components/messages/conversation-list';

const mockConversations = [
  {
    id: '1',
    patientName: 'Ion Popescu',
    phone: '+40123456789',
    channel: 'whatsapp' as const,
    status: 'active' as const,
    unreadCount: 3,
    lastMessage: {
      direction: 'IN' as const,
      content: 'Bună ziua, aș dori o programare.',
      timestamp: new Date('2024-01-20T10:00:00'),
    },
    updatedAt: new Date('2024-01-20T10:00:00'),
  },
  {
    id: '2',
    patientName: 'Maria Ionescu',
    phone: '+40987654321',
    channel: 'sms' as const,
    status: 'waiting' as const,
    unreadCount: 0,
    lastMessage: {
      direction: 'OUT' as const,
      content: 'Vă confirm programarea pentru mâine.',
      timestamp: new Date('2024-01-19T15:00:00'),
    },
    updatedAt: new Date('2024-01-19T15:00:00'),
  },
];

const mockOnSelect = vi.fn();
const mockOnLoadMore = vi.fn();

describe('ConversationList', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should render conversation names', () => {
    render(<ConversationList conversations={mockConversations} onSelect={mockOnSelect} />);

    expect(screen.getByText('Ion Popescu')).toBeInTheDocument();
    expect(screen.getByText('Maria Ionescu')).toBeInTheDocument();
  });

  it('should display search input', () => {
    render(<ConversationList conversations={mockConversations} onSelect={mockOnSelect} />);

    expect(screen.getByPlaceholderText('Caută pacient sau telefon...')).toBeInTheDocument();
  });

  it('should filter conversations by name', async () => {
    const user = userEvent.setup();
    render(<ConversationList conversations={mockConversations} onSelect={mockOnSelect} />);

    await user.type(screen.getByPlaceholderText('Caută pacient sau telefon...'), 'Ion');

    expect(screen.getByText('Ion Popescu')).toBeInTheDocument();
    expect(screen.queryByText('Maria Ionescu')).not.toBeInTheDocument();
  });

  it('should filter conversations by phone', async () => {
    const user = userEvent.setup();
    render(<ConversationList conversations={mockConversations} onSelect={mockOnSelect} />);

    await user.type(screen.getByPlaceholderText('Caută pacient sau telefon...'), '+40123');

    expect(screen.getByText('Ion Popescu')).toBeInTheDocument();
    expect(screen.queryByText('Maria Ionescu')).not.toBeInTheDocument();
  });

  it('should display unread count badge', () => {
    render(<ConversationList conversations={mockConversations} onSelect={mockOnSelect} />);

    expect(screen.getByText('3')).toBeInTheDocument();
  });

  it('should not display badge for zero unread', () => {
    render(<ConversationList conversations={mockConversations} onSelect={mockOnSelect} />);

    const badges = screen.queryAllByText('0');
    expect(badges.length).toBe(0);
  });

  it('should call onSelect when conversation is clicked', async () => {
    const user = userEvent.setup();
    render(<ConversationList conversations={mockConversations} onSelect={mockOnSelect} />);

    await user.click(screen.getByText('Ion Popescu'));

    expect(mockOnSelect).toHaveBeenCalledWith(mockConversations[0]);
  });

  it('should highlight selected conversation', () => {
    const { container } = render(
      <ConversationList
        conversations={mockConversations}
        selectedId="1"
        onSelect={mockOnSelect}
      />
    );

    const selectedConv = container.querySelector('.bg-muted');
    expect(selectedConv).toBeInTheDocument();
  });

  it('should display active count', () => {
    render(<ConversationList conversations={mockConversations} onSelect={mockOnSelect} />);

    expect(screen.getByText('1 active')).toBeInTheDocument();
  });

  it('should display waiting count', () => {
    render(<ConversationList conversations={mockConversations} onSelect={mockOnSelect} />);

    expect(screen.getByText('1 în așteptare')).toBeInTheDocument();
  });

  it('should filter by status', async () => {
    const user = userEvent.setup();
    render(<ConversationList conversations={mockConversations} onSelect={mockOnSelect} />);

    await user.click(screen.getByRole('button', { name: /status/i }));

    await waitFor(() => {
      expect(screen.getByText('Active')).toBeInTheDocument();
    });

    await user.click(screen.getByText('Active'));

    expect(screen.getByText('Ion Popescu')).toBeInTheDocument();
    expect(screen.queryByText('Maria Ionescu')).not.toBeInTheDocument();
  });

  it('should filter by channel', async () => {
    const user = userEvent.setup();
    render(<ConversationList conversations={mockConversations} onSelect={mockOnSelect} />);

    await user.click(screen.getByRole('button', { name: /canal/i }));

    await waitFor(() => {
      expect(screen.getByText('WhatsApp')).toBeInTheDocument();
    });

    await user.click(screen.getByText('WhatsApp'));

    expect(screen.getByText('Ion Popescu')).toBeInTheDocument();
    expect(screen.queryByText('Maria Ionescu')).not.toBeInTheDocument();
  });

  it('should show empty state when no conversations', () => {
    render(<ConversationList conversations={[]} onSelect={mockOnSelect} />);

    expect(screen.getByText('Nu există conversații')).toBeInTheDocument();
  });

  it('should display last message content', () => {
    render(<ConversationList conversations={mockConversations} onSelect={mockOnSelect} />);

    expect(screen.getByText('Bună ziua, aș dori o programare.')).toBeInTheDocument();
    expect(screen.getByText('Vă confirm programarea pentru mâine.')).toBeInTheDocument();
  });

  it('should show checkmark for outgoing messages', () => {
    const { container } = render(
      <ConversationList conversations={mockConversations} onSelect={mockOnSelect} />
    );

    const checkmarks = container.querySelectorAll('.text-blue-500');
    expect(checkmarks.length).toBeGreaterThan(0);
  });

  it('should display load more button when hasMore', () => {
    render(
      <ConversationList
        conversations={mockConversations}
        onSelect={mockOnSelect}
        hasMore={true}
        onLoadMore={mockOnLoadMore}
      />
    );

    expect(screen.getByRole('button', { name: /încarcă mai multe/i })).toBeInTheDocument();
  });

  it('should call onLoadMore when button clicked', async () => {
    const user = userEvent.setup();
    render(
      <ConversationList
        conversations={mockConversations}
        onSelect={mockOnSelect}
        hasMore={true}
        onLoadMore={mockOnLoadMore}
      />
    );

    await user.click(screen.getByRole('button', { name: /încarcă mai multe/i }));

    expect(mockOnLoadMore).toHaveBeenCalledTimes(1);
  });

  it('should show loading state when loading more', () => {
    render(
      <ConversationList
        conversations={mockConversations}
        onSelect={mockOnSelect}
        hasMore={true}
        isLoadingMore={true}
        onLoadMore={mockOnLoadMore}
      />
    );

    expect(screen.getByText('Se încarcă...')).toBeInTheDocument();
  });

  it('should display total count', () => {
    render(
      <ConversationList
        conversations={mockConversations}
        onSelect={mockOnSelect}
        hasMore={true}
        totalCount={10}
        onLoadMore={mockOnLoadMore}
      />
    );

    expect(screen.getByText('2 din 10 conversații')).toBeInTheDocument();
  });

  it('should format recent time correctly', () => {
    const recentConv = {
      ...mockConversations[0],
      updatedAt: new Date(),
    };

    render(<ConversationList conversations={[recentConv]} onSelect={mockOnSelect} />);

    expect(screen.getByText(/Acum|m|h/)).toBeInTheDocument();
  });
});

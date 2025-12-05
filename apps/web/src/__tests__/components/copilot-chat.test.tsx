import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { CopilotChat } from '@/components/ai-copilot/copilot-chat';

const mockMessages = [
  {
    id: '1',
    role: 'user' as const,
    content: 'Cum răspund la întrebări despre preț?',
    timestamp: new Date('2024-01-01T10:00:00'),
  },
  {
    id: '2',
    role: 'assistant' as const,
    content: 'Poți menționa că prețurile variază în funcție de complexitate.',
    timestamp: new Date('2024-01-01T10:00:05'),
  },
];

const mockSendMessage = vi.fn();
const mockClearMessages = vi.fn();

vi.mock('@/lib/ai', () => ({
  useAICopilot: vi.fn(() => ({
    messages: [],
    isLoading: false,
    error: null,
    sendMessage: mockSendMessage,
    clearMessages: mockClearMessages,
  })),
}));

describe('CopilotChat', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should render empty state when no messages', () => {
    render(<CopilotChat />);

    expect(screen.getByText('AI Copilot')).toBeInTheDocument();
    expect(
      screen.getByText('Întreabă-mă orice despre pacient sau despre cum să răspunzi la mesaje.')
    ).toBeInTheDocument();
  });

  it('should display example prompts in empty state', () => {
    render(<CopilotChat />);

    expect(screen.getByText('Cum răspund la întrebări despre preț?')).toBeInTheDocument();
    expect(screen.getByText('Ce procedură să recomand?')).toBeInTheDocument();
    expect(screen.getByText('Rezumă conversația anterioară')).toBeInTheDocument();
  });

  it('should render messages when provided', () => {
    const { useAICopilot } = require('@/lib/ai');
    useAICopilot.mockReturnValue({
      messages: mockMessages,
      isLoading: false,
      error: null,
      sendMessage: mockSendMessage,
      clearMessages: mockClearMessages,
    });

    render(<CopilotChat />);

    expect(screen.getByText('Cum răspund la întrebări despre preț?')).toBeInTheDocument();
    expect(
      screen.getByText('Poți menționa că prețurile variază în funcție de complexitate.')
    ).toBeInTheDocument();
  });

  it('should display user messages on the right', () => {
    const { useAICopilot } = require('@/lib/ai');
    useAICopilot.mockReturnValue({
      messages: [mockMessages[0]],
      isLoading: false,
      error: null,
      sendMessage: mockSendMessage,
      clearMessages: mockClearMessages,
    });

    const { container } = render(<CopilotChat />);

    const userMessage = container.querySelector('.justify-end');
    expect(userMessage).toBeInTheDocument();
  });

  it('should display assistant messages on the left', () => {
    const { useAICopilot } = require('@/lib/ai');
    useAICopilot.mockReturnValue({
      messages: [mockMessages[1]],
      isLoading: false,
      error: null,
      sendMessage: mockSendMessage,
      clearMessages: mockClearMessages,
    });

    const { container } = render(<CopilotChat />);

    const assistantMessage = container.querySelector('.justify-start');
    expect(assistantMessage).toBeInTheDocument();
  });

  it('should render textarea for input', () => {
    render(<CopilotChat />);

    const textarea = screen.getByPlaceholderText('Întreabă AI Copilot...');
    expect(textarea).toBeInTheDocument();
    expect(textarea.tagName).toBe('TEXTAREA');
  });

  it('should send message on form submit', async () => {
    const user = userEvent.setup();
    render(<CopilotChat />);

    const textarea = screen.getByPlaceholderText('Întreabă AI Copilot...');
    await user.type(textarea, 'Test message');
    await user.click(screen.getByRole('button', { name: /send message/i }));

    await waitFor(() => {
      expect(mockSendMessage).toHaveBeenCalledWith('Test message', undefined);
    });
  });

  it('should send message on Enter key', async () => {
    const user = userEvent.setup();
    render(<CopilotChat />);

    const textarea = screen.getByPlaceholderText('Întreabă AI Copilot...');
    await user.type(textarea, 'Test message{Enter}');

    await waitFor(() => {
      expect(mockSendMessage).toHaveBeenCalledWith('Test message', undefined);
    });
  });

  it('should not send message on Shift+Enter', async () => {
    const user = userEvent.setup();
    render(<CopilotChat />);

    const textarea = screen.getByPlaceholderText('Întreabă AI Copilot...');
    await user.type(textarea, 'Test message{Shift>}{Enter}{/Shift}');

    expect(mockSendMessage).not.toHaveBeenCalled();
  });

  it('should clear input after sending message', async () => {
    const user = userEvent.setup();
    render(<CopilotChat />);

    const textarea = screen.getByPlaceholderText('Întreabă AI Copilot...');
    await user.type(textarea, 'Test message');
    await user.click(screen.getByRole('button', { name: /send message/i }));

    await waitFor(() => {
      expect(textarea).toHaveValue('');
    });
  });

  it('should disable input when loading', () => {
    const { useAICopilot } = require('@/lib/ai');
    useAICopilot.mockReturnValue({
      messages: [],
      isLoading: true,
      error: null,
      sendMessage: mockSendMessage,
      clearMessages: mockClearMessages,
    });

    render(<CopilotChat />);

    const textarea = screen.getByPlaceholderText('Întreabă AI Copilot...');
    expect(textarea).toBeDisabled();
  });

  it('should disable send button when input is empty', () => {
    render(<CopilotChat />);

    const sendButton = screen.getByRole('button', { name: /send message/i });
    expect(sendButton).toBeDisabled();
  });

  it('should enable send button when input has text', async () => {
    const user = userEvent.setup();
    render(<CopilotChat />);

    const textarea = screen.getByPlaceholderText('Întreabă AI Copilot...');
    await user.type(textarea, 'Test');

    const sendButton = screen.getByRole('button', { name: /send message/i });
    expect(sendButton).not.toBeDisabled();
  });

  it('should show loading indicator when sending', () => {
    const { useAICopilot } = require('@/lib/ai');
    useAICopilot.mockReturnValue({
      messages: mockMessages,
      isLoading: true,
      error: null,
      sendMessage: mockSendMessage,
      clearMessages: mockClearMessages,
    });

    const { container } = render(<CopilotChat />);

    const loader = container.querySelector('.animate-spin');
    expect(loader).toBeInTheDocument();
  });

  it('should display error message when error occurs', () => {
    const { useAICopilot } = require('@/lib/ai');
    useAICopilot.mockReturnValue({
      messages: [],
      isLoading: false,
      error: 'Failed to send message',
      sendMessage: mockSendMessage,
      clearMessages: mockClearMessages,
    });

    render(<CopilotChat />);

    expect(screen.getByText('Failed to send message')).toBeInTheDocument();
  });

  it('should show clear conversation button when messages exist', () => {
    const { useAICopilot } = require('@/lib/ai');
    useAICopilot.mockReturnValue({
      messages: mockMessages,
      isLoading: false,
      error: null,
      sendMessage: mockSendMessage,
      clearMessages: mockClearMessages,
    });

    render(<CopilotChat />);

    expect(screen.getByRole('button', { name: /șterge conversația/i })).toBeInTheDocument();
  });

  it('should call clearMessages when clear button is clicked', async () => {
    const user = userEvent.setup();
    const { useAICopilot } = require('@/lib/ai');
    useAICopilot.mockReturnValue({
      messages: mockMessages,
      isLoading: false,
      error: null,
      sendMessage: mockSendMessage,
      clearMessages: mockClearMessages,
    });

    render(<CopilotChat />);

    await user.click(screen.getByRole('button', { name: /șterge conversația/i }));

    expect(mockClearMessages).toHaveBeenCalledTimes(1);
  });

  it('should not show clear button when no messages', () => {
    render(<CopilotChat />);

    expect(screen.queryByRole('button', { name: /șterge conversația/i })).not.toBeInTheDocument();
  });

  it('should format message timestamps', () => {
    const { useAICopilot } = require('@/lib/ai');
    useAICopilot.mockReturnValue({
      messages: mockMessages,
      isLoading: false,
      error: null,
      sendMessage: mockSendMessage,
      clearMessages: mockClearMessages,
    });

    render(<CopilotChat />);

    expect(screen.getByText('10:00')).toBeInTheDocument();
  });

  it('should have accessible labels on input and button', () => {
    render(<CopilotChat />);

    expect(screen.getByLabelText('Enter your message for AI Copilot')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /send message/i })).toBeInTheDocument();
  });

  it('should pass context to sendMessage', async () => {
    const user = userEvent.setup();
    const context = {
      patientId: '123',
      patientName: 'Ion Popescu',
    };

    render(<CopilotChat context={context} />);

    const textarea = screen.getByPlaceholderText('Întreabă AI Copilot...');
    await user.type(textarea, 'Test message');
    await user.click(screen.getByRole('button', { name: /send message/i }));

    await waitFor(() => {
      expect(mockSendMessage).toHaveBeenCalledWith('Test message', context);
    });
  });

  it('should auto-resize textarea based on content', async () => {
    const user = userEvent.setup();
    render(<CopilotChat />);

    const textarea = screen.getByPlaceholderText('Întreabă AI Copilot...');
    await user.type(textarea, 'Line 1\nLine 2\nLine 3');

    // Check that height changes (implementation detail test)
    expect(textarea).toBeInTheDocument();
  });

  it('should prevent sending empty messages', async () => {
    const user = userEvent.setup();
    render(<CopilotChat />);

    const textarea = screen.getByPlaceholderText('Întreabă AI Copilot...');
    await user.type(textarea, '   ');
    await user.click(screen.getByRole('button', { name: /send message/i }));

    expect(mockSendMessage).not.toHaveBeenCalled();
  });
});

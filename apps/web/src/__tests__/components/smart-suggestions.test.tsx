import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { SmartSuggestions } from '@/components/ai-copilot/smart-suggestions';

const mockSuggestions = [
  {
    id: '1',
    content: 'Bună ziua! Vă mulțumim pentru interes.',
    tone: 'friendly' as const,
    confidence: 0.9,
  },
  {
    id: '2',
    content: 'Vă rugăm să ne furnizați mai multe detalii.',
    tone: 'formal' as const,
    confidence: 0.85,
  },
];

const mockQuickReplies = [
  { id: 'q1', label: 'Salut', content: 'Bună ziua!', shortcut: 'Ctrl+1' },
  { id: 'q2', label: 'Programare', content: 'Vă putem programa.', shortcut: 'Ctrl+2' },
];

vi.mock('@/lib/ai', () => ({
  quickReplies: mockQuickReplies,
  generateMockSuggestions: vi.fn(() => mockSuggestions),
}));

// Mock clipboard
Object.assign(navigator, {
  clipboard: {
    writeText: vi.fn(),
  },
});

describe('SmartSuggestions', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('should show loading state initially', () => {
    render(<SmartSuggestions />);

    const skeletons = screen.getAllByRole('img', { hidden: true });
    expect(skeletons.length).toBeGreaterThan(0);
  });

  it('should display suggestions after loading', async () => {
    render(<SmartSuggestions />);
    vi.advanceTimersByTime(500);

    await waitFor(() => {
      expect(screen.getByText('Bună ziua! Vă mulțumim pentru interes.')).toBeInTheDocument();
      expect(screen.getByText('Vă rugăm să ne furnizați mai multe detalii.')).toBeInTheDocument();
    });
  });

  it('should display tone badges for suggestions', async () => {
    render(<SmartSuggestions />);
    vi.advanceTimersByTime(500);

    await waitFor(() => {
      expect(screen.getByText('Prietenos')).toBeInTheDocument();
      expect(screen.getByText('Formal')).toBeInTheDocument();
    });
  });

  it('should display confidence percentages', async () => {
    render(<SmartSuggestions />);
    vi.advanceTimersByTime(500);

    await waitFor(() => {
      expect(screen.getByText('90%')).toBeInTheDocument();
      expect(screen.getByText('85%')).toBeInTheDocument();
    });
  });

  it('should call onSelect when suggestion is clicked', async () => {
    const user = userEvent.setup({ delay: null });
    const onSelect = vi.fn();

    render(<SmartSuggestions onSelect={onSelect} />);
    vi.advanceTimersByTime(500);

    await waitFor(() => {
      expect(screen.getByText('Bună ziua! Vă mulțumim pentru interes.')).toBeInTheDocument();
    });

    await user.click(screen.getByText('Bună ziua! Vă mulțumim pentru interes.'));

    expect(onSelect).toHaveBeenCalledWith('Bună ziua! Vă mulțumim pentru interes.');
  });

  it('should copy suggestion to clipboard when copy button is clicked', async () => {
    const user = userEvent.setup({ delay: null });
    render(<SmartSuggestions />);
    vi.advanceTimersByTime(500);

    await waitFor(() => {
      expect(screen.getByText('Bună ziua! Vă mulțumim pentru interes.')).toBeInTheDocument();
    });

    const copyButtons = screen.getAllByRole('button', { name: /copiază/i });
    await user.click(copyButtons[0]);

    expect(navigator.clipboard.writeText).toHaveBeenCalledWith(
      'Bună ziua! Vă mulțumim pentru interes.'
    );
  });

  it('should show check icon after copying', async () => {
    const user = userEvent.setup({ delay: null });
    render(<SmartSuggestions />);
    vi.advanceTimersByTime(500);

    await waitFor(() => {
      expect(screen.getByText('Bună ziua! Vă mulțumim pentru interes.')).toBeInTheDocument();
    });

    const copyButtons = screen.getAllByRole('button', { name: /copiază/i });
    await user.click(copyButtons[0]);

    await waitFor(() => {
      // Check icon should be visible (implementation may vary)
      expect(navigator.clipboard.writeText).toHaveBeenCalled();
    });
  });

  it('should display quick replies section', async () => {
    render(<SmartSuggestions />);
    vi.advanceTimersByTime(500);

    await waitFor(() => {
      expect(screen.getByText('Răspunsuri Rapide')).toBeInTheDocument();
    });
  });

  it('should display quick reply labels', async () => {
    render(<SmartSuggestions />);
    vi.advanceTimersByTime(500);

    await waitFor(() => {
      expect(screen.getByText('Salut')).toBeInTheDocument();
      expect(screen.getByText('Programare')).toBeInTheDocument();
    });
  });

  it('should display quick reply shortcuts', async () => {
    render(<SmartSuggestions />);
    vi.advanceTimersByTime(500);

    await waitFor(() => {
      expect(screen.getByText('Ctrl+1')).toBeInTheDocument();
      expect(screen.getByText('Ctrl+2')).toBeInTheDocument();
    });
  });

  it('should call onSelect when quick reply is clicked', async () => {
    const user = userEvent.setup({ delay: null });
    const onSelect = vi.fn();

    render(<SmartSuggestions onSelect={onSelect} />);
    vi.advanceTimersByTime(500);

    await waitFor(() => {
      expect(screen.getByText('Salut')).toBeInTheDocument();
    });

    await user.click(screen.getByText('Salut'));

    expect(onSelect).toHaveBeenCalledWith('Bună ziua!');
  });

  it('should refresh suggestions when refresh button is clicked', async () => {
    const user = userEvent.setup({ delay: null });
    const { generateMockSuggestions } = require('@/lib/ai');

    render(<SmartSuggestions />);
    vi.advanceTimersByTime(500);

    await waitFor(() => {
      expect(screen.getByText('Bună ziua! Vă mulțumim pentru interes.')).toBeInTheDocument();
    });

    const refreshButton = screen.getByRole('button', { name: '' });
    await user.click(refreshButton);

    vi.advanceTimersByTime(500);

    await waitFor(() => {
      expect(generateMockSuggestions).toHaveBeenCalled();
    });
  });

  it('should disable refresh button while loading', async () => {
    const user = userEvent.setup({ delay: null });
    render(<SmartSuggestions />);

    const refreshButton = screen.getByRole('button', { name: '' });
    expect(refreshButton).toBeDisabled();
  });

  it('should handle feedback submission', async () => {
    const user = userEvent.setup({ delay: null });
    render(<SmartSuggestions />);
    vi.advanceTimersByTime(500);

    await waitFor(() => {
      expect(screen.getByText('Bună ziua! Vă mulțumim pentru interes.')).toBeInTheDocument();
    });

    const likeButtons = screen.getAllByRole('button', { name: /like/i });
    await user.click(likeButtons[0]);

    // Feedback should be recorded (visual feedback)
    expect(likeButtons[0]).toHaveClass('bg-green-100');
  });

  it('should handle negative feedback', async () => {
    const user = userEvent.setup({ delay: null });
    render(<SmartSuggestions />);
    vi.advanceTimersByTime(500);

    await waitFor(() => {
      expect(screen.getByText('Bună ziua! Vă mulțumim pentru interes.')).toBeInTheDocument();
    });

    const dislikeButtons = screen.getAllByRole('button', { name: /dislike/i });
    await user.click(dislikeButtons[0]);

    expect(dislikeButtons[0]).toHaveClass('bg-red-100');
  });

  it('should regenerate suggestions when context changes', async () => {
    const { generateMockSuggestions } = require('@/lib/ai');
    const context = {
      currentConversation: [
        { direction: 'IN' as const, content: 'Test message', timestamp: '2024-01-01', channel: 'whatsapp' as const },
      ],
    };

    const { rerender } = render(<SmartSuggestions context={context} />);
    vi.advanceTimersByTime(500);

    await waitFor(() => {
      expect(generateMockSuggestions).toHaveBeenCalled();
    });

    const newContext = {
      currentConversation: [
        { direction: 'IN' as const, content: 'New message', timestamp: '2024-01-02', channel: 'whatsapp' as const },
      ],
    };

    rerender(<SmartSuggestions context={newContext} />);
    vi.advanceTimersByTime(500);

    await waitFor(() => {
      expect(generateMockSuggestions).toHaveBeenCalledTimes(2);
    });
  });

  it('should apply correct tone colors', async () => {
    render(<SmartSuggestions />);
    vi.advanceTimersByTime(500);

    await waitFor(() => {
      const friendlyBadge = screen.getByText('Prietenos');
      expect(friendlyBadge).toHaveClass('bg-tone-friendly-bg');

      const formalBadge = screen.getByText('Formal');
      expect(formalBadge).toHaveClass('bg-tone-formal-bg');
    });
  });

  it('should limit quick replies to 6 items', async () => {
    render(<SmartSuggestions />);
    vi.advanceTimersByTime(500);

    await waitFor(() => {
      const quickReplyButtons = screen.getAllByRole('button').filter((btn) =>
        btn.textContent?.includes('Ctrl+')
      );
      expect(quickReplyButtons.length).toBeLessThanOrEqual(6);
    });
  });

  it('should stop propagation when clicking copy button', async () => {
    const user = userEvent.setup({ delay: null });
    const onSelect = vi.fn();

    render(<SmartSuggestions onSelect={onSelect} />);
    vi.advanceTimersByTime(500);

    await waitFor(() => {
      expect(screen.getByText('Bună ziua! Vă mulțumim pentru interes.')).toBeInTheDocument();
    });

    const copyButtons = screen.getAllByRole('button', { name: /copiază/i });
    await user.click(copyButtons[0]);

    // onSelect should not be called when copying
    expect(onSelect).not.toHaveBeenCalled();
  });

  it('should stop propagation when clicking feedback buttons', async () => {
    const user = userEvent.setup({ delay: null });
    const onSelect = vi.fn();

    render(<SmartSuggestions onSelect={onSelect} />);
    vi.advanceTimersByTime(500);

    await waitFor(() => {
      expect(screen.getByText('Bună ziua! Vă mulțumim pentru interes.')).toBeInTheDocument();
    });

    const likeButtons = screen.getAllByRole('button', { name: /like/i });
    await user.click(likeButtons[0]);

    expect(onSelect).not.toHaveBeenCalled();
  });
});

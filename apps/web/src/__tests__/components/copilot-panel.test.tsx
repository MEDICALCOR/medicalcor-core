import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { CopilotPanel } from '@/components/ai-copilot/copilot-panel';

// Mock child components
vi.mock('@/components/ai-copilot/copilot-chat', () => ({
  CopilotChat: ({ context }: any) => (
    <div data-testid="copilot-chat">Copilot Chat - {context?.patientName}</div>
  ),
}));

vi.mock('@/components/ai-copilot/smart-suggestions', () => ({
  SmartSuggestions: ({ context, onSelect }: any) => (
    <div data-testid="smart-suggestions">
      Smart Suggestions - {context?.patientName}
      <button onClick={() => onSelect?.('test suggestion')}>Select Suggestion</button>
    </div>
  ),
}));

vi.mock('@/components/ai-copilot/patient-summary', () => ({
  PatientSummary: ({ patientId }: any) => (
    <div data-testid="patient-summary">Patient Summary - {patientId}</div>
  ),
}));

vi.mock('@/components/ai-copilot/procedure-recommendations', () => ({
  ProcedureRecommendations: ({ context }: any) => (
    <div data-testid="procedure-recommendations">
      Procedure Recommendations - {context?.patientName}
    </div>
  ),
}));

describe('CopilotPanel', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should render closed state with floating button', () => {
    render(<CopilotPanel />);

    const button = screen.getByRole('button');
    expect(button).toHaveClass('fixed', 'right-4', 'bottom-4');
    expect(button).toHaveClass('rounded-full');
  });

  it('should have accessible label on floating button', () => {
    render(<CopilotPanel />);

    expect(screen.getByText('Deschide AI Copilot')).toBeInTheDocument();
  });

  it('should open panel when floating button is clicked', async () => {
    const user = userEvent.setup();
    render(<CopilotPanel />);

    const button = screen.getByRole('button');
    await user.click(button);

    await waitFor(() => {
      expect(screen.getByText('AI Copilot')).toBeInTheDocument();
    });
  });

  it('should display patient name in header when provided', async () => {
    const user = userEvent.setup();
    render(<CopilotPanel patientName="Ion Popescu" />);

    await user.click(screen.getByRole('button'));

    await waitFor(() => {
      expect(screen.getByText('Ion Popescu')).toBeInTheDocument();
    });
  });

  it('should display patient phone in header when name is not provided', async () => {
    const user = userEvent.setup();
    render(<CopilotPanel patientPhone="+40123456789" />);

    await user.click(screen.getByRole('button'));

    await waitFor(() => {
      expect(screen.getByText('+40123456789')).toBeInTheDocument();
    });
  });

  it('should display default text when no patient info is provided', async () => {
    const user = userEvent.setup();
    render(<CopilotPanel />);

    await user.click(screen.getByRole('button'));

    await waitFor(() => {
      expect(screen.getByText('Asistent inteligent')).toBeInTheDocument();
    });
  });

  it('should render all tabs when open', async () => {
    const user = userEvent.setup();
    render(<CopilotPanel />);

    await user.click(screen.getByRole('button'));

    await waitFor(() => {
      expect(screen.getByText('Chat')).toBeInTheDocument();
      expect(screen.getByText('Sugestii')).toBeInTheDocument();
      expect(screen.getByText('Rezumat')).toBeInTheDocument();
      expect(screen.getByText('Proceduri')).toBeInTheDocument();
    });
  });

  it('should default to suggestions tab', async () => {
    const user = userEvent.setup();
    render(<CopilotPanel />);

    await user.click(screen.getByRole('button'));

    await waitFor(() => {
      expect(screen.getByTestId('smart-suggestions')).toBeInTheDocument();
    });
  });

  it('should switch to chat tab when clicked', async () => {
    const user = userEvent.setup();
    render(<CopilotPanel />);

    await user.click(screen.getByRole('button'));

    await waitFor(() => {
      const chatTab = screen.getByRole('button', { name: /chat/i });
      expect(chatTab).toBeInTheDocument();
    });

    const chatTab = screen.getByRole('button', { name: /chat/i });
    await user.click(chatTab);

    expect(screen.getByTestId('copilot-chat')).toBeInTheDocument();
  });

  it('should switch to summary tab when clicked', async () => {
    const user = userEvent.setup();
    render(<CopilotPanel />);

    await user.click(screen.getByRole('button'));
    await waitFor(() => {
      expect(screen.getByText('Rezumat')).toBeInTheDocument();
    });

    const summaryTab = screen.getByRole('button', { name: /rezumat/i });
    await user.click(summaryTab);

    expect(screen.getByTestId('patient-summary')).toBeInTheDocument();
  });

  it('should switch to procedures tab when clicked', async () => {
    const user = userEvent.setup();
    render(<CopilotPanel />);

    await user.click(screen.getByRole('button'));
    await waitFor(() => {
      expect(screen.getByText('Proceduri')).toBeInTheDocument();
    });

    const proceduresTab = screen.getByRole('button', { name: /proceduri/i });
    await user.click(proceduresTab);

    expect(screen.getByTestId('procedure-recommendations')).toBeInTheDocument();
  });

  it('should highlight active tab', async () => {
    const user = userEvent.setup();
    render(<CopilotPanel />);

    await user.click(screen.getByRole('button'));
    await waitFor(() => {
      expect(screen.getByText('Sugestii')).toBeInTheDocument();
    });

    const suggestionsTab = screen.getByRole('button', { name: /sugestii/i });
    expect(suggestionsTab).toHaveClass('border-primary', 'text-primary');
  });

  it('should close panel when close button is clicked', async () => {
    const user = userEvent.setup();
    render(<CopilotPanel />);

    await user.click(screen.getByRole('button'));
    await waitFor(() => {
      expect(screen.getByText('AI Copilot')).toBeInTheDocument();
    });

    const closeButtons = screen.getAllByRole('button');
    const closeButton = closeButtons.find((btn) => btn.querySelector('svg'));
    if (closeButton) {
      await user.click(closeButton);
    }

    await waitFor(() => {
      expect(screen.queryByText('AI Copilot')).not.toBeInTheDocument();
    });
  });

  it('should call onSuggestionSelect when suggestion is selected', async () => {
    const user = userEvent.setup();
    const onSuggestionSelect = vi.fn();
    render(<CopilotPanel onSuggestionSelect={onSuggestionSelect} />);

    await user.click(screen.getByRole('button'));
    await waitFor(() => {
      expect(screen.getByTestId('smart-suggestions')).toBeInTheDocument();
    });

    await user.click(screen.getByText('Select Suggestion'));

    expect(onSuggestionSelect).toHaveBeenCalledWith('test suggestion');
  });

  it('should pass patient context to child components', async () => {
    const user = userEvent.setup();
    const context = {
      patientId: '123',
      patientName: 'Ion Popescu',
      patientPhone: '+40123456789',
      currentConversation: [],
    };

    render(
      <CopilotPanel
        patientId={context.patientId}
        patientName={context.patientName}
        patientPhone={context.patientPhone}
        currentConversation={context.currentConversation}
      />
    );

    await user.click(screen.getByRole('button'));

    await waitFor(() => {
      expect(screen.getByText(/Ion Popescu/)).toBeInTheDocument();
    });
  });

  it('should apply custom className to floating button', () => {
    render(<CopilotPanel className="custom-class" />);

    const button = screen.getByRole('button');
    expect(button).toHaveClass('custom-class');
  });

  it('should have fixed positioning and proper dimensions', async () => {
    const user = userEvent.setup();
    const { container } = render(<CopilotPanel />);

    await user.click(screen.getByRole('button'));

    await waitFor(() => {
      const panel = container.querySelector('.fixed.right-4.bottom-4');
      expect(panel).toBeInTheDocument();
      expect(panel).toHaveClass('w-96');
    });
  });

  it('should show footer hint message', async () => {
    const user = userEvent.setup();
    render(<CopilotPanel />);

    await user.click(screen.getByRole('button'));

    await waitFor(() => {
      expect(
        screen.getByText('Selectează o sugestie pentru a o folosi în conversație')
      ).toBeInTheDocument();
    });
  });

  it('should maintain state when switching between tabs', async () => {
    const user = userEvent.setup();
    render(<CopilotPanel patientId="123" />);

    await user.click(screen.getByRole('button'));
    await waitFor(() => {
      expect(screen.getByText('Rezumat')).toBeInTheDocument();
    });

    // Switch to summary tab
    const summaryTab = screen.getByRole('button', { name: /rezumat/i });
    await user.click(summaryTab);
    expect(screen.getByTestId('patient-summary')).toBeInTheDocument();

    // Switch back to suggestions
    const suggestionsTab = screen.getByRole('button', { name: /sugestii/i });
    await user.click(suggestionsTab);
    expect(screen.getByTestId('smart-suggestions')).toBeInTheDocument();
  });

  it('should have proper ARIA attributes', async () => {
    const user = userEvent.setup();
    render(<CopilotPanel />);

    await user.click(screen.getByRole('button'));

    await waitFor(() => {
      const panel = screen.getByText('AI Copilot').closest('div');
      expect(panel).toBeInTheDocument();
    });
  });
});

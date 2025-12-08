import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ProcedureRecommendations } from '@/components/ai-copilot/procedure-recommendations';

const mockRecommendations = [
  {
    id: '1',
    name: 'Implant Dentar',
    category: 'Implantologie',
    relevanceScore: 0.9,
    reasoning: 'Pacientul a menționat lipsa unui dinte',
    priceRange: { min: 2000, max: 3000, currency: 'EUR' },
    duration: '60-90 minute',
    relatedProcedures: ['Grefă Osoasă', 'Consultație'],
    commonQuestions: ['Durează procedura?', 'Cât timp este perioada de vindecare?'],
  },
  {
    id: '2',
    name: 'Igienizare Dentară',
    category: 'Prevenție',
    relevanceScore: 0.6,
    reasoning: 'Recomandat pentru menținerea sănătății dentare',
    priceRange: { min: 200, max: 300, currency: 'EUR' },
    duration: '30-45 minute',
    relatedProcedures: ['Detartraj'],
    commonQuestions: ['Cât de des ar trebui să fac igienizare?'],
  },
];

vi.mock('@/lib/ai', () => ({
  generateMockRecommendations: vi.fn(() => mockRecommendations),
}));

describe('ProcedureRecommendations', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('should show loading state initially', () => {
    render(<ProcedureRecommendations />);

    expect(screen.getByRole('img', { hidden: true })).toHaveClass('animate-spin');
  });

  it('should display recommendations after loading', async () => {
    render(<ProcedureRecommendations />);
    vi.advanceTimersByTime(600);

    await waitFor(() => {
      expect(screen.getByText('Implant Dentar')).toBeInTheDocument();
      expect(screen.getByText('Igienizare Dentară')).toBeInTheDocument();
    });
  });

  it('should display relevance scores', async () => {
    render(<ProcedureRecommendations />);
    vi.advanceTimersByTime(600);

    await waitFor(() => {
      expect(screen.getByText('90%')).toBeInTheDocument();
      expect(screen.getByText('60%')).toBeInTheDocument();
    });
  });

  it('should display relevance labels based on score', async () => {
    render(<ProcedureRecommendations />);
    vi.advanceTimersByTime(600);

    await waitFor(() => {
      expect(screen.getByText('Foarte relevant')).toBeInTheDocument();
      expect(screen.getByText('Relevant')).toBeInTheDocument();
    });
  });

  it('should display category badges', async () => {
    render(<ProcedureRecommendations />);
    vi.advanceTimersByTime(600);

    await waitFor(() => {
      expect(screen.getByText('Implantologie')).toBeInTheDocument();
      expect(screen.getByText('Prevenție')).toBeInTheDocument();
    });
  });

  it('should display reasoning for recommendations', async () => {
    render(<ProcedureRecommendations />);
    vi.advanceTimersByTime(600);

    await waitFor(() => {
      expect(screen.getByText('Pacientul a menționat lipsa unui dinte')).toBeInTheDocument();
      expect(
        screen.getByText('Recomandat pentru menținerea sănătății dentare')
      ).toBeInTheDocument();
    });
  });

  it('should expand recommendation when clicked', async () => {
    const user = userEvent.setup({ delay: null });
    render(<ProcedureRecommendations />);
    vi.advanceTimersByTime(600);

    await waitFor(() => {
      expect(screen.getByText('Implant Dentar')).toBeInTheDocument();
    });

    await user.click(screen.getByText('Implant Dentar'));

    await waitFor(() => {
      expect(screen.getByText('2.000 - 3.000 EUR')).toBeInTheDocument();
      expect(screen.getByText('60-90 minute')).toBeInTheDocument();
    });
  });

  it('should collapse recommendation when clicked again', async () => {
    const user = userEvent.setup({ delay: null });
    render(<ProcedureRecommendations />);
    vi.advanceTimersByTime(600);

    await waitFor(() => {
      expect(screen.getByText('Implant Dentar')).toBeInTheDocument();
    });

    // Expand
    await user.click(screen.getByText('Implant Dentar'));

    await waitFor(() => {
      expect(screen.getByText('2.000 - 3.000 EUR')).toBeInTheDocument();
    });

    // Collapse
    await user.click(screen.getByText('Implant Dentar'));

    await waitFor(() => {
      expect(screen.queryByText('2.000 - 3.000 EUR')).not.toBeInTheDocument();
    });
  });

  it('should display price range when expanded', async () => {
    const user = userEvent.setup({ delay: null });
    render(<ProcedureRecommendations />);
    vi.advanceTimersByTime(600);

    await waitFor(() => {
      expect(screen.getByText('Implant Dentar')).toBeInTheDocument();
    });

    await user.click(screen.getByText('Implant Dentar'));

    await waitFor(() => {
      expect(screen.getByText('2.000 - 3.000 EUR')).toBeInTheDocument();
    });
  });

  it('should display duration when expanded', async () => {
    const user = userEvent.setup({ delay: null });
    render(<ProcedureRecommendations />);
    vi.advanceTimersByTime(600);

    await waitFor(() => {
      expect(screen.getByText('Implant Dentar')).toBeInTheDocument();
    });

    await user.click(screen.getByText('Implant Dentar'));

    await waitFor(() => {
      expect(screen.getByText('60-90 minute')).toBeInTheDocument();
    });
  });

  it('should display related procedures when expanded', async () => {
    const user = userEvent.setup({ delay: null });
    render(<ProcedureRecommendations />);
    vi.advanceTimersByTime(600);

    await waitFor(() => {
      expect(screen.getByText('Implant Dentar')).toBeInTheDocument();
    });

    await user.click(screen.getByText('Implant Dentar'));

    await waitFor(() => {
      expect(screen.getByText('Grefă Osoasă')).toBeInTheDocument();
      expect(screen.getByText('Consultație')).toBeInTheDocument();
    });
  });

  it('should display common questions when expanded', async () => {
    const user = userEvent.setup({ delay: null });
    render(<ProcedureRecommendations />);
    vi.advanceTimersByTime(600);

    await waitFor(() => {
      expect(screen.getByText('Implant Dentar')).toBeInTheDocument();
    });

    await user.click(screen.getByText('Implant Dentar'));

    await waitFor(() => {
      expect(screen.getByText('Durează procedura?')).toBeInTheDocument();
      expect(screen.getByText('Cât timp este perioada de vindecare?')).toBeInTheDocument();
    });
  });

  it('should refresh recommendations when refresh button is clicked', async () => {
    const user = userEvent.setup({ delay: null });
    const { generateMockRecommendations } = require('@/lib/ai');

    render(<ProcedureRecommendations />);
    vi.advanceTimersByTime(600);

    await waitFor(() => {
      expect(screen.getByText('Implant Dentar')).toBeInTheDocument();
    });

    const refreshButton = screen.getByRole('button', { name: '' });
    await user.click(refreshButton);

    vi.advanceTimersByTime(600);

    await waitFor(() => {
      expect(generateMockRecommendations).toHaveBeenCalled();
    });
  });

  it('should apply correct relevance color for high scores', async () => {
    render(<ProcedureRecommendations />);
    vi.advanceTimersByTime(600);

    await waitFor(() => {
      const highScore = screen.getByText('90%');
      expect(highScore).toHaveClass('text-green-600');
    });
  });

  it('should apply correct relevance color for medium scores', async () => {
    render(<ProcedureRecommendations />);
    vi.advanceTimersByTime(600);

    await waitFor(() => {
      const mediumScore = screen.getByText('60%');
      expect(mediumScore).toHaveClass('text-yellow-600');
    });
  });

  it('should highlight expanded recommendation', async () => {
    const user = userEvent.setup({ delay: null });
    const { container } = render(<ProcedureRecommendations />);
    vi.advanceTimersByTime(600);

    await waitFor(() => {
      expect(screen.getByText('Implant Dentar')).toBeInTheDocument();
    });

    await user.click(screen.getByText('Implant Dentar'));

    await waitFor(() => {
      const expandedCard = container.querySelector('.ring-2');
      expect(expandedCard).toBeInTheDocument();
    });
  });

  it('should display disclaimer message', async () => {
    render(<ProcedureRecommendations />);
    vi.advanceTimersByTime(600);

    await waitFor(() => {
      expect(
        screen.getByText(
          'Recomandările sunt generate pe baza conversațiilor și intereselor exprimate.'
        )
      ).toBeInTheDocument();
    });
  });

  it('should update recommendations when context changes', async () => {
    const { generateMockRecommendations } = require('@/lib/ai');
    const context = { patientId: '123' };

    const { rerender } = render(<ProcedureRecommendations context={context} />);
    vi.advanceTimersByTime(600);

    await waitFor(() => {
      expect(generateMockRecommendations).toHaveBeenCalled();
    });

    const newContext = { patientId: '456' };
    rerender(<ProcedureRecommendations context={newContext} />);
    vi.advanceTimersByTime(600);

    await waitFor(() => {
      expect(generateMockRecommendations).toHaveBeenCalledTimes(2);
    });
  });

  it('should format prices with thousand separators', async () => {
    const user = userEvent.setup({ delay: null });
    render(<ProcedureRecommendations />);
    vi.advanceTimersByTime(600);

    await waitFor(() => {
      expect(screen.getByText('Implant Dentar')).toBeInTheDocument();
    });

    await user.click(screen.getByText('Implant Dentar'));

    await waitFor(() => {
      // Should format 2000 as "2.000"
      expect(screen.getByText('2.000 - 3.000 EUR')).toBeInTheDocument();
    });
  });
});

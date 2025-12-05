import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { PatientSummary } from '@/components/ai-copilot/patient-summary';

const mockSummary = {
  classification: 'HOT' as const,
  score: 85,
  sentiment: 'positive' as const,
  engagementLevel: 'high' as const,
  totalInteractions: 12,
  keyInsights: ['Interesat de implant dentar', 'Buget disponibil: €2000-3000'],
  proceduresDiscussed: ['Implant', 'Consultație'],
  objections: ['Preocupat de durere'],
  appointmentHistory: [
    {
      date: '2024-01-15',
      procedure: 'Consultație',
      status: 'completed' as const,
    },
  ],
  firstContact: '2024-01-10',
  lastContact: '2024-01-20',
};

vi.mock('@/lib/ai', () => ({
  generateMockSummary: vi.fn(() => mockSummary),
}));

describe('PatientSummary', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('should render empty state when no patient selected', () => {
    render(<PatientSummary />);

    expect(screen.getByText('Niciun pacient selectat')).toBeInTheDocument();
    expect(
      screen.getByText('Selectează un pacient pentru a vedea rezumatul AI.')
    ).toBeInTheDocument();
  });

  it('should show loading state initially', () => {
    render(<PatientSummary patientId="123" />);

    expect(screen.getByRole('img', { hidden: true })).toHaveClass('animate-spin');
  });

  it('should display summary after loading', async () => {
    render(<PatientSummary patientId="123" />);

    // Fast-forward timers
    vi.advanceTimersByTime(800);

    await waitFor(() => {
      expect(screen.getByText('HOT')).toBeInTheDocument();
      expect(screen.getByText('85%')).toBeInTheDocument();
    });
  });

  it('should display classification badge', async () => {
    render(<PatientSummary patientId="123" />);
    vi.advanceTimersByTime(800);

    await waitFor(() => {
      const badge = screen.getByText('HOT');
      expect(badge).toBeInTheDocument();
    });
  });

  it('should display total interactions', async () => {
    render(<PatientSummary patientId="123" />);
    vi.advanceTimersByTime(800);

    await waitFor(() => {
      expect(screen.getByText('12')).toBeInTheDocument();
      expect(screen.getByText('Interacțiuni')).toBeInTheDocument();
    });
  });

  it('should display sentiment icon', async () => {
    render(<PatientSummary patientId="123" />);
    vi.advanceTimersByTime(800);

    await waitFor(() => {
      expect(screen.getByText('positive')).toBeInTheDocument();
    });
  });

  it('should display engagement level', async () => {
    render(<PatientSummary patientId="123" />);
    vi.advanceTimersByTime(800);

    await waitFor(() => {
      expect(screen.getByText('Engagement')).toBeInTheDocument();
    });
  });

  it('should display key insights', async () => {
    render(<PatientSummary patientId="123" />);
    vi.advanceTimersByTime(800);

    await waitFor(() => {
      expect(screen.getByText('Interesat de implant dentar')).toBeInTheDocument();
      expect(screen.getByText('Buget disponibil: €2000-3000')).toBeInTheDocument();
    });
  });

  it('should display procedures discussed', async () => {
    render(<PatientSummary patientId="123" />);
    vi.advanceTimersByTime(800);

    await waitFor(() => {
      expect(screen.getByText('Implant')).toBeInTheDocument();
      expect(screen.getByText('Consultație')).toBeInTheDocument();
    });
  });

  it('should display objections when present', async () => {
    render(<PatientSummary patientId="123" />);
    vi.advanceTimersByTime(800);

    await waitFor(() => {
      expect(screen.getByText('Preocupat de durere')).toBeInTheDocument();
      expect(screen.getByText('Obiecții / Îngrijorări')).toBeInTheDocument();
    });
  });

  it('should display appointment history', async () => {
    render(<PatientSummary patientId="123" />);
    vi.advanceTimersByTime(800);

    await waitFor(() => {
      expect(screen.getByText('Consultație')).toBeInTheDocument();
      expect(screen.getByText('Finalizat')).toBeInTheDocument();
    });
  });

  it('should display first and last contact dates', async () => {
    render(<PatientSummary patientId="123" />);
    vi.advanceTimersByTime(800);

    await waitFor(() => {
      expect(screen.getByText(/Primul contact:/)).toBeInTheDocument();
      expect(screen.getByText(/Ultima interacțiune:/)).toBeInTheDocument();
    });
  });

  it('should reload summary when refresh button is clicked', async () => {
    const user = userEvent.setup({ delay: null });
    const { generateMockSummary } = require('@/lib/ai');

    render(<PatientSummary patientId="123" />);
    vi.advanceTimersByTime(800);

    await waitFor(() => {
      expect(screen.getByText('HOT')).toBeInTheDocument();
    });

    const refreshButton = screen.getByRole('button', { name: '' });
    await user.click(refreshButton);

    vi.advanceTimersByTime(800);

    await waitFor(() => {
      expect(generateMockSummary).toHaveBeenCalled();
    });
  });

  it('should show error state when summary fails to load', async () => {
    const { generateMockSummary } = require('@/lib/ai');
    generateMockSummary.mockReturnValue(null);

    render(<PatientSummary patientId="123" />);
    vi.advanceTimersByTime(800);

    await waitFor(() => {
      expect(screen.getByText('Nu s-a putut genera rezumatul')).toBeInTheDocument();
    });
  });

  it('should show retry button on error', async () => {
    const { generateMockSummary } = require('@/lib/ai');
    generateMockSummary.mockReturnValue(null);

    render(<PatientSummary patientId="123" />);
    vi.advanceTimersByTime(800);

    await waitFor(() => {
      expect(screen.getByRole('button', { name: /încearcă din nou/i })).toBeInTheDocument();
    });
  });

  it('should reload on retry button click', async () => {
    const user = userEvent.setup({ delay: null });
    const { generateMockSummary } = require('@/lib/ai');
    generateMockSummary.mockReturnValueOnce(null).mockReturnValue(mockSummary);

    render(<PatientSummary patientId="123" />);
    vi.advanceTimersByTime(800);

    await waitFor(() => {
      expect(screen.getByText('Nu s-a putut genera rezumatul')).toBeInTheDocument();
    });

    const retryButton = screen.getByRole('button', { name: /încearcă din nou/i });
    await user.click(retryButton);
    vi.advanceTimersByTime(800);

    await waitFor(() => {
      expect(screen.getByText('HOT')).toBeInTheDocument();
    });
  });

  it('should update summary when patientId changes', async () => {
    const { rerender } = render(<PatientSummary patientId="123" />);
    vi.advanceTimersByTime(800);

    await waitFor(() => {
      expect(screen.getByText('HOT')).toBeInTheDocument();
    });

    rerender(<PatientSummary patientId="456" />);
    vi.advanceTimersByTime(800);

    await waitFor(() => {
      expect(screen.getByText('HOT')).toBeInTheDocument();
    });
  });

  it('should format appointment dates correctly', async () => {
    render(<PatientSummary patientId="123" />);
    vi.advanceTimersByTime(800);

    await waitFor(() => {
      // Date should be formatted in Romanian locale
      expect(screen.getByText(/15/)).toBeInTheDocument();
    });
  });

  it('should display different appointment statuses', async () => {
    const { generateMockSummary } = require('@/lib/ai');
    generateMockSummary.mockReturnValue({
      ...mockSummary,
      appointmentHistory: [
        { date: '2024-01-15', procedure: 'Test 1', status: 'completed' },
        { date: '2024-01-16', procedure: 'Test 2', status: 'cancelled' },
        { date: '2024-01-17', procedure: 'Test 3', status: 'no-show' },
        { date: '2024-01-18', procedure: 'Test 4', status: 'scheduled' },
      ],
    });

    render(<PatientSummary patientId="123" />);
    vi.advanceTimersByTime(800);

    await waitFor(() => {
      expect(screen.getByText('Finalizat')).toBeInTheDocument();
      expect(screen.getByText('Anulat')).toBeInTheDocument();
      expect(screen.getByText('Absent')).toBeInTheDocument();
      expect(screen.getByText('Programat')).toBeInTheDocument();
    });
  });

  it('should apply correct sentiment icon colors', async () => {
    render(<PatientSummary patientId="123" />);
    vi.advanceTimersByTime(800);

    await waitFor(() => {
      const sentimentIcon = screen.getByText('positive').previousSibling;
      expect(sentimentIcon).toHaveClass('text-green-500');
    });
  });
});

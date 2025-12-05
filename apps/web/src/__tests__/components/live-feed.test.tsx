import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { LiveFeed } from '@/components/realtime/live-feed';

const mockLeads = [
  {
    id: '1',
    phone: '+40123456789',
    source: 'whatsapp' as const,
    message: 'Interested in dental implants',
    classification: 'HOT' as const,
    score: 95,
    procedureInterest: ['Implant Dentar'],
    time: '10:30',
  },
  {
    id: '2',
    phone: '+40987654321',
    source: 'voice' as const,
    message: 'Request for appointment',
    classification: 'WARM' as const,
    score: 75,
    procedureInterest: ['Curatare Dentara'],
    time: '10:25',
  },
  {
    id: '3',
    phone: '+40555666777',
    source: 'web' as const,
    message: 'General inquiry',
    classification: 'COLD' as const,
    score: 45,
    procedureInterest: [],
    time: '10:20',
  },
];

// Mock the useRealtimeLeads hook
vi.mock('@/lib/realtime', () => ({
  useRealtimeLeads: vi.fn(() => ({
    leads: [],
  })),
}));

describe('LiveFeed', () => {
  it('should render with header by default', () => {
    render(<LiveFeed />);

    expect(screen.getByText('Live Feed')).toBeInTheDocument();
  });

  it('should not render header when showHeader is false', () => {
    render(<LiveFeed showHeader={false} />);

    expect(screen.queryByText('Live Feed')).not.toBeInTheDocument();
  });

  it('should show "Așteptăm lead-uri noi..." when no leads', () => {
    const { useRealtimeLeads } = require('@/lib/realtime');
    useRealtimeLeads.mockReturnValue({ leads: [] });

    render(<LiveFeed />);

    expect(screen.getByText('Așteptăm lead-uri noi...')).toBeInTheDocument();
  });

  it('should display leads count in header', () => {
    const { useRealtimeLeads } = require('@/lib/realtime');
    useRealtimeLeads.mockReturnValue({ leads: mockLeads });

    render(<LiveFeed />);

    expect(screen.getByText('3 leads')).toBeInTheDocument();
  });

  it('should render list of leads', () => {
    const { useRealtimeLeads } = require('@/lib/realtime');
    useRealtimeLeads.mockReturnValue({ leads: mockLeads });

    render(<LiveFeed />);

    expect(screen.getByText('+40123456789')).toBeInTheDocument();
    expect(screen.getByText('Interested in dental implants')).toBeInTheDocument();
    expect(screen.getByText('+40987654321')).toBeInTheDocument();
    expect(screen.getByText('Request for appointment')).toBeInTheDocument();
  });

  it('should limit displayed leads to maxItems', () => {
    const { useRealtimeLeads } = require('@/lib/realtime');
    useRealtimeLeads.mockReturnValue({ leads: mockLeads });

    render(<LiveFeed maxItems={2} />);

    expect(screen.getByText('+40123456789')).toBeInTheDocument();
    expect(screen.getByText('+40987654321')).toBeInTheDocument();
    expect(screen.queryByText('+40555666777')).not.toBeInTheDocument();
  });

  it('should display lead classification badge', () => {
    const { useRealtimeLeads } = require('@/lib/realtime');
    useRealtimeLeads.mockReturnValue({ leads: [mockLeads[0]] });

    render(<LiveFeed />);

    expect(screen.getByText('HOT')).toBeInTheDocument();
  });

  it('should display lead score', () => {
    const { useRealtimeLeads } = require('@/lib/realtime');
    useRealtimeLeads.mockReturnValue({ leads: [mockLeads[0]] });

    render(<LiveFeed />);

    expect(screen.getByText('95%')).toBeInTheDocument();
  });

  it('should display procedure interest', () => {
    const { useRealtimeLeads } = require('@/lib/realtime');
    useRealtimeLeads.mockReturnValue({ leads: [mockLeads[0]] });

    render(<LiveFeed />);

    expect(screen.getByText('Implant Dentar')).toBeInTheDocument();
  });

  it('should display lead time', () => {
    const { useRealtimeLeads } = require('@/lib/realtime');
    useRealtimeLeads.mockReturnValue({ leads: [mockLeads[0]] });

    render(<LiveFeed />);

    expect(screen.getByText('10:30')).toBeInTheDocument();
  });

  it('should render WhatsApp icon for whatsapp source', () => {
    const { useRealtimeLeads } = require('@/lib/realtime');
    useRealtimeLeads.mockReturnValue({ leads: [mockLeads[0]] });

    const { container } = render(<LiveFeed />);

    const icon = container.querySelector('.bg-green-100');
    expect(icon).toBeInTheDocument();
  });

  it('should render Phone icon for voice source', () => {
    const { useRealtimeLeads } = require('@/lib/realtime');
    useRealtimeLeads.mockReturnValue({ leads: [mockLeads[1]] });

    const { container } = render(<LiveFeed />);

    const icon = container.querySelector('.bg-blue-100');
    expect(icon).toBeInTheDocument();
  });

  it('should render Globe icon for web source', () => {
    const { useRealtimeLeads } = require('@/lib/realtime');
    useRealtimeLeads.mockReturnValue({ leads: [mockLeads[2]] });

    const { container } = render(<LiveFeed />);

    const icon = container.querySelector('.bg-purple-100');
    expect(icon).toBeInTheDocument();
  });

  it('should apply custom className', () => {
    const { container } = render(<LiveFeed className="custom-feed" />);

    expect(container.querySelector('.custom-feed')).toBeInTheDocument();
  });

  it('should highlight first lead as new', () => {
    const { useRealtimeLeads } = require('@/lib/realtime');
    useRealtimeLeads.mockReturnValue({ leads: mockLeads });

    const { container } = render(<LiveFeed />);

    const firstLead = container.querySelector('.bg-primary\\/5.animate-pulse');
    expect(firstLead).toBeInTheDocument();
  });

  it('should not highlight other leads', () => {
    const { useRealtimeLeads } = require('@/lib/realtime');
    useRealtimeLeads.mockReturnValue({ leads: mockLeads });

    const { container } = render(<LiveFeed />);

    const animatedLeads = container.querySelectorAll('.animate-pulse');
    expect(animatedLeads).toHaveLength(2); // One for the header pulse indicator, one for the first lead
  });

  it('should render lead without message', () => {
    const { useRealtimeLeads } = require('@/lib/realtime');
    const leadWithoutMessage = { ...mockLeads[0], message: undefined };
    useRealtimeLeads.mockReturnValue({ leads: [leadWithoutMessage] });

    render(<LiveFeed />);

    expect(screen.getByText('+40123456789')).toBeInTheDocument();
    expect(screen.queryByText('Interested in dental implants')).not.toBeInTheDocument();
  });

  it('should render lead without classification', () => {
    const { useRealtimeLeads } = require('@/lib/realtime');
    const leadWithoutClass = { ...mockLeads[0], classification: undefined };
    useRealtimeLeads.mockReturnValue({ leads: [leadWithoutClass] });

    render(<LiveFeed />);

    expect(screen.getByText('+40123456789')).toBeInTheDocument();
    expect(screen.queryByText('HOT')).not.toBeInTheDocument();
  });

  it('should render lead without score', () => {
    const { useRealtimeLeads } = require('@/lib/realtime');
    const leadWithoutScore = { ...mockLeads[0], score: undefined };
    useRealtimeLeads.mockReturnValue({ leads: [leadWithoutScore] });

    render(<LiveFeed />);

    expect(screen.getByText('+40123456789')).toBeInTheDocument();
    expect(screen.queryByText(/\d+%/)).not.toBeInTheDocument();
  });

  it('should render lead with empty procedure interest', () => {
    const { useRealtimeLeads } = require('@/lib/realtime');
    const leadNoProcedure = { ...mockLeads[0], procedureInterest: [] };
    useRealtimeLeads.mockReturnValue({ leads: [leadNoProcedure] });

    render(<LiveFeed />);

    expect(screen.getByText('+40123456789')).toBeInTheDocument();
    expect(screen.queryByText('Implant Dentar')).not.toBeInTheDocument();
  });

  it('should show only first procedure interest', () => {
    const { useRealtimeLeads } = require('@/lib/realtime');
    const leadMultipleProcedures = {
      ...mockLeads[0],
      procedureInterest: ['Implant Dentar', 'Curatare Dentara', 'Fatete Dentare'],
    };
    useRealtimeLeads.mockReturnValue({ leads: [leadMultipleProcedures] });

    render(<LiveFeed />);

    expect(screen.getByText('Implant Dentar')).toBeInTheDocument();
    expect(screen.queryByText('Curatare Dentara')).not.toBeInTheDocument();
  });

  it('should display pulsing indicator in header', () => {
    const { container } = render(<LiveFeed />);

    const pulsingIndicator = container.querySelector('.animate-ping');
    expect(pulsingIndicator).toBeInTheDocument();
  });

  it('should memoize leads list to prevent unnecessary re-renders', () => {
    const { useRealtimeLeads } = require('@/lib/realtime');
    useRealtimeLeads.mockReturnValue({ leads: mockLeads });

    const { rerender } = render(<LiveFeed maxItems={2} />);

    expect(screen.getByText('+40123456789')).toBeInTheDocument();

    // Rerender with same props
    rerender(<LiveFeed maxItems={2} />);

    expect(screen.getByText('+40123456789')).toBeInTheDocument();
  });
});

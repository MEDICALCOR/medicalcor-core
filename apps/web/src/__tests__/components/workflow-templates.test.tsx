import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { WorkflowTemplates } from '@/components/workflows/workflow-templates';

const mockTemplates = [
  {
    id: 't1',
    name: 'Welcome Series',
    description: 'Multi-step welcome flow for new patients',
    category: 'Lead Management',
    trigger: { type: 'new_lead' as const },
    steps: [
      { id: 's1', type: 'action' as const, action: { type: 'send_whatsapp' } },
      { id: 's2', type: 'delay' as const, delay: { value: 1, unit: 'hours' as const } },
    ],
  },
  {
    id: 't2',
    name: 'Appointment Reminder',
    description: 'Automated reminder before appointment',
    category: 'Appointments',
    trigger: { type: 'appointment_scheduled' as const },
    steps: [
      { id: 's3', type: 'delay' as const, delay: { value: 24, unit: 'hours' as const } },
      { id: 's4', type: 'action' as const, action: { type: 'send_sms' } },
    ],
  },
  {
    id: 't3',
    name: 'Post-Treatment Follow-up',
    description: 'Follow up with patients after treatment',
    category: 'Patient Care',
    trigger: { type: 'appointment_completed' as const },
    steps: [
      { id: 's5', type: 'delay' as const, delay: { value: 1, unit: 'days' as const } },
      { id: 's6', type: 'action' as const, action: { type: 'send_whatsapp' } },
    ],
  },
];

const mockOnUseTemplate = vi.fn();

describe('WorkflowTemplates', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should render template names', () => {
    render(<WorkflowTemplates templates={mockTemplates} onUseTemplate={mockOnUseTemplate} />);

    expect(screen.getByText('Welcome Series')).toBeInTheDocument();
    expect(screen.getByText('Appointment Reminder')).toBeInTheDocument();
    expect(screen.getByText('Post-Treatment Follow-up')).toBeInTheDocument();
  });

  it('should render template descriptions', () => {
    render(<WorkflowTemplates templates={mockTemplates} onUseTemplate={mockOnUseTemplate} />);

    expect(screen.getByText('Multi-step welcome flow for new patients')).toBeInTheDocument();
    expect(screen.getByText('Automated reminder before appointment')).toBeInTheDocument();
    expect(screen.getByText('Follow up with patients after treatment')).toBeInTheDocument();
  });

  it('should group templates by category', () => {
    render(<WorkflowTemplates templates={mockTemplates} onUseTemplate={mockOnUseTemplate} />);

    expect(screen.getByText('Lead Management')).toBeInTheDocument();
    expect(screen.getByText('Appointments')).toBeInTheDocument();
    expect(screen.getByText('Patient Care')).toBeInTheDocument();
  });

  it('should display step count', () => {
    render(<WorkflowTemplates templates={mockTemplates} onUseTemplate={mockOnUseTemplate} />);

    expect(screen.getByText('2 pași')).toBeInTheDocument();
  });

  it('should call onUseTemplate when use button is clicked', async () => {
    const user = userEvent.setup();
    render(<WorkflowTemplates templates={mockTemplates} onUseTemplate={mockOnUseTemplate} />);

    const useButtons = screen.getAllByRole('button', { name: /folosește/i });
    await user.click(useButtons[0]);

    expect(mockOnUseTemplate).toHaveBeenCalledWith(mockTemplates[0]);
  });

  it('should display category badges with colors', () => {
    const { container } = render(
      <WorkflowTemplates templates={mockTemplates} onUseTemplate={mockOnUseTemplate} />
    );

    const leadManagementBadge = screen.getByText('Lead Management');
    expect(leadManagementBadge).toHaveClass('bg-blue-100', 'text-blue-700');

    const appointmentsBadge = screen.getByText('Appointments');
    expect(appointmentsBadge).toHaveClass('bg-purple-100', 'text-purple-700');

    const patientCareBadge = screen.getByText('Patient Care');
    expect(patientCareBadge).toHaveClass('bg-green-100', 'text-green-700');
  });

  it('should render template icons', () => {
    const { container } = render(
      <WorkflowTemplates templates={mockTemplates} onUseTemplate={mockOnUseTemplate} />
    );

    const icons = container.querySelectorAll('.bg-primary\\/10');
    expect(icons.length).toBe(3);
  });

  it('should have hover effect on cards', () => {
    const { container } = render(
      <WorkflowTemplates templates={mockTemplates} onUseTemplate={mockOnUseTemplate} />
    );

    const cards = container.querySelectorAll('.hover\\:border-primary\\/50');
    expect(cards.length).toBe(3);
  });

  it('should render grid layout', () => {
    const { container } = render(
      <WorkflowTemplates templates={mockTemplates} onUseTemplate={mockOnUseTemplate} />
    );

    const grid = container.querySelector('.grid');
    expect(grid).toBeInTheDocument();
    expect(grid).toHaveClass('grid-cols-1', 'md:grid-cols-2');
  });

  it('should handle empty templates', () => {
    const { container } = render(
      <WorkflowTemplates templates={[]} onUseTemplate={mockOnUseTemplate} />
    );

    const categories = container.querySelectorAll('.space-y-6 > div');
    expect(categories.length).toBe(0);
  });

  it('should group multiple templates in same category', () => {
    const sameCategory = [
      mockTemplates[0],
      { ...mockTemplates[0], id: 't4', name: 'Another Lead Template' },
    ];

    render(<WorkflowTemplates templates={sameCategory} onUseTemplate={mockOnUseTemplate} />);

    expect(screen.getByText('Welcome Series')).toBeInTheDocument();
    expect(screen.getByText('Another Lead Template')).toBeInTheDocument();
  });

  it('should display use button for each template', () => {
    render(<WorkflowTemplates templates={mockTemplates} onUseTemplate={mockOnUseTemplate} />);

    const useButtons = screen.getAllByRole('button', { name: /folosește/i });
    expect(useButtons.length).toBe(3);
  });
});

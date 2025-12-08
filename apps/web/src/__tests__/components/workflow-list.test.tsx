// @ts-nocheck
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { WorkflowList } from '@/components/workflows/workflow-list';

const mockWorkflows = [
  {
    id: '1',
    name: 'Welcome New Leads',
    description: 'Send welcome message to new leads',
    trigger: { type: 'new_lead' as const },
    steps: [
      { id: 's1', type: 'action' as const, action: { type: 'send_whatsapp', content: 'Welcome!' } },
    ],
    isActive: true,
    executionCount: 42,
    lastExecutedAt: new Date('2024-01-15T10:00:00'),
    createdAt: new Date('2024-01-01'),
    updatedAt: new Date('2024-01-15'),
  },
  {
    id: '2',
    name: 'Appointment Reminder',
    description: 'Remind patients about appointments',
    trigger: { type: 'appointment_scheduled' as const },
    steps: [
      { id: 's2', type: 'delay' as const, delay: { value: 24, unit: 'hours' as const } },
      { id: 's3', type: 'action' as const, action: { type: 'send_sms', content: 'Reminder' } },
    ],
    isActive: false,
    executionCount: 15,
    lastExecutedAt: null,
    createdAt: new Date('2024-01-05'),
    updatedAt: new Date('2024-01-10'),
  },
];

const mockOnToggle = vi.fn();
const mockOnEdit = vi.fn();
const mockOnDelete = vi.fn();
const mockOnDuplicate = vi.fn();

describe('WorkflowList', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should render workflow names', () => {
    render(
      <WorkflowList
        workflows={mockWorkflows}
        onToggle={mockOnToggle}
        onEdit={mockOnEdit}
        onDelete={mockOnDelete}
        onDuplicate={mockOnDuplicate}
      />
    );

    expect(screen.getByText('Welcome New Leads')).toBeInTheDocument();
    expect(screen.getByText('Appointment Reminder')).toBeInTheDocument();
  });

  it('should render workflow descriptions', () => {
    render(
      <WorkflowList
        workflows={mockWorkflows}
        onToggle={mockOnToggle}
        onEdit={mockOnEdit}
        onDelete={mockOnDelete}
        onDuplicate={mockOnDuplicate}
      />
    );

    expect(screen.getByText('Send welcome message to new leads')).toBeInTheDocument();
    expect(screen.getByText('Remind patients about appointments')).toBeInTheDocument();
  });

  it('should show active badge for active workflows', () => {
    render(
      <WorkflowList
        workflows={mockWorkflows}
        onToggle={mockOnToggle}
        onEdit={mockOnEdit}
        onDelete={mockOnDelete}
        onDuplicate={mockOnDuplicate}
      />
    );

    const activeBadges = screen.getAllByText('Activ');
    expect(activeBadges.length).toBeGreaterThan(0);
  });

  it('should show inactive badge for inactive workflows', () => {
    render(
      <WorkflowList
        workflows={mockWorkflows}
        onToggle={mockOnToggle}
        onEdit={mockOnEdit}
        onDelete={mockOnDelete}
        onDuplicate={mockOnDuplicate}
      />
    );

    expect(screen.getByText('Inactiv')).toBeInTheDocument();
  });

  it('should display execution count', () => {
    render(
      <WorkflowList
        workflows={mockWorkflows}
        onToggle={mockOnToggle}
        onEdit={mockOnEdit}
        onDelete={mockOnDelete}
        onDuplicate={mockOnDuplicate}
      />
    );

    expect(screen.getByText('42 execuții')).toBeInTheDocument();
    expect(screen.getByText('15 execuții')).toBeInTheDocument();
  });

  it('should display step count', () => {
    render(
      <WorkflowList
        workflows={mockWorkflows}
        onToggle={mockOnToggle}
        onEdit={mockOnEdit}
        onDelete={mockOnDelete}
        onDuplicate={mockOnDuplicate}
      />
    );

    expect(screen.getByText('1 pași')).toBeInTheDocument();
    expect(screen.getByText('2 pași')).toBeInTheDocument();
  });

  it('should call onToggle when toggle switch is clicked', async () => {
    const user = userEvent.setup();
    render(
      <WorkflowList
        workflows={mockWorkflows}
        onToggle={mockOnToggle}
        onEdit={mockOnEdit}
        onDelete={mockOnDelete}
        onDuplicate={mockOnDuplicate}
      />
    );

    const switches = screen.getAllByRole('switch');
    await user.click(switches[0]);

    expect(mockOnToggle).toHaveBeenCalledWith('1', false);
  });

  it('should call onEdit when edit menu item is clicked', async () => {
    const user = userEvent.setup();
    render(
      <WorkflowList
        workflows={mockWorkflows}
        onToggle={mockOnToggle}
        onEdit={mockOnEdit}
        onDelete={mockOnDelete}
        onDuplicate={mockOnDuplicate}
      />
    );

    const menuButtons = screen.getAllByRole('button', { name: '' });
    await user.click(menuButtons[0]);

    await waitFor(() => {
      expect(screen.getByText('Editează')).toBeInTheDocument();
    });

    await user.click(screen.getByText('Editează'));

    expect(mockOnEdit).toHaveBeenCalledWith(mockWorkflows[0]);
  });

  it('should call onDuplicate when duplicate menu item is clicked', async () => {
    const user = userEvent.setup();
    render(
      <WorkflowList
        workflows={mockWorkflows}
        onToggle={mockOnToggle}
        onEdit={mockOnEdit}
        onDelete={mockOnDelete}
        onDuplicate={mockOnDuplicate}
      />
    );

    const menuButtons = screen.getAllByRole('button', { name: '' });
    await user.click(menuButtons[0]);

    await waitFor(() => {
      expect(screen.getByText('Duplică')).toBeInTheDocument();
    });

    await user.click(screen.getByText('Duplică'));

    expect(mockOnDuplicate).toHaveBeenCalledWith(mockWorkflows[0]);
  });

  it('should call onDelete when delete menu item is clicked', async () => {
    const user = userEvent.setup();
    render(
      <WorkflowList
        workflows={mockWorkflows}
        onToggle={mockOnToggle}
        onEdit={mockOnEdit}
        onDelete={mockOnDelete}
        onDuplicate={mockOnDuplicate}
      />
    );

    const menuButtons = screen.getAllByRole('button', { name: '' });
    await user.click(menuButtons[0]);

    await waitFor(() => {
      expect(screen.getByText('Șterge')).toBeInTheDocument();
    });

    await user.click(screen.getByText('Șterge'));

    expect(mockOnDelete).toHaveBeenCalledWith('1');
  });

  it('should show empty state when no workflows', () => {
    render(
      <WorkflowList
        workflows={[]}
        onToggle={mockOnToggle}
        onEdit={mockOnEdit}
        onDelete={mockOnDelete}
        onDuplicate={mockOnDuplicate}
      />
    );

    expect(screen.getByText('Nu există workflow-uri')).toBeInTheDocument();
    expect(
      screen.getByText('Creează primul workflow pentru a automatiza procesele')
    ).toBeInTheDocument();
  });

  it('should display last execution time', () => {
    render(
      <WorkflowList
        workflows={mockWorkflows}
        onToggle={mockOnToggle}
        onEdit={mockOnEdit}
        onDelete={mockOnDelete}
        onDuplicate={mockOnDuplicate}
      />
    );

    expect(screen.getByText(/Ultima:/)).toBeInTheDocument();
  });

  it('should render workflow steps preview', () => {
    render(
      <WorkflowList
        workflows={mockWorkflows}
        onToggle={mockOnToggle}
        onEdit={mockOnEdit}
        onDelete={mockOnDelete}
        onDuplicate={mockOnDuplicate}
      />
    );

    // Should show trigger labels
    const { container } = render(
      <WorkflowList
        workflows={mockWorkflows}
        onToggle={mockOnToggle}
        onEdit={mockOnEdit}
        onDelete={mockOnDelete}
        onDuplicate={mockOnDuplicate}
      />
    );

    expect(container.querySelector('.border-dashed')).toBeInTheDocument();
  });

  it('should apply opacity to inactive workflows', () => {
    const { container } = render(
      <WorkflowList
        workflows={mockWorkflows}
        onToggle={mockOnToggle}
        onEdit={mockOnEdit}
        onDelete={mockOnDelete}
        onDuplicate={mockOnDuplicate}
      />
    );

    const cards = container.querySelectorAll('.opacity-60');
    expect(cards.length).toBeGreaterThan(0);
  });

  it('should limit step preview to 4 steps', () => {
    const manyStepsWorkflow = {
      ...mockWorkflows[0],
      steps: [
        { id: '1', type: 'action' as const, action: { type: 'send_whatsapp' } },
        { id: '2', type: 'action' as const, action: { type: 'send_sms' } },
        { id: '3', type: 'action' as const, action: { type: 'send_email' } },
        { id: '4', type: 'action' as const, action: { type: 'add_tag' } },
        { id: '5', type: 'action' as const, action: { type: 'create_task' } },
      ],
    };

    render(
      <WorkflowList
        workflows={[manyStepsWorkflow]}
        onToggle={mockOnToggle}
        onEdit={mockOnEdit}
        onDelete={mockOnDelete}
        onDuplicate={mockOnDuplicate}
      />
    );

    expect(screen.getByText('+1 pași')).toBeInTheDocument();
  });
});

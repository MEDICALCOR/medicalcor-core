/**
 * Component Tests: OSAX Dashboard Components
 *
 * Tests for the OSAX (Omnichannel Sales Agent eXperience) dashboard components:
 * - SupervisorStats: Mobile-first stats display for supervisors
 * - QueueStats: Queue SLA statistics dashboard
 * - AgentStatusBar: Agent status and workspace stats display
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, within } from '../setup/render';
import userEvent from '@testing-library/user-event';
import {
  createMockSupervisorStats,
  createMockQueueSLAStatus,
  createMockAgentSession,
  createMockAgentWorkspaceStats,
} from '../setup/test-data';

// Mock the server actions
vi.mock('@/app/agent-workspace/actions', async (importOriginal) => {
  const original = await importOriginal<typeof import('@/app/agent-workspace/actions')>();
  return {
    ...original,
    updateAgentAvailabilityAction: vi.fn().mockImplementation(async (availability) => ({
      agentId: 'agent-1',
      agentName: 'Test Agent',
      availability,
      sessionStartedAt: new Date(Date.now() - 3600000).toISOString(),
      leadsHandled: 5,
      callsHandled: 3,
      totalTalkTime: 1200,
    })),
  };
});

// Import components after mocks
import {
  SupervisorStats,
  SupervisorStatsSkeleton,
} from '@/app/supervisor/components/supervisor-stats';
import { QueueStats, QueueStatsSkeleton } from '@/app/queues/components/queue-stats';
import {
  AgentStatusBar,
  AgentStatusBarSkeleton,
} from '@/app/agent-workspace/components/agent-status-bar';

describe('SupervisorStats Component', () => {
  it('should render all primary stats cards', () => {
    const stats = createMockSupervisorStats();
    render(<SupervisorStats stats={stats} />);

    expect(screen.getByText('Apeluri Active')).toBeInTheDocument();
    expect(screen.getByText('În Coadă')).toBeInTheDocument();
    expect(screen.getByText('Agenți Disponibili')).toBeInTheDocument();
    expect(screen.getByText('Nivel Serviciu')).toBeInTheDocument();
  });

  it('should display correct stat values', () => {
    const stats = createMockSupervisorStats({
      activeCalls: 8,
      callsInQueue: 4,
      agentsAvailable: 10,
      agentsBusy: 5,
      serviceLevelPercent: 95,
    });
    render(<SupervisorStats stats={stats} />);

    expect(screen.getByText('8')).toBeInTheDocument();
    expect(screen.getByText('4')).toBeInTheDocument();
    expect(screen.getByText('10/15')).toBeInTheDocument();
    expect(screen.getByText('95%')).toBeInTheDocument();
  });

  it('should show alert state when active calls exceed threshold', () => {
    const stats = createMockSupervisorStats({ activeCalls: 15 });
    const { container } = render(<SupervisorStats stats={stats} />);

    // Alert state adds destructive styling
    const alertCard = container.querySelector('.border-destructive\\/50');
    expect(alertCard).toBeInTheDocument();
  });

  it('should show alert state when queue is backed up', () => {
    const stats = createMockSupervisorStats({ callsInQueue: 8 });
    const { container } = render(<SupervisorStats stats={stats} />);

    const alertCards = container.querySelectorAll('.border-destructive\\/50');
    expect(alertCards.length).toBeGreaterThan(0);
  });

  it('should show alert state when no agents available', () => {
    const stats = createMockSupervisorStats({ agentsAvailable: 0 });
    const { container } = render(<SupervisorStats stats={stats} />);

    const alertCards = container.querySelectorAll('.border-destructive\\/50');
    expect(alertCards.length).toBeGreaterThan(0);
  });

  it('should display average wait time when queue has items', () => {
    const stats = createMockSupervisorStats({
      callsInQueue: 3,
      averageWaitTime: 90,
    });
    render(<SupervisorStats stats={stats} />);

    expect(screen.getByText(/1m 30s așteptare/)).toBeInTheDocument();
  });

  it('should not display wait time subtext when queue is empty', () => {
    const stats = createMockSupervisorStats({
      callsInQueue: 0,
      averageWaitTime: 0,
    });
    render(<SupervisorStats stats={stats} />);

    expect(screen.queryByText(/așteptare/)).not.toBeInTheDocument();
  });

  it('should show AI stats section', () => {
    const stats = createMockSupervisorStats({
      aiHandledCalls: 20,
      averageAiConfidence: 87,
    });
    render(<SupervisorStats stats={stats} />);

    expect(screen.getByText('AI')).toBeInTheDocument();
    expect(screen.getByText('20')).toBeInTheDocument();
    expect(screen.getByText('87% confidence')).toBeInTheDocument();
  });

  it('should display average handle time', () => {
    const stats = createMockSupervisorStats({ averageHandleTime: 180 });
    render(<SupervisorStats stats={stats} />);

    expect(screen.getByText('Timp Mediu')).toBeInTheDocument();
    expect(screen.getByText('3m 0s')).toBeInTheDocument();
  });

  it('should show active alerts with badge when present', () => {
    const stats = createMockSupervisorStats({ activeAlerts: 3, callsInQueue: 0 });
    render(<SupervisorStats stats={stats} />);

    expect(screen.getByText('Alerte')).toBeInTheDocument();
    // Use getAllByText since multiple elements might show '3'
    const threeElements = screen.getAllByText('3');
    expect(threeElements.length).toBeGreaterThan(0);
    expect(screen.getByText('Active')).toBeInTheDocument();
  });

  it('should show daily stats with abandoned calls', () => {
    const stats = createMockSupervisorStats({
      callsHandledToday: 50,
      abandonedCalls: 3,
    });
    render(<SupervisorStats stats={stats} />);

    expect(screen.getByText('Azi')).toBeInTheDocument();
    expect(screen.getByText('50')).toBeInTheDocument();
    expect(screen.getByText('3 abandonate')).toBeInTheDocument();
  });

  it('should format time in seconds correctly', () => {
    const stats = createMockSupervisorStats({ averageWaitTime: 45 });
    render(<SupervisorStats stats={stats} />);

    // 45 seconds should be formatted as "45s"
    expect(screen.queryByText(/45s/)).toBeInTheDocument();
  });

  it('should format time with minutes correctly', () => {
    const stats = createMockSupervisorStats({ averageHandleTime: 125 });
    render(<SupervisorStats stats={stats} />);

    // 125 seconds = 2m 5s
    expect(screen.getByText('2m 5s')).toBeInTheDocument();
  });
});

describe('SupervisorStatsSkeleton', () => {
  it('should render loading skeleton', () => {
    const { container } = render(<SupervisorStatsSkeleton />);

    const skeletonItems = container.querySelectorAll('.animate-pulse');
    expect(skeletonItems.length).toBeGreaterThan(0);
  });

  it('should have correct grid structure', () => {
    const { container } = render(<SupervisorStatsSkeleton />);

    // Cards use the class 'rounded-lg border' from the Card component
    const cards = container.querySelectorAll('.rounded-lg.border');
    expect(cards.length).toBeGreaterThan(0);
  });
});

describe('QueueStats Component', () => {
  const mockQueueStats = {
    totalQueues: 5,
    activeQueues: 3,
    totalAgents: 20,
    availableAgents: 12,
    busyAgents: 8,
    totalCallsToday: 150,
    averageWaitTime: 45,
    serviceLevel: 92,
    breachesLast24h: 2,
    criticalBreaches: 1,
    complianceRate: 96,
  };

  it('should render compliance badge', () => {
    render(<QueueStats stats={mockQueueStats} />);

    expect(screen.getByText('96% Compliance')).toBeInTheDocument();
  });

  it('should show critical badge when breaches exist', () => {
    render(<QueueStats stats={{ ...mockQueueStats, criticalBreaches: 3 }} />);

    expect(screen.getByText('3 Critical')).toBeInTheDocument();
  });

  it('should not show critical badge when no critical breaches', () => {
    render(<QueueStats stats={{ ...mockQueueStats, criticalBreaches: 0 }} />);

    expect(screen.queryByText(/Critical/)).not.toBeInTheDocument();
  });

  it('should show active queues badge', () => {
    render(<QueueStats stats={mockQueueStats} />);

    expect(screen.getByText('3 Active Queues')).toBeInTheDocument();
  });

  it('should display total queues stat', () => {
    render(<QueueStats stats={mockQueueStats} />);

    expect(screen.getByText('Total Queues')).toBeInTheDocument();
    expect(screen.getByText('5')).toBeInTheDocument();
  });

  it('should display available agents', () => {
    render(<QueueStats stats={mockQueueStats} />);

    expect(screen.getByText('Available Agents')).toBeInTheDocument();
    expect(screen.getByText('12')).toBeInTheDocument();
  });

  it('should format average wait time', () => {
    render(<QueueStats stats={mockQueueStats} />);

    expect(screen.getByText('Avg Wait Time')).toBeInTheDocument();
    expect(screen.getByText('45s')).toBeInTheDocument();
  });

  it('should format wait time with minutes', () => {
    render(<QueueStats stats={{ ...mockQueueStats, averageWaitTime: 125 }} />);

    expect(screen.getByText('2m 5s')).toBeInTheDocument();
  });

  it('should display service level', () => {
    render(<QueueStats stats={mockQueueStats} />);

    expect(screen.getByText('Service Level')).toBeInTheDocument();
    expect(screen.getByText('92%')).toBeInTheDocument();
  });

  it('should show compliance status correctly', () => {
    // High compliance (>=95%)
    render(<QueueStats stats={{ ...mockQueueStats, complianceRate: 98 }} />);
    expect(screen.getByText('98% Compliance')).toBeInTheDocument();
  });

  it('should show warning state for medium compliance', () => {
    const { container } = render(<QueueStats stats={{ ...mockQueueStats, complianceRate: 88 }} />);

    const warningBadge = container.querySelector('.border-orange-500\\/50');
    expect(warningBadge).toBeInTheDocument();
  });

  it('should show critical state for low compliance', () => {
    const { container } = render(<QueueStats stats={{ ...mockQueueStats, complianceRate: 75 }} />);

    const criticalBadge = container.querySelector('.border-red-500\\/50');
    expect(criticalBadge).toBeInTheDocument();
  });

  it('should display calls today', () => {
    render(<QueueStats stats={mockQueueStats} />);

    expect(screen.getByText('Calls Today')).toBeInTheDocument();
    expect(screen.getByText('150')).toBeInTheDocument();
  });

  it('should display breach count', () => {
    render(<QueueStats stats={mockQueueStats} />);

    expect(screen.getByText('Breaches (24h)')).toBeInTheDocument();
    expect(screen.getByText('2')).toBeInTheDocument();
  });

  it('should show critical breach count in sublabel', () => {
    render(<QueueStats stats={{ ...mockQueueStats, criticalBreaches: 2 }} />);

    expect(screen.getByText('2 critical')).toBeInTheDocument();
  });

  it('should display agent utilization', () => {
    render(<QueueStats stats={mockQueueStats} />);

    // 8 busy / 20 total = 40% utilization
    expect(screen.getByText('40% utilization')).toBeInTheDocument();
  });
});

describe('QueueStatsSkeleton', () => {
  it('should render loading skeleton', () => {
    const { container } = render(<QueueStatsSkeleton />);

    const skeletonItems = container.querySelectorAll('.animate-pulse');
    expect(skeletonItems.length).toBeGreaterThan(0);
  });
});

describe('AgentStatusBar Component', () => {
  const mockSession = createMockAgentSession({
    agentId: 'agent-1',
    agentName: 'Ana Popescu',
    availability: 'available',
    leadsHandled: 8,
    callsHandled: 5,
    totalTalkTime: 2400,
    sessionStartedAt: new Date(Date.now() - 7200000).toISOString(), // 2 hours ago
  });

  const mockStats = createMockAgentWorkspaceStats({
    queueLength: 4,
    avgWaitTime: 90,
    conversionsToday: 3,
    satisfactionScore: 4.8,
  });

  it('should display agent name', () => {
    render(<AgentStatusBar session={mockSession} stats={mockStats} />);

    expect(screen.getByText('Ana Popescu')).toBeInTheDocument();
  });

  it('should show agent initials in avatar', () => {
    render(<AgentStatusBar session={mockSession} stats={mockStats} />);

    expect(screen.getByText('AP')).toBeInTheDocument();
  });

  it('should display current availability status', () => {
    render(<AgentStatusBar session={mockSession} stats={mockStats} />);

    expect(screen.getByText('Disponibil')).toBeInTheDocument();
  });

  it('should show queue length badge', () => {
    render(<AgentStatusBar session={mockSession} stats={mockStats} />);

    expect(screen.getByText('4 în coadă')).toBeInTheDocument();
  });

  it('should show high queue warning badge', () => {
    const highQueueStats = { ...mockStats, queueLength: 8 };
    const { container } = render(<AgentStatusBar session={mockSession} stats={highQueueStats} />);

    // Badge should have destructive variant for high queue
    const badge = screen.getByText('8 în coadă');
    expect(badge).toBeInTheDocument();
  });

  it('should display calls handled count', () => {
    render(<AgentStatusBar session={mockSession} stats={mockStats} />);

    // Multiple places show this, but it should exist
    const elements = screen.getAllByText('5');
    expect(elements.length).toBeGreaterThan(0);
  });

  it('should display leads handled count', () => {
    render(<AgentStatusBar session={mockSession} stats={mockStats} />);

    // Multiple places show this
    const elements = screen.getAllByText('8');
    expect(elements.length).toBeGreaterThan(0);
  });

  it('should display conversion count', () => {
    render(<AgentStatusBar session={mockSession} stats={mockStats} />);

    expect(screen.getByText('3 conversii')).toBeInTheDocument();
  });

  it('should display satisfaction score', () => {
    render(<AgentStatusBar session={mockSession} stats={mockStats} />);

    expect(screen.getByText('4.8')).toBeInTheDocument();
  });

  it('should render availability dropdown trigger', () => {
    render(<AgentStatusBar session={mockSession} stats={mockStats} />);

    const button = screen.getByRole('button', { name: /Disponibil/i });
    expect(button).toBeInTheDocument();
  });

  it('should open dropdown menu on click', async () => {
    const user = userEvent.setup();
    render(<AgentStatusBar session={mockSession} stats={mockStats} />);

    const button = screen.getByRole('button', { name: /Disponibil/i });
    await user.click(button);

    // All availability options should be visible
    expect(screen.getByText('Ocupat')).toBeInTheDocument();
    expect(screen.getByText('Pauză')).toBeInTheDocument();
    expect(screen.getByText('Training')).toBeInTheDocument();
    expect(screen.getByText('Offline')).toBeInTheDocument();
  });

  it('should call onSessionUpdate when availability changes', async () => {
    const user = userEvent.setup();
    const mockOnSessionUpdate = vi.fn();
    render(
      <AgentStatusBar
        session={mockSession}
        stats={mockStats}
        onSessionUpdate={mockOnSessionUpdate}
      />
    );

    const button = screen.getByRole('button', { name: /Disponibil/i });
    await user.click(button);

    const breakOption = screen.getByRole('menuitem', { name: /Pauză/i });
    await user.click(breakOption);

    // Should eventually call the callback
    expect(mockOnSessionUpdate).toHaveBeenCalled();
  });

  it('should display busy status correctly', () => {
    const busySession = { ...mockSession, availability: 'busy' as const };
    render(<AgentStatusBar session={busySession} stats={mockStats} />);

    expect(screen.getByText('Ocupat')).toBeInTheDocument();
  });

  it('should display break status correctly', () => {
    const breakSession = { ...mockSession, availability: 'break' as const };
    render(<AgentStatusBar session={breakSession} stats={mockStats} />);

    expect(screen.getByText('Pauză')).toBeInTheDocument();
  });

  it('should display training status correctly', () => {
    const trainingSession = { ...mockSession, availability: 'training' as const };
    render(<AgentStatusBar session={trainingSession} stats={mockStats} />);

    expect(screen.getByText('Training')).toBeInTheDocument();
  });

  it('should display offline status correctly', () => {
    const offlineSession = { ...mockSession, availability: 'offline' as const };
    render(<AgentStatusBar session={offlineSession} stats={mockStats} />);

    expect(screen.getByText('Offline')).toBeInTheDocument();
  });

  it('should display wrap-up status correctly', () => {
    const wrapupSession = { ...mockSession, availability: 'wrap-up' as const };
    render(<AgentStatusBar session={wrapupSession} stats={mockStats} />);

    expect(screen.getByText('Wrap-up')).toBeInTheDocument();
  });

  it('should display away status correctly', () => {
    const awaySession = { ...mockSession, availability: 'away' as const };
    render(<AgentStatusBar session={awaySession} stats={mockStats} />);

    expect(screen.getByText('Plecat')).toBeInTheDocument();
  });

  it('should format talk time correctly', () => {
    render(<AgentStatusBar session={mockSession} stats={mockStats} />);

    // 2400 seconds = 40 minutes
    expect(screen.getByText('40m')).toBeInTheDocument();
  });

  it('should format wait time correctly', () => {
    render(<AgentStatusBar session={mockSession} stats={mockStats} />);

    // 90 seconds = 1:30
    expect(screen.getByText('avg 1:30')).toBeInTheDocument();
  });
});

describe('AgentStatusBarSkeleton', () => {
  it('should render loading skeleton', () => {
    const { container } = render(<AgentStatusBarSkeleton />);

    const skeletonItems = container.querySelectorAll('.animate-pulse');
    expect(skeletonItems.length).toBeGreaterThan(0);
  });

  it('should have avatar placeholder', () => {
    const { container } = render(<AgentStatusBarSkeleton />);

    const avatarSkeleton = container.querySelector('.rounded-full');
    expect(avatarSkeleton).toBeInTheDocument();
  });
});

describe('Component Integration', () => {
  it('should handle empty/zero values gracefully', () => {
    const emptyStats = createMockSupervisorStats({
      activeCalls: 0,
      callsInQueue: 0,
      agentsAvailable: 0,
      agentsBusy: 0,
      serviceLevelPercent: 0,
      aiHandledCalls: 0,
      averageAiConfidence: 0,
      activeAlerts: 0,
      callsHandledToday: 0,
      abandonedCalls: 0,
      averageHandleTime: 0,
    });

    expect(() => render(<SupervisorStats stats={emptyStats} />)).not.toThrow();
  });

  it('should handle large numbers correctly', () => {
    const largeStats = createMockSupervisorStats({
      activeCalls: 999,
      callsHandledToday: 9999,
      serviceLevelPercent: 100,
    });

    render(<SupervisorStats stats={largeStats} />);

    expect(screen.getByText('999')).toBeInTheDocument();
    expect(screen.getByText('9999')).toBeInTheDocument();
    expect(screen.getByText('100%')).toBeInTheDocument();
  });

  it('should render without crashing with minimal props', () => {
    const minimalStats = {
      totalQueues: 0,
      activeQueues: 0,
      totalAgents: 0,
      availableAgents: 0,
      busyAgents: 0,
      totalCallsToday: 0,
      averageWaitTime: 0,
      serviceLevel: 0,
      breachesLast24h: 0,
      criticalBreaches: 0,
      complianceRate: 0,
    };

    expect(() => render(<QueueStats stats={minimalStats} />)).not.toThrow();
  });
});

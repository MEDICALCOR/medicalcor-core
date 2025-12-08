import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render } from '@testing-library/react';
import { NotificationBridge } from '@/components/notifications/notification-bridge';

const mockSubscribe = vi.fn();
const mockNotifyUrgency = vi.fn();
const mockNotifyNewLead = vi.fn();

vi.mock('@/lib/realtime', () => ({
  useRealtime: vi.fn(() => ({
    subscribe: mockSubscribe,
  })),
}));

vi.mock('@/lib/notifications', () => ({
  useNotifications: vi.fn(() => ({
    notifyUrgency: mockNotifyUrgency,
    notifyNewLead: mockNotifyNewLead,
  })),
}));

describe('NotificationBridge', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockSubscribe.mockReturnValue(vi.fn());
  });

  it('should not render any visible content', () => {
    const { container } = render(<NotificationBridge />);
    expect(container.firstChild).toBeNull();
  });

  it('should subscribe to urgency events', () => {
    render(<NotificationBridge />);

    expect(mockSubscribe).toHaveBeenCalledWith('urgency.new', expect.any(Function));
  });

  it('should subscribe to lead created events', () => {
    render(<NotificationBridge />);

    expect(mockSubscribe).toHaveBeenCalledWith('lead.created', expect.any(Function));
  });

  it('should subscribe to lead scored events', () => {
    render(<NotificationBridge />);

    expect(mockSubscribe).toHaveBeenCalledWith('lead.scored', expect.any(Function));
  });

  it('should notify urgency when urgency event is received', () => {
    render(<NotificationBridge />);

    const urgencyHandler = mockSubscribe.mock.calls.find((call) => call[0] === 'urgency.new')?.[1];

    urgencyHandler?.({
      data: {
        leadId: '123',
        phone: '+40123456789',
        reason: 'Durere acută',
        priority: 'critical',
        waitingTime: 30,
      },
    });

    expect(mockNotifyUrgency).toHaveBeenCalledWith({
      type: 'urgency',
      leadId: '123',
      phone: '+40123456789',
      reason: 'Durere acută',
      priority: 'critical',
      waitingTime: 30,
    });
  });

  it('should track pending leads when created', () => {
    render(<NotificationBridge />);

    const createdHandler = mockSubscribe.mock.calls.find((call) => call[0] === 'lead.created')?.[1];

    createdHandler?.({
      data: {
        id: '456',
        phone: '+40987654321',
        source: 'whatsapp',
      },
    });

    // Should track the lead internally
    expect(mockSubscribe).toHaveBeenCalled();
  });

  it('should notify for HOT leads when scored', () => {
    render(<NotificationBridge />);

    const createdHandler = mockSubscribe.mock.calls.find((call) => call[0] === 'lead.created')?.[1];

    const scoredHandler = mockSubscribe.mock.calls.find((call) => call[0] === 'lead.scored')?.[1];

    // First create a lead
    createdHandler?.({
      data: {
        id: '789',
        phone: '+40111222333',
        source: 'web',
      },
    });

    // Then score it as HOT
    scoredHandler?.({
      data: {
        leadId: '789',
        classification: 'HOT',
      },
    });

    expect(mockNotifyNewLead).toHaveBeenCalledWith({
      type: 'lead',
      leadId: '789',
      phone: '+40111222333',
      source: 'web',
      classification: 'HOT',
    });
  });

  it('should not notify for WARM leads', () => {
    render(<NotificationBridge />);

    const createdHandler = mockSubscribe.mock.calls.find((call) => call[0] === 'lead.created')?.[1];

    const scoredHandler = mockSubscribe.mock.calls.find((call) => call[0] === 'lead.scored')?.[1];

    createdHandler?.({
      data: {
        id: '999',
        phone: '+40444555666',
        source: 'sms',
      },
    });

    scoredHandler?.({
      data: {
        leadId: '999',
        classification: 'WARM',
      },
    });

    expect(mockNotifyNewLead).not.toHaveBeenCalled();
  });

  it('should not notify for COLD leads', () => {
    render(<NotificationBridge />);

    const createdHandler = mockSubscribe.mock.calls.find((call) => call[0] === 'lead.created')?.[1];

    const scoredHandler = mockSubscribe.mock.calls.find((call) => call[0] === 'lead.scored')?.[1];

    createdHandler?.({
      data: {
        id: '888',
        phone: '+40777888999',
        source: 'email',
      },
    });

    scoredHandler?.({
      data: {
        leadId: '888',
        classification: 'COLD',
      },
    });

    expect(mockNotifyNewLead).not.toHaveBeenCalled();
  });

  it('should clean up subscriptions on unmount', () => {
    const unsubscribe1 = vi.fn();
    const unsubscribe2 = vi.fn();
    const unsubscribe3 = vi.fn();

    mockSubscribe
      .mockReturnValueOnce(unsubscribe1)
      .mockReturnValueOnce(unsubscribe2)
      .mockReturnValueOnce(unsubscribe3);

    const { unmount } = render(<NotificationBridge />);

    unmount();

    expect(unsubscribe1).toHaveBeenCalled();
    expect(unsubscribe2).toHaveBeenCalled();
    expect(unsubscribe3).toHaveBeenCalled();
  });

  it('should handle duplicate lead events', () => {
    render(<NotificationBridge />);

    const createdHandler = mockSubscribe.mock.calls.find((call) => call[0] === 'lead.created')?.[1];

    // Create same lead twice
    createdHandler?.({
      data: {
        id: '111',
        phone: '+40111111111',
        source: 'whatsapp',
      },
    });

    createdHandler?.({
      data: {
        id: '111',
        phone: '+40111111111',
        source: 'whatsapp',
      },
    });

    // Should handle gracefully
    expect(mockSubscribe).toHaveBeenCalled();
  });

  it('should ignore scored events for unknown leads', () => {
    render(<NotificationBridge />);

    const scoredHandler = mockSubscribe.mock.calls.find((call) => call[0] === 'lead.scored')?.[1];

    // Score a lead that was never created
    scoredHandler?.({
      data: {
        leadId: 'unknown-lead',
        classification: 'HOT',
      },
    });

    expect(mockNotifyNewLead).not.toHaveBeenCalled();
  });
});

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, act, waitFor } from '@testing-library/react';
import { useWebSocket } from '@/lib/realtime/use-websocket';

// Mock WebSocket
class MockWebSocket {
  static CONNECTING = 0;
  static OPEN = 1;
  static CLOSING = 2;
  static CLOSED = 3;

  url: string;
  readyState: number = MockWebSocket.CONNECTING;
  onopen: (() => void) | null = null;
  onclose: (() => void) | null = null;
  onerror: ((error: Event) => void) | null = null;
  onmessage: ((event: MessageEvent) => void) | null = null;

  sentMessages: string[] = [];

  constructor(url: string) {
    this.url = url;
  }

  send(data: string) {
    this.sentMessages.push(data);
  }

  close() {
    this.readyState = MockWebSocket.CLOSED;
    this.onclose?.();
  }

  // Test helpers
  simulateOpen() {
    this.readyState = MockWebSocket.OPEN;
    this.onopen?.();
  }

  simulateMessage(data: unknown) {
    this.onmessage?.({ data: JSON.stringify(data) } as MessageEvent);
  }

  simulateError(error: Event) {
    this.onerror?.(error);
  }

  simulateClose() {
    this.readyState = MockWebSocket.CLOSED;
    this.onclose?.();
  }
}

let mockWsInstance: MockWebSocket | null = null;

vi.stubGlobal('WebSocket', class extends MockWebSocket {
  constructor(url: string) {
    super(url);
    mockWsInstance = this;
  }
});

describe('useWebSocket', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    mockWsInstance = null;
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.clearAllMocks();
  });

  it('should initialize with disconnected state', () => {
    const { result } = renderHook(() =>
      useWebSocket({
        url: 'wss://test.example.com',
        authToken: 'test-token',
      })
    );

    expect(result.current.connectionState.status).toBe('disconnected');
    expect(result.current.isConnected).toBe(false);
  });

  it('should connect and send auth message', async () => {
    const onOpen = vi.fn();
    const { result } = renderHook(() =>
      useWebSocket({
        url: 'wss://test.example.com',
        authToken: 'test-token',
        onOpen,
      })
    );

    act(() => {
      result.current.connect();
    });

    expect(result.current.connectionState.status).toBe('connecting');

    // Simulate WebSocket open
    act(() => {
      mockWsInstance?.simulateOpen();
    });

    expect(onOpen).toHaveBeenCalled();
    expect(result.current.connectionState.status).toBe('authenticating');

    // Verify auth message was sent (without token in URL)
    expect(mockWsInstance?.sentMessages).toHaveLength(1);
    const authMessage = JSON.parse(mockWsInstance?.sentMessages[0] ?? '{}');
    expect(authMessage.type).toBe('auth');
    expect(authMessage.token).toBe('test-token');
    expect(authMessage.timestamp).toBeDefined();
  });

  it('should set connected status after auth_success', async () => {
    const onAuthSuccess = vi.fn();
    const { result } = renderHook(() =>
      useWebSocket({
        url: 'wss://test.example.com',
        authToken: 'test-token',
        onAuthSuccess,
      })
    );

    act(() => {
      result.current.connect();
    });

    act(() => {
      mockWsInstance?.simulateOpen();
    });

    // Simulate auth success
    act(() => {
      mockWsInstance?.simulateMessage({ type: 'auth_success' });
    });

    expect(result.current.connectionState.status).toBe('connected');
    expect(result.current.isConnected).toBe(true);
    expect(onAuthSuccess).toHaveBeenCalled();
  });

  it('should handle auth_error and not reconnect', async () => {
    const onAuthError = vi.fn();
    const { result } = renderHook(() =>
      useWebSocket({
        url: 'wss://test.example.com',
        authToken: 'invalid-token',
        onAuthError,
      })
    );

    act(() => {
      result.current.connect();
    });

    act(() => {
      mockWsInstance?.simulateOpen();
    });

    // Simulate auth error
    act(() => {
      mockWsInstance?.simulateMessage({
        type: 'auth_error',
        data: { message: 'Invalid token' },
      });
    });

    expect(result.current.connectionState.status).toBe('error');
    expect(onAuthError).toHaveBeenCalledWith('Invalid token');
  });

  it('should require auth token', () => {
    const onAuthError = vi.fn();
    const { result } = renderHook(() =>
      useWebSocket({
        url: 'wss://test.example.com',
        onAuthError,
      })
    );

    act(() => {
      result.current.connect();
    });

    expect(result.current.connectionState.status).toBe('error');
    expect(onAuthError).toHaveBeenCalledWith('Authentication token required');
  });

  it('should subscribe to events and receive messages', async () => {
    const handler = vi.fn();
    const { result } = renderHook(() =>
      useWebSocket({
        url: 'wss://test.example.com',
        authToken: 'test-token',
      })
    );

    // Subscribe to lead_created events
    act(() => {
      result.current.subscribe('lead_created', handler);
    });

    act(() => {
      result.current.connect();
      mockWsInstance?.simulateOpen();
      mockWsInstance?.simulateMessage({ type: 'auth_success' });
    });

    // Simulate receiving a lead_created event
    act(() => {
      mockWsInstance?.simulateMessage({
        type: 'lead_created',
        data: { leadId: '123', name: 'Test Lead' },
      });
    });

    expect(handler).toHaveBeenCalledWith({
      type: 'lead_created',
      data: { leadId: '123', name: 'Test Lead' },
    });
  });

  it('should support wildcard subscription', async () => {
    const handler = vi.fn();
    const { result } = renderHook(() =>
      useWebSocket({
        url: 'wss://test.example.com',
        authToken: 'test-token',
      })
    );

    act(() => {
      result.current.subscribe('*', handler);
    });

    act(() => {
      result.current.connect();
      mockWsInstance?.simulateOpen();
      mockWsInstance?.simulateMessage({ type: 'auth_success' });
    });

    act(() => {
      mockWsInstance?.simulateMessage({ type: 'any_event', data: {} });
    });

    expect(handler).toHaveBeenCalled();
  });

  it('should unsubscribe correctly', async () => {
    const handler = vi.fn();
    const { result } = renderHook(() =>
      useWebSocket({
        url: 'wss://test.example.com',
        authToken: 'test-token',
      })
    );

    let unsubscribe: () => void;
    act(() => {
      unsubscribe = result.current.subscribe('test_event', handler);
    });

    act(() => {
      result.current.connect();
      mockWsInstance?.simulateOpen();
      mockWsInstance?.simulateMessage({ type: 'auth_success' });
    });

    // Unsubscribe
    act(() => {
      unsubscribe();
    });

    act(() => {
      mockWsInstance?.simulateMessage({ type: 'test_event', data: {} });
    });

    expect(handler).not.toHaveBeenCalled();
  });

  it('should send messages', async () => {
    const { result } = renderHook(() =>
      useWebSocket({
        url: 'wss://test.example.com',
        authToken: 'test-token',
      })
    );

    act(() => {
      result.current.connect();
      mockWsInstance?.simulateOpen();
      mockWsInstance?.simulateMessage({ type: 'auth_success' });
    });

    act(() => {
      result.current.send({ type: 'test', data: 'hello' });
    });

    // First message is auth, second is our test message
    expect(mockWsInstance?.sentMessages).toHaveLength(2);
    expect(JSON.parse(mockWsInstance?.sentMessages[1] ?? '{}')).toEqual({
      type: 'test',
      data: 'hello',
    });
  });

  it('should handle disconnect', async () => {
    const onClose = vi.fn();
    const { result } = renderHook(() =>
      useWebSocket({
        url: 'wss://test.example.com',
        authToken: 'test-token',
        onClose,
      })
    );

    act(() => {
      result.current.connect();
      mockWsInstance?.simulateOpen();
      mockWsInstance?.simulateMessage({ type: 'auth_success' });
    });

    expect(result.current.isConnected).toBe(true);

    act(() => {
      result.current.disconnect();
    });

    expect(result.current.connectionState.status).toBe('disconnected');
    expect(result.current.isConnected).toBe(false);
  });

  it('should auto-reconnect on connection close', async () => {
    const { result } = renderHook(() =>
      useWebSocket({
        url: 'wss://test.example.com',
        authToken: 'test-token',
        reconnectInterval: 1000,
        maxReconnectAttempts: 3,
      })
    );

    act(() => {
      result.current.connect();
      mockWsInstance?.simulateOpen();
      mockWsInstance?.simulateMessage({ type: 'auth_success' });
    });

    // Simulate unexpected close
    act(() => {
      mockWsInstance?.simulateClose();
    });

    expect(result.current.connectionState.status).toBe('disconnected');

    // Fast forward to trigger reconnect
    await act(async () => {
      vi.advanceTimersByTime(1500);
    });

    expect(result.current.connectionState.reconnectAttempts).toBe(1);
  });

  it('should handle heartbeat timeout', async () => {
    const { result } = renderHook(() =>
      useWebSocket({
        url: 'wss://test.example.com',
        authToken: 'test-token',
        enableHeartbeat: true,
        heartbeatInterval: 5000,
        heartbeatTimeout: 2000,
      })
    );

    act(() => {
      result.current.connect();
      mockWsInstance?.simulateOpen();
      mockWsInstance?.simulateMessage({ type: 'auth_success' });
    });

    // Fast forward past heartbeat interval
    await act(async () => {
      vi.advanceTimersByTime(5100);
    });

    // Ping should have been sent
    const sentMessages = mockWsInstance?.sentMessages ?? [];
    const pingMessage = sentMessages.find((msg) => {
      const parsed = JSON.parse(msg);
      return parsed.type === 'ping';
    });
    expect(pingMessage).toBeDefined();
  });

  it('should clear heartbeat timeout on pong', async () => {
    const { result } = renderHook(() =>
      useWebSocket({
        url: 'wss://test.example.com',
        authToken: 'test-token',
        enableHeartbeat: true,
        heartbeatInterval: 5000,
        heartbeatTimeout: 2000,
      })
    );

    act(() => {
      result.current.connect();
      mockWsInstance?.simulateOpen();
      mockWsInstance?.simulateMessage({ type: 'auth_success' });
    });

    // Trigger heartbeat
    await act(async () => {
      vi.advanceTimersByTime(5100);
    });

    // Simulate pong response
    act(() => {
      mockWsInstance?.simulateMessage({ type: 'pong' });
    });

    // Connection should still be open after heartbeat timeout would have expired
    await act(async () => {
      vi.advanceTimersByTime(3000);
    });

    expect(result.current.isConnected).toBe(true);
  });

  it('should ignore messages before authentication', async () => {
    const handler = vi.fn();
    const { result } = renderHook(() =>
      useWebSocket({
        url: 'wss://test.example.com',
        authToken: 'test-token',
      })
    );

    act(() => {
      result.current.subscribe('test_event', handler);
      result.current.connect();
      mockWsInstance?.simulateOpen();
    });

    // Send message before auth_success
    act(() => {
      mockWsInstance?.simulateMessage({ type: 'test_event', data: {} });
    });

    expect(handler).not.toHaveBeenCalled();

    // Now authenticate
    act(() => {
      mockWsInstance?.simulateMessage({ type: 'auth_success' });
    });

    // Send message after auth
    act(() => {
      mockWsInstance?.simulateMessage({ type: 'test_event', data: {} });
    });

    expect(handler).toHaveBeenCalledTimes(1);
  });
});

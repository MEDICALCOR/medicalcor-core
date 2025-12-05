/**
 * useWebSocket - Platinum Standard Tests
 *
 * Pattern: AAA (Arrange–Act–Assert)
 * Coverage: connection lifecycle + auth flow + messaging + reconnection + heartbeat
 * Cleanup: timers, mocks, WebSocket stubs - all properly isolated
 *
 * @vitest-environment jsdom
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useWebSocket } from '@/lib/realtime/use-websocket';

/**
 * Mock WebSocket implementation
 */
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
  private listeners: Map<string, Set<EventListener>> = new Map();

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

  addEventListener(event: string, listener: EventListener) {
    if (!this.listeners.has(event)) {
      this.listeners.set(event, new Set());
    }
    this.listeners.get(event)?.add(listener);
  }

  removeEventListener(event: string, listener: EventListener) {
    this.listeners.get(event)?.delete(listener);
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

class WebSocketMock extends MockWebSocket {
  constructor(url: string) {
    super(url);
    mockWsInstance = this;
  }
}

describe('useWebSocket (platinum standard)', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    mockWsInstance = null;
    vi.stubGlobal('WebSocket', WebSocketMock);
  });

  afterEach(() => {
    vi.runOnlyPendingTimers();
    vi.useRealTimers();
    vi.clearAllMocks();
    vi.unstubAllGlobals();
    mockWsInstance = null;
  });

  describe('Initial state', () => {
    it('initializes with disconnected state', () => {
      // ARRANGE & ACT
      const { result } = renderHook(() =>
        useWebSocket({
          url: 'wss://test.example.com',
          authToken: 'test-token',
        })
      );

      // ASSERT
      expect(result.current.connectionState.status).toBe('disconnected');
      expect(result.current.isConnected).toBe(false);
    });
  });

  describe('Connection lifecycle', () => {
    it('transitions to connecting state when connect is called', () => {
      // ARRANGE
      const { result } = renderHook(() =>
        useWebSocket({
          url: 'wss://test.example.com',
          authToken: 'test-token',
        })
      );

      // ACT
      act(() => {
        result.current.connect();
      });

      // ASSERT
      expect(result.current.connectionState.status).toBe('connecting');
    });

    it('sends auth message on connection open', () => {
      // ARRANGE
      const onOpen = vi.fn();
      const { result } = renderHook(() =>
        useWebSocket({
          url: 'wss://test.example.com',
          authToken: 'test-token',
          onOpen,
        })
      );

      // ACT
      act(() => {
        result.current.connect();
      });

      act(() => {
        mockWsInstance?.simulateOpen();
      });

      // ASSERT
      expect(onOpen).toHaveBeenCalled();
      expect(result.current.connectionState.status).toBe('authenticating');
      expect(mockWsInstance?.sentMessages).toHaveLength(1);

      const authMessage = JSON.parse(mockWsInstance?.sentMessages[0] ?? '{}');
      expect(authMessage.type).toBe('auth');
      expect(authMessage.token).toBe('test-token');
      expect(authMessage.timestamp).toBeDefined();
    });

    it('transitions to connected after auth_success', () => {
      // ARRANGE
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
        mockWsInstance?.simulateOpen();
      });

      // ACT
      act(() => {
        mockWsInstance?.simulateMessage({ type: 'auth_success' });
      });

      // ASSERT
      expect(result.current.connectionState.status).toBe('connected');
      expect(result.current.isConnected).toBe(true);
      expect(onAuthSuccess).toHaveBeenCalled();
    });

    it('handles disconnect correctly', () => {
      // ARRANGE
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

      // ACT
      act(() => {
        result.current.disconnect();
      });

      // ASSERT
      expect(result.current.connectionState.status).toBe('disconnected');
      expect(result.current.isConnected).toBe(false);
    });
  });

  describe('Authentication errors', () => {
    it('handles auth_error and calls onAuthError', () => {
      // ARRANGE
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
        mockWsInstance?.simulateOpen();
      });

      // ACT
      act(() => {
        mockWsInstance?.simulateMessage({
          type: 'auth_error',
          data: { message: 'Invalid token' },
        });
      });

      // ASSERT
      expect(onAuthError).toHaveBeenCalledWith('Invalid token');
      expect(['error', 'disconnected']).toContain(result.current.connectionState.status);
    });

    it('requires auth token to connect', () => {
      // ARRANGE
      const onAuthError = vi.fn();
      const { result } = renderHook(() =>
        useWebSocket({
          url: 'wss://test.example.com',
          onAuthError,
        })
      );

      // ACT
      act(() => {
        result.current.connect();
      });

      // ASSERT
      expect(result.current.connectionState.status).toBe('error');
      expect(onAuthError).toHaveBeenCalledWith('Authentication token required');
    });
  });

  describe('Message subscription', () => {
    it('subscribes to events and receives messages', () => {
      // ARRANGE
      const handler = vi.fn();
      const { result } = renderHook(() =>
        useWebSocket({
          url: 'wss://test.example.com',
          authToken: 'test-token',
        })
      );

      act(() => {
        result.current.subscribe('lead.created', handler);
        result.current.connect();
        mockWsInstance?.simulateOpen();
        mockWsInstance?.simulateMessage({ type: 'auth_success' });
      });

      // ACT
      act(() => {
        mockWsInstance?.simulateMessage({
          type: 'lead.created',
          data: { leadId: '123', name: 'Test Lead' },
        });
      });

      // ASSERT
      expect(handler).toHaveBeenCalledWith({
        type: 'lead.created',
        data: { leadId: '123', name: 'Test Lead' },
      });
    });

    it('supports wildcard subscription', () => {
      // ARRANGE
      const handler = vi.fn();
      const { result } = renderHook(() =>
        useWebSocket({
          url: 'wss://test.example.com',
          authToken: 'test-token',
        })
      );

      act(() => {
        result.current.subscribe('*', handler);
        result.current.connect();
        mockWsInstance?.simulateOpen();
        mockWsInstance?.simulateMessage({ type: 'auth_success' });
      });

      // ACT
      act(() => {
        mockWsInstance?.simulateMessage({ type: 'any_event', data: {} });
      });

      // ASSERT
      expect(handler).toHaveBeenCalled();
    });

    it('unsubscribes correctly', () => {
      // ARRANGE
      const handler = vi.fn();
      const { result } = renderHook(() =>
        useWebSocket({
          url: 'wss://test.example.com',
          authToken: 'test-token',
        })
      );

      let unsubscribe: () => void;
      act(() => {
        unsubscribe = result.current.subscribe('lead.updated', handler);
        result.current.connect();
        mockWsInstance?.simulateOpen();
        mockWsInstance?.simulateMessage({ type: 'auth_success' });
      });

      // ACT
      act(() => {
        unsubscribe();
      });

      act(() => {
        mockWsInstance?.simulateMessage({ type: 'lead.updated', data: {} });
      });

      // ASSERT
      expect(handler).not.toHaveBeenCalled();
    });

    it('ignores messages before authentication', () => {
      // ARRANGE
      const handler = vi.fn();
      const { result } = renderHook(() =>
        useWebSocket({
          url: 'wss://test.example.com',
          authToken: 'test-token',
        })
      );

      act(() => {
        result.current.subscribe('lead.updated', handler);
        result.current.connect();
        mockWsInstance?.simulateOpen();
      });

      // ACT - send message before auth_success
      act(() => {
        mockWsInstance?.simulateMessage({ type: 'lead.updated', data: {} });
      });

      // ASSERT
      expect(handler).not.toHaveBeenCalled();

      // ACT - authenticate
      act(() => {
        mockWsInstance?.simulateMessage({ type: 'auth_success' });
      });

      // ACT - send message after authentication
      act(() => {
        mockWsInstance?.simulateMessage({ type: 'lead.updated', data: { id: '123' } });
      });

      // ASSERT
      expect(handler).toHaveBeenCalledTimes(1);
    });
  });

  describe('Sending messages', () => {
    it('sends messages after authentication', () => {
      // ARRANGE
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

      // ACT
      act(() => {
        result.current.send({ type: 'test', data: 'hello' });
      });

      // ASSERT - first message is auth, second is our test message
      expect(mockWsInstance?.sentMessages).toHaveLength(2);
      expect(JSON.parse(mockWsInstance?.sentMessages[1] ?? '{}')).toEqual({
        type: 'test',
        data: 'hello',
      });
    });
  });

  describe('Auto-reconnection', () => {
    it('auto-reconnects on unexpected connection close', async () => {
      // ARRANGE
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

      // ACT - simulate unexpected close
      act(() => {
        mockWsInstance?.simulateClose();
      });

      expect(result.current.connectionState.status).toBe('disconnected');

      // Fast forward to trigger reconnect
      await act(async () => {
        vi.advanceTimersByTime(1500);
      });

      // ASSERT
      expect(result.current.connectionState.reconnectAttempts).toBe(1);
    });
  });

  describe('Heartbeat mechanism', () => {
    it('sends ping after heartbeat interval', async () => {
      // ARRANGE
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

      // ACT - fast forward past heartbeat interval
      await act(async () => {
        vi.advanceTimersByTime(5100);
      });

      // ASSERT - ping should have been sent
      const sentMessages = mockWsInstance?.sentMessages ?? [];
      const pingMessage = sentMessages.find((msg) => {
        const parsed = JSON.parse(msg);
        return parsed.type === 'ping';
      });
      expect(pingMessage).toBeDefined();
    });

    it('clears heartbeat timeout on pong', async () => {
      // ARRANGE
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

      // ACT - simulate pong response
      act(() => {
        mockWsInstance?.simulateMessage({ type: 'pong' });
      });

      // Advance past heartbeat timeout
      await act(async () => {
        vi.advanceTimersByTime(3000);
      });

      // ASSERT - connection should still be open
      expect(result.current.isConnected).toBe(true);
    });
  });

  describe('Multiple subscriptions', () => {
    it('handles multiple handlers for same event', () => {
      // ARRANGE
      const handler1 = vi.fn();
      const handler2 = vi.fn();
      const { result } = renderHook(() =>
        useWebSocket({
          url: 'wss://test.example.com',
          authToken: 'test-token',
        })
      );

      act(() => {
        result.current.subscribe('lead.created', handler1);
        result.current.subscribe('lead.created', handler2);
        result.current.connect();
        mockWsInstance?.simulateOpen();
        mockWsInstance?.simulateMessage({ type: 'auth_success' });
      });

      // ACT
      act(() => {
        mockWsInstance?.simulateMessage({
          type: 'lead.created',
          data: { id: '123' },
        });
      });

      // ASSERT
      expect(handler1).toHaveBeenCalledTimes(1);
      expect(handler2).toHaveBeenCalledTimes(1);
    });

    it('handles different event subscriptions independently', () => {
      // ARRANGE
      const leadHandler = vi.fn();
      const patientHandler = vi.fn();
      const { result } = renderHook(() =>
        useWebSocket({
          url: 'wss://test.example.com',
          authToken: 'test-token',
        })
      );

      act(() => {
        result.current.subscribe('lead.created', leadHandler);
        result.current.subscribe('patient.updated', patientHandler);
        result.current.connect();
        mockWsInstance?.simulateOpen();
        mockWsInstance?.simulateMessage({ type: 'auth_success' });
      });

      // ACT
      act(() => {
        mockWsInstance?.simulateMessage({ type: 'lead.created', data: {} });
      });

      // ASSERT
      expect(leadHandler).toHaveBeenCalledTimes(1);
      expect(patientHandler).not.toHaveBeenCalled();
    });
  });
});

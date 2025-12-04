/**
 * Supervisor WebSocket Handler
 * W3 Milestone: Voice AI + Realtime Supervisor
 *
 * Provides real-time event streaming for supervisor dashboard
 * using Server-Sent Events (SSE) and WebSocket connections.
 */
import type { FastifyPluginAsync, FastifyRequest, FastifyReply } from 'fastify';
import { generateCorrelationId } from '@medicalcor/core';
import { getSupervisorAgent } from '@medicalcor/domain';
import type { MonitoredCall, HandoffRequest } from '@medicalcor/types';
import { randomUUID } from 'crypto';

// =============================================================================
// Types
// =============================================================================

interface SSEClient {
  id: string;
  supervisorId: string;
  response: FastifyReply;
  createdAt: Date;
  lastPing: Date;
}

// =============================================================================
// SSE Event Manager
// =============================================================================

class SupervisorSSEManager {
  private clients = new Map<string, SSEClient>();
  private heartbeatInterval: NodeJS.Timeout | null = null;
  private agent = getSupervisorAgent();
  private isInitialized = false;

  constructor() {
    this.setupEventListeners();
  }

  /**
   * Setup event listeners from supervisor agent
   */
  private setupEventListeners(): void {
    if (this.isInitialized) return;
    this.isInitialized = true;

    // Call lifecycle events
    this.agent.on('call:started', (call: MonitoredCall) => {
      this.broadcast({
        eventId: randomUUID(),
        eventType: 'call.started',
        timestamp: new Date(),
        callSid: call.callSid,
        call: this.maskCallData(call),
      });
    });

    this.agent.on('call:updated', (callSid: string, changes: Partial<MonitoredCall>) => {
      this.broadcast({
        eventId: randomUUID(),
        eventType: 'call.updated',
        timestamp: new Date(),
        callSid,
        changes,
      });
    });

    this.agent.on(
      'call:ended',
      (
        callSid: string,
        outcome: 'completed' | 'transferred' | 'abandoned' | 'failed' | 'voicemail'
      ) => {
        this.broadcast({
          eventId: randomUUID(),
          eventType: 'call.ended',
          timestamp: new Date(),
          callSid,
          outcome,
          duration: 0, // Would be calculated from call data
        });
      }
    );

    // Transcript events
    this.agent.on(
      'transcript:message',
      (callSid: string, speaker: 'customer' | 'agent' | 'assistant', text: string) => {
        this.broadcast({
          eventId: randomUUID(),
          eventType: 'transcript.message',
          timestamp: new Date(),
          callSid,
          speaker,
          text,
        });
      }
    );

    // Alert events
    this.agent.on('alert:escalation', (callSid: string, reason: string) => {
      this.broadcast({
        eventId: randomUUID(),
        eventType: 'alert.escalation',
        timestamp: new Date(),
        callSid,
        severity: 'critical',
        message: reason,
      });
    });

    this.agent.on('alert:long-hold', (callSid: string, holdDuration: number) => {
      this.broadcast({
        eventId: randomUUID(),
        eventType: 'alert.long-hold',
        timestamp: new Date(),
        callSid,
        severity: 'warning',
        message: `Call on hold for ${Math.round(holdDuration)} seconds`,
        metadata: { holdDuration },
      });
    });

    this.agent.on('alert:silence', (callSid: string, silenceDuration: number) => {
      this.broadcast({
        eventId: randomUUID(),
        eventType: 'alert.silence',
        timestamp: new Date(),
        callSid,
        severity: 'info',
        message: `Silence detected for ${Math.round(silenceDuration)} seconds`,
        metadata: { silenceDuration },
      });
    });

    this.agent.on('alert:negative-sentiment', (callSid: string, sentiment: number) => {
      this.broadcast({
        eventId: randomUUID(),
        eventType: 'alert.high-value', // Reusing for sentiment
        timestamp: new Date(),
        callSid,
        severity: 'warning',
        message: `Negative sentiment detected: ${sentiment.toFixed(2)}`,
        metadata: { sentiment },
      });
    });

    // Supervisor events
    this.agent.on('supervisor:joined', (sessionId: string, callSid: string, mode: string) => {
      this.broadcast({
        eventId: randomUUID(),
        eventType: 'supervisor.joined',
        timestamp: new Date(),
        callSid,
        sessionId,
        mode,
      });
    });

    this.agent.on('supervisor:left', (sessionId: string, callSid: string) => {
      this.broadcast({
        eventId: randomUUID(),
        eventType: 'supervisor.left',
        timestamp: new Date(),
        callSid,
        sessionId,
      });
    });

    // Handoff events
    this.agent.on('handoff:requested', (request: HandoffRequest) => {
      this.broadcast({
        eventId: randomUUID(),
        eventType: 'alert.escalation',
        timestamp: new Date(),
        callSid: request.callSid,
        severity: 'critical',
        message: `Handoff requested: ${request.reason}`,
        metadata: request,
      });
    });

    this.agent.on('handoff:completed', (callSid: string, agentId: string) => {
      this.broadcast({
        eventId: randomUUID(),
        eventType: 'call.updated',
        timestamp: new Date(),
        callSid,
        changes: { agentId, handoffCompleted: true },
      });
    });
  }

  /**
   * Mask sensitive call data for transmission
   */
  private maskCallData(call: MonitoredCall): Partial<MonitoredCall> {
    return {
      ...call,
      customerPhone: call.customerPhone.slice(0, -4) + '****',
      recentTranscript: call.recentTranscript.slice(-5), // Last 5 messages only
    };
  }

  /**
   * Add a new SSE client
   */
  addClient(supervisorId: string, response: FastifyReply): string {
    const clientId = randomUUID();

    const client: SSEClient = {
      id: clientId,
      supervisorId,
      response,
      createdAt: new Date(),
      lastPing: new Date(),
    };

    this.clients.set(clientId, client);

    // Start heartbeat if not running
    if (!this.heartbeatInterval) {
      this.startHeartbeat();
    }

    // Send connection established event
    this.sendToClient(client, {
      eventId: randomUUID(),
      eventType: 'connection.established',
      timestamp: new Date(),
      clientId,
    });

    // Send initial state
    const activeCalls = this.agent.getActiveCalls();
    for (const call of activeCalls) {
      this.sendToClient(client, {
        eventId: randomUUID(),
        eventType: 'call.started',
        timestamp: new Date(),
        callSid: call.callSid,
        call: this.maskCallData(call),
      });
    }

    return clientId;
  }

  /**
   * Remove a client
   */
  removeClient(clientId: string): void {
    this.clients.delete(clientId);

    // Stop heartbeat if no clients
    if (this.clients.size === 0 && this.heartbeatInterval) {
      clearInterval(this.heartbeatInterval);
      this.heartbeatInterval = null;
    }
  }

  /**
   * Send event to specific client
   */
  private sendToClient(client: SSEClient, event: Record<string, unknown>): void {
    try {
      const data = `data: ${JSON.stringify(event)}\n\n`;
      client.response.raw.write(data);
    } catch {
      // Client disconnected, remove it
      this.clients.delete(client.id);
    }
  }

  /**
   * Broadcast event to all connected clients
   */
  private broadcast(event: Record<string, unknown>): void {
    for (const [clientId, client] of this.clients.entries()) {
      try {
        const data = `data: ${JSON.stringify(event)}\n\n`;
        client.response.raw.write(data);
      } catch {
        // Client disconnected, remove it
        this.clients.delete(clientId);
      }
    }
  }

  /**
   * Start heartbeat to keep connections alive
   */
  private startHeartbeat(): void {
    this.heartbeatInterval = setInterval(() => {
      const now = new Date();
      this.broadcast({
        eventId: randomUUID(),
        eventType: 'heartbeat',
        timestamp: now,
      });

      // Update last ping for all clients
      for (const client of this.clients.values()) {
        client.lastPing = now;
      }
    }, 30000); // Every 30 seconds
  }

  /**
   * Get client count
   */
  getClientCount(): number {
    return this.clients.size;
  }

  /**
   * Cleanup
   */
  destroy(): void {
    if (this.heartbeatInterval) {
      clearInterval(this.heartbeatInterval);
      this.heartbeatInterval = null;
    }

    // Close all client connections
    for (const client of this.clients.values()) {
      try {
        client.response.raw.end();
      } catch {
        // Ignore errors on close
      }
    }

    this.clients.clear();
  }
}

// Singleton instance
let sseManager: SupervisorSSEManager | null = null;

function getSSEManager(): SupervisorSSEManager {
  sseManager ??= new SupervisorSSEManager();
  return sseManager;
}

// =============================================================================
// Route Definitions
// =============================================================================

// eslint-disable-next-line @typescript-eslint/require-await -- Fastify plugin pattern
export const supervisorWSRoutes: FastifyPluginAsync = async (fastify) => {
  const manager = getSSEManager();

  /**
   * GET /supervisor/events
   * Server-Sent Events endpoint for real-time updates
   */
  fastify.get(
    '/supervisor/events',
    (request: FastifyRequest<{ Headers: { 'x-supervisor-id'?: string } }>, reply: FastifyReply) => {
      const correlationId = generateCorrelationId();
      const supervisorId = request.headers['x-supervisor-id'];

      if (!supervisorId) {
        return reply.status(400).send({
          error: 'x-supervisor-id header is required',
          correlationId,
        });
      }

      fastify.log.info({ correlationId, supervisorId }, 'SSE client connecting');

      // Set SSE headers
      reply.raw.writeHead(200, {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        Connection: 'keep-alive',
        'X-Accel-Buffering': 'no', // Disable nginx buffering
      });

      // Add client
      const clientId = manager.addClient(supervisorId, reply);

      fastify.log.info(
        { correlationId, supervisorId, clientId, totalClients: manager.getClientCount() },
        'SSE client connected'
      );

      // Handle client disconnect
      request.raw.on('close', () => {
        manager.removeClient(clientId);
        fastify.log.info(
          { correlationId, supervisorId, clientId, totalClients: manager.getClientCount() },
          'SSE client disconnected'
        );
      });

      // Keep the connection open (don't call reply.send())
      return;
    }
  );

  /**
   * GET /supervisor/events/status
   * Get SSE connection status
   */
  fastify.get('/supervisor/events/status', (_request: FastifyRequest, reply: FastifyReply) => {
    return reply.send({
      connectedClients: manager.getClientCount(),
      timestamp: new Date(),
    });
  });
};

// =============================================================================
// Manual Event Emission (for webhooks)
// =============================================================================

/**
 * Emit a supervisor event to all connected clients
 * Used by webhook handlers to push real-time updates
 */
export function emitSupervisorEvent(event: {
  eventType: string;
  callSid?: string;
  data?: Record<string, unknown>;
}): void {
  // Initialize SSE manager to ensure event listeners are set up
  getSSEManager();
  const agent = getSupervisorAgent();

  // The agent will emit events that the SSE manager listens to
  // This function is for webhook handlers to trigger events

  switch (event.eventType) {
    case 'call.started':
      if (event.data && event.callSid) {
        const customerPhone =
          typeof event.data.customerPhone === 'string' ? event.data.customerPhone : '+40000000000';
        const direction =
          event.data.direction === 'inbound' || event.data.direction === 'outbound'
            ? event.data.direction
            : 'inbound';
        agent.registerCall({
          callSid: event.callSid,
          customerPhone,
          state: 'ringing',
          direction,
          startedAt: new Date(),
          duration: 0,
          vapiCallId: event.data.vapiCallId as string | undefined,
          assistantId: event.data.assistantId as string | undefined,
        });
      }
      break;

    case 'call.updated':
      if (event.callSid && event.data) {
        agent.updateCall(event.callSid, event.data as Partial<MonitoredCall>);
      }
      break;

    case 'call.ended':
      if (event.callSid) {
        const outcome =
          event.data?.outcome === 'completed' ||
          event.data?.outcome === 'transferred' ||
          event.data?.outcome === 'abandoned' ||
          event.data?.outcome === 'failed' ||
          event.data?.outcome === 'voicemail'
            ? event.data.outcome
            : 'completed';
        agent.endCall(event.callSid, outcome);
      }
      break;

    case 'transcript.message':
      if (event.callSid && event.data) {
        const speaker =
          event.data.speaker === 'customer' ||
          event.data.speaker === 'agent' ||
          event.data.speaker === 'assistant'
            ? event.data.speaker
            : 'customer';
        const text = typeof event.data.text === 'string' ? event.data.text : '';
        agent.processTranscriptMessage(
          event.callSid,
          speaker,
          text,
          event.data.confidence as number | undefined
        );
      }
      break;

    default:
      // Unknown event type, ignore
      break;
  }
}

/**
 * Get the SSE manager for testing
 */
export function getSSEManagerInstance(): SupervisorSSEManager {
  return getSSEManager();
}

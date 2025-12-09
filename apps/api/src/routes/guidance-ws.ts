/**
 * Guidance WebSocket Handler
 * M2 Milestone: Agent Guidance Call Scripts
 *
 * Provides real-time guidance event streaming for agent dashboard
 * using Server-Sent Events (SSE).
 */
import type { FastifyPluginAsync, FastifyRequest, FastifyReply } from 'fastify';
import { generateCorrelationId, logger, deepRedactObject, redactString } from '@medicalcor/core';
import { GuidanceService, type IGuidanceRepository } from '@medicalcor/domain';
import type { AgentGuidance, GuidanceSuggestion } from '@medicalcor/types';
import { randomUUID } from 'crypto';

// =============================================================================
// Types
// =============================================================================

interface GuidanceSSEClient {
  id: string;
  agentId: string;
  callSid?: string;
  response: FastifyReply;
  createdAt: Date;
  lastPing: Date;
}

// =============================================================================
// SSE Event Manager
// =============================================================================

class GuidanceSSEManager {
  private clients = new Map<string, GuidanceSSEClient>();
  private callToClients = new Map<string, Set<string>>(); // callSid -> clientIds
  private heartbeatInterval: NodeJS.Timeout | null = null;
  private guidanceService: GuidanceService | null = null;
  private isInitialized = false;

  /**
   * Initialize with guidance service
   */
  initialize(service: GuidanceService): void {
    if (this.isInitialized) return;
    this.isInitialized = true;
    this.guidanceService = service;
    this.setupEventListeners();
  }

  /**
   * Setup event listeners from guidance service
   */
  private setupEventListeners(): void {
    if (!this.guidanceService) return;

    // Guidance loaded for call
    this.guidanceService.on('guidance:loaded', (callSid: string, guidance: AgentGuidance) => {
      this.broadcastToCall(callSid, {
        eventId: randomUUID(),
        eventType: 'guidance.loaded',
        timestamp: new Date(),
        callSid,
        guidance: this.sanitizeGuidance(guidance),
        currentStepId: guidance.steps[0]?.id,
      });
    });

    // Step completed
    this.guidanceService.on(
      'guidance:step-complete',
      (callSid: string, stepId: string, nextStepId?: string) => {
        this.broadcastToCall(callSid, {
          eventId: randomUUID(),
          eventType: 'guidance.step-complete',
          timestamp: new Date(),
          callSid,
          stepId,
          nextStepId,
        });
      }
    );

    // Suggestion generated
    this.guidanceService.on(
      'guidance:suggestion',
      (callSid: string, suggestion: GuidanceSuggestion) => {
        this.broadcastToCall(callSid, {
          eventId: randomUUID(),
          eventType: 'guidance.suggestion',
          timestamp: new Date(),
          callSid,
          suggestion: {
            ...suggestion,
            content: redactString(suggestion.content), // Redact PII
          },
        });
      }
    );

    // Objection detected
    this.guidanceService.on(
      'guidance:objection-detected',
      (callSid: string, objection: string, suggestedResponse: string) => {
        this.broadcastToCall(callSid, {
          eventId: randomUUID(),
          eventType: 'guidance.objection-detected',
          timestamp: new Date(),
          callSid,
          objection: redactString(objection),
          suggestedResponse,
        });
      }
    );

    // Script completed
    this.guidanceService.on(
      'guidance:script-complete',
      (
        callSid: string,
        guidanceId: string,
        stats: {
          completedSteps: number;
          totalSteps: number;
          duration: number;
          skippedSteps: number;
        }
      ) => {
        this.broadcastToCall(callSid, {
          eventId: randomUUID(),
          eventType: 'guidance.script-complete',
          timestamp: new Date(),
          callSid,
          guidanceId,
          completedSteps: stats.completedSteps,
          totalSteps: stats.totalSteps,
          duration: stats.duration,
          skippedSteps: stats.skippedSteps,
        });
      }
    );
  }

  /**
   * Sanitize guidance for transmission (remove sensitive data)
   */
  private sanitizeGuidance(guidance: AgentGuidance): Partial<AgentGuidance> {
    return {
      id: guidance.id,
      name: guidance.name,
      type: guidance.type,
      category: guidance.category,
      description: guidance.description,
      audience: guidance.audience,
      initialGreeting: guidance.initialGreeting,
      initialGreetingRo: guidance.initialGreetingRo,
      steps: guidance.steps,
      keyPoints: guidance.keyPoints,
      objectionHandlers: guidance.objectionHandlers,
      closingStatements: guidance.closingStatements,
      closingStatementsRo: guidance.closingStatementsRo,
      procedures: guidance.procedures,
      languages: guidance.languages,
      defaultLanguage: guidance.defaultLanguage,
    };
  }

  /**
   * Add a new SSE client
   */
  addClient(agentId: string, response: FastifyReply, callSid?: string): string {
    const clientId = randomUUID();

    const client: GuidanceSSEClient = {
      id: clientId,
      agentId,
      callSid,
      response,
      createdAt: new Date(),
      lastPing: new Date(),
    };

    this.clients.set(clientId, client);

    // Track call-to-client mapping
    if (callSid) {
      if (!this.callToClients.has(callSid)) {
        this.callToClients.set(callSid, new Set());
      }
      this.callToClients.get(callSid)!.add(clientId);
    }

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

    // Send current guidance state if subscribed to a call
    if (callSid && this.guidanceService) {
      const guidance = this.guidanceService.getCallGuidance(callSid);
      if (guidance) {
        const currentStep = this.guidanceService.getCurrentStep(callSid);
        const suggestions = this.guidanceService.getPendingSuggestions(callSid);

        this.sendToClient(client, {
          eventId: randomUUID(),
          eventType: 'guidance.loaded',
          timestamp: new Date(),
          callSid,
          guidance: this.sanitizeGuidance(guidance),
          currentStepId: currentStep?.id,
        });

        // Send pending suggestions
        for (const suggestion of suggestions) {
          this.sendToClient(client, {
            eventId: randomUUID(),
            eventType: 'guidance.suggestion',
            timestamp: new Date(),
            callSid,
            suggestion,
          });
        }
      }
    }

    return clientId;
  }

  /**
   * Subscribe client to a call
   */
  subscribeToCall(clientId: string, callSid: string): boolean {
    const client = this.clients.get(clientId);
    if (!client) return false;

    // Unsubscribe from previous call
    if (client.callSid) {
      this.callToClients.get(client.callSid)?.delete(clientId);
    }

    // Subscribe to new call
    client.callSid = callSid;
    if (!this.callToClients.has(callSid)) {
      this.callToClients.set(callSid, new Set());
    }
    this.callToClients.get(callSid)!.add(clientId);

    // Send current guidance state
    if (this.guidanceService) {
      const guidance = this.guidanceService.getCallGuidance(callSid);
      if (guidance) {
        this.sendToClient(client, {
          eventId: randomUUID(),
          eventType: 'guidance.loaded',
          timestamp: new Date(),
          callSid,
          guidance: this.sanitizeGuidance(guidance),
          currentStepId: this.guidanceService.getCurrentStep(callSid)?.id,
        });
      }
    }

    return true;
  }

  /**
   * Remove a client
   */
  removeClient(clientId: string): void {
    const client = this.clients.get(clientId);
    if (client?.callSid) {
      this.callToClients.get(client.callSid)?.delete(clientId);
      if (this.callToClients.get(client.callSid)?.size === 0) {
        this.callToClients.delete(client.callSid);
      }
    }

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
  private sendToClient(client: GuidanceSSEClient, event: Record<string, unknown>): void {
    try {
      const sanitizedEvent = deepRedactObject(event);
      const data = `data: ${JSON.stringify(sanitizedEvent)}\n\n`;
      client.response.raw.write(data);
    } catch (error) {
      logger.debug({ error, clientId: client.id }, 'Failed to send event to client');
      this.removeClient(client.id);
    }
  }

  /**
   * Broadcast to all clients subscribed to a call
   */
  private broadcastToCall(callSid: string, event: Record<string, unknown>): void {
    const clientIds = this.callToClients.get(callSid);
    if (!clientIds || clientIds.size === 0) return;

    const sanitizedEvent = deepRedactObject(event);
    const data = `data: ${JSON.stringify(sanitizedEvent)}\n\n`;

    for (const clientId of clientIds) {
      const client = this.clients.get(clientId);
      if (client) {
        try {
          client.response.raw.write(data);
        } catch (error) {
          logger.debug({ error, clientId }, 'Failed to broadcast to client');
          this.removeClient(clientId);
        }
      }
    }
  }

  /**
   * Broadcast to all clients
   */
  private broadcast(event: Record<string, unknown>): void {
    const sanitizedEvent = deepRedactObject(event);
    const data = `data: ${JSON.stringify(sanitizedEvent)}\n\n`;

    for (const [clientId, client] of this.clients.entries()) {
      try {
        client.response.raw.write(data);
      } catch (error) {
        logger.debug({ error, clientId }, 'Failed to broadcast to client');
        this.removeClient(clientId);
      }
    }
  }

  /**
   * Start heartbeat
   */
  private startHeartbeat(): void {
    this.heartbeatInterval = setInterval(() => {
      const now = new Date();
      this.broadcast({
        eventId: randomUUID(),
        eventType: 'heartbeat',
        timestamp: now,
      });

      for (const client of this.clients.values()) {
        client.lastPing = now;
      }
    }, 30000);
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

    for (const client of this.clients.values()) {
      try {
        client.response.raw.end();
      } catch {
        // Ignore errors on close
      }
    }

    this.clients.clear();
    this.callToClients.clear();
    this.guidanceService = null;
    this.isInitialized = false;
  }
}

// Singleton instance
let sseManager: GuidanceSSEManager | null = null;

function getGuidanceSSEManager(): GuidanceSSEManager {
  sseManager ??= new GuidanceSSEManager();
  return sseManager;
}

// =============================================================================
// Route Factory
// =============================================================================

/**
 * Create guidance WebSocket routes with injected repository
 */
export function createGuidanceWSRoutes(repository: IGuidanceRepository): FastifyPluginAsync {
  const service = new GuidanceService(repository);
  const manager = getGuidanceSSEManager();
  manager.initialize(service);

  const guidanceWSRoutes: FastifyPluginAsync = async (fastify) => {
    /**
     * GET /guidance/events
     * Server-Sent Events endpoint for real-time guidance updates
     */
    fastify.get(
      '/guidance/events',
      (
        request: FastifyRequest<{
          Headers: { 'x-agent-id'?: string };
          Querystring: { callSid?: string };
        }>,
        reply: FastifyReply
      ) => {
        const correlationId = generateCorrelationId();
        const agentId = request.headers['x-agent-id'];
        const callSid = (request.query as { callSid?: string }).callSid;

        if (!agentId) {
          return reply.status(400).send({
            error: 'x-agent-id header is required',
            correlationId,
          });
        }

        fastify.log.info({ correlationId, agentId, callSid }, 'Guidance SSE client connecting');

        // Set SSE headers
        reply.raw.writeHead(200, {
          'Content-Type': 'text/event-stream',
          'Cache-Control': 'no-cache',
          Connection: 'keep-alive',
          'X-Accel-Buffering': 'no',
        });

        // Add client
        const clientId = manager.addClient(agentId, reply, callSid);

        fastify.log.info(
          { correlationId, agentId, clientId, callSid, totalClients: manager.getClientCount() },
          'Guidance SSE client connected'
        );

        // Handle client disconnect
        request.raw.on('close', () => {
          manager.removeClient(clientId);
          fastify.log.info(
            { correlationId, agentId, clientId, totalClients: manager.getClientCount() },
            'Guidance SSE client disconnected'
          );
        });

        // Keep connection open
        return;
      }
    );

    /**
     * POST /guidance/events/subscribe
     * Subscribe to guidance events for a specific call
     */
    fastify.post(
      '/guidance/events/subscribe',
      async (
        request: FastifyRequest<{
          Body: { clientId: string; callSid: string };
        }>,
        reply: FastifyReply
      ) => {
        const correlationId = generateCorrelationId();
        const { clientId, callSid } = request.body as { clientId: string; callSid: string };

        if (!clientId || !callSid) {
          return await reply.status(400).send({
            error: 'clientId and callSid are required',
            correlationId,
          });
        }

        const success = manager.subscribeToCall(clientId, callSid);

        if (!success) {
          return await reply.status(404).send({
            error: 'Client not found',
            correlationId,
          });
        }

        return await reply.send({
          success: true,
          correlationId,
        });
      }
    );

    /**
     * GET /guidance/events/status
     * Get SSE connection status
     */
    fastify.get('/guidance/events/status', (_request: FastifyRequest, reply: FastifyReply) => {
      return reply.send({
        connectedClients: manager.getClientCount(),
        timestamp: new Date(),
      });
    });
  };

  return guidanceWSRoutes;
}

// =============================================================================
// Exports
// =============================================================================

export { getGuidanceSSEManager };
export type { GuidanceSSEManager };

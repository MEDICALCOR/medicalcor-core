/**
 * Voice Domain Module
 * W3 Milestone: Voice AI + Realtime Supervisor
 * H8: Queue SLA Tracking
 * M2: Agent Presence WebSocket
 *
 * Exports supervisor agent and related domain logic for
 * real-time call monitoring and AI-to-human handoff.
 */

export {
  SupervisorAgent,
  getSupervisorAgent,
  resetSupervisorAgent,
  type SupervisorAgentConfig,
  type SupervisorAgentEvents,
} from './supervisor-agent.js';

// State Persistence Repository (H3 Production Fix)
export {
  PostgresSupervisorStateRepository,
  createSupervisorStateRepository,
  type ISupervisorStateRepository,
  type EscalationHistoryEntry,
  type HandoffHistoryEntry,
} from './supervisor-state-repository.js';

// Queue SLA Service (H8 Queue SLA Tracking)
export {
  QueueSLAService,
  getQueueSLAService,
  createQueueSLAService,
  resetQueueSLAService,
  type SLABreachType,
  type QueueMetricsInput,
  type SLAEvaluationResult,
  type HistoricalMetrics,
  type IQueueMetricsPort,
  type QueueSLAServiceConfig,
} from './queue-sla-service.js';

// Agent Presence Service (M2 Agent Presence WebSocket)
export {
  AgentPresenceService,
  getAgentPresenceService,
  createAgentPresenceService,
  resetAgentPresenceService,
  type AgentPresenceServiceConfig,
  type AgentPresenceServiceEvents,
} from './agent-presence-service.js';

// Presence WebSocket Manager (M2 Agent Presence WebSocket)
export {
  PresenceWebSocketManager,
  createPresenceWebSocketManager,
  type IWebSocketConnection,
  type IPresenceWebSocketPort,
  type PresenceWebSocketManagerConfig,
  type PresenceWebSocketManagerEvents,
} from './presence-websocket-manager.js';

// Queue Actions Handler (Queue Action Processing)
export {
  QueueActionsHandler,
  getQueueActionsHandler,
  createQueueActionsHandler,
  resetQueueActionsHandler,
  InMemoryQueueEventPort,
  InMemoryAlertNotificationPort,
  type ActionHandlerResult,
  type IQueueEventPort,
  type IAlertNotificationPort,
  type QueueActionsHandlerConfig,
} from './queue-actions-handler.js';

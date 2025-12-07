/**
 * Voice Domain Module
 * W3 Milestone: Voice AI + Realtime Supervisor
 * H8: Queue SLA Tracking
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

/**
 * Voice Domain Module
 * W3 Milestone: Voice AI + Realtime Supervisor
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

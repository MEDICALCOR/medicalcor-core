/**
 * Supervisor Module Exports
 *
 * Provides real-time monitoring context and hooks for the supervisor dashboard.
 */

export {
  SupervisorProvider,
  useSupervisor,
  useSupervisorConnection,
  useSupervisorActions,
} from './context';
export type { SupervisorContextValue, SupervisorAlert } from './context';
export { useSupervisorSSE } from './use-supervisor-sse';

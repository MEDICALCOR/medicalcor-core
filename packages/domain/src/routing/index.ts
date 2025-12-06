/**
 * Skill-Based Routing Module
 * H6 Milestone: Intelligent Agent Routing
 *
 * Exports routing service, repositories, commands, and utilities
 */

export {
  SkillRoutingService,
  createSkillRoutingService,
  type AgentRepository,
  type RoutingRuleRepository,
  type RoutingQueue,
  type RoutingContext,
} from './skill-routing-service.js';

export {
  InMemoryAgentRepository,
  InMemoryRoutingRuleRepository,
  InMemoryRoutingQueue,
} from './repositories.js';

export {
  // Skill management commands
  CreateSkillCommand,
  UpdateSkillCommand,
  DeleteSkillCommand,
  // Agent skill assignment commands
  AssignAgentSkillCommand,
  UpdateAgentSkillCommand,
  RemoveAgentSkillCommand,
  BulkAssignSkillsCommand,
  // Agent profile commands
  CreateAgentProfileCommand,
  UpdateAgentAvailabilityCommand,
  UpdateAgentTaskCountCommand,
  // Routing rule commands
  CreateRoutingRuleCommand,
  UpdateRoutingRuleCommand,
  DeleteRoutingRuleCommand,
  ToggleRoutingRuleCommand,
  // Routing operation commands
  RouteTaskCommand,
  ForceAssignTaskCommand,
  RerouteTaskCommand,
  EscalateTaskCommand,
  // Handlers
  routeTaskHandler,
  getRoutingCommandSchemas,
  type RoutingCommandContext,
} from './commands.js';

export {
  FlexAgentRepositoryAdapter,
  FlexRoutingAdapter,
  createFlexAgentRepository,
  createFlexRoutingAdapter,
  createFlexSkillRouting,
  type FlexSkillMapping,
  type FlexRoutingTask,
  type FlexRoutingResult,
} from './flex-routing-adapter.js';

export {
  TriageRoutingIntegration,
  createTriageRoutingIntegration,
  type TriageRoutingConfig,
  type TriageRoutingResult,
} from './triage-integration.js';

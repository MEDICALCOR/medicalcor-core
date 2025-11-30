/**
 * @module architecture
 *
 * Enterprise Architecture Foundation
 * ==================================
 *
 * This module provides the foundational building blocks for a DDD + Hexagonal + Event-Driven
 * architecture with strict layer separation, security by design, and full observability.
 *
 * Architecture Principles:
 * - Domain-Driven Design (DDD) with tactical patterns
 * - Hexagonal Architecture (Ports & Adapters)
 * - Event-Driven Architecture with Event Sourcing
 * - CQRS (Command Query Responsibility Segregation)
 * - Security & Privacy by Design (Zero Trust)
 * - Full Observability (Metrics, Logs, Traces)
 * - Cloud-Agnostic Infrastructure
 * - AI & Data Ready
 *
 * Layer Structure:
 * ```
 * ┌─────────────────────────────────────────────────┐
 * │                    UI Layer                      │
 * │         (REST, GraphQL, WebSocket, CLI)          │
 * └─────────────────────────────────────────────────┘
 *                        │
 *                        ▼
 * ┌─────────────────────────────────────────────────┐
 * │              Application Layer                   │
 * │   (Use Cases, Commands, Queries, Sagas)         │
 * └─────────────────────────────────────────────────┘
 *                        │
 *                        ▼
 * ┌─────────────────────────────────────────────────┐
 * │               Domain Layer                       │
 * │  (Entities, Value Objects, Domain Events,       │
 * │   Aggregates, Domain Services, Repositories)    │
 * └─────────────────────────────────────────────────┘
 *                        │
 *                        ▼
 * ┌─────────────────────────────────────────────────┐
 * │            Infrastructure Layer                  │
 * │  (Database, Messaging, External Services,       │
 * │   Security, Observability, Cloud Services)      │
 * └─────────────────────────────────────────────────┘
 * ```
 */

// Layer contracts - export types to avoid duplicates with implementations
export {
  type ArchitecturalLayer,
  type LayerMetadata,
  type DomainComponent,
  type ApplicationComponent,
  type InfrastructureComponent,
  type UIComponent,
  type Command,
  type CommandMetadata,
  type CommandError,
  type Query,
  type QueryMetadata,
  type QueryError,
  type UseCaseError,
  type SagaStatus,
  type SagaAction,
  type Port,
  type Adapter,
  type MessageBus,
  type Outbox,
  type Controller,
  type Presenter,
  type ViewModel,
  type ViewMetadata,
  type AuditEntry,
  type TenantContext,
  type TenantSettings,
  type DomainLayerType,
  type ApplicationLayerType,
  type InfrastructureLayerType,
  type UILayerType,
} from './layers/contracts.js';

// Layer boundaries
export {
  type BoundaryViolation,
  layerRegistry,
  assertDomainLayer,
  assertApplicationLayer,
  assertInfrastructureLayer,
  assertUILayer,
  LayerViolationError,
  validateDependency,
  createLayerProxy,
  analyzeModuleBoundaries,
  type ModuleImport,
  type BoundaryAnalysisResult,
  runInLayerContext,
  getCurrentLayerContext,
  ensureLayer,
} from './layers/boundaries.js';

// Layer decorators
export {
  DomainLayer,
  ApplicationLayer,
  InfrastructureLayer,
  UILayer,
  InjectFromLayer,
  LayerBoundary,
  AggregateRoot as AggregateRootDecorator,
  ValueObjectDecorator,
  DomainEventDecorator,
  CommandHandlerDecorator,
  QueryHandlerDecorator,
  UseCaseDecorator,
  RepositoryImplementation,
  AdapterDecorator,
  AllowedCallers,
  LayerInternal,
} from './layers/decorators.js';

// Domain building blocks
export * from './domain/index.js';

// Application layer components
export * from './application/index.js';

// AI & Data infrastructure
export * from './ai-data/index.js';

// Testing infrastructure
export * from './testing/index.js';

// NOTE: Infrastructure, Security, Observability, and Events modules have duplicate exports
// with Domain/Application. Import them directly from their submodules if needed:
// - '@medicalcor/core/architecture/infrastructure'
// - '@medicalcor/core/architecture/security'
// - '@medicalcor/core/architecture/observability'
// - '@medicalcor/core/architecture/events'

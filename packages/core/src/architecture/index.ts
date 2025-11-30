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

// Layer contracts and boundaries
export * from './layers/index.js';

// Hexagonal architecture ports
export * from './ports/index.js';

// Domain building blocks
export * from './domain/index.js';

// Application layer components
export * from './application/index.js';

// Infrastructure abstractions
export * from './infrastructure/index.js';

// Security & compliance
export * from './security/index.js';

// Observability & monitoring
export * from './observability/index.js';

// Event-driven components
export * from './events/index.js';

// AI & Data infrastructure
export * from './ai-data/index.js';

// Testing infrastructure
export * from './testing/index.js';

# ADR-001: Hexagonal Architecture (Ports & Adapters)

## Status

**ACCEPTED** - 2024-11-30

## Context

MedicalCor OSAX is a medical-grade platform handling Protected Health Information (PHI) under HIPAA and GDPR compliance requirements. The system requires:

1. **High Testability**: Domain logic must be testable without infrastructure dependencies
2. **Technology Flexibility**: Ability to swap databases, message queues, or cloud providers
3. **Clear Boundaries**: Compliance-sensitive code must be isolated and auditable
4. **Long-term Maintainability**: The codebase must support evolution over years

Previous implementations suffered from:
- Tight coupling between business logic and infrastructure
- Difficulty testing without database connections
- Vendor lock-in to specific cloud services
- Compliance code scattered throughout the application

## Decision

Implement **Hexagonal Architecture** (Ports & Adapters) with strict layer separation:

### Architecture Layers

```
┌─────────────────────────────────────────────────────────────────┐
│                     DRIVING ADAPTERS                            │
│   REST Controllers │ GraphQL │ CLI │ Event Handlers             │
└──────────────────────────────┬──────────────────────────────────┘
                               │
┌──────────────────────────────▼──────────────────────────────────┐
│                     PRIMARY PORTS                               │
│   OsaxCaseService │ AuditService │ ReportingService             │
└──────────────────────────────┬──────────────────────────────────┘
                               │
┌──────────────────────────────▼──────────────────────────────────┐
│                   APPLICATION LAYER                             │
│   Use Cases │ Security Context │ RBAC Policy                    │
└──────────────────────────────┬──────────────────────────────────┘
                               │
┌──────────────────────────────▼──────────────────────────────────┐
│                    DOMAIN LAYER                                 │
│   Entities │ Value Objects │ Domain Events │ Domain Services    │
└──────────────────────────────┬──────────────────────────────────┘
                               │
┌──────────────────────────────▼──────────────────────────────────┐
│                   SECONDARY PORTS                               │
│   OsaxCaseRepository │ EventPublisher │ AuditService            │
└──────────────────────────────┬──────────────────────────────────┘
                               │
┌──────────────────────────────▼──────────────────────────────────┐
│                    DRIVEN ADAPTERS                              │
│   PostgreSQL │ Supabase │ Kafka │ Redis │ OpenAI                │
└─────────────────────────────────────────────────────────────────┘
```

### Package Structure

```
packages/
├── domain/              # Pure business logic, no dependencies
├── application/         # Use cases, ports, security
└── infrastructure/      # Adapters implementing ports
```

### Key Interfaces

**Primary Ports** (what the application offers):
- `OsaxCaseService`: Case management operations
- `OsaxCaseDto`: Data transfer objects for external communication

**Secondary Ports** (what the application needs):
- `OsaxCaseRepository`: Persistence abstraction
- `EventPublisher`: Event publishing abstraction
- `AuditService`: Audit logging abstraction

## Consequences

### Positive

- **Domain logic fully testable** without database, with in-memory implementations
- **Technology swappable**: Can migrate from PostgreSQL to DynamoDB without touching domain
- **Compliance isolated**: Audit, encryption, and security in dedicated adapters
- **Clear dependencies**: All dependencies flow inward toward domain
- **Parallel development**: Teams can work on adapters independently

### Negative

- **More abstraction layers**: Additional interfaces and indirection
- **Learning curve**: Team must understand hexagonal architecture principles
- **Initial overhead**: More files and packages to create initially
- **Potential over-engineering**: Risk of creating unnecessary abstractions

### Neutral

- **Consistent patterns**: All features follow the same structure
- **Explicit dependencies**: All external dependencies visible at port boundaries

## Alternatives Considered

### 1. Traditional Layered Architecture
**Rejected**: Tight coupling between layers, difficult to swap technologies, compliance code scattered.

### 2. Clean Architecture
**Considered but simplified**: Full Clean Architecture adds too many layers (Entities, Use Cases, Interface Adapters, Frameworks). Hexagonal provides similar benefits with less complexity.

### 3. Vertical Slice Architecture
**Partially adopted**: Feature organization used within bounded contexts, but hexagonal provides the horizontal layering needed for compliance isolation.

## Implementation Guidelines

1. **Domain Layer Rules**:
   - No dependencies on infrastructure packages
   - All external interactions through ports
   - Rich domain models with behavior

2. **Port Design**:
   - Ports defined in application layer
   - One port per external dependency type
   - Async interfaces for I/O operations

3. **Adapter Implementation**:
   - One adapter per technology
   - Adapters implement ports exactly
   - Infrastructure concerns contained in adapters

## References

- Alistair Cockburn, "Hexagonal Architecture" (2005)
- Vaughn Vernon, "Implementing Domain-Driven Design" (2013)
- Tom Hombergs, "Get Your Hands Dirty on Clean Architecture" (2019)

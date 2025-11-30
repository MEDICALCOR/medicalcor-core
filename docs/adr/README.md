# Architecture Decision Records (ADRs)

This directory contains Architecture Decision Records for the MedicalCor OSAX platform.

## What is an ADR?

An Architecture Decision Record (ADR) captures an important architectural decision along with its context and consequences.

## ADR Index

| ADR | Title | Status | Date |
|-----|-------|--------|------|
| [001](./001-hexagonal-architecture.md) | Hexagonal Architecture (Ports & Adapters) | ACCEPTED | 2024-11-30 |
| [002](./002-cloud-agnostic-strategy.md) | Cloud-Agnostic Multi-Cloud Strategy | ACCEPTED | 2024-11-30 |

## ADR Status Lifecycle

```
PROPOSED → ACCEPTED → DEPRECATED
              ↓
          SUPERSEDED (by ADR-XXX)
```

- **PROPOSED**: Under discussion
- **ACCEPTED**: Approved and in effect
- **DEPRECATED**: No longer recommended for new work
- **SUPERSEDED**: Replaced by a newer ADR

## Creating a New ADR

1. Copy the template from `docs/adr/template.md`
2. Assign the next sequential number
3. Fill in all sections
4. Submit PR for review
5. Update this index when merged

## ADR Template Structure

```markdown
# ADR-XXX: Title

## Status
PROPOSED | ACCEPTED | DEPRECATED | SUPERSEDED by [ADR-YYY](./YYY-title.md)

## Context
What is the issue that we're seeing that motivates this decision?

## Decision
What is the change that we're proposing?

## Consequences
What becomes easier or more difficult because of this change?

## Alternatives Considered
What other options were evaluated?
```

## References

- [Michael Nygard's ADR article](https://cognitect.com/blog/2011/11/15/documenting-architecture-decisions)
- [ADR GitHub organization](https://adr.github.io/)

---
name: Layer Boundary Violations Cleanup
about: Refactor domain layer to eliminate architecture violations
title: 'refactor(domain): eliminate layer boundary violations'
labels: 'technical-debt, architecture, refactoring'
assignees: ''
---

## Summary

The domain layer currently has 5 layer boundary violations that were identified when adding the automated layer boundary CI check (#471). These need to be refactored to comply with hexagonal architecture principles.

## Background

Per CLAUDE.md, the layer dependency order is:

```
types → core → domain → application → infrastructure → integrations → apps
```

**Rule**: Lower packages must never import from higher packages. Domain layer should have no knowledge of infrastructure implementations.

## Violations to Fix

### 1. pg Type Imports in Domain (4 files)

These files import `Pool` or `PoolClient` types directly from `pg`:

| File                                                                     | Line | Current Import                               |
| ------------------------------------------------------------------------ | ---- | -------------------------------------------- |
| `packages/domain/src/agent-performance/agent-performance-repository.ts`  | 10   | `import type { Pool } from 'pg'`             |
| `packages/domain/src/behavioral-insights/behavioral-insights-service.ts` | 11   | `import type { Pool } from 'pg'`             |
| `packages/domain/src/data-lineage/data-lineage-service.ts`               | 10   | `import type { Pool } from 'pg'`             |
| `packages/domain/src/voice/supervisor-state-repository.ts`               | 10   | `import type { Pool, PoolClient } from 'pg'` |

**Solution**: Create a database connection port interface in `@medicalcor/core` or `@medicalcor/application`:

```typescript
// packages/application/src/ports/secondary/DatabaseConnectionPort.ts
export interface DatabaseConnection {
  query<T>(sql: string, params?: unknown[]): Promise<QueryResult<T>>;
}

export interface QueryResult<T> {
  rows: T[];
  rowCount: number;
}
```

Then update domain services to depend on this port instead of `pg` directly.

### 2. Integrations Import in Domain (1 file)

| File                                                  | Line | Current Import                                                                |
| ----------------------------------------------------- | ---- | ----------------------------------------------------------------------------- |
| `packages/domain/src/routing/flex-routing-adapter.ts` | 11   | `import type { FlexClient, CreateTaskInput } from '@medicalcor/integrations'` |

**Solution**: Either:

- Move `FlexClient` types to `@medicalcor/types`
- Create a port interface for the Flex routing capability
- Move `flex-routing-adapter.ts` to infrastructure layer (if it's actually an adapter)

## Acceptance Criteria

- [ ] All 5 files no longer import from forbidden packages
- [ ] `pnpm check:layer-boundaries` passes without allowlist entries
- [ ] Remove entries from `KNOWN_VIOLATIONS` in `scripts/check-layer-boundaries.ts`
- [ ] ESLint passes on all modified files
- [ ] All existing tests pass
- [ ] No new technical debt introduced

## Testing

```bash
# Verify layer boundaries
pnpm check:layer-boundaries

# Run affected package tests
pnpm --filter @medicalcor/domain test
pnpm --filter @medicalcor/application test

# Full lint check
pnpm lint
```

## References

- [Hexagonal Architecture ADR](docs/ARCHITECTURE.md)
- [Layer Boundary Rules](CLAUDE.md#layer-boundaries--refactoring-rules)
- Related PR: Layer boundary CI check
